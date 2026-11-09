/**
 * IR sandbox worker checks (#158): visitor programs sample in a worker the page can terminate (src/engine/ir/sandbox).
 * Runs the real protocol through an in-process stand-in for the worker (`evaluateBatch` behind structured clones and
 * the same message checks), so it needs no browser. The checks:
 *  - parity: every DOTS example, a mixed card (blend, lattice, sites, a bounded spec `ir` layer, text) and the remix
 *    graph's thumbnails draw the very same dots through the worker as on the main thread, at several frame inputs;
 *  - the values are the program's own numbers, bit for bit (float64, NaN and pointer inputs included);
 *  - a batch that never returns gets its worker terminated, its program paused (the guard's note), and the next
 *    run spawns a fresh worker; a worker that crashes is replaced; one that never loads hands over to the main thread;
 *  - malformed messages are refused both ways, and a reply with the wrong value count is never drawn;
 *  - the worker's frame guard pauses a slow program, and the rest of its batch is asked again.
 * Prints the main-thread sampling time of a typical example both ways (informational).
 *
 *   npx tsx scripts/ir-worker.ts     # also run by `pnpm verify` through `irWorkerChecks()`
 */
import { pathToFileURL } from 'node:url'
import { irGuard, type IRGuard } from '../src/engine/ir'
import { checkBatch, checkReply, evaluateBatch, pointStore } from '../src/engine/ir/sandbox/protocol'
import { irRemote, type IRRemote } from '../src/engine/ir/sandbox/remote'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import type { DotInstance } from '../src/engine/types'
import { EXAMPLES } from '../src/components/dwitter/examples'
import { graphLayers, layoutGraph, SEEDS } from '../src/components/dwitter/gallery'
import { compileSource, DOTS_STYLE, sandboxedThumbs } from '../src/components/dwitter/program'
import { compileCard, guardKey, importDots, irLayer, sitesLayer, textLayer, type IRLayer, type StudioCard } from '../src/components/studio/doc'
import { sampleCard } from '../src/components/studio/playback'
import type { Assert } from './lib/check'

type Mode = 'ok' | 'hang' | 'silent' | 'crash' | 'short'
/** The worker, in process: the real checks and `evaluateBatch`, every message through `structuredClone`. */
class FakeWorker {
  private on: Record<string, ((e: { data: unknown }) => void)[]> = { message: [], error: [], messageerror: [] }
  private store = pointStore()
  terminated = false
  /** `clock`: the worker guard's clock (a still one for the parity runs, so a slow machine can't pause a program there). */
  constructor(public mode: Mode, private clock?: () => number) { if (mode !== 'silent') this.emit({ kind: 'ready' }) }
  addEventListener(type: string, fn: (e: { data: unknown }) => void) { this.on[type]?.push(fn) }
  postMessage(m: unknown) {
    const b = checkBatch(structuredClone(m))
    if (!b || this.terminated) return
    if (this.mode === 'hang') { this.emit({ kind: 'start', id: b.id, index: 0 }); return }
    if (this.mode === 'crash') { this.emit({ kind: 'start', id: b.id, index: 0 }); setTimeout(() => { if (!this.terminated) for (const f of this.on.error) f({ data: undefined }) }, 0); return }
    const results = evaluateBatch(b, this.store, index => this.emit({ kind: 'start', id: b.id, index }), this.clock)
    if (this.mode === 'short') for (const r of results) if (r.status === 'ok') r.values = r.values.subarray(1).slice()
    this.emit({ kind: 'done', id: b.id, results })
  }
  terminate() { this.terminated = true }
  private emit(data: unknown) { const d = structuredClone(data); setTimeout(() => { if (!this.terminated) for (const f of this.on.message) f({ data: d }) }, 0) }
}
function fakeRemote(modes: () => Mode, o: { watchdogMs?: number; startMs?: number } = {}, clock: (() => number) | undefined = () => 0) {
  const spawned: FakeWorker[] = []
  const remote = irRemote({ ...o, spawn: () => { const w = new FakeWorker(modes(), clock); spawned.push(w); return w as unknown as Worker } })
  return { remote, spawned }
}
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms))
/** Draw until every remote field has its values (each pass asks for what was missing). */
async function settled<T>(remote: IRRemote, draw: () => T, passes = 6): Promise<{ out: T; passes: number }> {
  for (let i = 1; i <= passes; i++) {
    remote.begin()
    const out = draw()
    let landed!: () => void
    const wait = new Promise<void>(r => { landed = r })
    if (remote.flush(() => landed())) return { out, passes: i }
    await Promise.race([wait, tick(500)])
  }
  throw new Error('never settled')
}
const same = (a: DotInstance[], b: DotInstance[]) => a.length === b.length && JSON.stringify(a) === JSON.stringify(b)
const theme = dot480
type Env = { t: number; data: Record<string, number>; pointer?: { x: number; y: number; down: boolean } }
const ENVS: Env[] = [{ t: 0, data: {} }, { t: 1.7, data: { value: .3, k: .9 } }, { t: 4.25, data: {}, pointer: { x: 20, y: 31, down: true } }]
const local = (card: StudioCard, g: IRGuard) => compileCard(card, new Map(), { guard: g })
const draw = (card: StudioCard, c: ReturnType<typeof compileCard>, e: Env) => sampleCard({ card, compiled: c, theme, pointer: e.pointer }, e.t, e.data)

