/** Draw layers onto a canvas through the engine (sampler → buffer canvas renderer), at `pitch` px per cell. */
import { sampleLayersInto } from '../../engine/sampler/gridSampler'
import { renderCanvasBuffer } from '../../engine/renderer/canvasBuffer'
import { createDotBuffer, type DotBuffer } from '../../engine/buffer/dotBuffer'
import type { DotStyle, Layer, ThemeTokens } from '../../engine/types'

export interface Surface { canvas: HTMLCanvasElement; buf: DotBuffer; cols: number; rows: number; pitch: number; dpr: number }
export function surfaceFor(canvas: HTMLCanvasElement, cols: number, rows: number, pitch: number): Surface {
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  canvas.width = Math.round(cols * pitch * dpr); canvas.height = Math.round(rows * pitch * dpr)
  canvas.style.width = `${cols * pitch}px`; canvas.style.height = `${rows * pitch}px`
  return { canvas, buf: createDotBuffer(cols * rows), cols, rows, pitch, dpr }
}
/** Sample `layers` into the surface's buffer (no drawing). */
export function sampleInto(s: Surface, layers: Layer[], style: DotStyle, theme: ThemeTokens): DotBuffer {
  return sampleLayersInto(layers, { cols: s.cols, rows: s.rows, pitch: s.pitch }, style, theme, s.buf)
}
/** Clear to the theme background and draw the buffer, offset by whole cells (`shake`). */
export function paint(s: Surface, theme: ThemeTokens, shake: [number, number] = [0, 0], draw?: (ctx: CanvasRenderingContext2D) => void): void {
  const ctx = s.canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, s.canvas.width, s.canvas.height)
  ctx.setTransform(s.dpr, 0, 0, s.dpr, shake[0] * s.pitch * s.dpr, shake[1] * s.pitch * s.dpr)
  if (draw) draw(ctx); else renderCanvasBuffer(ctx, s.buf)
}
