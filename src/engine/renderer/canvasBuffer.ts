import type { DotBuffer } from '../buffer/dotBuffer'
import { addDotShape, type PathSink } from './canvasRenderer'
import { squircleExponent } from './shapePath'
import { shapeExt } from './ext'

/** Opacity buckets per fill (same 1/1000 bucketing as `renderCanvas`). */
const STEPS = 1000
type Ctx = Pick<CanvasRenderingContext2D, 'fill' | 'globalAlpha' | 'fillStyle'>

/**
 * Draw a `DotBuffer` straight from its arrays: one `Path2D` and one `fill()` per (tone, opacity step),
 * with an integer key per dot (no string or object per dot) and open sub-paths (fill closes them). Pixel-identical batching to `renderCanvas`
 * (a quantized UI card is tones × quantize steps fills, ≤ 30). Returns the number of fills.
 * `makePath` is injectable for headless counting.
 */
export function renderCanvasBuffer(ctx: Ctx, buf: DotBuffer, makePath: () => PathSink & Path2D = () => new Path2D()): number {
  const groups = new Map<number, PathSink & Path2D>(), { x, y, r, opacity, tone, shape, join, form, joints } = buf, joined = shapeExt.canvas
  const n = shape === 'squircle' ? squircleExponent(buf.roundness ?? 0) : 2
  for (let i = 0; i < buf.n; i++) {
    const ri = r[i], oi = opacity[i]
    if (!(ri > 0) || !(oi > 0)) continue
    const key = tone[i] * (STEPS + 1) + Math.round(Math.min(1, oi) * STEPS)
    let path = groups.get(key)
    if (!path) groups.set(key, (path = makePath()))
    // squares channels (absent on classic frames): a joined cell, or a per-dot roundness step
    const j = join ? join[i] : 0xFFFF, f = form ? form[i] : 15
    if (j !== 0xFFFF && joined) joined(path, x[i], y[i], ri, j & 0xFFF, joints![j >> 12])
    else if (f !== 15) addDotShape(path, x[i], y[i], ri, 'squircle', squircleExponent(f / 8), false)
    else addDotShape(path, x[i], y[i], ri, shape, n, false)
  }
  for (const [key, path] of groups) {
    ctx.globalAlpha = (key % (STEPS + 1)) / STEPS
    ctx.fillStyle = buf.palette[Math.floor(key / (STEPS + 1))]
    ctx.fill(path)
  }
  ctx.globalAlpha = 1
  return groups.size
}
