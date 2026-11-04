/**
 * Field IR cost checks (#142): the static cost cap and the runtime guard for user programs.
 *  - the worst case from the issue (a 32 × 32 loop around a body of about 2,000 nodes) is rejected with a plain
 *    message, at line:col from source and at a JSON path from a serialized program;
 *  - every IR program in the repo passes the cap with headroom: the parity fields (scripts/ir.ts), the noise fields
 *    (scripts/noise.ts), the MAKE examples (the remix gallery seeds) and every registered card's IR;
 *  - a program just under the cap also fits the device step budget;
 *  - the guard (fake clock) pauses a legal but slow program inside one frame, and reads 0 for the rest of it, while a
 *    fast program is marked ok; a guarded MAKE card draws the paused note; without a guard a card is unchanged.
 *
 *   npx tsx scripts/ir-cost.ts      # also run by `pnpm verify` through `irCostChecks()`
 */
import { pathToFileURL } from 'node:url'
import { IR_LIMITS, IRError, compileBytecode, deserialize, irGuard, irSources, parse, serialize, validate, verifyBytecode, type IRNode } from '../src/engine/ir'
import '../src/engine/noise/ir'
import { EXAMPLES } from '../src/components/dwitter/examples'
import { compileCard, importDots } from '../src/components/studio/doc'
import { withChrome, widgetPresets } from '../src/widgets'
import { IR_TEST_FIELDS } from './ir'
import { IR_NOISE_FIELDS } from './noise'
import type { Assert } from './lib/check'

/** `n` copies of `u` summed as a balanced tree (shallow, so only the cost cap can reject it). */
const sumSrc = (n: number): string => (n === 1 ? 'u' : `(${sumSrc(n >> 1)}+${sumSrc(n - (n >> 1))})`)
const sumAst = (n: number): IRNode => (n === 1 ? { k: 'in', name: 'u' } : { k: 'bin', op: '+', a: sumAst(n >> 1), b: sumAst(n - (n >> 1)) })
const num0: IRNode = { k: 'num', v: 0 }
/** The issue's worst case as source: 32 × 32 runs of a ~1,920-node body (about 2 million steps per dot). */
export const WORST = `for i in 0..32 with s = 0 { s + for j in 0..32 with q = 0 { q + ${sumSrc(960)} } }`
/** The same shape as JSON, with a ~1,980-node body (JSON has no source-length limit). */
const WORST_AST: IRNode = { k: 'for', i: 'i', from: 0, to: 32, acc: 's', init: num0, body: { k: 'bin', op: '+', a: { k: 'ref', name: 's' },
  b: { k: 'for', i: 'j', from: 0, to: 32, acc: 'q', init: num0, body: { k: 'bin', op: '+', a: { k: 'ref', name: 'q' }, b: sumAst(990) } } } }
/** Headroom the heaviest program in the repo must leave under the cap. */
const HEADROOM = 4

const costOf = (src: string) => validate(parse(src)).cost
const errorOf = (f: () => unknown): string => { try { f(); return '' } catch (e) { return e instanceof IRError ? e.message : `not an IRError: ${(e as Error).message}` } }

