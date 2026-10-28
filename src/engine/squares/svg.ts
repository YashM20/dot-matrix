/**
 * SVG hook (`shapeExt.svg`, Q-squares §2.4.2): path data of a joined cell at the origin. Each `<use>` is its own
 * element, so abutting cells would conflate into a hairline: joined sides bleed δ = min(.12·P, .5) px past the cell
 * edge, and the renderer fades a group holding joined cells with group `opacity`, so the overlap never blends twice.
 */
import type { JointGeom } from '../types'
import { joinOutline, type OutlineSink } from './geometry'

const n = (x: number) => String(Math.round(x * 1000) / 1000)
class PathString implements OutlineSink {
  d = ''
  moveTo(x: number, y: number) { this.d += `M${n(x)} ${n(y)}` }
  lineTo(x: number, y: number) { this.d += `L${n(x)} ${n(y)}` }
  arc(_cx: number, _cy: number, r: number, _a0: number, _a1: number, ccw: boolean, ex: number, ey: number) { this.d += `A${n(r)} ${n(r)} 0 0 ${ccw ? 0 : 1} ${n(ex)} ${n(ey)}` }
  rect(x: number, y: number, w: number, h: number) { this.d += `M${n(x)} ${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z` }
  closePath() { this.d += 'Z' }
}
/** Seam bleed of a joined side (px) for a cell of half pitch h; 0 when the layer keeps a seam. */
export const svgBleed = (g: JointGeom): number => (g.seam > 0 ? 0 : Math.min(.24 * g.hx, .5))

export function svgJoin(s: number, mask: number, g: JointGeom): string {
  const p = new PathString()
  joinOutline(p, 0, 0, s, g, mask, svgBleed(g))
  return p.d
}
