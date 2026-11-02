/**
 * The adapter from a bound SDF to a `Field` in cell units, the way `light/sdf.ts` does it: u, v in [0, 1] map to
 * cells (u·(cols − 1), v·(rows − 1)), so a distance of 1 is one cell. Like those helpers, the result is a signed
 * distance and is not clamped to [0, 1]: feed it to `heightRaster` or a tone curve, not to the sampler directly.
 */
import type { Field, GridConfig } from '../types'
import type { Sd2 } from './ops'
import { dcos, dsin } from './util'

export interface SdfPlace {
  /** Shape centre in cells (default 0, 0). */
  cx?: number; cy?: number
  /** Uniform scale: shape units per cell are multiplied by this (default 1). The distance stays in cells. */
  scale?: number
  /** Rotation in radians (default 0). */
  angle?: number
  /** Cells count y downward; the SDFs are written y-up. Set to draw a shape the way the article shows it. */
  flipY?: boolean
}

/** A bound SDF as a cell-unit `Field`: `sdfField(grid, (x, y) => sdStar(x, y, 6, 5, 3), { cx: 20, cy: 12 })`. */
export function sdfField(grid: GridConfig, sd: Sd2, place: SdfPlace = {}): Field {
  const { cx = 0, cy = 0, scale = 1, angle = 0, flipY = false } = place
  const sx = grid.cols - 1, sy = grid.rows - 1, k = 1 / scale, fy = flipY ? -1 : 1
  if (angle === 0) return (u, v) => scale * sd((u * sx - cx) * k, (v * sy - cy) * k * fy)
  const c = dcos(angle), s = dsin(angle)
  return (u, v) => {
    const dx = (u * sx - cx) * k, dy = (v * sy - cy) * k * fy
    return scale * sd(c * dx + s * dy, -s * dx + c * dy)
  }
}