export function irCostChecks(assert: Assert) {
  // ── the static cap ──
  const fromSrc = errorOf(() => parse(WORST))
  assert(`ir cost: the 32 × 32 loop around a ~2,000-node body is rejected from source, at the loop's line:col (${WORST.length} chars)`,
    /^program does too much work per dot \(over 32768 steps\): the loop body runs 1024 times per dot.* the loop starts at 1:1$/.test(fromSrc), fromSrc)
  const fromJSON = errorOf(() => deserialize(serialize(WORST_AST)))
  assert('ir cost: the same program as JSON is rejected at the loop\'s path', /too much work per dot.* the loop starts at \$$/.test(fromJSON), fromJSON)
  const noisy = errorOf(() => parse(Array(100).fill('fbm(u, v, 8, 1)').join(' + ')))
  assert('ir cost: heavy builtins count without loops (100 fbm calls at 8 octaves)', /too much work per dot.*goes over the limit at 1:\d+$/.test(noisy), noisy)
  assert('ir cost: fbm counts its octaves (a literal 2 costs less than 8; a computed count costs 8)',
    costOf('fbm(u, v, 2, 1)') < costOf('fbm(u, v, 8, 1)') && costOf('fbm(u, v, 8, 1)') < costOf('fbm(u, v, u * 9, 1)') && costOf('fbm(u, v, u * 9, 1)') - costOf('fbm(u, v, 8, 1)') === 2)

  // ── every program in the repo passes, with headroom ──
  // building each card's layers once compiles the IR it builds lazily; module-level programs are compiled on import
  for (const p of widgetPresets) { try { withChrome(p)({ t: 0, data: { ...p.defaults } }) } catch { /* listed from its module-level IR */ } }
  const cards = irSources()
  const programs: [string, string][] = [
    ...Object.entries(IR_TEST_FIELDS).map(([k, s]): [string, string] => [`ir:${k}`, s]),
    ...Object.entries(IR_NOISE_FIELDS).map(([k, s]): [string, string] => [`noise:${k}`, s]),
    ...EXAMPLES.map((e): [string, string] => [`example:${e.name}`, e.src]),
    ...cards.map((s, i): [string, string] => [`card source #${i} "${s.split('\n')[0].slice(0, 40)}"`, s]),
  ]
  const failed: string[] = []
  let most = 0, heavy = ''
  for (const [name, src] of programs) {
    try { const c = costOf(src); if (c > most) { most = c; heavy = name } } catch (e) { failed.push(`${name}: ${(e as Error).message}`) }
  }
  assert(`ir cost: all ${programs.length} programs in the repo (parity, noise, examples, ${cards.length} card sources) pass the cap`, failed.length === 0 && cards.length > 3, failed.join('; ') || `${cards.length} card sources`)
  assert(`ir cost: the heaviest leaves ${HEADROOM}× headroom (≤ ${IR_LIMITS.cost / HEADROOM} steps per dot)`, most <= IR_LIMITS.cost / HEADROOM, `${heavy}: ${most} steps per dot`)

  // ── the cap sits inside the device budget ──
  const edge = `for i in 0..32 with s = 0 { s + for j in 0..32 with q = 0 { q${' + u'.repeat(12)} } }`
  let edgeCost = 0, steps = 0, edgeErr = ''
  try { edgeCost = costOf(edge); steps = verifyBytecode(compileBytecode(parse(edge))).steps } catch (e) { edgeErr = (e as Error).message }
  assert('ir cost: a program just under the cap compiles to device bytecode within the device step budget',
    !edgeErr && edgeCost > IR_LIMITS.cost * .8 && edgeCost <= IR_LIMITS.cost && steps > 0, edgeErr || `${edgeCost} steps by the cost model, ${steps} device steps`)

  // ── the runtime guard, on a fake clock (each read moves it on by `tick` ms) ──
  let clock = 0, tick = 0
  const g = irGuard(50, () => (clock += tick))
  const slow = g.field('slow', 2000, (u, v) => u + v), fast = g.field('fast', 10, () => 1)
  g.begin(); tick = 1 // the slow program reads the clock every 2 dots, so it runs out of its 50 ms after about 100 dots
  let ran = 0
  for (let i = 0; i < 10000; i++) if (slow(.25, .25) !== 0) ran++
  const pausedInFrame = g.state('slow') === 'paused', restDark = fast(.5, .5) === 0
  g.settle(); tick = 0
  g.begin(); const fastNext = fast(.5, .5), slowNext = slow(.25, .25); g.settle()
  assert('ir guard: a slow but legal program is paused inside its first frame, and the rest of that frame reads 0',
    pausedInFrame && ran > 0 && ran < 200 && restDark, `${ran} of 10000 dots ran before the pause`)
  assert('ir guard: the paused program stays dark at no cost; a fast program draws and is marked ok', slowNext === 0 && fastNext === 1 && g.state('fast') === 'ok' && g.state('slow') === 'paused')
  g.resume('slow'); g.begin(); const back = slow(.25, .25); g.settle()
  assert('ir guard: resume gives a paused program another try', back === .5 && g.state('slow') === 'ok')

  // ── a guarded MAKE card: unchanged until a frame runs out, then the paused note ──
  const card = importDots({ src: EXAMPLES[0].src, grid: 'square', lattice: 3, tone: 'auto' })
  let c2 = 0, t2 = 0
  const guarded = compileCard(card, new Map(), { guard: irGuard(50, () => (c2 += t2)) }), plain = compileCard(card), ctx = { t: 1, data: {} }
  const a = guarded.layers(ctx)[0].field, b = plain.layers(ctx)[0].field
  let same = true
  for (let i = 0; i < 256; i++) { const u = (i % 16) / 15, v = Math.floor(i / 16) / 15; if (a(u, v) !== b(u, v)) same = false }
  t2 = 100
  const slowFrame = guarded.layers(ctx)[0].field
  for (let i = 0; i < 4096; i++) slowFrame(i / 4096, .5)
  const after = guarded.layers(ctx), G = card.grid
  let lit = 0
  if (after.length === 1) for (let r = 0; r < G.rows; r++) for (let col = 0; col < G.cols; col++) if (after[0].field(col / (G.cols - 1), r / (G.rows - 1)) > 0) lit++
  assert('ir guard: a guarded card draws what an unguarded one does until a frame runs out, then only the paused note',
    same && after.length === 1 && after[0].tone === 'value' && lit > 100 && plain.layers(ctx).length === 1, `${after.length} layer(s) after the pause, ${lit} lit cells`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const { assert, done } = (await import('./lib/check')).checker('IR cost')
  irCostChecks(assert)
  done()
}
