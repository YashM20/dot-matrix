/**
 * SVG for dot lists that hold joined cells (`shapeExt.svg`, Q-squares §2.4.2): `renderSVG` (svgRenderer.ts) with
 * joined defs. Each `<use>` is its own element, so abutting cells would conflate into a hairline: joined sides bleed
 * δ = min(.12·P, .5) px past the cell edge, and a group holding joined cells fades with group `opacity`, so the
 * overlap never blends twice. Rect cells (squares Q2) get one def per (shape, size, aspect to .001). Plain dots and
 * groups come out exactly as `renderSVG` writes them.
 */
import { circlePath, squarePath, squirclePath } from '../renderer/shapePath'
import type { DotInstance, JointGeom } from '../types'
import { joinOutline, rectOutline, type OutlineSink } from './geometry'
import { squircleExponent } from '../renderer/shapePath'

const n3 = (x: number) => String(Math.round(x * 1000) / 1000)
class PathString implements OutlineSink {
  d = ''
  moveTo(x: number, y: number) { this.d += `M${n3(x)} ${n3(y)}` }
  lineTo(x: number, y: number) { this.d += `L${n3(x)} ${n3(y)}` }
  arc(_cx: number, _cy: number, r: number, _a0: number, _a1: number, ccw: boolean, ex: number, ey: number) { this.d += `A${n3(r)} ${n3(r)} 0 0 ${ccw ? 0 : 1} ${n3(ex)} ${n3(ey)}` }
  bezierCurveTo(ax: number, ay: number, bx: number, by: number, x: number, y: number) { this.d += `C${n3(ax)} ${n3(ay)} ${n3(bx)} ${n3(by)} ${n3(x)} ${n3(y)}` }
  rect(x: number, y: number, w: number, h: number) { this.d += `M${n3(x)} ${n3(y)}h${n3(w)}v${n3(h)}h${n3(-w)}Z` }
  closePath() { this.d += 'Z' }
}
/** Seam bleed of a joined side (px) for a cell of half pitch h; 0 when the layer keeps a seam. */
export const svgBleed = (g: JointGeom): number => (g.seam > 0 ? 0 : Math.min(.24 * g.hx, .5))
/** Path data of a joined cell centred at the origin (half height hs), with the seam bleed. */
export function svgJoin(s: number, mask: number, g: JointGeom, hs = s): string {
  const p = new PathString()
  joinOutline(p, 0, 0, s, g, mask, svgBleed(g), true, hs)
  return p.d
}
/** Path data of a plain rect cell centred at the origin. */
function svgRect(d: DotInstance, s: number, hs: number): string {
  const p = new PathString()
  rectOutline(p, 0, 0, s, hs, d.shape === 'square' ? Infinity : d.shape === 'squircle' ? squircleExponent(d.roundness ?? 0) : 2)
  return p.d.endsWith('Z') ? p.d : `${p.d}Z`
}

// (the character class spells the quotes as escapes, so the determinism lint's comment stripper stays in sync)
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\x22': '&quot;', '\x27': '&#39;' }
const escape = (value: string) => value.replace(/[&<>\x22\x27]/g, char => ESC[char])
const r2 = (n: number) => { const r = Math.round(n * 100) / 100; return String(r === 0 ? 0 : r) }
const round2 = (d: string) => d.replace(/-?\d+\.\d+/g, n => r2(+n))
let renderSeq = 0
const q = (n: number) => Math.round(n * 20) / 20

/** `renderSVG` for a dot list with joined cells: one def per (mask, size, joint), ≤ 47 masks per level. */
export function svgDots(dots: DotInstance[], width: number, height: number): string {
  const prefix = `q${(renderSeq++).toString(36)}-`
  const shapes = new Map<string, string>(), groups = new Map<string, string[]>(), joined = new Set<string>()
  let defs = ''
  for (const d of dots) {
    if (!(d.r > 0) || !(d.opacity > 0)) continue
    const r = q(d.r), g = d.join !== undefined ? d.joint : undefined, a = d.aspect === undefined ? 1 : Math.round(d.aspect * 1000) / 1000, hs = r * a
    const shapeKey = g ? `j|${d.join}|${r}|${a}|${q(g.hx)}|${q(g.hy)}|${q(g.ro)}|${q(g.ri)}|${q(g.seam)}` : `${d.shape}|${d.shape === 'squircle' ? d.roundness ?? 0 : ''}|${r}${a === 1 ? '' : `|${a}`}`
    let id = shapes.get(shapeKey)
    if (!id) {
      id = prefix + shapes.size.toString(36)
      shapes.set(shapeKey, id)
      const path = g ? svgJoin(r, d.join!, g, hs) : a !== 1 ? svgRect(d, r, hs) : d.shape === 'square' ? squarePath(0, 0, r) : d.shape === 'squircle' ? squirclePath(0, 0, r, d.roundness) : circlePath(0, 0, r)
      defs += `<path id="${id}" d="${round2(path)}"/>`
    }
    const opacity = Math.round(Math.min(1, d.opacity) * 1000) / 1000, key = `${d.color}|${opacity}`
    let list = groups.get(key)
    if (!list) groups.set(key, (list = []))
    if (g) joined.add(key)
    list.push(`<use href="#${id}" x="${r2(d.x)}" y="${r2(d.y)}"/>`)
  }
  let body = ''
  for (const [key, list] of groups) {
    const cut = key.lastIndexOf('|'), color = key.slice(0, cut), opacity = key.slice(cut + 1)
    body += `<g fill="${escape(color)}"${opacity === '1' ? '' : ` ${joined.has(key) ? '' : 'fill-'}opacity="${opacity}"`}>${list.join('')}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`
}
