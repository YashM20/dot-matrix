/**
 * Shared chrome and helpers of the Squares board (docs/living-matter/Q-squares.md §2.6): the card style, the
 * label / reference / footer chrome, and `cells`, a layer read per lattice cell. Q1–Q2 cards live in squares.ts,
 * the Q3 field pack, motif and morph cards in squaresPack.ts.
 */
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { clamp } from '../../engine/math'
import type { DotStyle, Field, JoinSpec, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor } from '../types'
import { caption, footer as footerText } from '../captions'

export const T = layoutFor(TILE)
export type Pt = [number, number]
export const N = TILE.cols - 1
/**
 * Squares card style: `square` dots, five quantized levels, and a .16 gutter (`{grid.gap}`), so a full cell's half
 * side is .84 of the half pitch, about the tile circle's radius (4/π its ink).
 */
export const squareStyle: DotStyle = { shape: 'square', sizeMin: .25, sizeMax: 1.125, gap: .16, quantizeSteps: 5, opacityMode: 'fromValue' }
export const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: squareStyle, animated: true } as const

/** Top-right: the work the card is after. */
export const cite = (s: string) => caption(s)
export const FOOT = 137, RAIL_Y = 132
/** Footer: a faint dotted rail filled in `mid` to `k`, an optional live (red) knob, a counter left and one stat right. */
export function footer(k: number, left: string, right: string, live = false): Layer[] {
  const done: Pt[] = [], rest: Pt[] = [], end = N * clamp(k)
  let knob: Pt | undefined
  for (let c = 0; c <= N; c += 3) (c <= end ? done : rest).push([c, RAIL_Y])
  if (live && done.length) knob = done.pop()
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    ...(knob ? [layer(T.dots([knob], 2.2), 'active')] : []),
    ...footerText(left, right, FOOT),
  ]
}
export const pad = (n: number, w: number) => String(Math.max(0, Math.round(n))).padStart(w, '0')
export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
export const mod = (x: number, m: number) => ((x % m) + m) % m

/**
 * A base-grid layer (card cells, no lattice) over the w × h box at `origin`, read per cell like `cells`: cheaper than
 * a 1× lattice for a full-card floor (no cover pass). `group` and `rotation` are per cell too.
 */
export function cardCells(origin: Pt, w: number, h: number, value: (c: number, r: number) => number,
  opts: { toneOf?: (c: number, r: number) => Tone | undefined; join?: JoinSpec | true; group?: (c: number, r: number) => number; rotation?: (c: number, r: number) => number } = {}): Layer {
  const col = (u: number) => Math.round(u * N) - origin[0], row = (v: number) => Math.round(v * N) - origin[1]
  const field: Field = (u, v) => { const c = col(u), r = row(v); return c < 0 || r < 0 || c >= w || r >= h ? 0 : value(c, r) }
  field.bounds = [origin[0], origin[1], origin[0] + w - 1, origin[1] + h - 1]
  const { toneOf, group, rotation } = opts
  const join: JoinSpec | true | undefined = group ? { ...(opts.join === true || !opts.join ? {} : opts.join), group: (u, v) => group(col(u), row(v)) } : opts.join
  return {
    field, ...(toneOf ? { toneOf: (_: number, u: number, v: number) => toneOf(col(u), row(v)) } : {}), ...(join ? { join } : {}),
    ...(rotation ? { rotation: (_: number, u: number, v: number) => rotation(col(u), row(v)) } : {}),
  }
}
/**
 * A layer on a `k`× lattice (`[kx, ky]`: rect cells) at card cell `origin`, read per lattice cell: `value(c, r)` over
 * [0, w) × [0, h) (0 outside), optionally a tone, a join group per cell and a size axis. The field is bounded, so the
 * sampler only visits the box.
 */
export function cells(k: number | Pt, origin: Pt, w: number, h: number, value: (c: number, r: number) => number,
  opts: { tone?: Tone; toneOf?: (c: number, r: number) => Tone | undefined; join?: JoinSpec | true; group?: (c: number, r: number) => number; sizeAxis?: Layer['sizeAxis'] } = {}): Layer {
  const sub = latticeGrid(TILE, k, origin), X = Math.max(1, sub.cols - 1), Y = Math.max(1, sub.rows - 1)
  const at = (u: number, v: number): [number, number] => [Math.round(u * X), Math.round(v * Y)]
  const field: Field = (u, v) => { const [c, r] = at(u, v); return c < 0 || r < 0 || c >= w || r >= h ? 0 : value(c, r) }
  field.bounds = [0, 0, w - 1, h - 1]
  const { tone, toneOf, group } = opts
  const join: JoinSpec | true | undefined = group ? { ...(opts.join === true || !opts.join ? {} : opts.join), group: (u, v) => { const [c, r] = at(u, v); return group(c, r) } } : opts.join
  return { field, lattice: k, origin, tone, ...(toneOf ? { toneOf: (_: number, u: number, v: number) => { const [c, r] = at(u, v); return toneOf(c, r) } } : {}), ...(join ? { join } : {}), ...(opts.sizeAxis ? { sizeAxis: opts.sizeAxis } : {}) }
}
