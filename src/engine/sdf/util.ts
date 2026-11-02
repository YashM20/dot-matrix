/**
 * Scalar helpers shared by the SDF ports. The library is deterministic (it sits under DET_PATHS): trig, cube roots
 * and arc cosines come from `noise/dmath`, so a card built on these shapes hashes the same in every JS engine.
 */
import { datan2, dcos, dpow, dsin } from '../noise/dmath'

export { len } from '../math'
export { datan2, dcos, dsin }

/** An out pair for gradients: `out[0]` = ∂d/∂x, `out[1]` = ∂d/∂y. Reuse one per loop to stay allocation-free. */
export type Out2 = number[] | Float64Array

export const SQRT2 = Math.SQRT2
export const SQRT1_2 = Math.SQRT1_2
export const SQRT3 = 1.7320508075688772

/** GLSL `sign`: -1, 0 or 1. */
export const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0)
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x)
export const dot2 = (x: number, y: number) => x * x + y * y
/** GLSL `mod` (floored, so the result takes the sign of `y`). */
export const mod = (x: number, y: number) => x - y * Math.floor(x / y)
/** Real cube root (GLSL ports write it as `pow(x, 1.0/3.0)` on x ≥ 0, or `sign(x)*pow(abs(x), 1.0/3.0)`). */
export const cbrt = (x: number) => (x < 0 ? -dpow(-x, 1 / 3) : x > 0 ? dpow(x, 1 / 3) : 0)
/** acos on [-1, 1] (input clamped), through the deterministic atan2. */
export function acos(x: number): number {
  const c = clamp(x, -1, 1)
  return datan2(Math.sqrt(1 - c * c), c)
}
