/**
 * Canvas hooks (`shapeExt.canvas`, `shapeExt.bufferDot`, Q-squares §2.4.1): a joined cell's clockwise outline,
 * left open for `fill`. Joined neighbours share tone and level, so they sit in one `Path2D`: one nonzero fill of
 * abutting clockwise sub-paths, no conflation seam, no bleed.
 */
import type { DotBuffer } from '../buffer/dotBuffer'
import { addDotShape, type PathSink } from '../renderer/canvasRenderer'
import { squircleExponent } from '../renderer/shapePath'
import type { JointGeom } from '../types'
import { joinOutline, type OutlineSink } from './geometry'

export function canvasJoin(p: PathSink, x: number, y: number, s: number, mask: number, g: JointGeom): void {
  joinOutline(p as unknown as OutlineSink, x, y, s, g, mask, 0, false)
}
/** Buffer dot `i` from its channels: a joined cell, or a per-dot roundness step; false = a plain dot (frame style). */
export function bufferDot(p: PathSink, buf: DotBuffer, i: number): boolean {
  const j = buf.join![i], f = buf.form![i]
  if (j !== 0xFFFF) { canvasJoin(p, buf.x[i], buf.y[i], buf.r[i], j & 0xFFF, buf.joints![j >> 12]); return true }
  if (f !== 15) { addDotShape(p, buf.x[i], buf.y[i], buf.r[i], 'squircle', squircleExponent(f / 8), false); return true }
  return false
}