function mixedCard(): StudioCard {
  const card = importDots(EXAMPLES[1])
  card.layers.push(
    irLayer('let d = length(u - .5, v - .5); smoothstep(.45, .1, d) * (.6 + .4 * sin(t * 3 + u * 9))', { z: 1, blend: 'multiply', lattice: 1 }),
    irLayer('fract(u * 5 + t) > .5 ? v : 0', { z: 2, lattice: 3 }),
    sitesLayer({ z: 3, src: '.5 + .5 * sin(u * 20 + t)' }),
    { id: 'spec1', name: 'spec', tone: 'auto', z: 4, blend: 'normal', visible: true, kind: 'spec', spec: { kind: 'ir', src: 'noise(u * 4, v * 4, t) > .5 ? 1 : .3', lattice: 2, bounds: [3, 4, 20, 18] } },
    textLayer('HI', { z: 5 }),
  )
  return card
}

export async function irWorkerChecks(assert: Assert) {
  // ── parity: the same dots both ways ──
  const { remote } = fakeRemote(() => 'ok'), mismatch: string[] = []
  let frames = 0
  const cards: [string, StudioCard][] = [...EXAMPLES.map(e => [e.name, importDots(e)] as [string, StudioCard]), ['mixed', mixedCard()]]
  for (const [name, card] of cards) {
    const lc = local(card, irGuard(1e9)), rc = compileCard(card, new Map(), { guard: irGuard(1e9), remote })
    for (const e of ENVS) {
      const want = draw(card, lc, e), { out: got } = await settled(remote, () => draw(card, rc, e))
      frames++
      if (!same(want, got)) mismatch.push(`${name} @ t=${e.t}`)
    }
  }
  assert(`ir worker parity: ${frames} frames of ${cards.length} cards (every DOTS example, plus blend / lattice / sites / bounded spec ir / text) draw the same dots through the worker`, !mismatch.length, mismatch.slice(0, 4).join(', '))

  const graph = layoutGraph(SEEDS), tg = irGuard(1e9)
  const want = sampleLayers(graphLayers(graph, SEEDS[2].id, undefined, irGuard(1e9)), graph.grid, DOTS_STYLE, theme)
  const { out: got, passes } = await settled(remote, () => sampleLayers(graphLayers(graph, SEEDS[2].id, undefined, sandboxedThumbs(tg, remote)), graph.grid, DOTS_STYLE, theme))
  assert('ir worker parity: the remix graph thumbnails draw the same dots through the worker (asked once, then drawn)', same(want, got) && passes === 2, `${got.length} dots, ${passes} passes`)

  const odd = compileSource('let a = data.k / (u - .5); (pointer.down ? a : -a) + t * 0 + v * pointer.x').program!
  const pts = new Float64Array([0, 0, .5, .5, .25, 1, 1, .125, .5, 0])
  const envs = [{ t: NaN, data: { k: Infinity } }, { t: 2, data: { k: -0 }, pointer: { x: .3, y: .4, down: true } }, { t: 1, data: { k: 2 }, pointer: { x: NaN, y: 0, down: false } }]
  const bits = envs.every((env, j) => {
    const [r] = evaluateBatch(checkBatch(structuredClone({ kind: 'eval', id: 1, items: [{ slot: 's', src: 'let a = data.k / (u - .5); (pointer.down ? a : -a) + t * 0 + v * pointer.x', pv: j, n: 5, points: pts, env }] }))!, pointStore())
    const f = odd(env)
    return r.status === 'ok' && [...r.values].every((x, i) => Object.is(x, f(pts[2 * i], pts[2 * i + 1])))
  })
  assert('ir worker: the worker\'s values are the program\'s own numbers, bit for bit (NaN / Infinity / -0 inputs, the pointer)', bits)

  // ── the watchdog ──
  let mode: Mode = 'hang'
  const hang = fakeRemote(() => mode, { watchdogMs: 30 }), card = importDots(EXAMPLES[0]), g = irGuard(1e9)
  const hc = compileCard(card, new Map(), { guard: g, remote: hang.remote }), il = card.layers.find((l): l is IRLayer => l.kind === 'ir')!, key = guardKey(card.grid, il.lattice, il.src)
  hang.remote.begin(); draw(card, hc, ENVS[0])
  let woke = false
  const done = hang.remote.flush(() => { woke = true })
  await tick(200)
  const t0 = hang.spawned[0]
  assert('ir worker watchdog: a frame that never comes back gets its worker terminated and its program paused (the guard\'s note)', !done && woke && t0.terminated && hang.remote.stats.kills === 1 && g.state(key) === 'paused',
    `kills ${hang.remote.stats.kills}, state ${g.state(key)}, terminated ${t0.terminated}`)
  const noted = draw(card, compileCard(card, new Map(), { guard: g, remote: hang.remote }), ENVS[0]).length
  mode = 'ok'; g.resume(key)
  const { passes: p2 } = await settled(hang.remote, () => draw(card, hc, ENVS[0]))
  assert('ir worker watchdog: the next run spawns a fresh worker and draws', hang.spawned.length === 2 && !hang.spawned[1].terminated && p2 === 2 && g.state(key) === 'ok' && noted > 0, `${hang.spawned.length} workers, ${p2} passes, ${g.state(key)}`)

  // ── crash, a worker that never loads, a flag that is off ──
  let cm: Mode = 'crash'
  const crash = fakeRemote(() => cm), cg = irGuard(1e9), cc = compileCard(card, new Map(), { guard: cg, remote: crash.remote })
  crash.remote.begin(); draw(card, cc, ENVS[0]); crash.remote.flush()
  await tick(20)
  cm = 'ok'
  const crashed = crash.spawned[0].terminated && cg.state(key) === 'paused' && crash.remote.active
  cg.resume(key)
  await settled(crash.remote, () => draw(card, cc, ENVS[0]))
  assert('ir worker: a worker that crashes on a program is replaced and that program paused', crashed && crash.spawned.length === 2 && crash.remote.stats.crashes === 1)
  const silent = fakeRemote(() => 'silent', { startMs: 30 }), sc = compileCard(card, new Map(), { guard: irGuard(1e9), remote: silent.remote })
  silent.remote.begin(); draw(card, sc, ENVS[0])
  let handed = false
  silent.remote.flush(() => { handed = true })
  await tick(120)
  const fallback = draw(card, sc, ENVS[0])
  assert('ir worker: a worker that never loads hands over to the main thread (active off, the same dots behind the guard)', handed && !silent.remote.active && silent.remote.stats.failed && same(fallback, draw(card, local(card, irGuard(1e9)), ENVS[0])))
  const off = irRemote({ enabled: () => false, spawn: () => { throw new Error('spawned') } })
  const thrown = irRemote({ spawn: () => { throw new Error('no module workers') } })
  const tc = compileCard(card, new Map(), { guard: irGuard(1e9), remote: thrown })
  thrown.begin(); draw(card, tc, ENVS[0]); thrown.flush()
  assert('ir worker: the worker flag off, or a Worker that throws, leaves the main-thread path', !off.active && !thrown.active)

  // ── messages ──
  const goodItem = { slot: 's', src: 'u', pv: 0, n: 1, points: new Float64Array([0, 0]), env: { t: 0 } }
  const badBatches: unknown[] = [null, [], { kind: 'other', id: 1, items: [] }, { kind: 'eval', id: -1, items: [] }, { kind: 'eval', id: 1, items: new Array(65).fill(goodItem) },
    { kind: 'eval', id: 1, items: [{ ...goodItem, points: [0, 0] }] }, { kind: 'eval', id: 1, items: [{ ...goodItem, points: new Float64Array(4) }] },
    { kind: 'eval', id: 1, items: [{ ...goodItem, src: 'x'.repeat(9000) }] }, { kind: 'eval', id: 1, items: [{ ...goodItem, env: { t: '1' } }] },
    { kind: 'eval', id: 1, items: [{ ...goodItem, env: { data: { k: '1' } } }] }, { kind: 'eval', id: 1, items: [{ ...goodItem, n: 2 ** 20 }] }]
  const proto = checkBatch(JSON.parse('{"kind":"eval","id":1,"items":[{"slot":"s","src":"data.k","pv":0,"n":0,"env":{"data":{"__proto__":1,"k":2}}}]}'))
  assert('ir worker messages: the worker refuses malformed batches (shapes, sizes, types), and a `__proto__` data key stays plain data', badBatches.every(b => checkBatch(b) === null) && checkBatch({ kind: 'eval', id: 1, items: [goodItem] }) !== null
    && !!proto && Object.getPrototypeOf(proto.items[0].env.data) === null && proto.items[0].env.data!.k === 2)
  const badReplies: unknown[] = [null, 'ready', { kind: 'done', id: 1, results: [{ status: 'ok', values: [1] }] }, { kind: 'done', id: 1, results: [{ status: 'eval' }] }, { kind: 'start', id: 1, index: 999 }, { kind: 'done', id: 1.5, results: [] }]
  assert('ir worker messages: the page refuses malformed replies', badReplies.every(r => checkReply(r) === null) && checkReply({ kind: 'done', id: 1, results: [{ status: 'ok', values: new Float64Array(1) }] }) !== null)
  const short = fakeRemote(() => 'short'), shc = compileCard(card, new Map(), { guard: irGuard(1e9), remote: short.remote })
  let shortDrawn = true
  for (let i = 0; i < 3; i++) { short.remote.begin(); draw(card, shc, ENVS[0]); shortDrawn = short.remote.flush(); await tick(10) }
  assert('ir worker messages: a reply with the wrong value count is never drawn (the frame keeps asking)', !shortDrawn)

  // ── the worker's own frame guard ──
  const slow = 'for i in 0..64 with s = 0 { s + noise(u * i, v * i, t) } / 64'
  let clock = 0
  const sp = new Float64Array(2 * 4096).map((_, i) => (i % 97) / 97)
  const res = evaluateBatch({ kind: 'eval', id: 1, items: [{ slot: 'a', src: slow, pv: 0, n: 4096, points: sp, env: { t: 0 } }, { slot: 'b', src: 'u', pv: 0, n: 1, points: new Float64Array(2), env: {} }] }, pointStore(), () => {}, () => (clock += 5))
  assert('ir worker guard: the worker pauses a program past the frame budget and asks for the rest of its batch again', res[0].status === 'paused' && res[1].status === 'skip', res.map(r => r.status).join(','))
  // a batch holds several frames' programs (and the remix graph's thumbnails): each gets its own budget, so a cheap
  // one queued behind another that used most of its budget still draws; past one budget the rest are asked again.
  // `u` reads the clock once per 4096 dots, so each item below reads it 7 times after its first dot: 35 ms at 5 ms a read.
  let at = 0
  const n7 = 7 * 4096 + 1, p7 = new Float64Array(2 * n7), cheap = (slot: string) => ({ slot, src: 'u', pv: 0, n: n7, points: p7, env: {} })
  const own = evaluateBatch({ kind: 'eval', id: 2, items: [cheap('c'), cheap('d'), cheap('e')] }, pointStore(), () => {}, () => (at += 5))
  assert('ir worker guard: each program in a batch has its own frame budget (a cheap one behind a busy one is not paused), and a batch past one budget asks for the rest again', own.map(r => r.status).join() === 'ok,ok,skip', own.map(r => r.status).join(','))

  // ── frame time (informational): the main thread's share of one frame ──
  const ex = importDots(EXAMPLES[1]), lcx = local(ex, irGuard(1e9)), { remote: fr } = fakeRemote(() => 'ok'), rcx = compileCard(ex, new Map(), { guard: irGuard(1e9), remote: fr })
  await settled(fr, () => draw(ex, rcx, ENVS[1]))
  const time = (f: () => void) => { const s = performance.now(); for (let i = 0; i < 40; i++) f(); return (performance.now() - s) / 40 }
  const mainMs = time(() => draw(ex, lcx, ENVS[1])), lookupMs = time(() => { fr.begin(); draw(ex, rcx, ENVS[1]); fr.flush() })
  console.log(`  frame time, "${EXAMPLES[1].name}" ${ex.grid.cols}×${ex.grid.rows}: ${mainMs.toFixed(2)} ms sampled on the main thread, ${lookupMs.toFixed(2)} ms on the main thread with the program in the worker`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('./lib/check')).checker('IR worker')
  await irWorkerChecks(assert)
  done()
}
