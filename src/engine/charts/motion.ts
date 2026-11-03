/**
 * Chart motion (#132): animate in, and animate between two data sets. Both are one progress `s` in [0, 1] spread
 * over the data with a stagger, so bars rise and points move as a wave from left to right. Every element's own
 * progress is eased and lands on exactly 0 and 1: `tween(a, b, 1)` is `b` to the last bit, `tween(a, b, 0)` is `a`.
 *
 * The demo loop is pure in t, and t = 0 (goldens, reduced motion) is the settled first data set.
 */

/** Cubic ease in and out, exact at 0 and 1. */
export const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? 4 * p * p * p : 1 - ((2 - 2 * p) ** 3) / 2)

/** Element `i` of `n`'s eased progress when the whole set is at `s`; `spread` is the share of the run the wave takes. */
export function stagger(s: number, i: number, n: number, spread = .4): number {
  if (!(s > 0)) return 0
  if (s >= 1) return 1
  const lag = n > 1 ? (spread * i) / (n - 1) : 0
  return ease((s - lag) / (1 - spread))
}

/** Mix two numbers so p = 0 gives `a` and p = 1 gives `b` exactly. */
export const mixExact = (a: number, b: number, p: number) => (p <= 0 ? a : p >= 1 ? b : (1 - p) * a + p * b)

/** The values on their way from `a` to `b` at progress `s` (length of `b`; a missing `a` entry starts at `from`). */
export function tween(a: readonly number[], b: readonly number[], s: number, spread = .4, from = 0): number[] {
  return b.map((v, i) => mixExact(a[i] ?? from, v, stagger(s, i, b.length, spread)))
}

/** The values growing in from `base` at progress `s`. */
export const grow = (values: readonly number[], s: number, base = 0, spread = .4) => tween(values.map(() => base), values, s, spread)

/** Snap a spring-driven progress that is within `eps` of an end onto it, so a settled glide ends on the target exactly. */
export const settle = (x: number, eps = 2e-3) => (!(x > eps) ? 0 : x >= 1 - eps ? 1 : x)

/**
 * The demo loop (seconds): hold set A, morph to B, hold B, fall away to the baseline, grow back in as A, hold.
 * Period 14 s; t = 0 sits in the first hold.
 */
export const LOOP = { period: 14, morph: [5, 6.2], out: [11, 11.8], in: [12.2, 13.4] } as const
const frac = (x: number, [a, b]: readonly [number, number]) => (x - a) / (b - a)
/**
 * Where the demo is at time `t`: `intro` (0 = at the baseline, 1 = grown in) and `set` (0 = A, 1 = B). Folded with one
 * `%`, so a whole number of periods later is the same phase to the bit.
 */
export function loopPhase(t: number): { intro: number; set: number } {
  const P = LOOP.period, r = Number.isFinite(t) ? t % P : 0, ph = r < 0 ? r + P : r
  if (ph < LOOP.morph[0]) return { intro: 1, set: 0 }
  if (ph < LOOP.morph[1]) return { intro: 1, set: frac(ph, LOOP.morph) }
  if (ph < LOOP.out[0]) return { intro: 1, set: 1 }
  if (ph < LOOP.out[1]) return { intro: 1 - frac(ph, LOOP.out), set: 1 }
  if (ph < LOOP.in[0]) return { intro: 0, set: 0 }
  if (ph < LOOP.in[1]) return { intro: frac(ph, LOOP.in), set: 0 }
  return { intro: 1, set: 0 }
}
