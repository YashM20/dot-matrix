import type { Field, GridConfig } from '../engine/types'
import { bayerDither, boxBlurField, floydSteinbergDither, imageToLuminanceField } from '../engine/fields/haltoneField'

/** Decode an image, resample it to the dot grid and dither it into a Field. Runs entirely in the browser. */
export async function dotifyUpload(file: File, gridConfig: GridConfig, ditherMode: 'bayer' | 'floyd-steinberg'): Promise<Field> {
  if (file.size > 2 * 1024 * 1024) await new Promise<void>(r => (typeof requestIdleCallback !== 'undefined' ? requestIdleCallback(() => r()) : setTimeout(r, 16)))
  const url = URL.createObjectURL(file); try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => { const n = new Image(); n.onload = () => resolve(n); n.onerror = reject; n.src = url })
    const canvas = document.createElement('canvas'); canvas.width = gridConfig.cols; canvas.height = gridConfig.rows
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Canvas unavailable')
    const iw = image.naturalWidth, ih = image.naturalHeight, maxDim = Math.max(iw, ih)
    if (maxDim > 1024) {
      const s = 1024 / maxDim
      const tmp = document.createElement('canvas'); tmp.width = Math.round(iw * s); tmp.height = Math.round(ih * s)
      tmp.getContext('2d')!.drawImage(image, 0, 0, tmp.width, tmp.height)
      ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height)
    } else {
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    if (ditherMode === 'bayer') return bayerDither(boxBlurField(imageToLuminanceField(imageData), 1), 4, gridConfig)
    return floydSteinbergDither(imageData)
  } finally { URL.revokeObjectURL(url) }
}
