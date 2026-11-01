import type { DotInstance } from '../types'
import { circlePath, squarePath, squirclePath } from './shapePath'
import { shapeExt } from './ext'
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
/** Two decimals is sub-pixel at any pitch we render; trailing zeros dropped ("12.50" → "12.5"). */
const r2 = (n: number) => { const r = Math.round(n * 100) / 100; return String(r === 0 ? 0 : r) }
const round2 = (d: string) => d.replace(/-?\d+\.\d+/g, n => r2(+n))
/** Ids are document-global and several SVGs share a page, so every render gets its own prefix. */
let renderSeq = 0

/**
 * Dots → one compact SVG string. Each distinct dot shape (outline × radius, radius rounded to
 * 0.05px) is defined once in `<defs>` and placed with `<use x y>`; dots sharing a colour and
 * opacity sit in one `<g>`. ~30 bytes per dot instead of ~400.
 */
export function renderSVG(dots: DotInstance[], width: number, height: number): string {
  // joined squares and rect cells (src/engine/squares): their own renderer (defs per mask / aspect, seam bleed, group opacity)
  if (shapeExt.svg && dots.some(d => d.join !== undefined || d.aspect)) return shapeExt.svg(dots, width, height)
  const prefix = `d${(renderSeq++).toString(36)}-`
  const shapes = new Map<string, string>(), groups = new Map<string, string[]>()
  let defs = ''
  for (const d of dots) {
    if (!(d.r > 0) || !(d.opacity > 0)) continue
    const r = Math.round(d.r * 20) / 20
    const shapeKey = `${d.shape}|${d.shape === 'squircle' ? d.roundness ?? 0 : ''}|${r}`
    let id = shapes.get(shapeKey)
    if (!id) {
      id = prefix + shapes.size.toString(36)
      shapes.set(shapeKey, id)
      const path = d.shape === 'square' ? squarePath(0, 0, r) : d.shape === 'squircle' ? squirclePath(0, 0, r, d.roundness) : circlePath(0, 0, r)
      defs += `<path id="${id}" d="${round2(path)}"/>`
    }
    const opacity = Math.round(Math.min(1, d.opacity) * 1000) / 1000
    const key = `${d.color}|${opacity}`
    let list = groups.get(key)
    if (!list) groups.set(key, (list = []))
    list.push(`<use href="#${id}" x="${r2(d.x)}" y="${r2(d.y)}"/>`)
  }
  let body = ''
  for (const [key, list] of groups) {
    const cut = key.lastIndexOf('|'), color = key.slice(0, cut), opacity = key.slice(cut + 1)
    body += `<g fill="${escape(color)}"${opacity === '1' ? '' : ` fill-opacity="${opacity}"`}>${list.join('')}</g>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`
}
