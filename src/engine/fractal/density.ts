/**
 * Density accumulation, shared by the orbit fractals (popcorn, IFS, icons): a histogram over a window of the
 * plane counts how often an orbit lands in each cell, and a tone curve turns the counts into [0, 1] values a dot
 * size can follow. The counts span decades, so the curve is a square root (as in the IFS article) or a log,
 * normalised to a high quantile of the lit cells rather than the single busiest one, so a few hot cells don't
 * leave the rest of the picture dim.
 *
 * Deterministic: integer counts, `Math.sqrt`, `dlog`.
 */
import { dlog } from '../noise/dmath'

/** A w × h histogram over the window [x0, y0, x1, y1] of the plane (row 0 at y0). */
export interface Histogram {
  w: number
  h: number
  window: readonly [number, number, number, number]
  /** Hits per cell, row-major. */
  hits: Float32Array
  /** Orbit points binned (inside the window or not). */
  steps: number
  /** Cells hit at least once, and the busiest cell's count. */
  covered: number
  max: number
}
export function histogram(w: number, h: number, window: readonly [number, number, number, number]): Histogram {
  return { w, h, window, hits: new Float32Array(w * h), steps: 0, covered: 0, max: 0 }
}
/** A binning function for `h`: plot(x, y) adds one hit to the cell under (x, y), if it is in the window. */
export function plotter(h: Histogram): (x: number, y: number) => void {
  const { w, hits } = h, [x0, y0, x1, y1] = h.window, sx = w / (x1 - x0), sy = h.h / (y1 - y0), hh = h.h
  return (x, y) => {
    h.steps++
    const px = Math.floor((x - x0) * sx), py = Math.floor((y - y0) * sy)
    if (!(px >= 0 && py >= 0 && px < w && py < hh)) return
    const i = py * w + px, v = ++hits[i]
    if (v === 1) h.covered++
    if (v > h.max) h.max = v
  }
}
/**
 * A window of aspect w : h centred on (cx, cy) that holds a box of half-size (rx, ry): the histogram's cells
 * stay square, so a symmetric shape stays symmetric on the grid.
 */
export function fitWindow(cx: number, cy: number, rx: number, ry: number, w: number, h: number): [number, number, number, number] {
  const s = Math.max(2 * rx / w, 2 * ry / h)
  return [cx - s * w / 2, cy - s * h / 2, cx + s * w / 2, cy + s * h / 2]
}

export interface ToneOptions {
  /** `sqrt` (the IFS article's choice) or `log` (log(1 + hits)). Default `sqrt`. */
  curve?: 'sqrt' | 'log'
  /** The lit-cell quantile that maps to 1 (default .98); cells above it clamp. */
  quantile?: number
  /** Reuse this array (w × h). */
  out?: Float32Array
}
// after Inigo Quilez, https://iquilezles.org/articles/ifsfractals/ (MIT): the square root of the density as tone
/** The histogram as tone values in [0, 1]: 0 where nothing landed, else curve(hits) / curve(quantile hits), clamped. */
export function densityTone(h: Histogram, o: ToneOptions = {}): Float32Array {
  const { curve = 'sqrt', quantile = .98 } = o, n = h.hits.length
  const out = o.out && o.out.length === n ? o.out : new Float32Array(n)
  if (!h.covered) { out.fill(0); return out }
  // the quantile by counting: hits are integers, so a histogram of counts (capped at 4096) is exact below the cap
  const cap = Math.min(h.max, 4096), counts = new Uint32Array(cap + 1)
  for (let i = 0; i < n; i++) { const v = h.hits[i]; if (v > 0) counts[v > cap ? cap : v]++ }
  let rest = h.covered * (1 - quantile), q = cap
  for (let v = cap; v >= 1; v--) { rest -= counts[v]; if (rest <= 0) { q = v; break } }
  const f = curve === 'sqrt' ? Math.sqrt : (v: number) => dlog(1 + v), k = 1 / f(q)
  for (let i = 0; i < n; i++) { const v = h.hits[i]; out[i] = v > 0 ? Math.min(1, f(v) * k) : 0 }
  return out
}
