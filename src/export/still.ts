/** One still frame of a clip source as a PNG (the card action strip's PNG, UX U2): same layout as `recordClip`. */
import { renderCanvas } from '../engine/renderer/canvasRenderer'
import type { ClipSource } from './record'

export function stillPNG(src: ClipSource, t = 0, scale = 2, pad = 14): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = Math.ceil((src.width + pad * 2) * scale); c.height = Math.ceil((src.height + pad * 2) * scale)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = src.background; ctx.fillRect(0, 0, c.width, c.height)
  ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale)
  renderCanvas(ctx, src.frame(t))
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
}
