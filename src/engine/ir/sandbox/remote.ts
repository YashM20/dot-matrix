/**
 * The page side of the IR sandbox: visitor programs run in a worker (`irWorker.ts`) that the page terminates when a
 * frame doesn't come back within `IR_WATCHDOG_MS`, so a program or a guard bug that never returns can't freeze it.
 *
 *   remote.begin()                                   // a frame starts
 *   layer.field = remote.field(program, src, key, env, guard)
 *   … sample as usual (the field returns the worker's values) …
 *   if (!remote.flush(redraw)) …                     // values were missing: asked for; `redraw` runs once they land
 *
 * A remote field replays the u/v points the sampler asked for last time, in the same order. When the points and
 * the frame inputs match a frame the worker already ran, it returns those values (float64, the same numbers the
 * program gives here). Otherwise it records the points, reads 0, and `flush` asks the worker for them. The worker
 * runs the batch under the usual frame guard; a program it pauses (or the watchdog kills) is reported to `guard`
 * as `paused`, so the card shows its usual paused note. With no module workers, the flag off, or a worker that
 * fails to start, `active` is false and callers sample on the main thread behind the guard, as before.
 */
import type { Field } from '../../types'
import type { IREnv, IRProgram } from '../compile'
import type { IRGuard } from '../guard'
import { checkReply, MAX_POINTS, type EvalItem } from './protocol'

/** How long a batch may take before the page terminates the worker, ms. The frame guard pauses slow programs at 50 ms. */
export const IR_WATCHDOG_MS = 250
/** How long a new worker may take to load before the page gives up on it and samples on the main thread, ms. */
export const IR_WORKER_START_MS = 8000

export interface RemoteOptions {
  /** Checked before each batch (the site's `worker` flag). */
  enabled?: () => boolean
  /** Make the worker (tests pass their own). */
  spawn?: () => Worker
  watchdogMs?: number
  startMs?: number
}
export interface RemoteStats { batches: number; kills: number; crashes: number; lastMs: number; failed: boolean }
export interface IRRemote {
  /** A worker can sample this frame. False: sample on the main thread, behind the guard. */
  readonly active: boolean
  readonly stats: RemoteStats
  begin(): void
  /** A field of `program` (compiled from `src`, guard key `key`) whose values come from the worker. */
  field(program: IRProgram, src: string, key: string, env: IREnv, guard?: IRGuard): Field
  /**
   * End the frame. True when every remote field had its values; else asks for them and calls `onSettled` once they
   * land. `ask` false: only say whether the frame was complete (a stand-in frame that must not replace the request).
   */
  flush(onSettled?: () => void, ask?: boolean): boolean
}

interface Slot {
  id: string; key: string; src: string; guard?: IRGuard
  points: Float64Array; n: number; pv: number
  /** `${generation}:${pv}` of the points the current worker holds. */
  sent: string
  cache: { sig: string; values: Float64Array }[]
  inflight?: string
  waiters: (() => void)[]
}
interface Use { s: Slot; sig: string; env: IREnv; i: number; rec: number[] | null; values?: Float64Array }
interface Batch { id: number; meta: { s: Slot; sig: string; n: number; pv: number }[]; started: number; posted: number; rearmed: boolean; timer: ReturnType<typeof setTimeout> }

const own = (o: object | undefined, k: string) => o !== undefined && Object.prototype.hasOwnProperty.call(o, k)
/** Exactly the inputs the program reads (`compile.ts` `inputs`), as plain numbers: what the worker gets and what a cache hit must match. */
function inputsOf(env: IREnv, keys: readonly string[]): { env: IREnv; sig: string } {
  const p = env.pointer, data: Record<string, number> = {}
  for (const k of keys) { const x = own(env.data, k) ? env.data![k] : 0; data[k] = typeof x === 'number' ? x : 0 }
  const t = Number(env.t ?? 0), pointer = p && { x: Number(p.x), y: Number(p.y), down: !!p.down }
  const sig = `${t}|${pointer ? `${pointer.x},${pointer.y},${+pointer.down}` : '-'}|${keys.map(k => data[k]).join(',')}`
  return { env: { t, data, ...(pointer && { pointer }) }, sig }
}
const ZERO: Field = () => 0
const MAX_SLOTS = 256, CACHE = 3, MAX_CRASHES = 3

