/**
 * Dev-only input latency gate (P2-G): event `timeStamp` (pointer / keyboard) → end of the first
 * canvas draw that reflects it. Samples land in a ring buffer; read them from the console with
 * `window.__dotLatency()` → `{ n, p50, p95, max }` in ms (`window.__dotLatency(true)` also clears).
 * The draw end is measured synchronously after `renderCanvas`, so browser paint / compositing is
 * not included. Compiled out of production builds (`import.meta.env.DEV`).
 */
export const LATENCY_PROBE: boolean = !!import.meta.env?.DEV

export interface LatencyStats { n: number; p50: number; p95: number; max: number }
const SIZE = 512
const ring = new Float64Array(SIZE)
let count = 0, head = 0

export function recordLatency(ms: number) {
  if (!(ms >= 0) || ms > 5000) return
  ring[head] = ms; head = (head + 1) % SIZE; count = Math.min(SIZE, count + 1)
}

export function latencyStats(clear = false): LatencyStats {
  const xs = Array.from(ring.subarray(0, count)).sort((a, b) => a - b)
  const q = (p: number) => (xs.length ? +xs[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)].toFixed(2) : NaN)
  const out = { n: xs.length, p50: q(.5), p95: q(.95), max: xs.length ? +xs[xs.length - 1].toFixed(2) : NaN }
  if (clear) { count = 0; head = 0 }
  return out
}

declare global { interface Window { __dotLatency?: (clear?: boolean) => LatencyStats } }
if (LATENCY_PROBE && typeof window !== 'undefined') window.__dotLatency = latencyStats

/** One input event waiting for its frame: `patch` must be visible in the drawn data (undefined = ix-only change). */
export interface LatencyMark { stamp: number; patch?: Record<string, number> }
/** Unanswered marks older than this are dropped, not recorded (the card unmounted or never redrew). */
const STALE_MS = 2000

/**
 * Called after a canvas draw with the data it drew. A mark is answered when it has no patch (hover /
 * press / focus are read live, so any draw after the commit shows them), when every patched key
 * shows its value, or when a newer answered mark overwrote those keys (a fast drag supersedes its
 * own older values). Answered marks are recorded and removed.
 */
export function resolveMarks(marks: LatencyMark[], drawn: Record<string, number>) {
  if (!marks.length) return
  const now = performance.now(), answeredKeys = new Set<string>(), keep: LatencyMark[] = []
  for (let i = marks.length - 1; i >= 0; i--) {
    const m = marks[i], p = m.patch
    let ok = true
    if (p) for (const k in p) if (drawn[k] !== p[k] && !answeredKeys.has(k)) { ok = false; break }
    if (ok) { recordLatency(now - m.stamp); if (p) for (const k in p) answeredKeys.add(k) }
    else if (now - m.stamp < STALE_MS) keep.unshift(m)
  }
  marks.length = 0
  marks.push(...keep.slice(-64))
}
