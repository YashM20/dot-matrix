/**
 * 2D dynamic clouds from Inigo Quilez's "2D dynamic clouds" article (the clouds of the 64k intro Paradise Is Coming):
 * - an fbm whose octaves each drift at their own velocity, re-summed every frame, so the clouds change shape as
 *   they move instead of sliding as one picture (`cloudFbm`);
 * - a clear-sky threshold `a` and a sharpness `b`: below `a` is empty sky, [a, b] ramps to full cloud (`cloudCover`);
 * - shading by a short march toward the sun: the cover at the point and a few steps sunward is compared with a
 *   ray that climbs as it goes, and the more of it lies inside the cloud the darker the point (`cloudShade`).
 *
 * The article stores each octave in a texture; here an octave is `noise2` (src/engine/noise/gradient.ts) at its own
 * frequency and seed, mapped to [0, 1]. Every op is +, ×, floor or imul, so a cloud is bit-identical in every JS engine
 * and a pure function of (x, y, t). Pure TS, framework-free; import by path (not in the engine barrel).
 */
import { noise2, octaveSeed } from '../noise/gradient'

/** One octave: features per unit, weight in the sum, drift in units per second. */
export interface CloudOctave { freq: number; weight: number; vel: readonly [number, number] }

// after Inigo Quilez, https://iquilezles.org/articles/dynclouds/ (MIT)
/**
 * The article's GPU version: four octaves weighted .5, .25, .125, .0625. Drifts follow its CPU table (`d[k]`) for the
 * four coarsest of its eight 256-texel layers: 6, 5.5, 5 and 4.5 texels a second, every third layer moving vertically
 * and the others horizontally, with its signs. Read in units where the 256-texel texture is 1: per feature, the
 * fine octaves move faster than the coarse ones, which the article says keeps the illusion of change.
 */
export const CLOUD_OCTAVES: readonly CloudOctave[] = [
  { freq: 2, weight: .5, vel: [-6 / 256, 0] },
  { freq: 4, weight: .25, vel: [0, 5.5 / 256] },
  { freq: 8, weight: .125, vel: [-5 / 256, 0] },
  { freq: 16, weight: .0625, vel: [4.5 / 256, 0] },
]

// after Inigo Quilez, https://iquilezles.org/articles/dynclouds/ (MIT)
/**
 * The dynamic fbm at (x, y) and time t: Σ weight·n(freq·(p + vel·t)), each octave its own noise (seed per octave,
 * like the article's separate textures), n mapped to [0, 1]. With the default octaves the result is in [0, .9375].
 */
export function cloudFbm(x: number, y: number, t: number, seed = 0, octaves: readonly CloudOctave[] = CLOUD_OCTAVES): number {
  let s = 0
  for (let k = 0; k < octaves.length; k++) {
    const o = octaves[k]
    s += o.weight * (.5 + .5 * noise2((x + o.vel[0] * t) * o.freq, (y + o.vel[1] * t) * o.freq, octaveSeed(seed, k)))
  }
  return s
}

// after Inigo Quilez, https://iquilezles.org/articles/dynclouds/ (MIT)
/**
 * Cloud cover from the fbm: the article's `MAD_SAT fbm, m, n` with m = 1/(b − a), n = −a/(b − a). Below the
 * threshold `a` is clear sky (0); `b` sets the sharpness (the closer to `a`, the harder the edge); above it is 1.
 */
export function cloudCover(fbm: number, a: number, b: number): number {
  const c = (fbm - a) / (b - a)
  return c < 0 ? 0 : c > 1 ? 1 : c
}

/** The article's ray altitudes, from the point itself to three steps sunward (its `ray = {0.0, 0.3, 0.6, 0.9}` read w, z, y, x). */
export const CLOUD_RAY: readonly number[] = [.9, .6, .3, 0]

// after Inigo Quilez, https://iquilezles.org/articles/dynclouds/ (MIT)
/**
 * Shading by the march toward the sun: `cover(k)` is the cover k steps sunward (k = 0 is the point), `ray[k]` the
 * ray's altitude there. The article's `de = max(fbm − ray, 0)` averaged by `DP4`: 0 for a point lit straight through,
 * up to 1 under a thick cloud. Lerp from the lit colour to the shadow colour by it.
 */
export function cloudShade(cover: (k: number) => number, ray: readonly number[] = CLOUD_RAY): number {
  let s = 0
  for (let k = 0; k < ray.length; k++) { const d = cover(k) - ray[k]; if (d > 0) s += d }
  return s / ray.length
}

/** A cloud layer: the fbm octaves, the threshold and sharpness, and the noise seed. */
export interface CloudSpec { a: number; b: number; seed?: number; octaves?: readonly CloudOctave[] }

/**
 * Cover of a w × h grid at time t, row by row; `at(i, j)` is a cell's position in cloud units. Bake it once a frame
 * and march through it with `cloudMarch`: the article's trick of reading the sunward samples from shifted copies
 * of the same textures instead of evaluating the noise again.
 */
export function cloudGrid(w: number, h: number, t: number, spec: CloudSpec, at: (i: number, j: number) => [number, number], out = new Float32Array(w * h)): Float32Array {
  const { a, b, seed = 0, octaves = CLOUD_OCTAVES } = spec
  for (let j = 0, k = 0; j < h; j++) for (let i = 0; i < w; i++, k++) {
    const [x, y] = at(i, j)
    out[k] = cloudCover(cloudFbm(x, y, t, seed, octaves), a, b)
  }
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/dynclouds/ (MIT)
/**
 * `cloudShade` on a baked cover grid: the samples are cells (i + k·di, j + k·dj), k = 0 … ray.length − 1, so the sun
 * step is a whole number of cells. Samples off the grid read clear sky.
 */
export function cloudMarch(grid: Float32Array, w: number, h: number, i: number, j: number, di: number, dj: number, ray: readonly number[] = CLOUD_RAY): number {
  return cloudShade(k => {
    const x = i + k * di, y = j + k * dj
    return x < 0 || y < 0 || x >= w || y >= h ? 0 : grid[y * w + x]
  }, ray)
}
