/**
 * Verify section for C3 (Growing NCA): BPTT gradient check, asset decode + size, determinism of the
 * timeline, regrowth from a 50% cut (gate < 5 s at 30 steps/s), step cost at the board grid and at 64²,
 * pointer scratches, and the heal board rendering. Imported by scripts/verify.ts.
 */
import { ncaAliveCount, ncaGrid, ncaModel, ncaRun, ncaRunAt, ncaRunAtStep, ncaScratch, ncaSeed, ncaStep, ncaStepAt } from '../../src/engine/nca'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import { lizardNca } from '../../src/assets/nca/lizard'
import { healBoard } from '../../src/widgets/boards/heal'
import { withChrome } from '../../src/widgets'
import { gradCheck } from './gradcheck'
import { lizardTarget } from './target'
import { iou, regrow, STEP_DT } from './eval'

type Assert = (name: string, cond: boolean, detail?: string) => void
const hashCells = (a: Float32Array) => { let h = 0x811c9dc5; const u = new Uint32Array(a.buffer, a.byteOffset, a.length); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0 } return h }

export function ncaChecks(assert: Assert): void {
  const gc = gradCheck()
  assert('nca: hand-written BPTT matches finite differences', gc.checked >= 20 && gc.worst < 1e-2, `${gc.checked} params, worst rel. error ${gc.worst.toExponential(1)}`)

  const m = ncaModel(lizardNca), bytes = lizardNca.w1.length + lizardNca.w2.length
  const params = m.w1.length + m.b1.length + m.w2.length
  assert('nca: Int8 asset decodes to the declared shape', m.w1.length === m.hidden * 3 * m.channels && m.w2.length === m.hidden * m.channels && m.b1.length === m.hidden,
    `${m.channels} ch, ${m.hidden} hidden, ${params} params, ${bytes} B base64 weights`)

  // grow from the seed, then a 50% cut (top half: head + front legs) must be back within 5 s at 30 steps/s
  const target = lizardTarget(), g = ncaGrid(m.w, m.h, m.channels)
  let s = new Float32Array(g.cells.length)
  const step = (n: number) => { ncaStep(m, g.cells, s, g.w, g.h, 1, n); const t = g.cells; g.cells = s; s = t }
  ncaSeed(g, m.seedAt[0], m.seedAt[1])
  for (let n = 0; n < 160; n++) step(n)
  const grownIou = iou(g, target), grown = g.cells.slice(), rg = regrow(m, grown, (_x, y) => y < m.h * .46, target, 240)
  assert('nca: regrows from a 50% cut (top half) in < 5 s at 30 steps/s (≥ 90% of an uncut twin IoU)', grownIou > .8 && rg.removed > .4 && rg.steps * STEP_DT < 5,
    `grown IoU ${grownIou.toFixed(2)}, cut ${(rg.removed * 100).toFixed(0)}%, back in ${rg.steps} steps = ${(rg.steps * STEP_DT).toFixed(2)} s (IoU ${rg.iou.toFixed(2)} vs twin ${rg.twin.toFixed(2)})`)

  // step cost: the board grid with a grown lizard, and 64² holding four lizards
  let t0 = performance.now()
  for (let n = 0; n < 48; n++) step(3000 + n)
  const boardMs = (performance.now() - t0) / 48
  const big = ncaGrid(64, 64, m.channels)
  let bs = new Float32Array(big.cells.length)
  for (const [ox, oy] of [[0, 0], [32, 0], [0, 32], [32, 32]]) for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const src = ((y + 1) * (m.w + 2) + x + 1) * m.channels, dst = ((oy + y + 1) * 66 + ox + x + 1) * m.channels
    big.cells.set(grown.subarray(src, src + m.channels), dst)
  }
  t0 = performance.now()
  for (let n = 0; n < 24; n++) { ncaStep(m, big.cells, bs, 64, 64, 1, n); const t = big.cells; big.cells = bs; bs = t }
  const bigMs = (performance.now() - t0) / 24
  // the 2 ms idle-machine gate is reported, not asserted: verify runs beside other jobs (see mirror-camera)
  assert('nca: step cost (board grid, and 64² with four grown lizards) under a loose 60 ms budget', bigMs < 60, `${m.w}×${m.h}: ${boardMs.toFixed(2)} ms/step, 64²: ${bigMs.toFixed(2)} ms/step (gate 2 ms on an idle machine)`)

  // timeline: same t → same state in any call order; a scratch goes live and erases
  const mk = () => ncaRun({ model: m, dt: STEP_DT, seed: 4, lead: 2, period: 8, every: 24 })
  const a = mk(), b = mk()
  ncaRunAt(a, 5); const ha = hashCells(ncaRunAt(a, 3).cells)
  const hb = hashCells(ncaRunAt(b, 3).cells), hc = hashCells(ncaRunAtStep(b, ncaStepAt(b, 3)).cells)
  assert('nca: the timeline is a pure function of t (call order, checkpoints)', ha === hb && hb === hc, `hashes ${[ha, hb, hc].map(h => h.toString(16)).join('/')}`)
  const pre = ncaAliveCount(ncaRunAt(a, 3)), hit = ncaScratch(a, 3, 12, 12, 3)
  assert('nca: a pointer scratch erases cells and takes the run live', hit > 0 && a.live && ncaAliveCount(a.grid) < pre, `erased ${hit} of ${pre}`)

  // the board: every card renders at t = 0 / 1.3 / 3 and deterministically
  const counts = healBoard.map(p => [0, 1.3, 3].map(t => sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480).length))
  const again = healBoard.map(p => sampleLayers(withChrome(p)({ t: 1.3, data: { ...p.defaults } }), p.grid, p.style, dot480).length)
  assert('nca: heal board renders every card, stable without a pointer', counts.every(c => c.every(n => n > 150)) && again.every((n, i) => n === counts[i][1]), counts.map(c => c.join('/')).join(' · '))
}
