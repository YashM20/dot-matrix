/**
 * Plane deformations, the late-1990s demo effect from Inigo Quilez's "Plane deformations" article: every screen
 * point gets new texture coordinates (u, v) from a formula, and a texture scrolled by time is read there. Tunnels,
 * twists, stars, flowers and floors all come from the same loop with a different formula.
 *
 * Conventions follow the article's `createLUT`: x, y ∈ [−1, 1] across the screen, y growing downward (rows),
 * r = √(x² + y²), a = atan2(y, x). Formulas that divide by r or |y| return ±Infinity or NaN at that point; `wrap01`
 * maps any non-finite coordinate to 0, so a texture read there stays defined.
 *
 * Every op is +, −, ×, /, sqrt, floor or the `dmath` trig, so a deformation is bit-identical in every JS engine.
 * Pure TS, framework-free; import by path (not in the engine barrel).
 */
import { datan2, dcos, dsin } from '../noise/dmath'

/** Texture coordinates. Deformations write into `out` and return it, so hot loops allocate nothing. */
export type UV = [number, number]
export type Deformation = (x: number, y: number, out: UV) => UV

const INV_PI = 1 / Math.PI

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** The article's worked example: u = cos(a)/r, v = sin(a)/r, a circle inversion (x/r², y/r²) that pulls the texture out of the centre. */
export function deformInvert(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), a = datan2(y, x)
  out[0] = dcos(a) / r; out[1] = dsin(a) / r
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Twist: the plane rotated by 2r, so straight texture lines wind into a spiral. u = x·cos 2r − y·sin 2r, v = y·cos 2r + x·sin 2r. */
export function deformTwist(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), c = dcos(2 * r), s = dsin(2 * r)
  out[0] = x * c - y * s; out[1] = y * c + x * s
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Off-axis tunnel: depth 0.3/(r + 0.5x), angle 3a/π, so the vanishing point sits left of centre. */
export function deformTunnel(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), a = datan2(y, x)
  out[0] = .3 / (r + .5 * x); out[1] = 3 * a * INV_PI
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Three-armed star: a slight shear plus 0.03·(cos 3a, sin 3a)/r, which spins the texture out along three arms. */
export function deformStar(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), a = datan2(y, x)
  out[0] = .02 * y + .03 * dcos(a * 3) / r; out[1] = .02 * x + .03 * dsin(a * 3) / r
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Lens: (x, y)·0.1/(0.11 + 0.5r), a magnified centre that flattens toward the edges. */
export function deformLens(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), k = .1 / (.11 + r * .5)
  out[0] = x * k; out[1] = y * k
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Rings: u = 0.5a/π (one turn is one texture width), v = sin 7r (seven ripples out from the centre). */
export function deformRings(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), a = datan2(y, x)
  out[0] = .5 * a * INV_PI; out[1] = dsin(7 * r)
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Swirl: polar coordinates turned by r, u = r·cos(a + r), v = r·sin(a + r). */
export function deformSwirl(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), a = datan2(y, x)
  out[0] = r * dcos(a + r); out[1] = r * dsin(a + r)
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Flower tunnel: depth 1/(r + 0.5 + 0.5·sin 5a), angle 3a/π, a five-petal tunnel. */
export function deformFlower(x: number, y: number, out: UV): UV {
  const r = Math.sqrt(x * x + y * y), a = datan2(y, x)
  out[0] = 1 / (r + .5 + .5 * dsin(5 * a)); out[1] = a * 3 * INV_PI
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/** Floor and ceiling: u = x/|y|, v = 1/|y|, a plane in perspective above and below a horizon at y = 0. */
export function deformFloor(x: number, y: number, out: UV): UV {
  const ay = y < 0 ? -y : y
  out[0] = x / ay; out[1] = 1 / ay
  return out
}

/** The article's eight formula pairs, in its order, plus its worked example (`invert`). */
export const DEFORMATIONS = {
  invert: deformInvert, twist: deformTwist, tunnel: deformTunnel, star: deformStar, lens: deformLens,
  rings: deformRings, swirl: deformSwirl, flower: deformFlower, floor: deformFloor,
} as const satisfies Record<string, Deformation>
export type DeformationName = keyof typeof DEFORMATIONS

/** x − ⌊x⌋: the texture's repeat (the article's `& 255` / `fmodf`, kept positive). Non-finite input → 0. */
export function wrap01(x: number): number {
  if (!(x > -1e15 && x < 1e15)) return 0
  return x - Math.floor(x)
}

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/**
 * The article's look-up table: (u, v) of every pixel of a w × h screen, two floats per pixel, row by row. `at(i, j)`
 * gives a pixel's (x, y); the default is the article's x = −1 + 2i/w, y = −1 + 2j/h. The formulas are evaluated once
 * here, and each frame only shifts the texture (`deformRead`), which is what made the effect cheap.
 */
export function deformLUT(w: number, h: number, d: Deformation, at: (i: number, j: number, out: UV) => UV = articleScreen(w, h)): Float32Array {
  const lut = new Float32Array(w * h * 2), p: UV = [0, 0], uv: UV = [0, 0]
  for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k += 2) {
    at(i, j, p); d(p[0], p[1], uv)
    lut[k] = Number.isFinite(uv[0]) ? uv[0] : NaN; lut[k + 1] = Number.isFinite(uv[1]) ? uv[1] : NaN
  }
  return lut
}
/** The article's pixel → screen map: x = −1 + 2i/w, y = −1 + 2j/h. */
export const articleScreen = (w: number, h: number) => (i: number, j: number, out: UV): UV => { out[0] = -1 + 2 * i / w; out[1] = -1 + 2 * j / h; return out }

// after Inigo Quilez, https://iquilezles.org/articles/deform/ (MIT)
/**
 * One pixel of `renderDeformation`: the texture at the table's (u, v) plus the scroll (du, dv), wrapped into [0, 1).
 * The article scrolls both axes by the same `itime`; pass different speeds to move along and around a tunnel.
 */
export function deformRead(lut: Float32Array, pixel: number, tex: (u: number, v: number) => number, du: number, dv: number): number {
  const u = lut[pixel * 2], v = lut[pixel * 2 + 1]
  if (u !== u || v !== v) return 0
  return tex(wrap01(u + du), wrap01(v + dv))
}
