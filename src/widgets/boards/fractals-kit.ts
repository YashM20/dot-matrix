/**
 * Shared chrome and plumbing for the fractals board (`./fractals.ts`): the caption top-right, the footer, the
 * credit line, and `gridLayer`, which turns a baked or per-frame value grid (one value per card cell) into one
 * multi-tone layer through quantized bands, so every fractal reaches the dots as Field → Sampler → Renderer.
 */
import { clamp } from '../../engine/math'
import type { Field, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetCredit } from '../types'
import { caption, footer as footerText } from '../captions'

export const T = layoutFor(TILE)
export type Pt = [number, number]
export const N = TILE.cols - 1
export const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const

/** Top-right: the person or idea the card is built on, in `mid`. */
export const cite = (s: string) => caption(s)
export const FOOT = 134
/** Footer: a counter left (idle) and one stat right (mid). */
export const footer = (left: string, right: string): Layer[] => footerText(left, right, FOOT)
/** The credit every card on the board carries (docs/IQ-PLAN.md "Licence and credit"). */
export const credit = (slug: string, title: string, others: string[] = []): WidgetCredit =>
  ({ by: ['Inigo Quilez', ...others], title, source: `https://iquilezles.org/articles/${slug}/`, note: 'technique' })

/** One band of a `gridLayer`: grid values from `at` up draw in `tone` with dot value `v` (a constant or a function of the grid value). */
export interface Band { at: number; tone: Tone; v: number | ((x: number) => number) }
/** Per grid array: its band index and dot value per cell, for one `version` of its contents. */
const tables = new WeakMap<ArrayLike<number>, { version: number; bands: readonly Band[]; band: Int8Array; value: Float32Array }>()
/**
 * A w × h grid of values (row-major) placed at card cell (c0, r0) as one multi-tone layer: a cell draws in the
 * highest band whose `at` it reaches, nothing below the first. Off-grid samples (thumbnails) read the nearest cell.
 * Bands and dot values are resolved once per grid and `version`: a grid whose contents change between frames
 * (same array, new values) passes a new version each time it changes.
 */
export function gridLayer(vals: ArrayLike<number>, w: number, h: number, c0: number, r0: number, bands: readonly Band[], version = 0): Layer {
  let t = tables.get(vals)
  if (!t || t.version !== version || t.bands !== bands) {
    const band = t?.band ?? new Int8Array(w * h), value = t?.value ?? new Float32Array(w * h)
    for (let i = 0; i < w * h; i++) {
      const x = vals[i]
      let b = bands.length - 1
      while (b >= 0 && !(x >= bands[b].at)) b--
      band[i] = b
      const bv = b < 0 ? 0 : bands[b].v
      value[i] = typeof bv === 'number' ? bv : clamp(bv(x))
    }
    tables.set(vals, (t = { version, bands, band, value }))
  }
  const { band, value } = t
  const at = (u: number, v: number) => { const c = Math.round(u * N) - c0, r = Math.round(v * N) - r0; return c < 0 || r < 0 || c >= w || r >= h ? -1 : r * w + c }
  const field: Field = (u, v) => { const i = at(u, v); return i < 0 ? 0 : value[i] }
  field.bounds = [c0, r0, c0 + w - 1, r0 + h - 1]
  return { field, toneOf: (_, u, v) => { const i = at(u, v); return i < 0 || band[i] < 0 ? undefined : bands[band[i]].tone } }
}

/**
 * A red probe on a grid layer (`T.marker`): the dot snapped to the cell under it, and the grid cut in a ring of
 * clear air round it, so no band dot shows half under the red. Returns [cut grid, probe].
 */
export const probe = (grid: Layer, pt: Pt, size = 2.6): [Layer, Layer] => {
  const m = T.marker(pt, size)
  return [{ ...grid, field: m.cut(grid.field) }, layer(m.dot, 'active')]
}

/** Four quantized density bands (dot value .25 / .5 / .75 / 1): faint wisps, mid body, idle, white cores. */
export const densityBands = (a: number, b: number, c: number, d: number): Band[] => [
  { at: a, tone: 'faint', v: .25 }, { at: b, tone: 'mid', v: .5 }, { at: c, tone: 'idle', v: .75 }, { at: d, tone: 'value', v: 1 },
]
/** Plane (x, y) → card cell, for a window [x0, y0, x1, y1] drawn as a w × h grid at (c0, r0) (cell centres). */
export const toCell = (win: readonly [number, number, number, number], w: number, h: number, c0: number, r0: number) =>
  (x: number, y: number): Pt => [c0 + (x - win[0]) / (win[2] - win[0]) * w - .5, r0 + (y - win[1]) / (win[3] - win[1]) * h - .5]
/** Card cell centre (col, row) of a w × h grid at (c0, r0) → plane (x, y). */
export const toPlane = (win: readonly [number, number, number, number], w: number, h: number) =>
  (i: number, j: number): Pt => [win[0] + (i + .5) / w * (win[2] - win[0]), win[1] + (j + .5) / h * (win[3] - win[1])]
/** Seconds → a looped phase in [0, 1). */
export const phase = (t: number, period: number) => { const p = (t % period) / period; return p < 0 ? p + 1 : p }
export const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
/** Signed fixed-point text that keeps its width: "+0.31" / "-0.31". */
export const signed = (x: number, digits = 2) => (x < 0 ? '-' : '+') + Math.abs(x).toFixed(digits)
