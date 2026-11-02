/**
 * The essay figures' own fields, kept free of React so the headless blog images (scripts/og-blog.ts) sample the
 * same functions the live figures do.
 */
import type { Field } from '../../engine/types'

/** Three metaballs (FigPipeline); the reader holds the third at (x, y). Pure in (u, v, x, y). */
export const blobs = (x: number, y: number): Field => (u, v) => {
  // inverse-square falloffs summed, thresholded low enough that nearby blobs grow a neck between them
  const a = .012 / ((u - .32) ** 2 + (v - .36) ** 2 + 1e-4)
  const b = .009 / ((u - .64) ** 2 + (v - .66) ** 2 + 1e-4)
  const c = .01 / ((u - x) ** 2 + (v - y) ** 2 + 1e-4)
  const s = a + b + c
  return s < .7 ? 0 : Math.min(1, (s - .7) / 2.3)
}

/** A lit sphere over a floor (FigResolution): a field in u/v, so it has no resolution of its own. */
export const sphere: Field = (u, v) => {
  const x = (u - .5) / .34, y = (v - .44) / .34, q = x * x + y * y
  if (q < 1) {
    const z = Math.sqrt(1 - q), l = Math.max(0, -.5 * x - .55 * y + .67 * z)
    return .12 + .88 * l ** 1.4
  }
  const fy = (v - .86) / .05, fx = (u - .53) / .3, f = fx * fx + fy * fy
  return f < 1 ? .35 * (1 - f) : 0
}
