/**
 * Orbit traps: colour a point of the Mandelbrot or Julia plane by how close its orbit {z₁, z₂, …} comes to a
 * shape (the trap), instead of by how fast it escapes. A point trap gives bubbles that follow the set's
 * spirals; a line trap gives threads; a procedural trap is any function of z.
 *
 * Deterministic: + − × /, `Math.abs` and `Math.sqrt` only.
 */

/** The traps to measure: any subset. */
export interface Traps {
  /** A point (x, y): distance |z − p|. */
  point?: readonly [number, number]
  /** A line a·x + b·y + c = 0 with (a, b) a unit normal: distance |a·x + b·y + c|. */
  line?: readonly [number, number, number]
  /** A procedural trap: any non-negative function of z (its minimum over the orbit is kept). */
  fn?: (x: number, y: number) => number
}
/** What one orbit left in the traps. Reuse one object across a scan (`orbitTraps(..., out)`). */
export interface TrapHit {
  /** Minimum distance to the point trap over the orbit (Infinity without one). */
  point: number
  /** Minimum distance to the line trap. */
  line: number
  /** Minimum of the procedural trap. */
  fn: number
  /** Orbit index (1-based) where the point trap's minimum was reached, and that orbit point. */
  at: number
  ax: number
  ay: number
  /** Iterations run, and whether the orbit left the bailout radius. */
  n: number
  escaped: boolean
}
export const trapHit = (): TrapHit => ({ point: Infinity, line: Infinity, fn: Infinity, at: 0, ax: 0, ay: 0, n: 0, escaped: false })

/** A line through (x, y) at angle given by its unit direction (dx, dy), as the `line` trap's [a, b, c]. */
export function trapLine(x: number, y: number, dx: number, dy: number): [number, number, number] {
  const l = Math.sqrt(dx * dx + dy * dy), a = -dy / l, b = dx / l
  return [a, b, -(a * x + b * y)]
}

// after Inigo Quilez, https://iquilezles.org/articles/ftrapsgeometric/ (MIT); the procedural trap (`fn`) after
// https://iquilezles.org/articles/ftrapsprocedural/ (MIT)
/**
 * Iterate z ← z² + c from z₀ (z₀ = 0 for the Mandelbrot set) and keep the minimum distance from every orbit point
 * to each trap. As in the article's code, the escape test comes before the trap test, so the point that escapes is
 * not measured, and the loop stops there; `escaped` tells the caller (the article returns 0 for those points).
 * Distances are compared squared for the point trap and rooted once at the end.
 */
export function orbitTraps(zx: number, zy: number, cx: number, cy: number, maxIter: number, traps: Traps, out: TrapHit = trapHit(), bailout = 2): TrapHit {
  const b2 = bailout * bailout, p = traps.point, l = traps.line, fn = traps.fn
  let x = zx, y = zy, dp = Infinity, dl = Infinity, df = Infinity, at = 0, ax = 0, ay = 0, n = 0, escaped = false
  for (; n < maxIter; n++) {
    const nx = x * x - y * y + cx; y = 2 * x * y + cy; x = nx
    if (x * x + y * y > b2) { escaped = true; break }
    if (p) {
      const dx = x - p[0], dy = y - p[1], d = dx * dx + dy * dy
      if (d < dp) { dp = d; at = n + 1; ax = x; ay = y }
    }
    if (l) { const d = Math.abs(l[0] * x + l[1] * y + l[2]); if (d < dl) dl = d }
    if (fn) { const d = fn(x, y); if (d < df) df = d }
  }
  out.point = Math.sqrt(dp); out.line = dl; out.fn = df; out.at = at; out.ax = ax; out.ay = ay; out.n = n; out.escaped = escaped
  return out
}

/**
 * The orbit itself, z₁ … zₖ, written as x, y pairs into `out` (up to out.length / 2 points); returns k. It stops
 * after the first point outside the bailout (that point included), so a drawn orbit shows where it left.
 */
export function orbitPoints(zx: number, zy: number, cx: number, cy: number, out: Float64Array, bailout = 2): number {
  const b2 = bailout * bailout, max = out.length >> 1
  let x = zx, y = zy, k = 0
  while (k < max) {
    const nx = x * x - y * y + cx; y = 2 * x * y + cy; x = nx
    out[2 * k] = x; out[2 * k + 1] = y; k++
    if (x * x + y * y > b2) break
  }
  return k
}
