/**
 * Canvas hooks (`shapeExt.canvas`, `shapeExt.bufferDot`, Q-squares §2.4.1, §3.2): a joined cell's clockwise outline,
 * left open for `fill`, and a rect cell's outline. Joined neighbours share tone and level, so they sit in one
 * `Path2D`: one nonzero fill of abutting clockwise sub-paths, no conflation seam, no bleed.
 */
import type { DotBuffer } from '../buffer/dotBuffer'
import { addDotShape, type PathSink } from '../renderer/canvasRenderer'
import { squircleExponent } from '../renderer/shapePath'
import type { DotInstance, JointGeom } from '../types'
import { joinOutline, rectOutline, type OutlineSink } from './geometry'

/** A joined cell (half height `hs` = s on a square cell). */
export function canvasJoin(p: PathSink, x: number, y: number, s: number, mask: number, g: JointGeom, hs = s): void {
  joinOutline(p as unknown as OutlineSink, x, y, s, g, mask, 0, false, hs)
}
/** `shapeExt.canvas`: a joined cell or a rect cell (`aspect`); false = a plain dot. */
export function canvasDot(p: PathSink, d: DotInstance): boolean {
  const hs = d.r * (d.aspect ?? 1)
  if (d.join !== undefined && d.joint) { canvasJoin(p, d.x, d.y, d.r, d.join, d.joint, hs); return true }
  if (d.aspect === undefined) return false
  rectOutline(p as never, d.x, d.y, d.r, hs, d.shape === 'square' ? Infinity : d.shape === 'squircle' ? squircleExponent(d.roundness ?? 0) : 2)
  return true
}
/** Buffer dot `i` from its channels: a joined cell, a rect cell, or a per-dot roundness step; false = a plain dot (frame style). */
export function bufferDot(p: PathSink, buf: DotBuffer, i: number): boolean {
  const j = buf.join![i], f = buf.form![i], a = buf.aspect![i], r = buf.r[i], hs = a ? r * a : r
  if (j !== 0xFFFF) { canvasJoin(p, buf.x[i], buf.y[i], r, j & 0xFFF, buf.joints![j >> 12], hs); return true }
  const n = f !== 15 ? squircleExponent(f / 8) : buf.shape === 'square' ? Infinity : buf.shape === 'squircle' ? squircleExponent(buf.roundness ?? 0) : 2
  if (a) { rectOutline(p as never, buf.x[i], buf.y[i], r, hs, n); return true }
  if (f !== 15) { addDotShape(p, buf.x[i], buf.y[i], r, 'squircle', n, false); return true }
  return false
}
