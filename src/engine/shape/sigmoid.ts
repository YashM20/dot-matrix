/**
 * The six sigmoids from Inigo Quilez's "Sigmoid functions" article, each with its inverse and derivative. All are
 * odd, map the real line onto (−1, 1) and pass through 0; scale x to set the slope at the origin (every one has
 * slope 1 there except T1, which has ½; the article's Graphtoy plot draws T1 as T1(2x)). Inverses take y in
 * (−1, 1). Pure TS; import by path (not in the barrel).
 */

export interface Sigmoid {
  f: (x: number) => number
  inv: (y: number) => number
  /** df/dx. */
  d: (x: number) => number
}

const H = Math.PI / 2

// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** Trigonometric: (2/π)·atan((π/2)·x). */
export const sigmoidTrig = (x: number) => Math.atan(H * x) / H
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
export const sigmoidTrigInv = (y: number) => Math.tan(H * y) / H
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
export const sigmoidTrigD = (x: number) => 4 / (4 + Math.PI * Math.PI * x * x)

// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** Hyperbolic: tanh(x) = 1 − 2/(1 + e^(2x)). */
export const sigmoidTanh = (x: number) => Math.tanh(x)
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** ½·ln((1 + y)/(1 − y)). */
export const sigmoidTanhInv = (y: number) => 0.5 * Math.log((1 + y) / (1 - y))
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** 4/(eˣ + e⁻ˣ)². */
export const sigmoidTanhD = (x: number) => { const e = Math.exp(x) + Math.exp(-x); return 4 / (e * e) }

// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** S1: x/(1 + |x|). */
export const sigmoidS1 = (x: number) => x / (1 + Math.abs(x))
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
export const sigmoidS1Inv = (y: number) => y / (1 - Math.abs(y))
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** (1 + |x|)⁻². */
export const sigmoidS1D = (x: number) => { const a = 1 + Math.abs(x); return 1 / (a * a) }

// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** S2: x/√(1 + x²), with hypot so x² can't overflow for large x. */
export const sigmoidS2 = (x: number) => x / Math.hypot(1, x)
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
export const sigmoidS2Inv = (y: number) => y / Math.sqrt(1 - y * y)
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** (1 + x²)^(−3/2). */
export const sigmoidS2D = (x: number) => { const a = 1 + x * x; return 1 / (a * Math.sqrt(a)) }

// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** S3: x/∛(1 + x²|x|). Past |x| = 1 it is written as sign(x)/∛(1 + |x|⁻³), so |x|³ can't overflow. */
export const sigmoidS3 = (x: number) => {
  const ax = Math.abs(x)
  if (ax <= 1) return x / Math.cbrt(1 + x * x * ax)
  const u = 1 / ax
  return Math.sign(x) / Math.cbrt(1 + u * u * u)
}
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
export const sigmoidS3Inv = (y: number) => y / Math.cbrt(1 - y * y * Math.abs(y))
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** (1 + x²|x|)^(−4/3). */
export const sigmoidS3D = (x: number) => { const a = 1 + x * x * Math.abs(x); return 1 / (a * Math.cbrt(a)) }

// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** T1: x/(1 + √(1 + x²)), with hypot so x² can't overflow. Slope ½ at the origin. */
export const sigmoidT1 = (x: number) => x / (1 + Math.hypot(1, x))
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** 2y/(1 − y²). */
export const sigmoidT1Inv = (y: number) => 2 * y / (1 - y * y)
// after Inigo Quilez, https://iquilezles.org/articles/sigmoids/ (MIT)
/** 1/(√(1 + x²)·(1 + √(1 + x²))). */
export const sigmoidT1D = (x: number) => { const s = Math.hypot(1, x); return 1 / (s * (1 + s)) }

/** The six sigmoids by the article's names, for pickers and sweeps. */
export const SIGMOIDS: Readonly<Record<string, Sigmoid>> = {
  trig: { f: sigmoidTrig, inv: sigmoidTrigInv, d: sigmoidTrigD },
  tanh: { f: sigmoidTanh, inv: sigmoidTanhInv, d: sigmoidTanhD },
  s1: { f: sigmoidS1, inv: sigmoidS1Inv, d: sigmoidS1D },
  s2: { f: sigmoidS2, inv: sigmoidS2Inv, d: sigmoidS2D },
  s3: { f: sigmoidS3, inv: sigmoidS3Inv, d: sigmoidS3D },
  t1: { f: sigmoidT1, inv: sigmoidT1Inv, d: sigmoidT1D },
}
