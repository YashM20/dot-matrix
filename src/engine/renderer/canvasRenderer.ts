import type { DotInstance } from '../types'
import { BEZIER_MAX_N, bezierHandle, cornerFraction, squircleExponent } from './shapePath'

export type PathSink = Pick<CanvasPath, 'moveTo' | 'lineTo' | 'arcTo' | 'bezierCurveTo' | 'arc' | 'rect' | 'closePath'>

/** Append one dot outline as a sub-path, left open for `fill` (squircles: same curve as the SVG renderer). */
function addDot(p: PathSink, dot: DotInstance): void {
  addDotShape(p, dot.x, dot.y, dot.r, dot.shape, dot.shape === 'squircle' ? squircleExponent(dot.roundness ?? 0) : 2, false)
}
/**
 * One dot outline from plain numbers; `n` = the squircle exponent (read only for `shape: 'squircle'`).
 * `close: false` leaves the sub-paths open: `fill()` closes them implicitly (same pixels), and Chrome's
 * `closePath` is a large share of path building for thousands of dots.
 */
export function addDotShape(p: PathSink, x: number, y: number, r: number, shape: DotInstance['shape'], n: number, close = true): void {
  if (shape === 'square') { p.rect(x - r, y - r, r * 2, r * 2); return }
  if (shape !== 'squircle') { p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI * 2); if (close) p.closePath(); return }
  if (n > BEZIER_MAX_N) {
    const c = r * cornerFraction(n), s = r - c
    p.moveTo(x - s, y - r); p.lineTo(x + s, y - r); p.arcTo(x + r, y - r, x + r, y - s, c)
    p.lineTo(x + r, y + s); p.arcTo(x + r, y + r, x + s, y + r, c)
    p.lineTo(x - s, y + r); p.arcTo(x - r, y + r, x - r, y + s, c)
    p.lineTo(x - r, y - s); p.arcTo(x - r, y - r, x - s, y - r, c)
  } else {
    const k = r * bezierHandle(n)
    p.moveTo(x, y - r); p.bezierCurveTo(x + k, y - r, x + r, y - k, x + r, y)
    p.bezierCurveTo(x + r, y + k, x + k, y + r, x, y + r)
    p.bezierCurveTo(x - k, y + r, x - r, y + k, x - r, y)
    p.bezierCurveTo(x - r, y - k, x - k, y - r, x, y - r)
  }
  if (close) p.closePath()
}

/**
 * Draw dots, batched: dots sharing a colour and opacity become one `Path2D` and one `fill()`.
 * A UI card is a handful of fills instead of thousands; photo cards (continuous opacity) still
 * collapse to at most ~1000 groups because opacity is bucketed to 1/1000.
 */
export function renderCanvas(ctx: CanvasRenderingContext2D, dots: DotInstance[]): void {
  const groups = new Map<string, Path2D>()
  for (const dot of dots) {
    if (!(dot.r > 0) || !(dot.opacity > 0)) continue
    const key = `${dot.color}|${Math.round(Math.min(1, dot.opacity) * 1000)}`
    let path = groups.get(key)
    if (!path) groups.set(key, (path = new Path2D()))
    addDot(path, dot)
  }
  for (const [key, path] of groups) {
    const cut = key.lastIndexOf('|')
    ctx.globalAlpha = +key.slice(cut + 1) / 1000
    ctx.fillStyle = key.slice(0, cut)
    ctx.fill(path)
  }
  ctx.globalAlpha = 1
}
