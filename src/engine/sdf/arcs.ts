/**
 * Shapes built from circles: pies, arcs, rings, lenses, moons, the egg and the heart. Centred on the origin, y-up,
 * negative inside. Apertures are passed as a sine/cosine pair (s, c) of the half-angle measured from +y.
 */
import { clamp, dcos, dot2, dsin, len, mod, sign, SQRT2 } from './util'

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Pie slice of radius `r` opening around +y, half-aperture given as (s, c) = (sin, cos). Exact. */
export function sdPie(px: number, py: number, s: number, c: number, r: number): number {
  const x = Math.abs(px)
  const l = len(x, py) - r
  const t = clamp(x * s + py * c, 0, r)
  const m = len(x - s * t, py - c * t)
  return Math.max(l, m * sign(c * x - s * py))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** The cap of a disc of radius `r` above the chord y = h (everything below it cut away). Exact. */
export function sdCutDisk(px: number, py: number, r: number, h: number): number {
  const w = Math.sqrt(r * r - h * h)
  const x = Math.abs(px)
  const s = Math.max((h - r) * x * x + w * w * (h + r - 2 * py), h * x - w * py)
  return s < 0 ? len(x, py) - r : x < w ? h - py : len(x - w, py - h)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Arc of radius `ra` around +y, half-aperture (s, c) = (sin, cos), `rb` thick. Exact. */
export function sdArc(px: number, py: number, s: number, c: number, ra: number, rb: number): number {
  const x = Math.abs(px)
  return (c * x > s * py ? len(x - s * ra, py - c * ra) : Math.abs(len(x, py) - ra)) - rb
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Ring of radius `r` and thickness `th` with square-cut ends; (nx, ny) = (cos, sin) of the half-aperture. Exact. */
export function sdRing(px: number, py: number, nx: number, ny: number, r: number, th: number): number {
  const x = Math.abs(px)
  const qx = nx * x - ny * py, qy = ny * x + nx * py
  return Math.max(Math.abs(len(qx, qy) - r) - th * .5, len(qx, Math.max(0, Math.abs(r - qy) - th * .5)) * sign(qx))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/**
 * Horseshoe: a band of radius `r`, half-thickness `wy`, open at the top, with straight legs of length `wx`;
 * (cx, cy) = (cos, sin) of the opening angle. Exact.
 */
export function sdHorseshoe(px: number, py: number, cx: number, cy: number, r: number, wx: number, wy: number): number {
  const x = Math.abs(px), l = len(x, py)
  const qx = -cx * x + cy * py, qy = cy * x + cx * py
  const ux = qy > 0 || qx > 0 ? qx : l * sign(-cx), uy = qx > 0 ? qy : l
  const ax = ux - wx, ay = Math.abs(uy - r) - wy
  return len(Math.max(ax, 0), Math.max(ay, 0)) + Math.min(0, Math.max(ax, ay))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Lens with its tips at (±w, 0) and its sides bulging to (0, ±h). Exact. */
export function sdVesica(px: number, py: number, w: number, h: number): number {
  const d = .5 * (w * w - h * h) / h
  const x = Math.abs(px), y = Math.abs(py)
  return w * y < d * (x - w) ? len(x - w, y) : len(x, y + d) - (d + h)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Lens with its tips at (ax, ay) and (bx, by), half-width `w`. Exact. */
export function sdOrientedVesica(px: number, py: number, ax: number, ay: number, bx: number, by: number, w: number): number {
  const r = .5 * len(bx - ax, by - ay)
  const d = .5 * (r * r - w * w) / w
  const vx = (bx - ax) / r, vy = (by - ay) / r
  const dx = px - (ax + bx) * .5, dy = py - (ay + by) * .5
  const qx = .5 * Math.abs(vy * dx - vx * dy), qy = .5 * Math.abs(vx * dx + vy * dy)
  return r * qx < d * (qy - r) ? len(qx, qy - r) : len(qx + d, qy) - (d + w)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Crescent: a disc of radius `ra` minus a disc of radius `rb` centred at (d, 0). Exact. */
export function sdMoon(px: number, py: number, d: number, ra: number, rb: number): number {
  const y = Math.abs(py)
  const a = (ra * ra - rb * rb + d * d) / (2 * d)
  const b = Math.sqrt(Math.max(ra * ra - a * a, 0))
  if (d * (px * b - y * a) > d * d * Math.max(b - y, 0)) return len(px - a, y - b)
  return Math.max(len(px, y) - ra, -(len(px - d, y) - rb))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Four-pointed cross with concave circular sides, tips at (±1, 0) and (0, ±h) (the article's "circle cross"). Exact. */
export function sdRoundedCross(px: number, py: number, h: number): number {
  const k = .5 * (h + 1 / h)
  const x = Math.abs(px), y = Math.abs(py)
  return x < 1 && y < x * (k - h) + h
    ? k - Math.sqrt(dot2(x - 1, y - k))
    : Math.sqrt(Math.min(dot2(x, y - h), dot2(x - 1, y)))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Egg: a disc of radius `ra` at the origin and one of radius `rb` at (0, he), joined by arcs; `bu` sets the bulge. Exact. */
export function sdEgg(px: number, py: number, he: number, ra: number, rb: number, bu: number): number {
  const r = .5 * (he + ra + rb) / bu
  const da = r - ra, db = r - rb
  const y = (db * db - da * da - he * he) / (2 * he)
  const x = Math.sqrt(da * da - y * y)
  const qx = Math.abs(px)
  const k = py * x - qx * y
  if (k > 0 && k < he * (qx + x)) return len(qx + x, py + y) - r
  return Math.min(len(qx, py) - ra, len(qx, py - he) - rb)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Heart with its tip at the origin and its notch at (0, 1). Exact. */
export function sdHeart(px: number, py: number): number {
  const x = Math.abs(px)
  if (py + x > 1) return Math.sqrt(dot2(x - .25, py - .75)) - SQRT2 / 4
  const m = .5 * Math.max(x + py, 0)
  return Math.sqrt(Math.min(dot2(x, py - 1), dot2(x - m, py - m))) * sign(x - py)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions2d/ (MIT)
/** Wave of circular arcs of radius `ra` along x; `tb` in (0, 1] sets how much of each circle is used. Unsigned, exact. */
export function sdCircleWave(px: number, py: number, tb: number, ra: number): number {
  const a = Math.PI * 5 / 6 * Math.max(tb, 0.0001)
  const cx = ra * dsin(a), cy = ra * dcos(a)
  const x = Math.abs(mod(px, cx * 4) - cx * 2)
  const x2 = Math.abs(x - 2 * cx), y2 = -py + 2 * cy
  const d1 = cy * x > cx * py ? len(x - cx, py - cy) : Math.abs(len(x, py) - ra)
  const d2 = cy * x2 > cx * y2 ? len(x2 - cx, y2 - cy) : Math.abs(len(x2, y2) - ra)
  return Math.min(d1, d2)
}
