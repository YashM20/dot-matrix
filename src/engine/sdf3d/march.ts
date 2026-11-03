/**
 * Marching a 3D SDF (#69, docs/IQ-PLAN.md IQ8): a look-at camera, the sphere tracer, tetrahedron normals, and the
 * three soft shadows of Inigo Quilez's article (the k·h/t penumbra, Sebastian Aaltonen's improvement, and the
 * inner-penumbra extension). Scalars in, scalars out: vectors go through small `out` arrays, nothing is allocated
 * per ray.
 *
 * Footprint: a dot covers `cell` radians of view (`Camera.cell`), so at distance t it spans about cell·t in the
 * scene. The tracer stops when the surface is closer than a fraction of that, and the normal's h is that span, as
 * the normals article advises: the CPU has no fwidth, so the footprint is passed in explicitly.
 */
import type { Sd3 } from './prims'

export type V3 = [number, number, number] | Float64Array

/** A pinhole camera: eye, right / up / forward basis, focal length, and `cell` = the angle one dot covers. */
export interface Camera {
  ox: number; oy: number; oz: number
  ux: number; uy: number; uz: number
  vx: number; vy: number; vz: number
  wx: number; wy: number; wz: number
  fl: number; cell: number
}

const norm = (v: V3) => { const l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1; v[0] /= l; v[1] /= l; v[2] /= l; return v }
/** Normalise in place and return the same array. */
export const normalize = norm

/**
 * A camera at `eye` looking at `target`, focal length `fl` (screen y runs −1 … 1), for a picture `rows` dots tall,
 * rolled by `roll` radians given as its sine and cosine (default upright). Our helper.
 */
export function lookAt(eye: V3, target: V3, fl: number, rows: number, rollSin = 0, rollCos = 1): Camera {
  const w = norm([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]])
  // as in the usual Shadertoy camera: right = forward × up(roll), up = right × forward
  const u = norm([-w[2] * rollCos, w[2] * rollSin, w[0] * rollCos - w[1] * rollSin])
  const v = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]
  return { ox: eye[0], oy: eye[1], oz: eye[2], ux: u[0], uy: u[1], uz: u[2], vx: v[0], vy: v[1], vz: v[2], wx: w[0], wy: w[1], wz: w[2], fl, cell: 2 / (rows * fl) }
}

/** The unit ray through screen point (sx, sy) (y up, sy in −1 … 1) into `out`. */
export function cameraRay(c: Camera, sx: number, sy: number, out: V3): V3 {
  out[0] = sx * c.ux + sy * c.vx + c.fl * c.wx
  out[1] = sx * c.uy + sy * c.vy + c.fl * c.wy
  out[2] = sx * c.uz + sy * c.vz + c.fl * c.wz
  return norm(out)
}

/**
 * Sphere tracing (Hart 1996): step by the distance until it falls under `eps`·t (a fraction of the footprint) or
 * t passes `tmax`. `scale` < 1 shortens each step for bounds (twist, bend). Returns t, or −1 for a miss.
 */
export function sphereTrace(sd: Sd3, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  tmin: number, tmax: number, eps: number, steps = 96, scale = 1): number {
  let t = tmin
  for (let i = 0; i < steps && t < tmax; i++) {
    const h = sd(ox + dx * t, oy + dy * t, oz + dz * t)
    if (Math.abs(h) < eps * t) return t
    t += h * scale
  }
  return -1
}

// after Inigo Quilez, https://iquilezles.org/articles/normalsSDF/ (MIT); the tetrahedron technique as he first
// saw it from Paulo Falcao (Pouet, around 2008) and later Paul Malin (Shadertoy)
/**
 * The surface normal at (x, y, z) from four samples on a tetrahedron of size `h`: central differences at the cost
 * of forward ones. Pass h ≈ the dot's footprint at that distance (cell·t) so detail smaller than a dot does not
 * shimmer. Writes the unit normal into `out`.
 */
