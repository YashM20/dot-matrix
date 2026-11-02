/**
 * SDFs with analytic gradients (`sdg*`): each returns the distance and writes ∂d/∂x, ∂d/∂y into `out`, which has
 * unit length wherever the gradient is defined. That is a per-dot normal for lighting at no extra samples. Pass one
 * reused `out` (a `Float64Array(2)`) per loop to stay allocation-free. Same frame as the plain SDFs: centred on the
 * origin, y-up, negative inside.
 */
import { cbrt, clamp, datan2, dcos, dsin, len, sign, type Out2 } from './util'

const set = (out: Out2, gx: number, gy: number, d: number) => { out[0] = gx; out[1] = gy; return d }

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Disc of radius `r`. */
export function sdgCircle(px: number, py: number, r: number, out: Out2): number {
  const d = len(px, py)
  return set(out, px / d, py / d, d - r)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Pie slice; as `sdPie`. */
export function sdgPie(px: number, py: number, s: number, c: number, r: number, out: Out2): number {
  const sx = sign(px), x = Math.abs(px)
  const l = len(x, py), n = l - r
  const t = clamp(x * s + py * c, 0, r)
  const qx = x - s * t, qy = py - c * t
  const m = len(qx, qy) * sign(c * x - s * py)
  return n > m ? set(out, sx * x / l, py / l, n) : set(out, sx * qx / m, qy / m, m)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Arc; as `sdArc`. */
export function sdgArc(px: number, py: number, s: number, c: number, ra: number, rb: number, out: Out2): number {
  const sx = sign(px), x = Math.abs(px)
  if (c * x > s * py) {
    const wx = x - ra * s, wy = py - ra * c, d = len(wx, wy)
    return set(out, sx * wx / d, wy / d, d - rb)
  }
  const l = len(px, py), w = l - ra, k = sign(w) / l
  return set(out, k * px, k * py, Math.abs(w) - rb)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Capsule: segment (ax, ay)–(bx, by) of radius `r` (0 for the bare segment). */
export function sdgSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number, r: number, out: Out2): number {
  const bax = bx - ax, bay = by - ay, pax = px - ax, pay = py - ay
  const h = clamp((pax * bax + pay * bay) / (bax * bax + bay * bay), 0, 1)
  const qx = pax - h * bax, qy = pay - h * bay, d = len(qx, qy)
  return set(out, qx / d, qy / d, d - r)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/**
 * Lens made of two discs of radius `r` centred at (±d, 0): tips at (0, ±√(r² − d²)), half-width r − d.
 * Note the parameters differ from `sdVesica`: `sdgVesica(x, y, r, d)` = `sdVesica(y, x, √(r² − d²), r − d)`.
 */
export function sdgVesica(px: number, py: number, r: number, d: number, out: Out2): number {
  const sx = sign(px), sy = sign(py), x = Math.abs(px), y = Math.abs(py)
  const b = Math.sqrt(r * r - d * d)
  if ((y - b) * d > x * b) {
    const qy = y - b, l = len(x, qy) * sign(d)
    return set(out, sx * x / l, sy * qy / l, l)
  }
  const qx = x + d, l = len(qx, y)
  return set(out, sx * qx / l, sy * y / l, l - r)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Box of half-size (bx, by). */
export function sdgBox(px: number, py: number, bx: number, by: number, out: Out2): number {
  const wx = Math.abs(px) - bx, wy = Math.abs(py) - by
  const sx = px < 0 ? -1 : 1, sy = py < 0 ? -1 : 1
  const g = Math.max(wx, wy)
  if (g > 0) {
    const qx = Math.max(wx, 0), qy = Math.max(wy, 0), l = len(qx, qy)
    return set(out, sx * qx / l, sy * qy / l, l)
  }
  return wx > wy ? set(out, sx, 0, g) : set(out, 0, sy, g)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Plus sign; as `sdCross` with r = 0, and exact inside too. */
export function sdgCross(px: number, py: number, bx: number, by: number, out: Out2): number {
  const sx = sign(px), sy = sign(py), x = Math.abs(px), y = Math.abs(py)
  const swap = y > x
  const qx = (swap ? y : x) - bx, qy = (swap ? x : y) - by
  const h = Math.max(qx, qy)
  const ox = Math.max(h < 0 ? by - bx - qx : qx, 0), oy = Math.max(h < 0 ? -qy : qy, 0)
  const l = len(ox, oy)
  let rx: number, ry: number, rz: number
  if (h < 0 && -qx < l) { rx = -qx; ry = 1; rz = 0 } else { rx = l; ry = ox / l; rz = oy / l }
  return set(out, sx * (swap ? rz : ry), sy * (swap ? ry : rz), sign(h) * rx)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Regular pentagon of apothem `r`, flat edge down (`sdPentagon` mirrored in y). */
export function sdgPentagon(px: number, py: number, r: number, out: Out2): number {
  const mx = 0.80901699, my = 0.58778525, mz = 0.72654253
  const nx = mx * mx - my * my, ny = 2 * mx * my
  const s = sign(px)
  let x = Math.abs(px), y = py
  const w1 = x * mx + y * my, w2 = x * nx - y * ny
  let t = 2 * Math.max(w1, 0); x -= t * mx; y -= t * my
  t = 2 * Math.min(w2, 0); x -= t * mx; y += t * my
  x -= clamp(x, -r * mz, r * mz); y += r
  const d = len(x, y) * sign(-y)
  let gx = x, gy = y
  if (w2 < 0) { gx = -mx * x - my * y; gy = my * x - mx * y }
  else if (w1 > 0) { gx = -nx * x - ny * y; gy = -ny * x + nx * y }
  return set(out, s * gx / d, gy / d, d)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Regular hexagon of apothem `r`; as `sdHexagon`. */
export function sdgHexagon(px: number, py: number, r: number, out: Out2): number {
  const kx = -0.866025404, ky = 0.5, kz = 0.577350269
  const sx = sign(px), sy = sign(py)
  let x = Math.abs(px), y = Math.abs(py)
  const w = kx * x + ky * y
  const t = 2 * Math.min(w, 0); x -= t * kx; y -= t * ky
  x -= clamp(x, -kz * r, kz * r); y -= r
  const d = len(x, y) * sign(y)
  const gx = w < 0 ? -ky * x - kx * y : x, gy = w < 0 ? -kx * x + ky * y : y
  return set(out, sx * gx / d, sy * gy / d, d)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Isosceles triangle; as `sdTriangleIsosceles`. */
export function sdgTriangleIsosceles(px: number, py: number, qx: number, qy: number, out: Out2): number {
  const w = sign(px), x = Math.abs(px)
  const t = clamp((x * qx + py * qy) / (qx * qx + qy * qy), 0, 1)
  const ax = x - qx * t, ay = py - qy * t
  const bx = x - qx * clamp(x / qx, 0, 1), by = py - qy
  const k = sign(qy)
  const l1 = ax * ax + ay * ay, l2 = bx * bx + by * by
  const d = Math.sqrt(l1 < l2 ? l1 : l2)
  const gx = l1 < l2 ? ax : bx, gy = l1 < l2 ? ay : by
  const s = sign(Math.max(k * (x * qy - py * qx), k * (py - qy)))
  return set(out, s * w * gx / d, s * gy / d, s * d)
}

const cro = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx
/** The edge loop shared by `sdgTriangle` and `sdgQuad` (convex, either winding). */
function convex(px: number, py: number, v: ArrayLike<number>, n: number, out: Out2): number {
  const gs = cro(v[0] - v[2 * n - 2], v[1] - v[2 * n - 1], v[2] - v[0], v[3] - v[1])
  let bd = Infinity, bx = 0, by = 0, bs = -Infinity
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const ex = v[2 * j] - v[2 * i], ey = v[2 * j + 1] - v[2 * i + 1], wx = px - v[2 * i], wy = py - v[2 * i + 1]
    const t = clamp((wx * ex + wy * ey) / (ex * ex + ey * ey), 0, 1)
    const qx = wx - ex * t, qy = wy - ey * t
    const d = qx * qx + qy * qy, s = gs * cro(wx, wy, ex, ey)
    if (d < bd) { bd = d; bx = qx; by = qy }
    if (s > bs) bs = s
  }
  const d = Math.sqrt(bd) * sign(bs)
  return set(out, bx / d, by / d, d)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Triangle (x0, y0), (x1, y1), (x2, y2). */
export function sdgTriangle(px: number, py: number, x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, out: Out2): number {
  const v = tri; v[0] = x0; v[1] = y0; v[2] = x1; v[3] = y1; v[4] = x2; v[5] = y2
  return convex(px, py, v, 3, out)
}
const tri = new Float64Array(6)

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Convex quad, vertices as flat pairs `[x0, y0, …, x3, y3]` in either winding. */
export function sdgQuad(px: number, py: number, v: ArrayLike<number>, out: Out2): number {
  return convex(px, py, v, 4, out)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Ellipse with radii (a, b): Newton steps on the angle, 4 as in the article (about 2e-4 off at radii (2, 1)). */
export function sdgEllipse(px: number, py: number, a: number, b: number, out: Out2, iters = 4): number {
  const sx = sign(px), sy = sign(py), x = Math.abs(px), y = Math.abs(py)
  const outside = (x / a) * (x / a) + (y / b) * (y / b) > 1
  let w = outside ? datan2(y * a, x * b) : a * (x - a) < b * (y - b) ? 1.570796327 : 0
  for (let i = 0; i < iters; i++) {
    const c = dcos(w), s = dsin(w)
    const ux = a * c, uy = b * s, vx = -a * s, vy = b * c
    w += ((x - ux) * vx + (y - uy) * vy) / ((x - ux) * ux + (y - uy) * uy + vx * vx + vy * vy)
  }
  const qx = x - a * dcos(w), qy = y - b * dsin(w), d = len(qx, qy), k = outside ? 1 : -1
  return set(out, k * sx * qx / d, k * sy * qy / d, k * d)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Crescent; as `sdMoon` (the article lists it as `sdMoon`). */
export function sdgMoon(px: number, py: number, d: number, ra: number, rb: number, out: Out2): number {
  const s = sign(py), y = Math.abs(py)
  const a = (ra * ra - rb * rb + d * d) / (2 * d)
  const b = Math.sqrt(Math.max(ra * ra - a * a, 0))
  if (d * (px * b - y * a) > d * d * Math.max(b - y, 0)) {
    const wx = px - a, wy = y - b, l = len(wx, wy)
    return set(out, wx / l, s * wy / l, l)
  }
  const l1 = len(px, y), d1 = l1 - ra, l2 = len(px - d, y), d2 = rb - l2
  return d1 > d2 ? set(out, px / l1, s * y / l1, d1) : set(out, -(px - d) / l2, -s * y / l2, d2)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Parabola y = k·x²; as `sdParabola`. */
export function sdgParabola(px: number, py: number, k: number, out: Out2): number {
  const s = sign(px), x = Math.abs(px)
  const ik = 1 / k
  const p = ik * (py - .5 * ik) / 3, q = .25 * ik * ik * x
  const h = q * q - p * p * p, r = Math.sqrt(Math.abs(h))
  const cx = h > 0 ? cbrt(q + r) - cbrt(Math.abs(q - r)) * sign(r - q) : 2 * dcos(datan2(r, q) / 3) * Math.sqrt(p)
  const z = py > k * x * x ? -1 : 1 // = sign(x - cx), without its hole on the axis (see sdParabola)
  const wx = x - cx, wy = py - k * cx * cx, l = len(wx, wy)
  return set(out, z * s * wx / l, z * wy / l, z * l)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Isosceles trapezoid; as `sdTrapezoid` (the article also returns the closest point, left out here). */
export function sdgTrapezoid(px: number, py: number, ra: number, rb: number, he: number, out: Out2): number {
  const sx = px < 0 ? -1 : 1, sy = py < 0 ? -1 : 1
  const x = Math.abs(px)
  let qx = x - Math.min(x, py < 0 ? ra : rb), qy = py - sy * he
  let bd = qx * qx + qy * qy, bs = Math.abs(py) - he
  const kx = rb - ra, ky = 2 * he, wx = x - ra, wy = py + he
  const t = clamp((wx * kx + wy * ky) / (kx * kx + ky * ky), 0, 1)
  const cx = x - (ra + t * kx), cy = py - (-he + t * ky)
  const d2 = cx * cx + cy * cy, s2 = wx * ky - wy * kx
  if (d2 < bd) { bd = d2; qx = cx; qy = cy }
  if (s2 > bs) bs = s2
  const d = Math.sqrt(bd) * sign(bs)
  return set(out, sx * qx / d, qy / d, d)
}

// after Inigo Quilez, https://iquilezles.org/articles/distgradfunctions2d/ (MIT)
/** Heart; as `sdHeart`. */
export function sdgHeart(px: number, py: number, out: Out2): number {
  const sx = px < 0 ? -1 : 1, x = Math.abs(px)
  if (py + x > 1) {
    const qx = x - .25, qy = py - .75, l = len(qx, qy)
    return set(out, sx * qx / l, qy / l, l - Math.SQRT2 / 4)
  }
  const q1x = x, q1y = py - 1, m = .5 * Math.max(x + py, 0), q2x = x - m, q2y = py - m
  const a = q1x * q1x + q1y * q1y, b = q2x * q2x + q2y * q2y
  const gx = a < b ? q1x : q2x, gy = a < b ? q1y : q2y
  const d = Math.sqrt(a < b ? a : b), k = x > py ? 1 : -1
  return set(out, k * sx * gx / d, k * gy / d, k * d)
}
