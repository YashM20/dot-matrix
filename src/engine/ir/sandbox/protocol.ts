/**
 * The IR sandbox protocol: visitor programs are sampled in a worker the page can terminate (`remote.ts` is the page
 * side, `irWorker.ts` the worker). The page sends a batch of programs, each with its frame inputs and the exact u/v
 * points the grid sampler will ask for; the worker compiles each with `compileUntrusted`, runs it at those points
 * under its own frame guard, and sends the values back in a transferred `Float64Array` (float64, so a value is the
 * very number the main-thread program returns: frames stay identical). Plain module: the parity check
 * (`scripts/ir-worker.ts`) calls `evaluateBatch` without a Worker.
 *
 * Every message is checked on arrival, both ways: the worker reads only what `checkBatch` accepts, the page only
 * what `checkReply` accepts.
 */
import { compileUntrusted } from '../index'
import { IR_FRAME_MS, irGuard } from '../guard'
import type { IREnv } from '../compile'
import '../../noise/ir' // the noise pack: the same builtins as the page's visitor programs

/** One program in a batch. `points` (u, v pairs) comes along when the worker doesn't hold version `pv` of them yet. */
export interface EvalItem { slot: string; src: string; pv: number; n: number; points?: Float64Array; env: IREnv }
export interface EvalBatch { kind: 'eval'; id: number; items: EvalItem[] }
/**
 * `ok`: the values; `paused`: it ran past the frame budget; `skip`: a program before it in the batch ran out of
 * time, ask again; `points`: the worker lost the points, send them again; `error`: it didn't compile.
 */
export type ItemResult =
  | { status: 'ok'; values: Float64Array }
  | { status: 'paused' | 'skip' | 'points' | 'error' }
export type WorkerReply =
  | { kind: 'ready' }
  /** About to run item `index` of batch `id`: if the batch never comes back, that item is the one to pause. */
  | { kind: 'start'; id: number; index: number }
  | { kind: 'done'; id: number; results: ItemResult[] }

