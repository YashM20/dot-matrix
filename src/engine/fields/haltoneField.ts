import type { Field, GridConfig } from '../types'
const clamp = (value: number) => Math.max(0, Math.min(1, value))
export interface LuminanceOptions {
  /** Dot/480 draws light dots on black, so bright pixels → big dots. Set true for print-style negatives. */
  invert?: boolean
  /** Gamma applied to luminance — >1 pushes mid-tones down to keep the halftone from greying out. */
  gamma?: number
}
/** Rec.709 luminance with gamma; nearest-pixel lookup. */
export function imageToLuminanceField(imageData: ImageData, opts: LuminanceOptions = {}): Field {
  const { width, height, data } = imageData, { invert = false, gamma = 1.4 } = opts
  return (u, v) => {
    const x = Math.min(width - 1, Math.floor(u * width)), y = Math.min(height - 1, Math.floor(v * height)), i = (y * width + x) * 4
    const lum = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255
    return clamp(invert ? 1 - lum : lum) ** gamma
  }
}
const BAYER_4 = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
const BAYER_8 = [[0, 48, 12, 60, 3, 51, 15, 63], [32, 16, 44, 28, 35, 19, 47, 31], [8, 56, 4, 52, 11, 59, 7, 55], [40, 24, 36, 20, 43, 27, 39, 23], [2, 50, 14, 62, 1, 49, 13, 61], [34, 18, 46, 30, 33, 17, 45, 29], [10, 58, 6, 54, 9, 57, 5, 53], [42, 26, 38, 22, 41, 25, 37, 21]]
/**
 * Ordered dither. The threshold matrix is indexed per *dot* of the target grid, so each dot
 * compares against exactly one matrix entry — indexing by a fixed sub-pixel scale aliases.
 */
export function bayerDither(field: Field, matrixSize: 4 | 8, grid: GridConfig): Field {
  const matrix = matrixSize === 4 ? BAYER_4 : BAYER_8
  return (u, v) => {
    const x = Math.round(u * (grid.cols - 1)) % matrixSize, y = Math.round(v * (grid.rows - 1)) % matrixSize
    const t = (matrix[y][x] + .5) / (matrixSize * matrixSize)
    const lum = field(u, v)
    return lum > t ? lum : lum * 0.35
  }
}
/** Floyd–Steinberg error diffusion over the image raster (resample the image to the grid first). */
export function floydSteinbergDither(imageData: ImageData, opts: LuminanceOptions = {}): Field {
  const { width, height } = imageData
  const field = imageToLuminanceField(imageData, opts)
  const lumVals = new Float32Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) lumVals[y * width + x] = field(x / width, y / height)
  const binary = Float32Array.from(lumVals)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, old = binary[i], next = old > .5 ? 1 : 0, err = old - next
    binary[i] = next
    for (const [dx, dy, w] of [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]] as const) {
      const nx = x + dx, ny = y + dy
      if (nx >= 0 && nx < width && ny < height) binary[ny * width + nx] += err * w
    }
  }
  return (u, v) => { const idx = Math.min(height - 1, Math.floor(v * height)) * width + Math.min(width - 1, Math.floor(u * width)); return binary[idx] ? lumVals[idx] : lumVals[idx] * 0.28 }
}
export function boxBlurField(field: Field, radius = 1): Field { return (u, v) => { let s = 0, c = 0; for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) { s += field(clamp(u + dx * 0.004), clamp(v + dy * 0.004)); c++ } return s / c } }
// The Floyd–Steinberg path skips the pre-blur on purpose: error diffusion is already a
// low-pass, so blurring first double-smooths and loses micro-contrast. Bayer has no such
// smoothing, so photoDotify wraps its luminance in boxBlurField(lum,1) to tame moiré.
