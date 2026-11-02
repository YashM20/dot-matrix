/**
 * Distance to an axis-aligned ellipse with radii (a, b), negative inside, three ways. `sdEllipse` is the analytic
 * quartic solve (fast, loses precision near a circle or at high eccentricity). `sdEllipseNewton` and
 * `sdEllipseRobust` are the Newton solvers from the ellipse article: steady everywhere, and `sdEllipseRobust` needs
 * no trig at all. Use the robust one unless profiling says otherwise.
 */
import { acos, cbrt, datan2, dcos, dsin, len, sign, SQRT3 } from './util'

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Analytic ellipse. A circle (a = b) divides by zero in the quartic, so it takes the circle distance, and the
 * isolated points where the solve is 0/0 take `sdEllipseRobust`.
 */
export function sdEllipse(px: number, py: number, a: number, b: number): number {
  if (a === b) return len(px, py) - a
  let x = Math.abs(px), y = Math.abs(py), ax = a, ay = b
  if (x > y) { let t = x; x = y; y = t; t = ax; ax = ay; ay = t }
  const l = ay * ay - ax * ax
  const m = ax * x / l, m2 = m * m
  const n = ay * y / l, n2 = n * n
  const c = (m2 + n2 - 1) / 3, c3 = c * c * c
  const q = c3 + m2 * n2 * 2
  const d = c3 + m2 * n2
  const g = m + m * n2
  let co: number
  if (d < 0) {
    const h = acos(q / c3) / 3
    const s = dcos(h), t = dsin(h) * SQRT3
    const rx = Math.sqrt(-c * (s + t + 2) + m2)
    const ry = Math.sqrt(-c * (s - t + 2) + m2)
    co = (ry + sign(l) * rx + Math.abs(g) / (rx * ry) - m) / 2
  } else {
    const h = 2 * m * n * Math.sqrt(d)
    const s = cbrt(q + h), u = cbrt(q - h)
    const rx = -s - u - c * 4 + 2 * m2
    const ry = (s - u) * SQRT3
    const rm = Math.sqrt(rx * rx + ry * ry)
    co = (ry / Math.sqrt(rm - rx) + 2 * g / rm - m) / 2
  }
  const rx = ax * co, ry = ay * Math.sqrt(1 - co * co)
  const dist = len(rx - x, ry - y) * sign(y - ry)
  // the quartic hits 0/0 at isolated points (e.g. (0, 3) for radii (2, 1)); hand those to the Newton solver
  return dist === dist ? dist : sdEllipseRobust(px, py, a, b)
}

// after Inigo Quilez, https://iquilezles.org/articles/ellipsedist/ (MIT)
/** Newton solve on the ellipse angle, `iters` steps (5 in the article; raise it for very eccentric ellipses). */
export function sdEllipseNewton(px: number, py: number, a: number, b: number, iters = 5): number {
  const x = Math.abs(px), y = Math.abs(py)
  const out = (x / a) * (x / a) + (y / b) * (y / b) > 1
  let w = out ? datan2(y * a, x * b) : a * (x - a) < b * (y - b) ? 1.5707963 : 0
  for (let i = 0; i < iters; i++) {
    const c = dcos(w), s = dsin(w)
    const ux = a * c, uy = b * s, vx = -a * s, vy = b * c
    w += ((x - ux) * vx + (y - uy) * vy) / ((x - ux) * ux + (y - uy) * uy + vx * vx + vy * vy)
  }
  const d = len(x - a * dcos(w), y - b * dsin(w))
  return out ? d : -d
}

// after Inigo Quilez, https://iquilezles.org/articles/ellipsedist/ (MIT)
/** Trig-free Newton solve: the angle step is applied as a rotation of (cos, sin). The robust default. */
export function sdEllipseRobust(px: number, py: number, a: number, b: number, iters = 5): number {
  const x = Math.abs(px), y = Math.abs(py)
  const qx = a * (x - a), qy = b * (y - b)
  let cx = qx < qy ? 0.01 : 1, cy = qx < qy ? 1 : 0.01
  const k = 1 / len(cx, cy); cx *= k; cy *= k
  for (let i = 0; i < iters; i++) {
    const ux = a * cx, uy = b * cy, vx = -a * cy, vy = b * cx
    const s = (x - ux) * vx + (y - uy) * vy
    const c = (x - ux) * ux + (y - uy) * uy + vx * vx + vy * vy
    const t = Math.sqrt(c * c - s * s)
    const nx = (cx * t - cy * s) / c, ny = (cy * t + cx * s) / c
    cx = nx; cy = ny
  }
  const d = len(x - a * cx, y - b * cy)
  return (x / a) * (x / a) + (y / b) * (y / b) > 1 ? d : -d
}
