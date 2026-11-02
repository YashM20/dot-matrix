/**
 * Escape-time fractals with the smooth iteration count: the Mandelbrot set (z₀ = 0, c varies), Julia sets
 * (z₀ varies, c fixed) and their degree-d relatives f(z) = z^d + c.
 *
 * The classic count n (iterations until |z| > B) steps in bands. The smooth count subtracts how far past B
 * the escaping point went, measured so that a point that only just escaped and one that escaped a whole
 * iteration early meet: s = n − log_d(log_B |zₙ|). It is continuous across the band edges, which is what a dot
 * grid wants: tone (and dot size) can follow s without contour lines.
 *
 * Deterministic: only + − × / and `dlog` (src/engine/noise/dmath), so a card hashes the same in every engine.
 */
import { dlog } from '../noise/dmath'

/** The article's bailout for the smooth count: far enough out that z^d dominates the lower terms. */
export const SMOOTH_BAILOUT = 256
/** Returned for points whose orbit stays bounded for `maxIter` iterations (inside the set). */
export const INSIDE = -1

export interface EscapeOptions {
  maxIter: number
  /** Bailout radius B (default 256). The plain set test only needs 2; the smooth count wants it large. */
  bailout?: number
  /** Degree d of f(z) = z^d + c, an integer ≥ 2 (default 2). */
  degree?: number
  /** `false` returns the classic integer count (the banded one), for comparison. Default true. */
  smooth?: boolean
}

/** ln 2 and ln 256, the constants of the common case (computed once: the same bits as computing them per call). */
const LN2 = dlog(2), LN_B = dlog(SMOOTH_BAILOUT)

// after Inigo Quilez, https://iquilezles.org/articles/msetsmooth/ (MIT)
/**
 * The smooth iteration count from the classic count `n` and the escaped orbit point zₙ (given as |zₙ|²):
 * n − log_d(log_B |zₙ|), with |zₙ| ≥ B. log|z| is taken as ½·log|z|² (the article's "no square root" note).
 */
export function smoothCount(n: number, r2: number, bailout = SMOOTH_BAILOUT, degree = 2): number {
  const lnB = bailout === SMOOTH_BAILOUT ? LN_B : dlog(bailout), lnD = degree === 2 ? LN2 : dlog(degree)
  return n - dlog(.5 * dlog(r2) / lnB) / lnD
}

// after Inigo Quilez, https://iquilezles.org/articles/msetsmooth/ (MIT)
/**
 * Iterate z ← z^d + c from z₀ and return the smooth escape count (or the integer one with `smooth: false`),
 * or `INSIDE` when the orbit stays within B for `maxIter` iterations. The counter follows the article's code:
 * n is the number of iterations that did not escape, so a z₀ already outside B still iterates once.
 */
export function escapeTime(zx: number, zy: number, cx: number, cy: number, o: EscapeOptions): number {
  const { maxIter, bailout = SMOOTH_BAILOUT, degree = 2, smooth = true } = o
  const b2 = bailout * bailout
  if (degree === 2) {
    // the common case as its own tight loop (a Julia card runs it for every cell, every frame)
    let x = zx, y = zy, x2 = x * x, y2 = y * y
    for (let n = 0; n < maxIter; n++) {
      y = 2 * x * y + cy; x = x2 - y2 + cx
      x2 = x * x; y2 = y * y
      if (x2 + y2 > b2) return smooth ? smoothCount(n, x2 + y2, bailout, 2) : n
    }
    return INSIDE
  }
  let x = zx, y = zy
  for (let n = 0; n < maxIter; n++) {
    // z^d by repeated multiplication (same order every call)
    let px = x, py = y
    for (let k = 1; k < degree; k++) { const t = px * x - py * y; py = px * y + py * x; px = t }
    x = px + cx; y = py + cy
    const r2 = x * x + y * y
    if (r2 > b2) return smooth ? smoothCount(n, r2, bailout, degree) : n
  }
  return INSIDE
}

/** Smooth count of the Mandelbrot set (or the degree-d multibrot) at c. */
export const mandelbrot = (cx: number, cy: number, maxIter: number, o: Omit<EscapeOptions, 'maxIter'> = {}) =>
  escapeTime(0, 0, cx, cy, { ...o, maxIter })

/** Smooth count of the Julia set of c at z. */
export const julia = (zx: number, zy: number, cx: number, cy: number, maxIter: number, o: Omit<EscapeOptions, 'maxIter'> = {}) =>
  escapeTime(zx, zy, cx, cy, { ...o, maxIter })

/**
 * A point on the boundary of the main cardioid at angle θ, scaled by `r` from its centre-cusp form:
 * c(θ) = r·(e^{iθ}/2 − e^{2iθ}/4). r < 1 is inside (connected Julia sets), r > 1 outside (dust).
 * A parameter path for a moving Julia c; `cos` and `sin` are passed in so callers pick their trig.
 */
export function cardioid(theta: number, r: number, cos: (x: number) => number, sin: (x: number) => number): [number, number] {
  return [r * (.5 * cos(theta) - .25 * cos(2 * theta)), r * (.5 * sin(theta) - .25 * sin(2 * theta))]
}
