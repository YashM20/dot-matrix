import type { DotInstance } from '../types'
import { BEZIER_MAX_N, bezierHandle, cornerFraction, squircleExponent } from './shapePath'

function squircle(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, roundness: number): void {
  const n = squircleExponent(roundness)
  ctx.beginPath()
  if (n > BEZIER_MAX_N) {
    const c = r * cornerFraction(n), s = r - c
    ctx.moveTo(x - s, y - r); ctx.lineTo(x + s, y - r); ctx.arcTo(x + r, y - r, x + r, y - s, c)
    ctx.lineTo(x + r, y + s); ctx.arcTo(x + r, y + r, x + s, y + r, c)
    ctx.lineTo(x - s, y + r); ctx.arcTo(x - r, y + r, x - r, y + s, c)
    ctx.lineTo(x - r, y - s); ctx.arcTo(x - r, y - r, x - s, y - r, c)
  } else {
    const k = r * bezierHandle(n)
    ctx.moveTo(x, y - r); ctx.bezierCurveTo(x + k, y - r, x + r, y - k, x + r, y)
    ctx.bezierCurveTo(x + r, y + k, x + k, y + r, x, y + r)
    ctx.bezierCurveTo(x - k, y + r, x - r, y + k, x - r, y)
    ctx.bezierCurveTo(x - r, y - k, x - k, y - r, x, y - r)
  }
  ctx.closePath(); ctx.fill()
}

export function renderCanvas(ctx: CanvasRenderingContext2D, dots: DotInstance[]): void {
  for (const dot of dots) {
    if (dot.r <= 0 || dot.opacity <= 0) continue
    ctx.globalAlpha = dot.opacity; ctx.fillStyle = dot.color
    if (dot.shape === 'square') ctx.fillRect(dot.x - dot.r, dot.y - dot.r, dot.r * 2, dot.r * 2)
    else if (dot.shape === 'squircle') squircle(ctx, dot.x, dot.y, dot.r, dot.roundness ?? 0)
    else { ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.globalAlpha = 1
}
