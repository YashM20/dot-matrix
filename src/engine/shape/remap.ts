/**
 * Remapping functions (identities, impulses, unit remaps, bumps, steps) from Inigo Quilez's "Useful little
 * functions" article. Every argument list puts `x` first; the article's `quaImpulse(k, x)` and
 * `polyImpulse(k, n, x)` are reordered to match. Pure TS, no engine imports; import by path (not in the barrel).
 */

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/**
 * Identity above `m`; below it a cubic blends smoothly down to the floor `n` at x = 0 (a soft `max(x, n)`).
 * Takes m > 0; with m ≤ 0 there is no blend, so it returns n at and below m.
 */
export function almostIdentity(x: number, m: number, n: number): number {
  if (x > m) return x
  if (m <= 0) return n // the article's x/m would be 0/0 or ±Infinity here
  const a = 2 * n - m, b = 2 * m - 3 * n, t = x / m
  return (a * t + b) * t * t + n
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Smooth abs, quadratic form: |x| outside ±n, a parabola through n/2 at 0 inside (the quadratic smin's kernel). */
export function smoothAbsPoly(x: number, n: number): number {
  const x2 = x * x, n2 = n * n
  return x2 < n2 ? (x2 + n2) / (2 * n) : Math.abs(x)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT); the technique is credited there to Shadertoy user "omeometo"
/** Smooth abs, square-root form: sqrt(x² + n²). Zero slope at 0, but a non-zero second derivative. */
export function smoothAbs(x: number, n: number): number {
  return Math.sqrt(x * x + n * n)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
// and https://iquilezles.org/articles/smoothstepintegral/ (MIT)
/**
 * The integral of smoothstep(0, T, x): position of something that eases from rest into speed 1 over time T.
 * Its slope is smoothstep, so it never exceeds 1 and never decelerates. Equals x − T/2 once x > T.
 */
export function integralSmoothstep(x: number, T: number): number {
  if (x <= 0) return 0 // at rest before the ramp starts (smoothstep clamps to 0 there)
  if (x > T) return x - T / 2
  return x * x * x * (1 - x * 0.5 / T) / T / T
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Exponential impulse: fast rise, slow decay; peaks at exactly 1 when x = 1/k. */
export function expImpulse(x: number, k: number): number {
  const h = k * x
  return h * Math.exp(1 - h)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Quadratic impulse, no exponentials; peaks at 1 when x = sqrt(1/k). */
export function quaImpulse(x: number, k: number): number {
  return 2 * Math.sqrt(k) * x / (1 + k * x * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Polynomial impulse of degree n (n > 1); peaks at 1 when x = [k(n−1)]^(−1/n). */
export function polyImpulse(x: number, k: number, n: number): number {
  return (n / (n - 1)) * Math.pow((n - 1) * k, 1 / n) * x / (1 + k * Math.pow(x, n))
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Impulse with separate attack width `f` and release rate `k`; rises to 1 at x = f and settles back to 1. */
export function sustainedImpulse(x: number, f: number, k: number): number {
  const s = Math.max(x - f, 0)
  return Math.min(x * x / (f * f), 1 + (2 / f) * s * Math.exp(-k * s))
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT); the idea is credited there to Hubert-Jan
/** Phase-shifted sinc for bounces: 1 at x = 1/k, integer k sets the bounce count. Can go negative. */
export function sincImpulse(x: number, k: number): number {
  const a = Math.PI * (k * x - 1)
  return a === 0 ? 1 : Math.sin(a) / a // the limit at a = 0, where the article's sin(a)/a is 0/0
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Quadratic falloff that reaches 0 at distance m (a light-style falloff with a hard range). */
export function truncFalloff(x: number, m: number): number {
  if (x > m) return 0
  x /= m
  return (x - 2) * x + 1
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Unit remap with slope 0 at 0 and slope 1 at 1 (almostIdentity with n = 0, m = 1). */
export function almostUnitIdentity(x: number): number {
  return x * x * (2 - x)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/**
 * RenderMan-style gain on [0, 1] for k > 0: keeps 0, ½ and 1; k = 1 is identity, k > 1 an S, 0 < k < 1 the inverse
 * S. gain(·, 1/k) inverts gain(·, k). At k = 0 it is flat ½, and k < 0 leaves the unit interval.
 */
export function gain(x: number, k: number): number {
  const a = 0.5 * Math.pow(2 * (x < 0.5 ? x : 1 - x), k)
  return x < 0.5 ? a : 1 - a
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** (4x(1 − x))^k on [0, 1]: 0 at both ends, 1 in the middle. */
export function parabola(x: number, k: number): number {
  return Math.pow(4 * x * (1 - x), k)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/**
 * Skewed parabola on [0, 1]: k·x^a·(1 − x)^b, scaled so its peak (at a/(a+b)) is exactly 1. Evaluated in log space,
 * so large exponents (the article's k overflows from a + b ≈ 143) keep a finite peak of 1.
 */
export function pcurve(x: number, a: number, b: number): number {
  return Math.exp(xlogx(a + b) - xlogx(a) - xlogx(b) + tlog(a, x) + tlog(b, 1 - x))
}
/** t·ln t, with 0·ln 0 = 0. */
const xlogx = (t: number) => (t === 0 ? 0 : t * Math.log(t))
/** t·ln s, with a zero exponent contributing 0 (so s⁰ = 1, even at s = 0). */
const tlog = (t: number, s: number) => (t === 0 ? 0 : t * Math.log(s))

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Rational tone curve on [0, 1]: keeps 0 and 1, lifts the mids for k > 0, bends them down for −1 < k < 0. */
export function tone(x: number, k: number): number {
  return (k + 1) * x / (1 + k * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** Smoothstep-shaped bump centred on c with half-width w: 1 at c, 0 beyond c ± w. A gaussian with local support. */
export function cubicPulse(x: number, c: number, w: number): number {
  x = Math.abs(x - c)
  if (x > w) return 0
  if (w === 0) return 1 // a zero-width pulse is 1 at c (the article's x/w would be 0/0)
  x /= w
  return 1 - x * x * (3 - 2 * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/** 1 / (1 + kx²): a gaussian stand-in with infinite support. */
export function rationalBump(x: number, k: number): number {
  return 1 / (1 + k * x * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/**
 * x / (1 + |x|^k): an odd double bump with slope 1 at the origin (the article's code writes pow(x, k); its plot
 * uses |x|, which keeps negative x defined for any k). Multiply by k / (k−1)^(1−1/k) to make the peaks 1.
 */
export function doubleBump(x: number, k: number): number {
  return x / (1 + Math.pow(Math.abs(x), k))
}

// after Inigo Quilez, https://iquilezles.org/articles/functions/ (MIT)
/**
 * 2^(−x^k) for x ≥ 0: a falling step through ½ at x = 1 that sharpens towards a hard step as k grows. Follows the
 * article's code (exp2); its plot uses e^(−x^k) instead, which crosses 1/e at x = 1.
 */
export function expStep(x: number, k: number): number {
  return Math.pow(2, -Math.pow(x, k))
}
