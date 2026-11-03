/**
 * Chart scales (#132): data values to card cells. A scale maps its domain linearly onto a range of cells and
 * snaps to a whole number of `step`s from the range's start, so a bar of dot sites `step` cells apart ends on a
 * site row and a line point on a whole cell. The ends are exact: the domain's min lands on the range's first cell,
 * its max on the last, its midpoint on the middle one (when the range holds an even number of steps).
 *
 * Pure and framework-free, in the determinism lint (scripts/lib/detLint.ts): no engine-specific Math.
 */
export type Range2 = [number, number]

export interface Scale {
  domain: Range2
  /** Cells: [first, last], either way round (a value axis usually runs from the baseline up). */
  range: Range2
  /** Snap size in cells (1 = whole cells; a bar's site pitch). */
  step: number
  /** Cell position of `v`, unsnapped and unclamped. */
  at(v: number): number
  /** Cell position of `v`, snapped to the step grid from `range[0]` and clamped to the range. A non-finite value maps to `range[0]`. */
  cell(v: number): number
  /** Value at cell `c` (the inverse of `at`). */
  invert(c: number): number
}

export function linear(domain: Range2, range: Range2, step = 1): Scale {
  const [d0, d1] = domain, [r0, r1] = range
  const span = d1 - d0 || 1, dir = r1 >= r0 ? 1 : -1, len = (r1 - r0) * dir, s = step > 0 ? step : 1
  const steps = Math.round(len / s)
  const at = (v: number) => r0 + ((v - d0) / span) * (r1 - r0)
  return {
    domain, range, step: s, at,
    cell(v) {
      if (!Number.isFinite(v)) return r0
      const k = Math.round(((at(v) - r0) * dir) / s)
      return r0 + dir * Math.max(0, Math.min(steps, k)) * s
    },
    invert: c => d0 + ((c - r0) / ((r1 - r0) || 1)) * span,
  }
}

/** The finite values of a list (data can carry gaps). */
export const finite = (values: readonly number[]): number[] => values.filter(v => Number.isFinite(v))

/**
 * [min, max] of the values, never empty or flat: no values → [0, 1]; one level `v` → [0, v] with `zero`, else
 * [v − 1, v + 1]. `zero` keeps 0 inside (bars and areas grow from it).
 */
export function extent(values: readonly number[], zero = false): Range2 {
  const xs = finite(values)
  if (!xs.length) return [0, 1]
  let lo = Math.min(...xs), hi = Math.max(...xs)
  if (zero) { lo = Math.min(0, lo); hi = Math.max(0, hi) }
  if (lo === hi) return zero ? (lo === 0 ? [0, 1] : [Math.min(0, lo), Math.max(0, hi)]) : [lo - 1, hi + 1]
  return [lo, hi]
}

/** A 1, 2 or 5 × 10ⁿ step that cuts `span` into about `count` pieces (powers of ten by repeated multiplication). */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 1
  const raw = span / count
  let up = 1, down = 1
  while (up * 10 <= raw) up *= 10
  while (raw < 1 / down) down *= 10
  const mag = down > 1 ? 1 / down : up, f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
}

const tidy = (v: number) => Math.round(v * 1e9) / 1e9
/** The domain widened to whole `niceStep`s and its ticks, ends included: [0, 87] at 2 → [0, 100], ticks 0, 50, 100. */
export function niceDomain(lo: number, hi: number, count = 2): { domain: Range2; ticks: number[] } {
  const step = niceStep(hi - lo, count), a = Math.floor(tidy(lo / step)), b = Math.max(a + 1, Math.ceil(tidy(hi / step)))
  const ticks: number[] = []
  for (let k = a; k <= b; k++) ticks.push(tidy(k * step))
  return { domain: [ticks[0], ticks[ticks.length - 1]], ticks }
}

/** `n` positions from `x0` to `x1`, ends included (one point sits in the middle; none for n ≤ 0). */
export function spread(n: number, x0: number, x1: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [(x0 + x1) / 2]
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? x1 : x0 + (i * (x1 - x0)) / (n - 1)))
}

/** Whole-cell centres of `n` equal bands across [x0, x1] (bars, candles, heat columns). */
export function bands(n: number, x0: number, x1: number): number[] {
  if (n <= 0) return []
  const w = (x1 - x0) / n
  return Array.from({ length: n }, (_, i) => Math.round(x0 + (i + .5) * w))
}