export function irRemote(o: RemoteOptions = {}): IRRemote {
  const ms = o.watchdogMs ?? IR_WATCHDOG_MS, startMs = o.startMs ?? IR_WORKER_START_MS
  const spawn = o.spawn ?? (() => new Worker(new URL('./irWorker.ts', import.meta.url), { type: 'module' }))
  const slots = new Map<string, Slot>(), ords = new Map<string, number>(), queue = new Map<Slot, { sig: string; env: IREnv }>(), paused = new Set<string>()
  const stats: RemoteStats = { batches: 0, kills: 0, crashes: 0, lastMs: 0, failed: false }
  let uses: Use[] = [], worker: Worker | null = null, ready = false, gen = 0, nextId = 1, inflight: Batch | null = null
  let startTimer: ReturnType<typeof setTimeout> | undefined
  const enabled = () => !stats.failed && (o.spawn !== undefined || typeof Worker !== 'undefined') && (o.enabled?.() ?? true)

  const settle = (s: Slot) => { const w = s.waiters; s.waiters = []; for (const f of w) f() }
  const pause = (s: Slot) => { if (s.guard) s.guard.report(s.key, 'paused'); else paused.add(s.key) }
  /** Drop the worker. Its batch's slots hear back now (redrawn, then asked again or sampled on the main thread). */
  function drop(guilty?: Slot) {
    clearTimeout(startTimer)
    const b = inflight
    inflight = null
    if (b) clearTimeout(b.timer)
    worker?.terminate(); worker = null; ready = false; gen++
    if (guilty) pause(guilty)
    b?.meta.forEach(x => { x.s.inflight = undefined; settle(x.s) })
  }
  function fail() {
    stats.failed = true
    drop()
    for (const s of queue.keys()) settle(s)
    queue.clear()
  }
  function getWorker(): Worker | null {
    if (worker) return worker
    let w: Worker
    try { w = spawn() } catch { fail(); return null }
    worker = w
    const mine = gen
    w.addEventListener('message', e => { if (worker === w && gen === mine) onMessage(e.data) })
    const broke = () => {
      if (worker !== w) return
      // a worker that never loaded (no module workers, a blocked script) means the main thread from now on
      // after it loaded: the program it was running is paused, like one the watchdog stopped
      if (!ready || ++stats.crashes > MAX_CRASHES) fail()
      else { const b = inflight; drop(b && b.started >= 0 ? b.meta[b.started]?.s : undefined); pump() }
    }
    w.addEventListener('error', broke)
    w.addEventListener('messageerror', broke)
    startTimer = setTimeout(() => { if (worker === w && !ready) fail() }, startMs)
    return w
  }
  function pump() {
    if (inflight || !queue.size) return
    if (!enabled()) { for (const s of queue.keys()) settle(s); queue.clear(); return }
    const w = getWorker()
    if (!w || !ready) return // sent once the worker says it's ready
    const items: EvalItem[] = [], meta: Batch['meta'] = []
    for (const [s, q] of queue) {
      if (items.length >= 64) break
      queue.delete(s)
      const tag = `${gen}:${s.pv}`, fresh = s.sent !== tag
      items.push({ slot: s.id, src: s.src, pv: s.pv, n: s.n, env: q.env, ...(fresh && { points: s.points.slice() }) })
      s.sent = tag; s.inflight = q.sig
      meta.push({ s, sig: q.sig, n: s.n, pv: s.pv })
    }
    const id = nextId++, b: Batch = { id, meta, started: -1, posted: performance.now(), rearmed: false, timer: setTimeout(() => watchdog(b), ms) }
    inflight = b
    stats.batches++
    try { w.postMessage({ kind: 'eval', id, items }) } catch { drop(); fail() }
  }
  function watchdog(b: Batch) {
    if (inflight !== b) return
    // the page itself was busy past the deadline: the reply may be queued behind this timer, so give it one more turn
    if (!b.rearmed && performance.now() - b.posted > ms + 40) { b.rearmed = true; b.timer = setTimeout(() => watchdog(b), ms); return }
    stats.kills++
    drop(b.meta[Math.max(0, b.started)]?.s)
    pump() // the next batch, if any, gets a fresh worker
  }
  function onMessage(data: unknown) {
    const m = checkReply(data)
    if (!m) return
    if (m.kind === 'ready') { ready = true; clearTimeout(startTimer); pump(); return }
    const b = inflight
    if (!b || m.id !== b.id) return
    if (m.kind === 'start') { if (m.index < b.meta.length) b.started = m.index; return }
    inflight = null
    clearTimeout(b.timer)
    stats.lastMs = performance.now() - b.posted
    b.meta.forEach(({ s, sig, n, pv }, i) => {
      const r = m.results[i]
      s.inflight = undefined
      if (r?.status === 'ok') {
        if (r.values.length === n && pv === s.pv) {
          s.cache.unshift({ sig, values: r.values })
          if (s.cache.length > CACHE) s.cache.length = CACHE
          s.guard?.report(s.key, 'ok')
        }
      } else if (r?.status === 'points') s.sent = ''
      // paused, or a program the worker can't compile (the page could): it doesn't run
      else if (r?.status === 'paused' || r?.status === 'error') pause(s)
      settle(s)
    })
    pump()
  }

  function slotFor(key: string, src: string, guard?: IRGuard): Slot {
    const ord = ords.get(key) ?? 0
    ords.set(key, ord + 1)
    const id = ord ? `${key}#${ord}` : key
    let s = slots.get(id)
    if (s) slots.delete(id) // most recent last
    else s = { id, key, src, points: new Float64Array(0), n: 0, pv: 0, sent: '', cache: [], waiters: [] }
    slots.set(id, s)
    s.guard = guard
    if (s.src !== src) { s.src = src; s.cache = [] }
    if (slots.size > MAX_SLOTS) for (const [k, x] of slots) { if (slots.size <= MAX_SLOTS) break; if (!x.inflight && !x.waiters.length && !queue.has(x)) slots.delete(k) }
    return s
  }

  return {
    get active() { return enabled() },
    stats,
    begin() { uses = []; ords.clear() },
    field(program, src, key, env, guard) {
      if (guard ? guard.state(key) === 'paused' : paused.has(key)) return ZERO
      const s = slotFor(key, src, guard), { env: e, sig } = inputsOf(env, program.info.data)
      const u: Use = { s, sig, env: e, i: 0, rec: null, values: s.cache.find(c => c.sig === sig)?.values }
      uses.push(u)
      const P = s.points, n = s.n
      const f: Field = (x, y) => {
        const i = u.i++
        if (u.rec === null) {
          if (i < n && P[2 * i] === x && P[2 * i + 1] === y) return u.values ? u.values[i] : 0
          u.rec = Array.from(P.subarray(0, 2 * i)) // the sampler asks for other points now: record them
        }
        if (u.rec.length < 2 * MAX_POINTS) u.rec.push(x, y)
        return 0
      }
      return f
    },
    flush(onSettled, ask = true) {
      const waiting: Slot[] = []
      for (const u of uses) {
        const s = u.s
        if (u.rec === null && u.i !== s.n) u.rec = Array.from(s.points.subarray(0, 2 * Math.min(u.i, s.n)))
        if (u.rec) { s.points = Float64Array.from(u.rec); s.n = u.rec.length / 2; s.pv++; s.cache = []; u.values = undefined }
        if (u.values) continue
        if (ask && (s.inflight !== u.sig || u.rec)) queue.set(s, { sig: u.sig, env: u.env })
        waiting.push(s)
      }
      uses = []
      if (!waiting.length) return true
      if (!ask) return false
      if (onSettled) {
        let left = waiting.length
        const one = () => { if (--left === 0) onSettled() }
        for (const s of waiting) s.waiters.push(one)
      }
      pump()
      return false
    },
  }
}
