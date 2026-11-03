/**
 * Squares board, X-advanced #2 (docs/living-matter/X-advanced.md): the arctic circle.
 *
 *   ARCTIC  domino shuffling (Elkies, Kuperberg, Larsen & Propp 1992) grows a uniformly random tiling of the Aztec
 *           diamond one order at a time, up to order 29. The four corners freeze into brick walls, one direction
 *           each, around a disordered disc whose edge tends to the circle of radius n / √2 (Jockusch, Propp & Shor
 *           1995).
 *
 * Each domino is two lattice squares joined into one piece: the join group is a greedy colouring of touching
 * dominoes (`engine/squares/aztec`), so two same-direction neighbours stay apart. Tone is the direction. One step
 * plays in three beats: the colliding pairs go, the rest slide one cell, the holes fill with new pairs. The red is
 * the edge of the frozen corners (`frozenOf`): each frozen domino with an unfrozen neighbour, which closes in on the
 * circle as the order grows. The diamond grows over 13 s, holds, then rewinds to nothing at 4× speed.
 */
import { aztecShuffle, colourDominoes, frozenOf, ownerGrid, partner, tilingAt, type AztecHistory, type Domino } from '../../engine/squares/aztec'
import type { Tone } from '../../engine/types'
import type { WidgetPreset } from '../types'
import { cells, cite, footer, mod, pad, tile, type Pt } from './squaresKit'

/** Orders, the lattice (card cells per domino cell) and the card box: 2·ORDERS lattice cells across, centred. */
const ORDERS = 29, K = 2, SIDE = 2 * ORDERS, ORIGIN: Pt = [(144 - K * SIDE) / 2, 12]
/** Seconds per step, the hold at the full diamond, the rewind speed, and t = 0 a second before the hold ends. */
const STEP = .45, HOLD = 3, REWIND = 4, GROW = ORDERS * STEP, LOOP = GROW + HOLD + GROW / REWIND, OFF = GROW + HOLD - 1
const SEED = 1992
/** Below this order nearly every domino is frozen and the edge is the whole diamond, so the red waits. */
const MIN_EDGE = 6
/** Tone per direction (N S E W): the four frozen corners read as four bands. */
const DIR_TONE: Tone[] = ['value', 'mid', 'idle', 'faint']
const TONES: Tone[] = [...DIR_TONE, 'active']
const DIR_LEVEL = [.75, 1, 1, 1]

let hist: AztecHistory | undefined
export const arcticHistory = () => (hist ??= aztecShuffle(ORDERS, SEED))

/** The state at time t: the step being played (1…ORDERS), its beat (0 collide, 1 slide, 2 fill) and the order shown. */
export function arcticBeat(t: number): { step: number; beat: number; order: number } {
  const p = mod(t + OFF, LOOP)
  // grow forward, hold the full diamond, then rewind through the same beats
  const s = p < GROW ? p / STEP : p < GROW + HOLD ? ORDERS : Math.max(0, ORDERS - (p - GROW - HOLD) * REWIND / STEP)
  if (s >= ORDERS) return { step: ORDERS, beat: 2, order: ORDERS }
  const step = Math.floor(s) + 1, beat = Math.min(2, Math.floor((s - step + 1) * 3))
  return { step, beat, order: beat === 2 ? step : step - 1 }
}

