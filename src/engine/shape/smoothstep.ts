/**
 * Smoothstep variants on the unit interval, each with its inverse where a closed form exists, from Inigo Quilez's
 * "Smoothstep functions" article. They all map [0, 1] onto [0, 1] and take x already in [0, 1]: for an interval
 * [a, b], pass `clamp((x − a) / (b − a))` (`src/engine/math.ts`). Pure TS; import by path (not in the barrel).
 */

export type Unit = (x: number) => number
export interface SmoothstepVariant {
  f: Unit
  /** The inverse on [0, 1]; null where the article gives none (the quintic). */
  inv: Unit | null
  /** Continuity class from the article's table (1 = C1, 2 = C2). */
  continuity: number
  /** Symmetric about (½, ½): f(1 − x) = 1 − f(x). */
  symmetric: boolean
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** The standard cubic x²(3 − 2x). C1. */
export function smoothstepCubic(x: number): number {
  return x * x * (3 - 2 * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/ismoothstep/ (MIT)
/** Closed-form inverse of the cubic smoothstep (trigonometric Cardano root, simplified). */
export function smoothstepCubicInv(y: number): number {
  return 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Quartic x²(2 − x²): even powers only, so it takes a squared distance without a sqrt. C1, not symmetric. */
export function smoothstepQuartic(x: number): number {
  return x * x * (2 - x * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
export function smoothstepQuarticInv(y: number): number {
  return Math.sqrt(1 - Math.sqrt(1 - y))
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Quintic x³(6x² − 15x + 10) (Perlin's smootherstep). C2. No closed-form inverse. */
export function smoothstepQuintic(x: number): number {
  return x * x * x * (x * (x * 6 - 15) + 10)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Quadratic rational x² / (2x² − 2x + 1). C1. */
export function smoothstepQuadRational(x: number): number {
  return x * x / (2 * x * x - 2 * x + 1)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
export function smoothstepQuadRationalInv(y: number): number {
  if (y === 0.5) return 0.5 // the article's formula is 0/0 here; this is its limit
  return (y - Math.sqrt(y * (1 - y))) / (2 * y - 1)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Cubic rational x³ / (3x² − 3x + 1). C2. */
export function smoothstepCubicRational(x: number): number {
  return x * x * x / (3 * x * x - 3 * x + 1)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
export function smoothstepCubicRationalInv(y: number): number {
  const a = Math.cbrt(y), b = Math.cbrt(1 - y)
  return a / (a + b)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** General rational xⁿ / (xⁿ + (1 − x)ⁿ). C(n−1); n = 2 and 3 are the quadratic and cubic rationals. */
export function smoothstepRational(x: number, n: number): number {
  const a = Math.pow(x, n)
  return a / (a + Math.pow(1 - x, n))
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Inverse of the rational smoothstep: the same curve with exponent 1/n. */
export function smoothstepRationalInv(y: number, n: number): number {
  return smoothstepRational(y, 1 / n)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Two parabolas joined at ½. C1. */
export function smoothstepPiecewiseQuadratic(x: number): number {
  return x < 0.5 ? 2 * x * x : 2 * x * (2 - x) - 1
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
export function smoothstepPiecewiseQuadraticInv(y: number): number {
  return y < 0.5 ? Math.sqrt(0.5 * y) : 1 - Math.sqrt(0.5 - 0.5 * y)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Two power curves joined at ½, sharpness n. C(n−1). The same curve as `gain` in remap.ts. */
export function smoothstepPiecewise(x: number, n: number): number {
  return x < 0.5 ? 0.5 * Math.pow(2 * x, n) : 1 - 0.5 * Math.pow(2 * (1 - x), n)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
export function smoothstepPiecewiseInv(y: number, n: number): number {
  return smoothstepPiecewise(y, 1 / n)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
/** Half a cosine period. C1. */
export function smoothstepTrig(x: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothsteps/ (MIT)
export function smoothstepTrigInv(y: number): number {
  return Math.acos(1 - 2 * y) / Math.PI
}

/** The fixed-shape variants by name, for pickers and sweeps. */
export const SMOOTHSTEPS: Readonly<Record<string, SmoothstepVariant>> = {
  cubic: { f: smoothstepCubic, inv: smoothstepCubicInv, continuity: 1, symmetric: true },
  quartic: { f: smoothstepQuartic, inv: smoothstepQuarticInv, continuity: 1, symmetric: false },
  quintic: { f: smoothstepQuintic, inv: null, continuity: 2, symmetric: true },
  quadRational: { f: smoothstepQuadRational, inv: smoothstepQuadRationalInv, continuity: 1, symmetric: true },
  cubicRational: { f: smoothstepCubicRational, inv: smoothstepCubicRationalInv, continuity: 2, symmetric: true },
  piecewiseQuadratic: { f: smoothstepPiecewiseQuadratic, inv: smoothstepPiecewiseQuadraticInv, continuity: 1, symmetric: true },
  trig: { f: smoothstepTrig, inv: smoothstepTrigInv, continuity: 1, symmetric: true },
}
