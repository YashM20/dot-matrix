/**
 * Lyapunov fractals (after Mario Markus): the logistic map xₙ₊₁ = rₙ·xₙ·(1 − xₙ), where rₙ follows a periodic
 * sequence of two values (A → a, B → b, e.g. "AB" or "AABAB"), and each point (a, b) of the plane is shaded by
 * the orbit's Lyapunov exponent λ = lim (1/n)·Σ ln|rᵢ·(1 − 2xᵢ)|. λ < 0: the orbit settles (order); λ > 0: chaos.
 *
 * The article's trick: λ = (1/n)·ln Π|f'(xᵢ)|, one logarithm after the loop instead of one per step. The product
 * over- or underflows within a few hundred steps, so it is folded into a running log whenever it leaves
 * [1e-150, 1e150]: a handful of logarithms per orbit, never one per step.
 *
 * Deterministic: + − × /, `Math.abs`, `dlog`.
 */
import { dlog } from '../noise/dmath'

export interface LyapunovOptions {
  /** Iterations discarded before measuring (default 60). */
  warmup?: number
  /** Iterations measured (default 200). */
  n?: number
  /** Start point (default .5). */
  x0?: number
}
/** "AABAB" → [0, 0, 1, 0, 1] (A = 0, B = 1). */
export const lyapunovSequence = (s: string): number[] => [...s.toUpperCase()].map(ch => (ch === 'B' ? 1 : 0))

// after Inigo Quilez, https://iquilezles.org/articles/lyapunovfractals/ (MIT), after Mario Markus
/**
 * The Lyapunov exponent of the logistic map driven by `seq` (0 → a, 1 → b). -Infinity for a superstable orbit
 * (a step lands exactly on x = ½, where the derivative is 0).
 */
export function lyapunov(a: number, b: number, seq: ArrayLike<number>, o: LyapunovOptions = {}): number {
  const { warmup = 60, n = 200, x0 = .5 } = o, m = seq.length
  let x = x0, j = 0
  for (let i = 0; i < warmup; i++) { const r = seq[j] ? b : a; x = r * x * (1 - x); if (++j === m) j = 0 }
  let prod = 1, acc = 0
  for (let i = 0; i < n; i++) {
    const r = seq[j] ? b : a
    prod *= Math.abs(r * (1 - 2 * x))
    x = r * x * (1 - x)
    if (++j === m) j = 0
    if (prod > 1e150 || prod < 1e-150) {
      if (prod === 0) return -Infinity
      acc += dlog(prod); prod = 1
    }
  }
  return (acc + dlog(prod)) / n
}

/** The orbit x₁ … xₖ itself (after `warmup`), for drawing a probe's time series. */
export function logisticOrbit(a: number, b: number, seq: ArrayLike<number>, k: number, warmup = 60, x0 = .5): Float64Array {
  const out = new Float64Array(k), m = seq.length
  let x = x0, j = 0
  for (let i = 0; i < warmup + k; i++) {
    const r = seq[j] ? b : a
    x = r * x * (1 - x)
    if (++j === m) j = 0
    if (i >= warmup) out[i - warmup] = x
  }
  return out
}
