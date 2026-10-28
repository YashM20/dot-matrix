/**
 * Deterministic trigonometry (part of `dmath`, F0.1): `dsin dcos tsin tcos`, moved verbatim from algo/attractor.ts.
 * Its own module so the algorithms board (algo/attractor.ts, algo/dla.ts) bundles only this, not the hash and
 * exp/pow code the noise pack shares (one shared chunk fewer in the first-load preload maps). Import from `dmath`.
 */
export const TAU = Math.PI * 2
const INV_TAU = 1 / TAU
/** sin(x) to ~2e-7 from +, ×, round only (bit-identical in every engine). Moved verbatim from algo/attractor.ts. */
export function dsin(x: number): number {
  // reduce to [-π, π], then fold to [-π/2, π/2] (sin(π - x) = sin x)
  x -= Math.round(x * INV_TAU) * TAU
  if (x > Math.PI / 2) x = Math.PI - x
  else if (x < -Math.PI / 2) x = -Math.PI - x
  const x2 = x * x
  // Taylor to x^13 on [-π/2, π/2]: truncation error < 6e-8
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 / 6227020800))))))
}
export const dcos = (x: number) => dsin(x + Math.PI / 2)

/**
 * Table sine for hot loops: 4096 `dsin` samples per turn + linear interpolation (error < 3e-7), built once.
 * As deterministic as `dsin` (floor, ×, +, table reads) and ~4× cheaper; the orbit only needs determinism.
 */
const LUT_N = 4096, LUT_K = LUT_N / TAU
let lut: Float64Array | undefined
export function tsin(x: number): number {
  const t = lut ?? (lut = Float64Array.from({ length: LUT_N + 1 }, (_, i) => dsin((i / LUT_N) * TAU)))
  const f = x * LUT_K, i = Math.floor(f), j = i & (LUT_N - 1), a = t[j]
  return a + (t[j + 1] - a) * (f - i)
}
export const tcos = (x: number) => tsin(x + Math.PI / 2)
