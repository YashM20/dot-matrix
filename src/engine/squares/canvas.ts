/**
 * Canvas hook (`shapeExt.canvas`, Q-squares §2.4.1): a joined cell's clockwise outline, left open for `fill`.
 * Joined neighbours share tone and level, so they sit in one `Path2D`: one nonzero fill of abutting clockwise
 * sub-paths, no conflation seam, no bleed.
 */
import type { PathSink } from '../renderer/canvasRenderer'
import type { JointGeom } from '../types'
import { joinOutline, type OutlineSink } from './geometry'

export function canvasJoin(p: PathSink, x: number, y: number, s: number, mask: number, g: JointGeom): void {
  joinOutline(p as unknown as OutlineSink, x, y, s, g, mask, 0, false)
}
