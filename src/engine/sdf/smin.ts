/**
 * Smooth minimums (#63, docs/IQ-PLAN.md IQ2): blend two distances `a` and `b` so the shapes melt together where
 * they come within reach of each other. Every variant is k-normalised the way the article does it: `k` is the
 * thickness the blend adds, in distance units, so smin(a, a, k) = a − k and the variants can be swapped for one
 * another without retuning `k`.
 *
 * - Quadratic, cubic, quartic and circular are rigid: they return min(a, b) exactly once |a − b| reaches
 *   k / g(0) (4k, 6k, 16k/3 and k/(1 − √½)), so far from the join the shapes keep their own distances.
 * - Exponential and root never quite reach min(a, b): they bend the field everywhere a little. The exponential one
 *   is the only one here where the order of a chain of blends doesn't matter.
 * - All of them stay ≤ min(a, b) and are symmetric in a and b.
 *
 * The `Mix` forms also return the blend factor (0 = all `a`, 1 = all `b`), to blend tone between the two parts.
 * `smoothUnion`, `smoothSubtract` and `smoothIntersect` are the booleans on the quadratic kernel, and the `sdg`
 * forms carry a gradient through (it shortens inside the blend, so it is not unit length there).
 */
import { dexp, dlog } from '../noise/dmath'
import type { Sdg2 } from './ops'
import type { Out2 } from './util'

const LN2 = Math.LN2
/** 1 / (1 − √½): the circular kernel's normalisation, 1 / g(0). */
const CIRC = 1 / (1 - Math.SQRT1_2)

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT); the optimised form is Media Molecule's (Dreams)
/** Quadratic polynomial smooth minimum. Rigid: equals min(a, b) once |a − b| ≥ 4k. */
export function sminQuad(a: number, b: number, k: number): number {
  k *= 4
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * (1 / 4)
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/** Cubic polynomial smooth minimum. Rigid: equals min(a, b) once |a − b| ≥ 6k. */
export function sminCubic(a: number, b: number, k: number): number {
  k *= 6
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * h * k * (1 / 6)
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/** Quartic polynomial smooth minimum. Rigid: equals min(a, b) once |a − b| ≥ 16k/3. */
export function sminQuartic(a: number, b: number, k: number): number {
  k *= 16 / 3
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * h * (4 - h) * k * (1 / 16)
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/**
 * Circular smooth minimum: two shapes meeting at a right angle join with an exactly circular fillet. Rigid: equals
 * min(a, b) once |a − b| ≥ k/(1 − √½) ≈ 3.41k.
 */
export function sminCircular(a: number, b: number, k: number): number {
  k *= CIRC
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - k * 0.5 * (1 + h - Math.sqrt(1 - h * (h - 2)))
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/**
 * Exponential smooth minimum, −k·log2(2^(−a/k) + 2^(−b/k)). Written here as min(a, b) − k·log2(1 + 2^(−|a − b|/k)),
 * which is the same value and can't overflow when a/k or b/k is large and negative. Not rigid, but associative:
 * smin(a, smin(b, c)) = smin(smin(a, b), c).
 */
export function sminExp(a: number, b: number, k: number): number {
  const r = 1 + dexp(-Math.abs(a - b) / k * LN2)
  return Math.min(a, b) - k * dlog(r) / LN2
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/** Root smooth minimum, ½(a + b − √((b − a)² + (2k)²)). Not rigid: it tends to min(a, b) as |a − b| grows. */
export function sminRoot(a: number, b: number, k: number): number {
  k *= 2
  const x = b - a
  return 0.5 * (a + b - Math.sqrt(x * x + k * k))
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/**
 * `sminQuad` that also writes the mix factor to `out[0]`: 0 where `a` wins outright, 1 where `b` does, ½ where
 * a = b. Tone or material = mix(toneA, toneB, out[0]). Returns the same distance as `sminQuad`.
 */
export function sminQuadMix(a: number, b: number, k: number, out: Out2): number {
  const h = 1 - Math.min(Math.abs(a - b) / (4 * k), 1)
  const w = h * h, m = w * 0.5, s = w * k
  if (a < b) { out[0] = m; return a - s }
  out[0] = 1 - m
  return b - s
}

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/** `sminCubic` that also writes the mix factor to `out[0]`; as `sminQuadMix`. */
export function sminCubicMix(a: number, b: number, k: number, out: Out2): number {
  const h = 1 - Math.min(Math.abs(a - b) / (6 * k), 1)
  const w = h * h * h, m = w * 0.5, s = w * k
  if (a < b) { out[0] = m; return a - s }
  out[0] = 1 - m
  return b - s
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT), on the quadratic smooth minimum
/** Smooth union: `sminQuad`. */
export const smoothUnion = sminQuad

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT), on the quadratic smooth minimum
/**
 * Smooth subtraction: `a` with `b` cut out, the order `sdfSubtract` uses. The article's opSmoothSubtraction takes
 * its arguments the other way round (it cuts the first out of the second).
 */
export const smoothSubtract = (a: number, b: number, k: number) => -sminQuad(-a, b, k)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT), on the quadratic smooth minimum
/** Smooth intersection, a smooth maximum: −smin(−a, −b). */
export const smoothIntersect = (a: number, b: number, k: number) => -sminQuad(-a, -b, k)

// after Inigo Quilez, https://iquilezles.org/articles/smin/ (MIT)
/**
 * The quadratic smooth minimum of two distances with their gradients (∂a = (ax, ay), ∂b = (bx, by)): returns the
 * distance and writes its gradient into `out`. Inside the blend the gradient is a lerp of the two, shorter than 1.
 */
export function sminQuadGrad(a: number, ax: number, ay: number, b: number, bx: number, by: number, k: number, out: Out2): number {
  k *= 4
  const h = Math.max(k - Math.abs(a - b), 0) / (2 * k)
  const t = a < b ? h : 1 - h
  out[0] = ax + (bx - ax) * t
  out[1] = ay + (by - ay) * t
  return Math.min(a, b) - h * h * k
}

/**
 * Smooth union of two `sdg` shapes, with gradient. Each call reuses two scratch pairs made once here, so a bound
 * shape is allocation-free per sample (and not re-entrant: don't nest the same bound shape inside itself).
 */
export function sdgSmoothUnion(sa: Sdg2, sb: Sdg2, k: number): Sdg2 {
  const ga = new Float64Array(2), gb = new Float64Array(2)
  return (x, y, out) => sminQuadGrad(sa(x, y, ga), ga[0], ga[1], sb(x, y, gb), gb[0], gb[1], k, out)
}

/** Smooth subtraction with gradient: `sa` with `sb` cut out (as `smoothSubtract`). */
export function sdgSmoothSubtract(sa: Sdg2, sb: Sdg2, k: number): Sdg2 {
  const ga = new Float64Array(2), gb = new Float64Array(2)
  return (x, y, out) => {
    const d = -sminQuadGrad(-sa(x, y, ga), -ga[0], -ga[1], sb(x, y, gb), gb[0], gb[1], k, out)
    out[0] = -out[0]; out[1] = -out[1]
    return d
  }
}

/** Smooth intersection with gradient (as `smoothIntersect`). */
export function sdgSmoothIntersect(sa: Sdg2, sb: Sdg2, k: number): Sdg2 {
  const ga = new Float64Array(2), gb = new Float64Array(2)
  return (x, y, out) => {
    const d = -sminQuadGrad(-sa(x, y, ga), -ga[0], -ga[1], -sb(x, y, gb), -gb[0], -gb[1], k, out)
    out[0] = -out[0]; out[1] = -out[1]
    return d
  }
}
