/**
 * Curved primitives that need a cubic solve: parabolas, the quadratic Bézier, hyperbola, blobby cross, quadratic
 * circle, plus the tunnel, stairs and cool S. Centred on the origin, y-up, negative inside.
 */
import { acos, cbrt, clamp, dcos, dot2, dsin, len, sign, SQRT1_2, SQRT2 } from './util'

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Parabola y = k·x², negative above it (inside the cup). Exact. Two cell-grid fixes over the GLSL: the point where
 * p = q = 0 (GLSL gets 0/0) takes the vertex, and the side comes from the curve itself (y > k·x²), which is what
 * `sign(x - cx)` means; on the axis below the vertex that one is 0 or a rounding sign.
 */
export function sdParabola(px: number, py: number, k: number): number {
  const x = Math.abs(px)
  const ik = 1 / k
  const p = ik * (py - .5 * ik) / 3, q = .25 * ik * ik * x
  const h = q * q - p * p * p
  let cx: number
  if (h > 0) { const r = cbrt(q + Math.sqrt(h)); cx = r + p / r }
  else { const r = Math.sqrt(p); cx = r > 0 ? 2 * r * dcos(acos(q / (p * r)) / 3) : 0 }
  return len(x - cx, py - k * cx * cx) * (py > k * x * x ? -1 : 1)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Parabolic arch from (-wi, 0) through (0, he) to (wi, 0), negative below the curve. Exact for |x| ≤ wi. Past the
 * ends the sign still follows the extended parabola while the distance goes to the end point, so the field flips
 * sign across that curve there: keep the shape inside |x| ≤ wi, or use `Math.abs` of it as an open curve.
 */
export function sdParabolaSegment(px: number, py: number, wi: number, he: number): number {
  const x = Math.abs(px)
  const ik = wi * wi / he
  const p = ik * (he - py - .5 * ik) / 3, q = x * ik * ik / 4
  const h = q * q - p * p * p
  let cx: number
  if (h > 0) { const r = cbrt(q + Math.sqrt(h)); cx = r + p / r }
  else { const r = Math.sqrt(p); cx = r > 0 ? 2 * r * dcos(acos(q / (p * r)) / 3) : 0 }
  cx = Math.min(cx, wi)
  return len(x - cx, py - (he - cx * cx / ik)) * sign(ik * (py - he) + x * x)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Quadratic Bézier A → B → C. Unsigned and exact; A, B, C must not be collinear. */
export function sdBezier(px: number, py: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const aX = bx - ax, aY = by - ay
  const bX = ax - 2 * bx + cx, bY = ay - 2 * by + cy
  const cX = aX * 2, cY = aY * 2
  const dX = ax - px, dY = ay - py
  const kk = 1 / (bX * bX + bY * bY)
  const kx = kk * (aX * bX + aY * bY)
  const ky = kk * (2 * (aX * aX + aY * aY) + (dX * bX + dY * bY)) / 3
  const kz = kk * (dX * aX + dY * aY)
  const p = ky - kx * kx, p3 = p * p * p
  const q = kx * (2 * kx * kx - 3 * ky) + kz
  let h = q * q + 4 * p3, res: number
  const at = (t: number) => dot2(dX + (cX + bX * t) * t, dY + (cY + bY * t) * t)
  if (h >= 0) {
    h = Math.sqrt(h)
    const t = clamp(cbrt((h - q) * .5) + cbrt((-h - q) * .5) - kx, 0, 1)
    res = at(t)
  } else {
    const z = Math.sqrt(-p)
    const v = acos(q / (p * z * 2)) / 3
    const m = dcos(v), n = dsin(v) * 1.732050808
    // the third root cannot be the closest
    res = Math.min(at(clamp((m + m) * z - kx, 0, 1)), at(clamp((-n - m) * z - kx, 0, 1)))
  }
  return Math.sqrt(res)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Cross with parabolic, blobby arms reaching (±1, 0) and (0, ±1); `he` sets the arm curvature. Exact. */
export function sdBlobbyCross(px: number, py: number, he: number): number {
  const ax = Math.abs(px), ay = Math.abs(py)
  const x0 = Math.abs(ax - ay) * SQRT1_2, y0 = (1 - ax - ay) * SQRT1_2
  const p = (he - y0 - .25 / he) / (6 * he)
  const q = x0 / (he * he * 16)
  const h = q * q - p * p * p
  let x: number
  if (h > 0) { const r = Math.sqrt(h); x = cbrt(q + r) - cbrt(Math.abs(q - r)) * sign(r - q) }
  else { const r = Math.sqrt(p); x = r > 0 ? 2 * r * dcos(acos(q / (p * r)) / 3) : 0 } // p = q = 0: GLSL gets 0/0
  x = Math.min(x, SQRT2 / 2)
  const zx = x - x0, zy = he * (1 - 2 * x * x) - y0
  return len(zx, zy) * sign(zy)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Tunnel (arch): a rectangle of half-width `w` from y = -h to 0, capped by a half-disc of radius `w`. Exact. */
export function sdTunnel(px: number, py: number, w: number, h: number): number {
  const x = Math.abs(px), y = -py
  let qx = x - w
  const qy = y - h
  const d1 = dot2(Math.max(qx, 0), qy)
  qx = y > 0 ? qx : len(x, y) - w
  const d2 = dot2(qx, Math.max(qy, 0))
  const d = Math.sqrt(Math.min(d1, d2))
  return Math.max(qx, qy) < 0 ? -d : d
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** `n` stairs of size (w, h) climbing from the origin to (n·w, n·h); solid below and right of the steps. Exact. */
export function sdStairs(px: number, py: number, w: number, h: number, n: number): number {
  const bax = w * n, bay = h * n
  let d = Math.min(dot2(px - clamp(px, 0, bax), py), dot2(px - bax, py - clamp(py, 0, bay)))
  let s = Math.max(-py, px - bax) < 0 ? -1 : 1 // GLSL sign() gives 0 on the base and wall lines, zeroing them
  const dia = len(w, h)
  let x = (w * px + h * py) / dia, y = (-h * px + w * py) / dia
  const id = clamp(Math.round(x / dia), 0, n - 1)
  x -= id * dia
  let qx = (w * x - h * y) / dia, qy = (h * x + w * y) / dia
  const hh = h / 2
  qy -= hh
  if (qy > hh * sign(qx)) s = 1
  if (!(id < .5 || qx > 0)) { qx = -qx; qy = -qy }
  d = Math.min(d, dot2(qx, qy - clamp(qy, -hh, hh)))
  d = Math.min(d, dot2(qx - clamp(qx, 0, w), qy - hh))
  return Math.sqrt(d) * s
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Rounded square made of four parabolic arcs, through (±1, 0) and (0, ±1). Exact. */
export function sdQuadraticCircle(px: number, py: number): number {
  let x = Math.abs(px), y = Math.abs(py)
  if (y > x) { const t = x; x = y; y = t }
  const a = x - y, b = x + y, c = (2 * b - 1) / 3
  let h = a * a + c * c * c, t: number
  if (h >= 0) {
    h = Math.sqrt(h)
    t = sign(h - a) * cbrt(Math.abs(h - a)) - cbrt(h + a)
  } else {
    const z = Math.sqrt(-c), v = acos(a / (c * z)) / 3
    t = -z * (dcos(v) + dsin(v) * 1.732050808)
  }
  t *= .5
  const wx = -t + .75 - t * t - x, wy = t + .75 - t * t - y
  return len(wx, wy) * sign(a * a * .5 + b - 1.5)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Hyperbola x² − y² = 2k (k > 0) opening along ±x, clipped at |y| = he; negative inside the branches. Exact for
 * |y| ≤ he. Past the clip the sign still follows the full hyperbola (as `sdParabolaSegment` past its ends).
 */
export function sdHyperbola(px: number, py: number, k: number, he: number): number {
  const ax = Math.abs(px), ay = Math.abs(py)
  const x = (ax - ay) * SQRT1_2, y = (ax + ay) * SQRT1_2
  const x2 = x * x / 16, y2 = y * y / 16
  const r = k * (4 * k - x * y) / 12
  const q = (x2 - y2) * k * k
  const h = q * q + r * r * r
  let u: number
  if (h < 0) { const m = Math.sqrt(-r); u = m * dcos(acos(q / (r * m)) / 3) }
  else { const m = cbrt(Math.sqrt(h) - q); u = (m - r / m) / 2 }
  const w = Math.sqrt(u + x2)
  const b = k * y - x2 * x * 2
  // the solve is 0/0 at the centre (GLSL gets NaN); there the closest point is the vertex, t = √k
  let t = y === 0 ? Math.sqrt(k) : x / 4 - w + Math.sqrt(2 * x2 - u + b / w / 4)
  t = Math.max(t, Math.sqrt(he * he * .5 + k) - he * SQRT1_2)
  const d = len(x - t, y - k / t)
  return x * y < k ? d : -d
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** The "cool S" doodle, about 1.6 units wide and 2.4 tall. Exact. */
export function sdCoolS(px: number, py: number): number {
  const six = py < 0 ? -px : px
  const x = Math.abs(px), y = Math.abs(py) - .2
  const rex = x - Math.min(Math.round(x / .4), .4)
  const aby = Math.abs(y - .2) - .6
  let t = clamp(.5 * (six - y), 0, .2)
  let d = dot2(six - t, -y - t)
  t = clamp(.5 * (x - aby), 0, .4)
  d = Math.min(d, dot2(x - t, -aby - t))
  d = Math.min(d, dot2(rex, y - clamp(y, 0, .4)))
  const s = 2 * x + aby + Math.abs(aby + .4) - .4
  return Math.sqrt(d) * sign(s)
}
