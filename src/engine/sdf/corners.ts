/**
 * Rounded boxes with a choice of corner curve. A circular corner (the usual rounded box) has a jump in curvature
 * where it meets the sides, which shows up as a crease in lighting. The cosine and cubic corners are C²: their
 * curvature goes to zero at the join, so normals and the shading built on them stay smooth.
 *
 * Each corner works in the article's "uv" frame: the corner square rotated 45°, the join at (1, 0) and the corner
 * curve c(u) with c(1) = 0, c'(1) = -1. At the same `r` the corners bulge by different amounts; divide `r` by c(0)
 * to match them: circle √2 − 1, parabola 1/2, cosine 2/π, cubic 2/3.
 */
import { cbrt, clamp, dcos, dsin, len, sign, SQRT1_2, SQRT2 } from './util'

/** Signed distance to a corner curve in the corner's uv frame. */
export type CornerSdf = (u: number, v: number) => number

// after Inigo Quilez, https://iquilezles.org/articles/roundedboxes/ (MIT)
/** Circular corner, c(u) = √(2 − u²) − 1: the classic rounded box. Exact. */
export const cornerCircle: CornerSdf = (u, v) => len(u, v + 1) - SQRT2

// after Inigo Quilez, https://iquilezles.org/articles/roundedboxes/ (MIT), from an idea by Shadertoy user wutzhuhn
/**
 * Parabolic corner, c(u) = (1 − u²)/2. Halves the curvature jump of the circle. Like the article, it skips the
 * three-root case, which only happens deep inside the box.
 */
export const cornerParabola: CornerSdf = (u, v) => {
  const y = (.5 + v) * (2 / 3)
  const h = u * u + y * y * y
  const w = cbrt(u + Math.sqrt(Math.abs(h)))
  const x = w - y / w
  const qy = .5 * (1 - x * x)
  return len(u - x, v - qy) * sign(v - qy)
}

// after Inigo Quilez, https://iquilezles.org/articles/roundedboxes/ (MIT)
/** Cosine corner, c(u) = (2/π)·cos(uπ/2). C² at the join; found by a 12-step bisection. */
export const cornerCosine: CornerSdf = (u0, v0) => {
  const k = Math.PI / 2, u = u0 * k, v = v0 * k
  let ta = 0, tb = k
  for (let i = 0; i < 12; i++) {
    const t = .5 * (ta + tb)
    if (t - u + (v - dcos(t)) * dsin(t) < 0) ta = t; else tb = t
  }
  return segSide(u, v, ta, dcos(ta), tb, dcos(tb)) / k
}

// after Inigo Quilez, https://iquilezles.org/articles/roundedboxes/ (MIT)
/** Cubic corner, c(u) = (u³ − 3u² + 2)/3. C² at the join, a little cheaper than the cosine. 12-step bisection. */
export const cornerCubic: CornerSdf = (u, v) => {
  let ta = 0, tb = 1
  for (let i = 0; i < 12; i++) {
    const t = .5 * (ta + tb)
    const c = (t * t * (t - 3) + 2) / 3, dc = t * (t - 2)
    if ((u - t) + (v - c) * dc > 0) ta = t; else tb = t
  }
  return segSide(u, v, ta, (ta * ta * (ta - 3) + 2) / 3, tb, (tb * tb * (tb - 3) + 2) / 3)
}

/** Signed distance from (u, v) to the chord (ax, ay)–(bx, by), positive on the left of it. */
function segSide(u: number, v: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = u - ax, pay = v - ay, dx = bx - ax, dy = by - ay
  const h = clamp((pax * dx + pay * dy) / (dx * dx + dy * dy), 0, 1)
  return len(pax - dx * h, pay - dy * h) * sign(pay * dx - pax * dy)
}

// after Inigo Quilez, https://iquilezles.org/articles/roundedboxes/ (MIT)
/**
 * Box of half-size (bx, by) with corners of size `r0..r3` (same order as `sdRoundedBox`) drawn by `corner`.
 * With `cornerCircle` it equals `sdRoundedBox`. The article returns `d·√2·r`; the uv frame is scaled by √2/r,
 * so the distance is `d·r/√2` (that is what makes the circle case match).
 */
export function sdBoxCorners(px: number, py: number, bx: number, by: number, corner: CornerSdf, r0: number, r1 = r0, r2 = r0, r3 = r0): number {
  const r = px > 0 ? (py > 0 ? r0 : r1) : (py > 0 ? r2 : r3)
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r
  if (Math.min(qx, qy) < 0 || r <= 0) return r <= 0 && qx > 0 && qy > 0 ? len(qx, qy) : Math.max(qx, qy) - r
  return corner(Math.abs(qx - qy) / r, (qx + qy - r) / r) * r * SQRT1_2
}
