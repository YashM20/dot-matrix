/**
 * Triangles, regular polygons, stars, crosses and the general polygon. Centred on the origin, y-up, negative inside.
 * Regular polygons take their apothem `r` (centre to edge), so d(0, 0) = -r.
 */
import { clamp, datan2, dcos, dsin, len, mod, sign, SQRT3 } from './util'

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Equilateral triangle of half-side `r`, centroid at the origin, apex up. Exact. */
export function sdEquilateralTriangle(px: number, py: number, r: number): number {
  const k = SQRT3
  let x = Math.abs(px) - r, y = py + r / k
  if (x + k * y > 0) { const nx = (x - k * y) * .5, ny = (-k * x - y) * .5; x = nx; y = ny }
  x -= clamp(x, -2 * r, 0)
  return -len(x, y) * sign(y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Isosceles triangle with its apex at the origin and its base corners at (±qx, qy). Exact. */
export function sdTriangleIsosceles(px: number, py: number, qx: number, qy: number): number {
  const x = Math.abs(px)
  const t = clamp((x * qx + py * qy) / (qx * qx + qy * qy), 0, 1)
  const ax = x - qx * t, ay = py - qy * t
  const bx = x - qx * clamp(x / qx, 0, 1), by = py - qy
  const s = -sign(qy)
  const d0 = Math.min(ax * ax + ay * ay, bx * bx + by * by)
  const d1 = Math.min(s * (x * qy - py * qx), s * (py - qy))
  return -Math.sqrt(d0) * sign(d1)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Triangle (x0, y0), (x1, y1), (x2, y2), either winding. Exact. */
export function sdTriangle(px: number, py: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number): number {
  const e0x = x1 - x0, e0y = y1 - y0, e1x = x2 - x1, e1y = y2 - y1, e2x = x0 - x2, e2y = y0 - y2
  const v0x = px - x0, v0y = py - y0, v1x = px - x1, v1y = py - y1, v2x = px - x2, v2y = py - y2
  const t0 = clamp((v0x * e0x + v0y * e0y) / (e0x * e0x + e0y * e0y), 0, 1)
  const t1 = clamp((v1x * e1x + v1y * e1y) / (e1x * e1x + e1y * e1y), 0, 1)
  const t2 = clamp((v2x * e2x + v2y * e2y) / (e2x * e2x + e2y * e2y), 0, 1)
  const q0x = v0x - e0x * t0, q0y = v0y - e0y * t0
  const q1x = v1x - e1x * t1, q1y = v1y - e1y * t1
  const q2x = v2x - e2x * t2, q2y = v2y - e2y * t2
  const s = sign(e0x * e2y - e0y * e2x)
  const d = Math.min(q0x * q0x + q0y * q0y, q1x * q1x + q1y * q1y, q2x * q2x + q2y * q2y)
  const w = Math.min(s * (v0x * e0y - v0y * e0x), s * (v1x * e1y - v1y * e1x), s * (v2x * e2y - v2y * e2x))
  return -Math.sqrt(d) * sign(w)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Regular pentagon of apothem `r`, flat edge up. Exact. */
export function sdPentagon(px: number, py: number, r: number): number {
  const kx = 0.809016994, ky = 0.587785252, kz = 0.726542528
  let x = Math.abs(px), y = py
  let t = 2 * Math.min(-kx * x + ky * y, 0); x += t * kx; y -= t * ky
  t = 2 * Math.min(kx * x + ky * y, 0); x -= t * kx; y -= t * ky
  x -= clamp(x, -r * kz, r * kz); y -= r
  return len(x, y) * sign(y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Regular hexagon of apothem `r`, flat edges top and bottom. Exact. */
export function sdHexagon(px: number, py: number, r: number): number {
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269
  let x = Math.abs(px), y = Math.abs(py)
  const t = 2 * Math.min(kx * x + ky * y, 0); x -= t * kx; y -= t * ky
  x -= clamp(x, -kz * r, kz * r); y -= r
  return len(x, y) * sign(y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Regular octagon of apothem `r` (the article's `sdOctogon`). Exact. */
export function sdOctagon(px: number, py: number, r: number): number {
  const kx = -0.9238795325, ky = 0.3826834323, kz = 0.4142135623
  let x = Math.abs(px), y = Math.abs(py)
  let t = 2 * Math.min(kx * x + ky * y, 0); x -= t * kx; y -= t * ky
  t = 2 * Math.min(-kx * x + ky * y, 0); x += t * kx; y -= t * ky
  x -= clamp(x, -kz * r, kz * r); y -= r
  return len(x, y) * sign(y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Six-pointed star: two triangles whose edges sit at distance `r` from the centre; tips at (±√3·r, ±r) and (0, ±2r). Exact. */
export function sdHexagram(px: number, py: number, r: number): number {
  const kx = -0.5, ky = 0.8660254038, kz = 0.5773502692, kw = 1.7320508076
  let x = Math.abs(px), y = Math.abs(py)
  let t = 2 * Math.min(kx * x + ky * y, 0); x -= t * kx; y -= t * ky
  t = 2 * Math.min(ky * x + kx * y, 0); x -= t * ky; y -= t * kx
  x -= clamp(x, r * kz, r * kw); y -= r
  return len(x, y) * sign(y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Five-pointed star with its top tip at (0, r). Exact. */
export function sdPentagram(px: number, py: number, r: number): number {
  const k1x = 0.809016994, k2x = 0.309016994, k1y = 0.587785252, k2y = 0.951056516, k1z = 0.726542528
  const v1x = k1x, v1y = -k1y, v2x = -k1x, v2y = -k1y, v3x = k2x, v3y = -k2y
  let x = Math.abs(px), y = py
  let t = 2 * Math.max(v1x * x + v1y * y, 0); x -= t * v1x; y -= t * v1y
  t = 2 * Math.max(v2x * x + v2y * y, 0); x -= t * v2x; y -= t * v2y
  x = Math.abs(x); y -= r
  t = clamp(x * v3x + y * v3y, 0, k1z * r)
  return len(x - v3x * t, y - v3y * t) * sign(y * v3x - x * v3y)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Regular star with `n` tips at radius `r`, one on +y. `m` in [2, n] sets the inner angle (2 gives a
 * regular n-gon, n a sharp star). Exact.
 */
export function sdStar(px: number, py: number, r: number, n: number, m: number): number {
  const an = Math.PI / n, en = Math.PI / m
  const acx = dcos(an), acy = dsin(an), ecx = dcos(en), ecy = dsin(en)
  const bn = mod(datan2(px, py), 2 * an) - an
  const l = len(px, py)
  let x = l * dcos(bn), y = l * Math.abs(dsin(bn))
  x -= r * acx; y -= r * acy
  const t = clamp(-(x * ecx + y * ecy), 0, r * acy / ecy)
  x += ecx * t; y += ecy * t
  return len(x, y) * sign(x)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Plus sign whose arms reach (bx, ±by) and (±by, bx) (bx > by), offset by `r`. Exact outside, a bound inside. */
export function sdCross(px: number, py: number, bx: number, by: number, r = 0): number {
  let x = Math.abs(px), y = Math.abs(py)
  if (y > x) { const t = x; x = y; y = t }
  const qx = x - bx, qy = y - by
  const k = Math.max(qy, qx)
  const wx = k > 0 ? qx : by - x, wy = k > 0 ? qy : -k
  return sign(k) * len(Math.max(wx, 0), Math.max(wy, 0)) + r
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Diagonal cross: arms of length `w`/√2 along the diagonals, `r` thick. Exact. */
export function sdRoundedX(px: number, py: number, w: number, r: number): number {
  const x = Math.abs(px), y = Math.abs(py), m = Math.min(x + y, w) * .5
  return len(x - m, y - m) - r
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Any simple polygon, vertices as flat pairs `[x0, y0, x1, y1, …]` in either winding. Exact. */
export function sdPolygon(px: number, py: number, v: ArrayLike<number>): number {
  const n = v.length >> 1
  let d = (px - v[0]) * (px - v[0]) + (py - v[1]) * (py - v[1]), s = 1
  for (let i = 0, j = n - 1; i < n; j = i, i++) {
    const vix = v[2 * i], viy = v[2 * i + 1], ex = v[2 * j] - vix, ey = v[2 * j + 1] - viy
    const wx = px - vix, wy = py - viy
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
    const bx = wx - ex * t, by = wy - ey * t
    d = Math.min(d, bx * bx + by * by)
    const c1 = py >= viy, c2 = py < v[2 * j + 1], c3 = ex * wy > ey * wx
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s
  }
  return s * Math.sqrt(d)
}
