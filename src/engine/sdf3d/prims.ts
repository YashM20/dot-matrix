/**
 * 3D primitives (#69, docs/IQ-PLAN.md IQ8): a useful subset of Inigo Quilez's 3D distance functions, ported to plain
 * scalar TypeScript (no vector objects in the hot loop). Every shape is centred on the origin, y up, negative
 * inside. Exact unless the comment says "bound".
 */
import { clamp } from '../sdf/util'

/** A 3D signed distance: point → distance (negative inside). */
export type Sd3 = (x: number, y: number, z: number) => number

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z)
const len2 = (x: number, y: number) => Math.sqrt(x * x + y * y)
export { len2, len3 }

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Sphere of radius `r`. */
export const sdSphere = (x: number, y: number, z: number, r: number) => len3(x, y, z) - r

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Box of half-size (bx, by, bz). */
export function sdBox(x: number, y: number, z: number, bx: number, by: number, bz: number): number {
  const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0)
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Box of half-size (bx, by, bz) with its edges rounded by `r` (the outer size stays b). */
export function sdRoundBox(x: number, y: number, z: number, bx: number, by: number, bz: number, r: number): number {
  const qx = Math.abs(x) - bx + r, qy = Math.abs(y) - by + r, qz = Math.abs(z) - bz + r
  return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, Math.max(qy, qz)), 0) - r
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** The edges of a box of half-size (bx, by, bz), as bars `2e` thick on the inside of the box. */
export function sdBoxFrame(x: number, y: number, z: number, bx: number, by: number, bz: number, e: number): number {
  const px = Math.abs(x) - bx, py = Math.abs(y) - by, pz = Math.abs(z) - bz
  const qx = Math.abs(px + e) - e, qy = Math.abs(py + e) - e, qz = Math.abs(pz + e) - e
  const edge = (ax: number, ay: number, az: number) => len3(Math.max(ax, 0), Math.max(ay, 0), Math.max(az, 0)) + Math.min(Math.max(ax, Math.max(ay, az)), 0)
  return Math.min(edge(px, qy, qz), edge(qx, py, qz), edge(qx, qy, pz))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Torus in the xz plane: ring radius `R`, tube radius `r`. */
export const sdTorus = (x: number, y: number, z: number, R: number, r: number) => len2(len2(x, z) - R, y) - r

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** A chain link: a torus of radius `r1` (tube `r2`) in the xy plane, stretched by `le` up and down y. */
export function sdLink(x: number, y: number, z: number, le: number, r1: number, r2: number): number {
  const qy = Math.max(Math.abs(y) - le, 0)
  return len2(len2(x, qy) - r1, z) - r2
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Capsule round the segment a → b, radius `r`. */
export function sdCapsule(x: number, y: number, z: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number): number {
  const pax = x - ax, pay = y - ay, paz = z - az, bax = bx - ax, bay = by - ay, baz = bz - az
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1)
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - r
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Capsule from the origin up to height `h`, radius `r`. */
export const sdVerticalCapsule = (x: number, y: number, z: number, h: number, r: number) => len3(x, y - clamp(y, 0, h), z) - r

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Cylinder round y, radius `r`, half-height `h`, flat caps. */
export function sdCappedCylinder(x: number, y: number, z: number, r: number, h: number): number {
  const dx = len2(x, z) - r, dy = Math.abs(y) - h
  return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0))
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Cylinder round y, radius `ra`, half-height `h`, its rims rounded by `rb`. */
export function sdRoundedCylinder(x: number, y: number, z: number, ra: number, rb: number, h: number): number {
  const dx = len2(x, z) - ra + rb, dy = Math.abs(y) - h + rb
  return Math.min(Math.max(dx, dy), 0) + len2(Math.max(dx, 0), Math.max(dy, 0)) - rb
}

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Plane with unit normal (nx, ny, nz) at offset `h`: dot(p, n) + h. */
export const sdPlane = (x: number, y: number, z: number, nx: number, ny: number, nz: number, h: number) => x * nx + y * ny + z * nz + h

// after Inigo Quilez, https://iquilezles.org/articles/distfunctions/ (MIT)
/** Ellipsoid of radii (rx, ry, rz). A bound, zero exactly on the surface. */
export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number): number {
  const k0 = len3(x / rx, y / ry, z / rz), k1 = len3(x / (rx * rx), y / (ry * ry), z / (rz * rz))
  return k1 === 0 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1
}
