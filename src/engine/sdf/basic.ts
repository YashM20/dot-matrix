/**
 * Boxes, segments and other straight-sided primitives. All shapes are centred on the origin in y-up coordinates,
 * negative inside, and every distance is in the units of the point (cells when used through `sdfField`).
 */
import { clamp, dot2, len, sign, SQRT1_2, SQRT2 } from './util'

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Disc of radius `r`. Exact. */
export const sdCircle = (px: number, py: number, r: number) => len(px, py) - r

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Box of half-size (bx, by). Exact. */
export function sdBox(px: number, py: number, bx: number, by: number): number {
  const dx = Math.abs(px) - bx, dy = Math.abs(py) - by
  return len(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Box of half-size (bx, by) with a radius per corner: `r0` for x > 0, y > 0; `r1` for x > 0, y ≤ 0; `r2` for
 * x ≤ 0, y > 0; `r3` for x ≤ 0, y ≤ 0. Exact.
 */
export function sdRoundedBox(px: number, py: number, bx: number, by: number, r0: number, r1 = r0, r2 = r0, r3 = r0): number {
  const r = px > 0 ? (py > 0 ? r0 : r1) : (py > 0 ? r2 : r3)
  const qx = Math.abs(px) - bx + r, qy = Math.abs(py) - by + r
  return Math.min(Math.max(qx, qy), 0) + len(Math.max(qx, 0), Math.max(qy, 0)) - r
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Box of half-size (bx, by) with its corners cut at 45° by `chamfer`. Exact. */
export function sdChamferBox(px: number, py: number, bx: number, by: number, chamfer: number): number {
  let x = Math.abs(px) - bx, y = Math.abs(py) - by
  if (y > x) { const t = x; x = y; y = t }
  y += chamfer
  const k = 1 - SQRT2
  if (y < 0 && y + x * k < 0) return x
  if (x < y) return (x + y) * SQRT1_2
  return len(x, y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Box from (ax, ay) to (bx, by) along its length, `th` thick. Exact. */
export function sdOrientedBox(px: number, py: number, ax: number, ay: number, bx: number, by: number, th: number): number {
  const l = len(bx - ax, by - ay), dx = (bx - ax) / l, dy = (by - ay) / l
  const cx = px - (ax + bx) * .5, cy = py - (ay + by) * .5
  const qx = Math.abs(dx * cx + dy * cy) - l * .5, qy = Math.abs(-dy * cx + dx * cy) - th * .5
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Segment from (ax, ay) to (bx, by). Unsigned and exact; subtract a radius for a capsule. */
export function sdSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const pax = px - ax, pay = py - ay, bax = bx - ax, bay = by - ay
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
  return len(pax - bax * h, pay - bay * h)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Rhombus with half-diagonals (bx, by). Exact. x = 0 after the projection only happens past a tip, so it counts as
 * outside (GLSL `sign(0)` gives 0 there, a line of zeros through the tips on a cell grid).
 */
export function sdRhombus(px: number, py: number, bx: number, by: number): number {
  const ny = -by
  let x = Math.abs(px), y = Math.abs(py)
  const h = clamp((bx * x + ny * y + ny * ny) / (bx * bx + ny * ny), 0, 1)
  x -= bx * h; y -= ny * (h - 1)
  return len(x, y) * (x < 0 ? -1 : 1)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Isosceles trapezoid: half-width `r1` at y = -he, `r2` at y = +he. Exact. */
export function sdTrapezoid(px: number, py: number, r1: number, r2: number, he: number): number {
  const k1x = r2, k1y = he, k2x = r2 - r1, k2y = 2 * he
  const x = Math.abs(px)
  const cax = x - Math.min(x, py < 0 ? r1 : r2), cay = Math.abs(py) - he
  const t = clamp(((k1x - x) * k2x + (k1y - py) * k2y) / dot2(k2x, k2y), 0, 1)
  const cbx = x - k1x + k2x * t, cby = py - k1y + k2y * t
  const s = cbx < 0 && cay < 0 ? -1 : 1
  return s * Math.sqrt(Math.min(dot2(cax, cay), dot2(cbx, cby)))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Parallelogram: half-width `wi`, half-height `he`, the top edge shifted right by `sk`. Exact. */
export function sdParallelogram(px: number, py: number, wi: number, he: number, sk: number): number {
  const ex = sk, ey = he
  let x = px, y = py
  if (y < 0) { x = -x; y = -y }
  let wx = x - ex
  const wy = y - ey
  wx -= clamp(wx, -wi, wi)
  let dx = wx * wx + wy * wy, dy = -wy
  const s = x * ey - y * ex
  if (s < 0) { x = -x; y = -y }
  let vx = x - wi, vy = y
  const t = clamp((vx * ex + vy * ey) / (ex * ex + ey * ey), -1, 1)
  vx -= ex * t; vy -= ey * t
  dx = Math.min(dx, vx * vx + vy * vy); dy = Math.min(dy, wi * he - Math.abs(s))
  return Math.sqrt(dx) * sign(-dy)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Capsule from a disc of radius `r1` at the origin to a disc of radius `r2` at (0, h). Exact. */
export function sdUnevenCapsule(px: number, py: number, r1: number, r2: number, h: number): number {
  const x = Math.abs(px)
  const b = (r1 - r2) / h, a = Math.sqrt(1 - b * b)
  const k = -b * x + a * py
  if (k < 0) return len(x, py) - r1
  if (k > a * h) return len(x, py - h) - r2
  return a * x + b * py - r1
}
