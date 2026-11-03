/**
 * Chart readouts (#132): which data point a pointer, tap or key lands on. Every pick snaps to a real point (the
 * nearest one), so the readout never shows a value between two. Ties go to the earlier point. -1 means no point.
 */
import { TAU, datan2 } from '../noise/dmath'

/** Index of the position in `xs` nearest to `x` (time series: the readout follows the pointer across). */
export function nearestIndex(xs: readonly number[], x: number): number {
  let best = -1, d = Infinity
  for (let i = 0; i < xs.length; i++) { const e = Math.abs(xs[i] - x); if (e < d) { d = e; best = i } }
  return best
}

/** Index of the point nearest to (x, y) (grids, scatter). */
export function nearestPoint(pts: readonly (readonly [number, number])[], x: number, y: number): number {
  let best = -1, d = Infinity
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - x, dy = pts[i][1] - y, e = dx * dx + dy * dy
    if (e < d) { d = e; best = i }
  }
  return best
}

/** Clock fraction (0 at 12 o'clock, clockwise, [0, 1)) of (x, y) around (cx, cy). */
export function clockOf(cx: number, cy: number, x: number, y: number): number {
  const a = datan2(x - cx, cy - y) / TAU
  return a < 0 ? a + 1 : a >= 1 ? 0 : a
}

/** Index of the segment holding clock fraction `a`, for segment ends `bounds` (cumulative, last = 1); -1 when empty. */
export function segmentAt(bounds: readonly number[], a: number): number {
  for (let i = 0; i < bounds.length; i++) if (a < bounds[i]) return i
  return bounds.length - 1
}

/** A pick from data (a float key) as an index into n points, or -1. */
export const pickIndex = (pick: number, n: number) => { const i = Math.round(pick); return i >= 0 && i < n ? i : -1 }
