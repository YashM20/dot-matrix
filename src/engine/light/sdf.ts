import type { Field, GridConfig } from '../types'
import { len } from '../math'

/**
 * Signed distance fields in cell units of one grid: negative inside, positive outside, the edge at 0.
 * They are `Field`s that are deliberately not clamped to [0,1]: feed them to `heightRaster`, not to
 * the sampler. Bounds are left off (the distance is defined everywhere).
 */
const at = (grid: GridConfig, f: (x: number, y: number) => number): Field => (u, v) => f(u * (grid.cols - 1), v * (grid.rows - 1))

/** Disc of radius `r` cells centred on cell (cx, cy). */
export const sdfCircle = (grid: GridConfig, cx: number, cy: number, r: number): Field => at(grid, (x, y) => len(x - cx, y - cy) - r)

/** Rectangle centred on (cx, cy) with half-size (hw, hh) and corner radius `radius` (all in cells). */
export function sdfBox(grid: GridConfig, cx: number, cy: number, hw: number, hh: number, radius = 0): Field {
  const rr = Math.min(radius, hw, hh)
  return at(grid, (x, y) => {
    const qx = Math.abs(x - cx) - hw + rr, qy = Math.abs(y - cy) - hh + rr
    return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rr
  })
}

/** Ring of mid-radius `r` and half-thickness `half` around (cx, cy). */
export const sdfRing = (grid: GridConfig, cx: number, cy: number, r: number, half: number): Field => at(grid, (x, y) => Math.abs(len(x - cx, y - cy) - r) - half)

/** Union (min) of SDFs. */
export const sdfUnion = (...fs: Field[]): Field => (u, v) => { let m = Infinity; for (const f of fs) { const d = f(u, v); if (d < m) m = d } return m }
/** `a` with `b` cut out of it. */
export const sdfSubtract = (a: Field, b: Field): Field => (u, v) => Math.max(a(u, v), -b(u, v))