/** One frame's lattice cells (row-major, SIDE²): tone index (255 = empty), join group and level; counts for the footer. */
export interface ArcticCells { tone: Uint8Array; group: Uint8Array; level: Float32Array; shown: number; frozen: number; edge: number }
let last: { key: number; cells: ArcticCells } | undefined
/** Frozen flags of the full order-n tiling, cached per order (the collide and slide beats carry the step before's). */
const frozenCache = new Map<number, Uint8Array>()
const frozenAt = (n: number) => {
  let f = frozenCache.get(n)
  if (!f) { const ds = tilingAt(arcticHistory(), n); f = frozenOf(ds, ownerGrid(ds, Math.max(1, n)), Math.max(1, n)); frozenCache.set(n, f) }
  return f
}
export function arcticCells(step: number, beat: number): ArcticCells {
  const key = step * 3 + beat
  if (last?.key === key) return last.cells
  const h = arcticHistory(), st = h.steps[step - 1]
  // collide: the order step − 1 tiling without its dead pairs; slide: the survivors moved; fill: the full tiling.
  // Frozen flags come from the last full tiling and travel with each domino (survivors keep their order).
  let ds: Domino[], fz: Uint8Array
  if (beat === 2) { ds = tilingAt(h, step); fz = frozenAt(step) }
  else {
    const f0 = frozenAt(step - 1), keep = st.before.map((_, i) => i).filter(i => !st.dead[i])
    ds = beat === 0 ? keep.map(i => st.before[i]) : st.slid; fz = Uint8Array.from(keep, i => f0[i])
  }
  const grid = ownerGrid(ds, ORDERS), col = colourDominoes(ds, grid, ORDERS)
  const tone = new Uint8Array(SIDE * SIDE).fill(255), group = new Uint8Array(SIDE * SIDE), level = new Float32Array(SIDE * SIDE)
  let frozen = 0, edge = 0
  const showEdge = (beat === 2 ? step : step - 1) >= MIN_EDGE
  ds.forEach((d, i) => {
    // the red: a frozen domino with a liquid (unfrozen) neighbour, the edge of the circle
    let red = false
    if (fz[i]) frozen++
    if (fz[i] && showEdge) {
      for (const [cx, cy] of [[d.x, d.y], partner(d)]) for (const [dx, dy] of NB) {
        const x = cx + dx, y = cy + dy, j = x < -ORDERS || y < -ORDERS || x >= ORDERS || y >= ORDERS ? -1 : grid[(y + ORDERS) * SIDE + x + ORDERS]
        if (j >= 0 && !fz[j]) red = true
      }
      if (red) edge++
    }
    for (const [x, y] of [[d.x, d.y], partner(d)]) {
      const j = (ORDERS - 1 - y) * SIDE + x + ORDERS
      tone[j] = red ? 4 : d.dir; group[j] = col[i]; level[j] = red ? 1 : DIR_LEVEL[d.dir]
    }
  })
  const cells: ArcticCells = { tone, group, level, shown: ds.length, frozen, edge }
  last = { key, cells }
  return cells
}
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/** The order-ORDERS diamond holds lattice cell (c, r). */
const inFrame = (c: number, r: number) => Math.abs(2 * (c - ORDERS) + 1) + Math.abs(2 * (ORDERS - 1 - r) + 1) <= 2 * ORDERS

export const sqArctic: WidgetPreset = {
  id: 'sq-arctic', name: 'Squares Arctic', label: 'ARCTIC', ...tile,
  credit: { by: ['William Jockusch', 'James Propp', 'Peter Shor'], title: 'Random domino tilings and the arctic circle theorem', source: 'https://arxiv.org/abs/math/9801068', note: 'technique; domino shuffling by Noam Elkies, Greg Kuperberg, Michael Larsen and James Propp (1992)' },
  layers: ctx => {
    const b = arcticBeat(ctx.t), a = arcticCells(b.step, b.beat), at = (c: number, r: number) => a.tone[r * SIDE + c]
    return [
      cite('JOCKUSCH 1995'),
      // the diamond's frame: small faint squares where no domino sits yet
      cells(K, ORIGIN, SIDE, SIDE, (c, r) => (at(c, r) === 255 && inFrame(c, r) ? .25 : 0), { tone: 'faint' }),
      cells(K, ORIGIN, SIDE, SIDE, (c, r) => (at(c, r) === 255 ? 0 : a.level[r * SIDE + c]), {
        toneOf: (c, r) => TONES[at(c, r)], group: (c, r) => a.group[r * SIDE + c], join: { accent: true },
      }),
      ...footer(b.order / ORDERS, `ORDER ${pad(b.order, 2)}`, `FROZEN ${pad(a.shown ? 100 * a.frozen / a.shown : 0, 2)}%`),
    ]
  },
}
/** Sizes for the checks (`scripts/arctic.ts`). */
export const ARCTIC_CARD = { orders: ORDERS, k: K, side: SIDE, origin: ORIGIN, loop: LOOP, step: STEP, seed: SEED }