export function calcNormal(sd: Sd3, x: number, y: number, z: number, h: number, out: V3): V3 {
  // vertices k.xyy = (1, −1, −1), k.yyx = (−1, −1, 1), k.yxy = (−1, 1, −1), k.xxx = (1, 1, 1)
  const a = sd(x + h, y - h, z - h), b = sd(x - h, y - h, z + h), c = sd(x - h, y + h, z - h), d = sd(x + h, y + h, z + h)
  out[0] = a - b - c + d
  out[1] = -a - b + c + d
  out[2] = -a + b - c + d
  return norm(out)
}

// after Inigo Quilez, https://iquilezles.org/articles/rmshadows/ (MIT)
/**
 * Soft shadow, the first form: the darkest k·h/t along the ray toward the light (closest miss over its distance).
 * 1 = lit, 0 = hit within `hit`. Larger k, sharper shadow.
 */
export function softShadow(sd: Sd3, ox: number, oy: number, oz: number, lx: number, ly: number, lz: number,
  mint: number, maxt: number, k: number, steps = 64, hit = 1e-3): number {
  let res = 1, t = mint
  for (let i = 0; i < steps && t < maxt; i++) {
    const h = sd(ox + lx * t, oy + ly * t, oz + lz * t)
    if (h < hit) return 0
    res = Math.min(res, k * h / t)
    t += h
  }
  return res
}

// after Inigo Quilez, https://iquilezles.org/articles/rmshadows/ (MIT); the improvement is Sebastian Aaltonen's
// (GDC 2018)
/**
 * Soft shadow with Aaltonen's improvement: the penumbra is read at the estimated closest point between this step's
 * and the last step's spheres, not at the step itself, so sharp corners stop leaking light in step-shaped bands.
 * `w` is the light's size (a solid angle; 1/k of the first form). 1 = lit, 0 = in shadow.
 */
export function softShadowImproved(sd: Sd3, ox: number, oy: number, oz: number, lx: number, ly: number, lz: number,
  mint: number, maxt: number, w: number, steps = 64, hit = 1e-3): number {
  let res = 1, ph = 1e20, t = mint
  for (let i = 0; i < steps && t < maxt; i++) {
    const h = sd(ox + lx * t, oy + ly * t, oz + lz * t)
    if (h < hit) return 0
    const y = h * h / (2 * ph)
    // h ≤ 2·ph for a true SDF, so the root is real; a bound (twist, bend) can break that, hence the max
    const d = Math.sqrt(Math.max(h * h - y * y, 0))
    // a zero denominator (the estimate behind the start) reads as no penumbra; GLSL's min would take its NaN as is
    const den = w * Math.max(0, t - y)
    if (den > 0) res = Math.min(res, d / den)
    ph = h
    t += h
  }
  return res
}

// after Inigo Quilez, https://iquilezles.org/articles/rmshadows/ (MIT); the idea of marching on inside the shape
// is Shadertoy user nurof3n's
/**
 * Soft shadow with inner penumbras: the ray keeps going through the shape (steps clamped to [minStep, maxStep])
 * until the penumbra reaches −1, then a smoothstep over −1 … 1. Closer to a ground-truth area light.
 */
export function softShadowInner(sd: Sd3, ox: number, oy: number, oz: number, lx: number, ly: number, lz: number,
  mint: number, maxt: number, w: number, steps = 64, minStep = .005, maxStep = .5): number {
  let res = 1, t = mint
  for (let i = 0; i < steps && t < maxt; i++) {
    const h = sd(ox + lx * t, oy + ly * t, oz + lz * t)
    res = Math.min(res, h / (w * t))
    t += Math.min(Math.max(h, minStep), maxStep)
    if (res < -1 || t > maxt) break
  }
  res = Math.max(res, -1)
  return .25 * (1 + res) * (1 + res) * (2 - res)
}
