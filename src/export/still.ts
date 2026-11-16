/** One still frame of a clip source as a PNG (the card action strip's PNG, UX U2): same layout as `recordClip`. */
import { renderCanvas } from '../engine/renderer/canvasRenderer'
import type { CardFrameStyle } from '../engine/theme/tokens'
import type { ClipSource } from './record'

/**
 * With `frame` (the card exports), the PNG is the site's card: the surface in the card radius with a 1 px hairline
 * and clear corners, like `cardSVG`. Without it, the surface fills the whole image (the editor, the palette).
 */
export function stillPNG(src: ClipSource, t = 0, scale = 2, pad = 14, frame?: CardFrameStyle): Promise<Blob> {
  const c = document.createElement('canvas'), W = src.width + pad * 2, H = src.height + pad * 2
  c.width = Math.ceil(W * scale); c.height = Math.ceil(H * scale)
  const ctx = c.getContext('2d')!
  if (frame) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0)
    ctx.beginPath(); ctx.roundRect(.5, .5, W - 1, H - 1, frame.radius)
    ctx.fillStyle = frame.background; ctx.fill()
    ctx.lineWidth = 1; ctx.strokeStyle = frame.border; ctx.stroke()
  } else { ctx.fillStyle = src.background; ctx.fillRect(0, 0, c.width, c.height) }
  ctx.setTransform(scale, 0, 0, scale, pad * scale, pad * scale)
  renderCanvas(ctx, src.frame(t))
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
}
