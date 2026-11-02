/**
 * SDFs in the L∞ (Chebyshev) metric: distance is max(|dx|, |dy|), so the iso-lines are squares, which suits square
 * dots and the squares track. Same frame as the Euclidean set: centred on the origin, y-up, negative inside.
 * Their gradients have unit L1 length (|gx| + |gy| = 1). Rotations don't carry over the way they do in L2.
 */
import { clamp, dcos, dsin } from './util'

/** Shared by the circle and the rounded box: L∞ distance once the point is folded against a quarter circle `r`. */
function quarter(x: number, y: number, r: number): number {
  const mx = Math.max(x, y - r), my = Math.max(y, x - r)
  const a = .5 * (mx + my), b = .5 * (mx - my)
  return a - Math.sqrt(r * r * .5 - b * b)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT)
/** Box of half-size (bx, by), L∞. Exact. */
export const sdBoxLinf = (px: number, py: number, bx: number, by: number) => Math.max(Math.abs(px) - bx, Math.abs(py) - by)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT), with the max(p, (p-r).yx) trick from Shadertoy user "oneshade"
/** Disc of radius `r`, L∞. Exact. */
export const sdCircleLinf = (px: number, py: number, r: number) => quarter(Math.abs(px), Math.abs(py), r)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT), with the max(p, (p-r).yx) trick from Shadertoy user "oneshade"
/** Ellipse with radii (a, b), L∞. Exact. */
export function sdEllipseLinf(px: number, py: number, a: number, b: number): number {
  const x0 = Math.abs(px), y0 = Math.abs(py)
  const x = Math.max(x0, y0 - b), y = Math.max(y0, x0 - a)
  const m = a * a + b * b, d = y - x
  return x - (b * Math.sqrt(m - d * d) - a * d) * a / m
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT)
/**
 * Parabolic arch from (±wi, 0) up to (0, he), L∞. Exact for y ≥ 0. Below the base the code returns a positive
 * distance past the line x − y = wi and a negative one inside it, so the field jumps there.
 */
export function sdParabolaLinf(px: number, py: number, wi: number, he: number): number {
  const x = Math.abs(px)
  const a = x - py - wi, b = py - x - he
  if (a > 0) return Math.max(Math.abs(x - wi), Math.abs(py))
  if (b > 0) return Math.max(Math.abs(py - he), x)
  return x + (wi - Math.sqrt(wi * wi - 4 * he * b)) * .5 * wi / he
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT)
/** Segment (ax, ay)–(bx, by), L∞. Unsigned. */
export function sdSegmentLinf(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay
  const s = bax * bay > 0 ? 1 : -1
  const h = clamp((pay + s * pax) / (bay + s * bax), 0, 1)
  return Math.max(Math.abs(pax - h * bax), Math.abs(pay - h * bay))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT), with the max(p, (p-r).yx) trick from Shadertoy user "oneshade"
/** Box of half-size (bx, by) grown by a rounded margin `r` (outer half-size b + r), L∞. Exact. */
export const sdRoundBoxLinf = (px: number, py: number, bx: number, by: number, r: number) =>
  quarter(Math.abs(px) - bx, Math.abs(py) - by, r)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT)
/** Rhombus with half-diagonals (w, h), L∞. Exact. */
export function sdRhombusLinf(px: number, py: number, w: number, h: number): number {
  const x = Math.abs(px) - w, y = Math.abs(py)
  const f = clamp((y - x) / (h + w), 0, 1)
  return Math.max(Math.abs(x + f * w), Math.abs(y - f * h)) * (h * x + w * y > 0 ? 1 : -1)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2dlinf/ (MIT)
/** Box of half-size (rx, ry) rotated by `ang` radians, L∞. Exact. */
export function sdOrientedBoxLinf(px: number, py: number, rx: number, ry: number, ang: number): number {
  const wx = dcos(ang), wy = dsin(ang)
  const q0 = wx * px, q1 = wy * px, q2 = wy * py, q3 = wx * py
  const s0 = wx * rx, s1 = wy * rx, s2 = wy * ry, s3 = wx * ry
  return Math.max(
    Math.max(Math.abs(q0 + q2) - rx, Math.abs(q3 - q1) - ry) / Math.max(Math.abs(wx - wy), Math.abs(wx + wy)),
    Math.max(Math.abs(px) - Math.max(Math.abs(s0 - s2), Math.abs(s0 + s2)), Math.abs(py) - Math.max(Math.abs(s1 + s3), Math.abs(s1 - s3))),
  )
}