/** Most points one program may ask for in one frame (a 512 × 512 grid; the editor caps grids well below it). */
export const MAX_POINTS = 1 << 18
const MAX_ITEMS = 64, MAX_SRC = 8192, MAX_DATA = 64, MAX_SLOT = 9000

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isInt = (x: unknown, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= max
/** Any number, NaN and ±Infinity too: the page's program reads its inputs as they are, so the worker must as well. */
const num = (x: unknown): x is number => typeof x === 'number'

function checkEnv(x: unknown): IREnv | null {
  if (!isObj(x)) return null
  const env: IREnv = {}
  if (x.t !== undefined) { if (!num(x.t)) return null; env.t = x.t }
  if (x.pointer !== undefined) {
    const p = x.pointer
    if (!isObj(p) || !num(p.x) || !num(p.y) || (p.down !== undefined && typeof p.down !== 'boolean')) return null
    env.pointer = { x: p.x, y: p.y, down: p.down === true }
  }
  if (x.data !== undefined) {
    if (!isObj(x.data)) return null
    const keys = Object.keys(x.data)
    if (keys.length > MAX_DATA) return null
    // a null-prototype copy: a key like `__proto__` is plain data here
    const data: Record<string, number> = Object.create(null)
    for (const k of keys) { const v = x.data[k]; if (!num(v)) return null; data[k] = v }
    env.data = data
  }
  return env
}
/** A batch as the worker accepts it, or null. */
export function checkBatch(x: unknown): EvalBatch | null {
  if (!isObj(x) || x.kind !== 'eval' || !isInt(x.id, 2 ** 31) || !Array.isArray(x.items) || x.items.length > MAX_ITEMS) return null
  const items: EvalItem[] = []
  for (const it of x.items as unknown[]) {
    if (!isObj(it) || typeof it.slot !== 'string' || it.slot.length > MAX_SLOT || typeof it.src !== 'string' || it.src.length > MAX_SRC || !isInt(it.pv, 2 ** 31) || !isInt(it.n, MAX_POINTS)) return null
    const env = checkEnv(it.env)
    if (!env) return null
    if (it.points !== undefined && !(it.points instanceof Float64Array && it.points.length === 2 * it.n)) return null
    items.push({ slot: it.slot, src: it.src, pv: it.pv, n: it.n, env, ...(it.points && { points: it.points }) })
  }
  return { kind: 'eval', id: x.id, items }
}
/** A worker message as the page accepts it, or null. Value counts are checked against the request by the page. */
export function checkReply(x: unknown): WorkerReply | null {
  if (!isObj(x)) return null
  if (x.kind === 'ready') return { kind: 'ready' }
  if (x.kind === 'start') return isInt(x.id, 2 ** 31) && isInt(x.index, MAX_ITEMS) ? { kind: 'start', id: x.id, index: x.index } : null
  if (x.kind !== 'done' || !isInt(x.id, 2 ** 31) || !Array.isArray(x.results) || x.results.length > MAX_ITEMS) return null
  const results: ItemResult[] = []
  for (const r of x.results as unknown[]) {
    if (!isObj(r)) return null
    if (r.status === 'ok') { if (!(r.values instanceof Float64Array)) return null; results.push({ status: 'ok', values: r.values }) }
    else if (r.status === 'paused' || r.status === 'skip' || r.status === 'points' || r.status === 'error') results.push({ status: r.status })
    else return null
  }
  return { kind: 'done', id: x.id, results }
}

/** The worker's copy of each slot's points, by version; the oldest go first past `cap` slots. */
export interface PointStore { get(slot: string, pv: number): Float64Array | undefined; set(slot: string, pv: number, p: Float64Array): void }
export function pointStore(cap = 256): PointStore {
  const m = new Map<string, { pv: number; p: Float64Array }>()
  return {
    get(slot, pv) { const e = m.get(slot); if (!e || e.pv !== pv) return undefined; m.delete(slot); m.set(slot, e); return e.p },
    set(slot, pv, p) { m.delete(slot); m.set(slot, { pv, p }); if (m.size > cap) m.delete(m.keys().next().value!) },
  }
}

/**
 * Run a batch. A batch holds the programs of several editor frames and thumbnails, so each program gets its own
 * `IR_FRAME_MS` budget (the same guard the page gives each card): one that runs past it is `paused`, and a cheap
 * program is never paused for the slow ones before it. Once the batch has run past one budget, or a program was
 * paused, the rest are `skip` (asked again in the next batch), so a batch stays near two budgets, well inside the
 * page's watchdog. `onStart(i)` is told before item `i` runs.
 */
export function evaluateBatch(b: EvalBatch, store: PointStore, onStart: (index: number) => void = () => {}, now: () => number = () => performance.now()): ItemResult[] {
  const results: ItemResult[] = [], t0 = now()
  let tripped = false
  b.items.forEach((it, index) => {
    // keep new points even for a skipped item: the page counts them as sent
    if (it.points) store.set(it.slot, it.pv, it.points)
    if (tripped || (index > 0 && now() - t0 > IR_FRAME_MS)) { results.push({ status: 'skip' }); return }
    const P = it.points ?? store.get(it.slot, it.pv)
    if (!P || P.length !== 2 * it.n) { results.push({ status: 'points' }); return }
    let program
    try { program = compileUntrusted(it.src) } catch { results.push({ status: 'error' }); return }
    onStart(index)
    const guard = irGuard(IR_FRAME_MS, now)
    guard.begin()
    const f = guard.field(it.slot, program.info.cost, program(it.env)), values = new Float64Array(it.n)
    for (let i = 0; i < it.n; i++) values[i] = f(P[2 * i], P[2 * i + 1], 0, 0)
    if (guard.state(it.slot) === 'paused') { tripped = true; results.push({ status: 'paused' }) }
    else results.push({ status: 'ok', values })
  })
  return results
}
