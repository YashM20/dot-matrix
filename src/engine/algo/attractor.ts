/**
 * Strange-attractor density fields: iterate a 2-D map from one point and histogram where the orbit
 * lands. Two classic maps (Paul Bourke's catalogue, after Clifford Pickover / Peter de Jong):
 *
 *   clifford   x' = sin(a·y) + c·cos(a·x)    y' = sin(b·x) + d·cos(b·y)     |x| ≤ 1 + |c|, |y| ≤ 1 + |d|
 *   dejong     x' = sin(a·y) − cos(b·x)      y' = sin(c·x) − cos(d·y)       |x|, |y| ≤ 2
 *
 * Both are bounded by construction, so the histogram is framed by those bounds and never refits: when
 * the parameters drift (`a`, `b` as functions of t) the shape morphs in place instead of jumping.
 * Tone is log(1 + hits) / log(1 + max hits), the standard way to show a density spanning decades.
 *
 * Determinism: `Math.sin` is not bit-identical across JS engines and a chaotic orbit amplifies an ulp
 * into a different trajectory, so the map uses `tsin` / `tcos`: a table of `dsin` (range reduction by a
 * rounded multiple of 2π, then an odd polynomial — only +, × and Math.round, which IEEE 754 makes exact
 * everywhere) read with linear interpolation.
 */

const TAU = Math.PI * 2, INV_TAU = 1 / TAU
/** sin(x) to ~2e-7 from +, ×, round only (bit-identical in every engine). */
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

export type AttractorKind = 'clifford' | 'dejong'
export interface AttractorParams { kind?: AttractorKind; a: number; b: number; c: number; d: number }
export interface AttractorOptions {
  /** Histogram size. */
  w: number
  h: number
  /** Orbit points binned (after `warmup` discarded ones). */
  iterations: number
  warmup?: number
  /** Start point (default 0.1, 0.1). */
  x0?: number
  y0?: number
  /** Margin in histogram pixels left empty around the attractor's bound box (default 1). */
  margin?: number
  /**
   * Chaotic maps have periodic windows: inside one the orbit collapses onto a few points. When fewer than
   * `minCovered` pixels are hit, `a`, then `b`, is nudged by ±`nudge`, ±2·`nudge`, ±3·`nudge` (up to 12 tries) and the first attempt that clears the bar (else the best) is drawn,
   * so a parameter path through a window keeps its shape (default 0 = off).
   */
  minCovered?: number
  nudge?: number
  /** Reuse this histogram (w × h, zeroed here). */
  out?: Float32Array
}
export interface AttractorDensity {
  w: number
  h: number
  /** log-scaled hits per pixel in [0, 1] (row-major, y down). */
  density: Float32Array
  /** Hits of the busiest pixel. */
  max: number
  /** Pixels hit at least once. */
  covered: number
  /** The `a`, `b` actually drawn (they differ from the request after a collapse nudge). */
  a: number
  b: number
}
/** The analytic bound box [x0, y0, x1, y1] of the map. */
export function attractorBounds(p: AttractorParams): [number, number, number, number] {
  if ((p.kind ?? 'clifford') === 'dejong') return [-2, -2, 2, 2]
  const bx = 1 + Math.abs(p.c), by = 1 + Math.abs(p.d)
  return [-bx, -by, bx, by]
}

/** Iterate the map and return its log-density histogram, framed by the analytic bounds (aspect kept, centred). */
export function attractorDensity(p: AttractorParams, o: AttractorOptions): AttractorDensity {
  const { w, h, iterations, warmup = 64, margin = 1, minCovered = 0, nudge = .013 } = o
  const hits = o.out && o.out.length === w * h ? o.out : new Float32Array(w * h)
  const [bx0, by0, bx1, by1] = attractorBounds(p)
  const s = Math.min((w - 2 * margin) / (bx1 - bx0), (h - 2 * margin) / (by1 - by0))
  const ox = w / 2 - s * (bx0 + bx1) / 2, oy = h / 2 - s * (by0 + by1) / 2
  const { c, d } = p, dejong = p.kind === 'dejong'
  /** Raw hits for map parameters `a`, `b` into `hits`; returns [max, covered]. */
  const run = (a: number, b: number): [number, number] => {
    hits.fill(0)
    let x = o.x0 ?? .1, y = o.y0 ?? .1, max = 0, covered = 0
    for (let i = -warmup; i < iterations; i++) {
      const nx = dejong ? tsin(a * y) - tcos(b * x) : tsin(a * y) + c * tcos(a * x)
      const ny = dejong ? tsin(c * x) - tcos(d * y) : tsin(b * x) + d * tcos(b * y)
      x = nx; y = ny
      if (i < 0) continue
      const px = (ox + s * x) | 0, py = (oy + s * y) | 0
      if (px < 0 || py < 0 || px >= w || py >= h) continue
      const v = ++hits[py * w + px]
      if (v === 1) covered++
      if (v > max) max = v
    }
    return [max, covered]
  }
  let a = p.a, b = p.b, [max, covered] = run(a, b)
  if (covered < minCovered) {
    // ±1, ±2, ±3 nudges of a, then of b; keep the first that clears the bar, else the best
    let best = covered, bestA = a, bestB = b
    for (let k = 1; k <= 12 && best < minCovered; k++) {
      const off = (k % 2 ? 1 : -1) * Math.ceil(((k - 1) % 6 + 1) / 2) * nudge, ta = k <= 6 ? p.a + off : p.a, tb = k <= 6 ? p.b : p.b + off
      const [, cov] = run(ta, tb)
      if (cov > best) { best = cov; bestA = ta; bestB = tb }
    }
    a = bestA; b = bestB;
    [max, covered] = run(a, b)
  }
  const k = max > 0 ? 1 / Math.log(1 + max) : 0
  for (let i = 0; i < hits.length; i++) if (hits[i] > 0) hits[i] = Math.log(1 + hits[i]) * k
  return { w, h, density: hits, max, covered, a, b }
}
