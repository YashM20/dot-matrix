/**
 * Node-side evaluation of a shipped NCA model with the engine's own inference: grow from the seed, cut
 * away 50% of the body, count the steps until it is back. IoU is over cells with alpha > .5.
 */
import { ncaAliveCount, ncaErase, ncaGrid, ncaSeed, ncaStep, type NcaGrid, type NcaModel } from '../../src/engine/nca'

/** Card step rate: one NCA step every other frame at 60 fps. */
export const STEP_DT = 1 / 30

export function iou(g: NcaGrid, target: Float32Array): number {
  let inter = 0, uni = 0
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const a = g.cells[((y + 1) * (g.w + 2) + x + 1) * g.channels] > .5, b = target[(y * g.w + x) * 2] > .5
    if (a && b) inter++
    if (a || b) uni++
  }
  return uni ? inter / uni : 1
}
/** Mean squared error over alpha and tone. */
export function mse(g: NcaGrid, target: Float32Array): number {
  let e = 0
  for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
    const o = ((y + 1) * (g.w + 2) + x + 1) * g.channels, k = (y * g.w + x) * 2
    e += (g.cells[o] - target[k]) ** 2 + (g.cells[o + 1] - target[k + 1]) ** 2
  }
  return e / (g.w * g.h * 2)
}

export interface Cut { name: string; cut: (x: number, y: number) => boolean }
export const CUTS = (w: number, h: number): Cut[] => [
  { name: 'left half', cut: x => x < w / 2 },
  { name: 'right half', cut: x => x >= w / 2 },
  { name: 'top half', cut: (_x, y) => y < h * .46 },
  { name: 'bottom half', cut: (_x, y) => y >= h * .46 },
]

export interface Regrow { removed: number; steps: number; iou: number; twin: number }
/**
 * Cut a grown state and step it beside an undamaged twin (same seed, same step indices) until the cut
 * one is back to 90% of the twin's IoU: "healed" relative to where the uncut lizard is at that moment,
 * since a grown NCA keeps breathing too. `steps` = maxSteps + 1 if it never got there.
 */
export function regrow(m: NcaModel, grown: Float32Array, cut: Cut['cut'], target: Float32Array, maxSteps = 240, seed = 1): Regrow {
  const mk = () => { const g = ncaGrid(m.w, m.h, m.channels); g.cells.set(grown); return { g, s: new Float32Array(g.cells.length) } }
  const go = (r: { g: NcaGrid; s: Float32Array }, n: number) => { ncaStep(m, r.g.cells, r.s, r.g.w, r.g.h, seed, n); const t = r.g.cells; r.g.cells = r.s; r.s = t }
  const a = mk(), b = mk(), before = ncaAliveCount(b.g), removed = ncaErase(b.g, cut) / Math.max(1, before)
  let k = 0
  for (; k <= maxSteps; k++) {
    if (iou(b.g, target) >= .9 * iou(a.g, target)) break
    go(a, 1000 + k); go(b, 1000 + k)
  }
  return { removed, steps: k, iou: iou(b.g, target), twin: iou(a.g, target) }
}

export interface Eval {
  grownStep: number; grownIou: number; grownMse: number
  /** IoU after 600 steps (long-run stability). */
  longIou: number
  cuts: ({ name: string } & Regrow)[]
}
export function evaluate(m: NcaModel, target: Float32Array, seed = 1): Eval {
  const g = ncaGrid(m.w, m.h, m.channels)
  let scratch = new Float32Array(g.cells.length)
  const step = (n: number) => { ncaStep(m, g.cells, scratch, g.w, g.h, seed, n); const s = g.cells; g.cells = scratch; scratch = s }
  ncaSeed(g, m.seedAt[0], m.seedAt[1])
  let n = 0, grownStep = -1
  for (; n < 200; n++) { step(n); if (grownStep < 0 && iou(g, target) >= .9) grownStep = n + 1 }
  const grownIou = iou(g, target), grownMse = mse(g, target), grown = g.cells.slice()
  const cuts = CUTS(m.w, m.h).map(({ name, cut }) => ({ name, ...regrow(m, grown, cut, target, 400, seed) }))
  g.cells.set(grown)
  for (let k = 0; k < 400; k++) step(5000 + k)
  return { grownStep, grownIou, grownMse, longIou: iou(g, target), cuts }
}

/** The four hidden channels with the most spatial structure (std over live cells) once grown, for the x-ray card. */
export function pickXray(m: NcaModel, seed = 1): number[] {
  const g = ncaGrid(m.w, m.h, m.channels)
  let s = new Float32Array(g.cells.length)
  ncaSeed(g, m.seedAt[0], m.seedAt[1])
  for (let n = 0; n < 160; n++) { ncaStep(m, g.cells, s, g.w, g.h, seed, n); const t = g.cells; g.cells = s; s = t }
  const score: [number, number][] = []
  for (let c = 2; c < m.channels; c++) {
    let n = 0, a = 0, b = 0
    for (let i = 0; i < g.cells.length; i += m.channels) if (g.cells[i] > .1) { const v = g.cells[i + c]; n++; a += v; b += v * v }
    score.push([c, n ? Math.sqrt(Math.max(0, b / n - (a / n) ** 2)) : 0])
  }
  return score.sort((p, q) => q[1] - p[1]).slice(0, 4).map(p => p[0]).sort((p, q) => p - q)
}
