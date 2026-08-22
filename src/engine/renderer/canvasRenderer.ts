import type { DotInstance } from '../types'
export function renderCanvas(ctx: CanvasRenderingContext2D, dots: DotInstance[]): void {
  for (const dot of dots) {
    if (dot.r <= 0 || dot.opacity <= 0) continue
    ctx.globalAlpha = dot.opacity; ctx.fillStyle = dot.color
    if (dot.shape === 'square') ctx.fillRect(dot.x - dot.r, dot.y - dot.r, dot.r * 2, dot.r * 2)
    else if (dot.shape === 'squircle') {
      const r = dot.r, x = dot.x, y = dot.y, roundness = dot.roundness ?? .72, c = r * (.2 + Math.max(0, Math.min(1, roundness)) * .35)
      ctx.beginPath()
      ctx.moveTo(x, y - r); ctx.bezierCurveTo(x + c, y - r, x + r, y - c, x + r, y)
      ctx.bezierCurveTo(x + r, y + c, x + c, y + r, x, y + r)
      ctx.bezierCurveTo(x - c, y + r, x - r, y + c, x - r, y)
      ctx.bezierCurveTo(x - r, y - c, x - c, y - r, x, y - r)
      ctx.closePath(); ctx.fill()
    } else { ctx.beginPath(); ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2); ctx.fill() }
  }
  ctx.globalAlpha = 1
}
