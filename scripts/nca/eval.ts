/**
 * Node-side evaluation of a shipped NCA model with the engine's own inference: grow from the seed, cut
 * away 50% of the body, count the steps until it is back. IoU is over cells with alpha > .5.
 */
import { ncaAliveCount, ncaErase, ncaGrid, ncaSeed, ncaStep, type NcaGrid, type NcaModel } from '../../src/engine/nca'

export const STEP_DT = 1 / 24

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

export interface Eval {
  grownStep: number; grownIou: number; grownMse: number
  /** IoU after 600 steps (long-run stability). */
  longIou: number
  cuts: { name: string; removed: number; steps: number; iou: number }[]
}
export function evaluate(m: NcaModel, target: Float32Array, seed = 1): Eval {
  const g = ncaGrid(m.w, m.h, m.channels)
  let scratch = new Float32Array(g.cells.length)
  const step = (n: number) => { ncaStep(m, g.cells, scratch, g.w, g.h, seed, n); const s = g.cells; g.cells = scratch; scratch = s }
  ncaSeed(g, m.seedAt[0], m.seedAt[1])
  let n = 0, grownStep = -1
  for (; n < 200; n++) { step(n); if (grownStep < 0 && iou(g, target) >= .9) grownStep = n + 1 }
  const grownIou = iou(g, target), grownMse = mse(g, target), grown = g.cells.slice()
  const cuts = CUTS(m.w, m.h).map(({ name, cut }) => {
    g.cells.set(grown)
    const before = ncaAliveCount(g), removed = ncaErase(g, cut) / Math.max(1, before)
    let k = 0
    for (; k < 400; k++) { step(1000 + k); if (iou(g, target) >= Math.min(.9, grownIou - .03)) break }
    return { name, removed, steps: k + 1, iou: iou(g, target) }
  })
  g.cells.set(grown)
  for (let k = 0; k < 400; k++) step(5000 + k)
  return { grownStep, grownIou, grownMse, longIou: iou(g, target), cuts }
}
