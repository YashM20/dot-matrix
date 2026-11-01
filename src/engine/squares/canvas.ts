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
import { formOutline, MOTIFS, MOTIF_SHIFT, ROT45, shapeExponent, type FormSink } from './form'

/** A joined cell (half height `hs` = s on a square cell). */
export function canvasJoin(p: PathSink, x: number, y: number, s: number, mask: number, g: JointGeom, hs = s): void {
  joinOutline(p as unknown as OutlineSink, x, y, s, g, mask, 0, false, hs)
}
/** `shapeExt.canvas`: a joined cell, a rect cell (`aspect`), or a rotated / motif cell (squares Q3); false = a plain dot. */
export function canvasDot(p: PathSink, d: DotInstance): boolean {
  const hs = d.r * (d.aspect ?? 1)
  if (d.join !== undefined && d.joint) { canvasJoin(p, d.x, d.y, d.r, d.join, d.joint, hs); return true }
  const n = shapeExponent(d.shape, d.roundness)
  // a rotated / motif cell carries aspect 1 (the routing mark); a rect cell (aspect ≠ 1) ignores both
  if ((d.rot || d.motif) && hs === d.r) { formOutline(p as unknown as FormSink, d.x, d.y, d.r, n, !!d.rot, d.motif ? MOTIFS.indexOf(d.motif as never) : 0); return true }
  if (d.aspect === undefined) return false
  rectOutline(p as never, d.x, d.y, d.r, hs, n)
  return true
}
/** Buffer dot `i` from its channels: a joined cell, a rect cell, a rotated / motif cell, or a per-dot roundness step; false = a plain dot (frame style). */
export function bufferDot(p: PathSink, buf: DotBuffer, i: number): boolean {
  const j = buf.join![i], form = buf.form![i], f = form & 15, a = buf.aspect![i], r = buf.r[i], hs = a ? r * a : r
  if (j !== 0xFFFF) { canvasJoin(p, buf.x[i], buf.y[i], r, j & 0xFFF, buf.joints![j >> 12], hs); return true }
  const n = f !== 15 ? squircleExponent(f / 8) : shapeExponent(buf.shape, buf.roundness)
  if (a) { rectOutline(p as never, buf.x[i], buf.y[i], r, hs, n); return true }
  if (form > 15) { formOutline(p as unknown as FormSink, buf.x[i], buf.y[i], r, n, (form & ROT45) !== 0, form >> MOTIF_SHIFT); return true }
  if (f !== 15) { addDotShape(p, buf.x[i], buf.y[i], r, 'squircle', n, false); return true }
  return false
}
