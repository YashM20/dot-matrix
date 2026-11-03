/**
 * 3D operators (#69, docs/IQ-PLAN.md IQ8): booleans, rounding, onion, elongation, revolution and extrusion of a 2D
 * SDF, twist, bend, uniform scale, mirror and limited repetition. Each takes an `Sd3` (or a 2D `Sd2`) and returns
 * a new `Sd3`, so a scene is a small tree of closures. The smooth booleans are the quadratic ones already in
 * `src/engine/sdf/smin.ts` (same article), re-exported here.
 *
 * Twist and bend compress space, so their result is a bound: march them with a step scale below 1.
 */
import { clamp } from '../sdf/util'
import type { Sd2 } from '../sdf/ops'
import { tcos, tsin } from '../noise/dmath'
import { len2, type Sd3 } from './prims'

export { smoothIntersect, smoothSubtract, smoothUnion } from '../sdf/smin'

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Union: exact outside. */
export const opUnion = (a: number, b: number) => Math.min(a, b)
// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** `b` with `a` carved out of it (not commutative). A bound. */
export const opSubtraction = (a: number, b: number) => Math.max(-a, b)
// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Intersection. A bound. */
export const opIntersection = (a: number, b: number) => Math.max(a, b)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Rounding (inflating): the iso-surface `r` further out. Exact if `sd` is. */
export const opRound = (sd: Sd3, r: number): Sd3 => (x, y, z) => sd(x, y, z) - r

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Onion: a shell of half-thickness `t` round the surface of a distance `d`. */
export const onion = (d: number, t: number) => Math.abs(d) - t
/** `onion` as an operator on a whole SDF. */
export const opOnion = (sd: Sd3, t: number): Sd3 => (x, y, z) => Math.abs(sd(x, y, z)) - t

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/**
 * Elongation, the article's first form: split the shape at the origin and pull the halves (hx, hy, hz) apart.
 * Exact for a 1D elongation; in 2D and 3D it leaves a core of zero distance inside.
 */
export const opElongate = (sd: Sd3, hx: number, hy: number, hz: number): Sd3 => (x, y, z) =>
  sd(x - clamp(x, -hx, hx), y - clamp(y, -hy, hy), z - clamp(z, -hz, hz))

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/**
 * Elongation, the second form: exact inside all the way to the core. Needs a shape symmetric in x, y and z (it
 * reads only the positive octant, as the article does).
 */
export const opElongateExact = (sd: Sd3, hx: number, hy: number, hz: number): Sd3 => (x, y, z) => {
  const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz
  return sd(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/**
 * Revolution: spin a 2D SDF round the y axis at radius `o`. The 2D shape's x is the distance from the axis minus
 * `o`, its y is height (y up, as in `src/engine/sdf/`). Exact if the 2D one is.
 */
export const opRevolution = (sd2: Sd2, o: number): Sd3 => (x, y, z) => sd2(len2(x, z) - o, y)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Extrusion: a 2D SDF in the xy plane pulled out to half-depth `h` along z. Exact if the 2D one is. */
export const opExtrusion = (sd2: Sd2, h: number): Sd3 => (x, y, z) => {
  const wx = sd2(x, y), wy = Math.abs(z) - h
  return Math.min(Math.max(wx, wy), 0) + len2(Math.max(wx, 0), Math.max(wy, 0))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/**
 * Twist round the y axis by `k` radians per unit of height. The article's snippet builds vec3(m·p.xz, p.y), which
 * swaps y and z on the way out; here y stays y. A bound: lower the march step as k grows.
 */
export const opTwist = (sd: Sd3, k: number): Sd3 => (x, y, z) => {
  const c = tcos(k * y), s = tsin(k * y)
  // GLSL mat2(c, -s, s, c) is column-major: m·v = (c·vx + s·vy, −s·vx + c·vy)
  return sd(c * x + s * z, y, -s * x + c * z)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** The article's cheap bend: rotate the xy plane by `k` radians per unit of x. A bound. */
export const opCheapBend = (sd: Sd3, k: number): Sd3 => (x, y, z) => {
  const c = tcos(k * x), s = tsin(k * x)
  return sd(c * x + s * y, -s * x + c * y, z)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Uniform scale by `s`: exact (non-uniform scale is not). */
export const opScale = (sd: Sd3, s: number): Sd3 => (x, y, z) => sd(x / s, y / s, z / s) * s

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Mirror in x: model one half, get both. A bound if the shape crosses the plane x = 0. */
export const opSymX = (sd: Sd3): Sd3 => (x, y, z) => sd(Math.abs(x), y, z)

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/**
 * Limited repetition: copies `s` apart, `lx`, `ly`, `lz` copies each side of the origin. Right only for shapes
 * symmetric within their cell (src/engine/sdf/repeat.ts has the neighbour check for the rest).
 */
export const opLimitedRepetition = (sd: Sd3, s: number, lx: number, ly: number, lz: number): Sd3 => (x, y, z) =>
  sd(x - s * clamp(Math.round(x / s), -lx, lx), y - s * clamp(Math.round(y / s), -ly, ly), z - s * clamp(Math.round(z / s), -lz, lz))

/** Move a shape so its origin sits at (ox, oy, oz). Our helper. */
export const opMove = (sd: Sd3, ox: number, oy: number, oz: number): Sd3 => (x, y, z) => sd(x - ox, y - oy, z - oz)
/** Turn a shape by `a` radians round the y axis (a rotation, so exact). Our helper. */
export const opTurnY = (sd: Sd3, a: number): Sd3 => {
  const c = tcos(a), s = tsin(a)
  return (x, y, z) => sd(c * x - s * z, y, s * x + c * z)
}
/** Turn a shape by `a` radians round the z axis. Our helper. */
export const opTurnZ = (sd: Sd3, a: number): Sd3 => {
  const c = tcos(a), s = tsin(a)
  return (x, y, z) => sd(c * x + s * y, -s * x + c * y, z)
}
