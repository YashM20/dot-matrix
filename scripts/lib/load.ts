/**
 * Load-aware timing for the area checks (materials, life, squares, halftone). A timing budget scales by the load
 * factor: how much slower this box runs a fixed float loop right now than the budget machine did (`spin`, 1e6 steps,
 * ~1.2 ms there; the classic 1e7 loop of scripts/algorithms.ts is ~12 ms). Never below 1.
 *
 * One factor taken at the top of a script goes stale on a shared box: the suite runs under heavy.mjs at
 * below-normal priority, next to other agents, so the share of CPU it gets swings within seconds (the round-2 merge
 * run measured 1.6 at the top of materials and then timed its frames at ~2.5). So the factor is sampled next to
 * the code it scales: interleaved with the samples of a median (`medianLoaded`), or right before and after a
 * one-shot timing (`onceLoaded`). Both see the same contention as the timed code, which a single early factor didn't.
 */
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[s.length >> 1] }
let sink = 0
/** The reference loop: 1e6 steps, ~1.2 ms on the budget machine. */
export const spin = () => { let s = 0; for (let i = 0; i < 1e6; i++) s += (i & 7) * .5; sink += s; return s }
const SPIN_MS = 1.2
const timeSpin = () => { const a = performance.now(); spin(); return performance.now() - a }
spin(); spin()
/** One load sample in ms (a timed `spin`), for loops that interleave their own; `loadOf` turns samples into a factor. */
export const spinMs = timeSpin
export const loadOf = (samples: number[]) => Math.max(1, median(samples) / SPIN_MS)
/** Load factor now: the median of `n` spins over the reference, ≥ 1. */
export function loadNow(n = 5): number { return Math.max(1, median(Array.from({ length: n }, timeSpin)) / SPIN_MS) }

export interface Loaded<T = unknown> {
  /** Measured ms: the median of the samples, or the one-shot time. */
  ms: number
  /** The load factor sampled alongside it (≥ 1). */
  load: number
  /** The last sample's return value. */
  value: T
}
/** Median of `n` timings of `f(i)` with one load sample before each, so the factor sees what the samples saw. */
export function medianLoaded<T>(f: (i: number) => T, n: number): Loaded<T> {
  const ms: number[] = [], lf: number[] = []
  let value!: T
  for (let i = 0; i < n; i++) {
    lf.push(timeSpin())
    const a = performance.now(); value = f(i); ms.push(performance.now() - a)
  }
  return { ms: median(ms), load: Math.max(1, median(lf) / SPIN_MS), value }
}
/** One timing of `f` (a cold frame, a bake), with the load sampled 3× right before and 3× right after it. */
export function onceLoaded<T>(f: () => T): Loaded<T> {
  const lf = [timeSpin(), timeSpin(), timeSpin()]
  const a = performance.now(), value = f(), ms = performance.now() - a
  lf.push(timeSpin(), timeSpin(), timeSpin())
  return { ms, load: Math.max(1, median(lf) / SPIN_MS), value }
}
/** `12.34 ms @ load 2.10` for a check's detail. */
export const fmtLoaded = (r: Pick<Loaded, 'ms' | 'load'>, dp = 2) => `${r.ms.toFixed(dp)} ms @ ${r.load.toFixed(2)}`
/** Keeps the spins observable (never read by the checks). */
export const spinSink = () => sink
