/**
 * Band-limiting (IQ4, #65), ported from Inigo Quilez's "Band limiting" (MIT; see THIRD-PARTY-NOTICES.md): a cosine
 * box-filtered over its footprint (cos × sinc), the cheaper smoothstep fade, and an fBm whose octaves fade out once
 * they oscillate faster than the footprint can hold. The article takes w from `fwidth`; here the caller passes it:
 * the footprint in the function's own units (one cell, scaled into the cosine's phase or the noise lattice).
 *
 * A zero footprint gives the plain value: `fcos(x, 0)` is `dcos(x)` and `ffbm2(x, y, 0, …)` is `fbm2(x, y, …)` bit
 * for bit. Deterministic (`dsin` / `dcos` and the noise pack; scanned by the determinism lint).
 */
import { smoothstep } from '../math'
import { dcos, dsin, TAU } from '../noise/trig'
import { noise2, octaveCount, octaveSeed, type FbmOptions } from '../noise/gradient'

/**
 * cos(x) box-filtered over a footprint w (in radians of phase): cos(x)·sin(w/2) / (w/2). Fades to 0 as one cycle
 * shrinks to the footprint (w = 2π), then rings with the sinc's small negative lobes.
 */
// after Inigo Quilez, https://iquilezles.org/articles/bandlimiting/ (MIT)
export function fcos(x: number, w: number): number {
  const c = dcos(x)
  if (!(w > 0)) return c
  const h = .5 * w
  return c * dsin(h) / h
}

/**
 * The article's cheaper fcos: cos(x)·smoothstep(2π, 0, w), switching the wave off smoothly as one cycle shrinks to
 * the footprint. Band-limiting rather than filtering: no negative lobes.
 */
// after Inigo Quilez, https://iquilezles.org/articles/bandlimiting/ (MIT)
export const fcosApprox = (x: number, w: number) => dcos(x) * smoothstep(TAU, 0, w)

/** One octave's fade by its footprint w (noise-lattice units): 1 below half a lattice cell, 0 from one cell up. */
// after Inigo Quilez, https://iquilezles.org/articles/bandlimiting/ (MIT)
export const noiseFade = (w: number) => smoothstep(1, .5, w)

/** Gradient noise (`noise2`) faded by its footprint w: the article's `fnoise`. */
// after Inigo Quilez, https://iquilezles.org/articles/bandlimiting/ (MIT)
export function fnoise2(x: number, y: number, w: number, seed = 0): number {
  const f = noiseFade(w)
  return f === 0 ? 0 : f === 1 ? noise2(x, y, seed) : noise2(x, y, seed) * f
}

/**
 * Band-limited `fbm2`: the same octaves (rotation, lacunarity, gain, seeds, normalisation), each faded by its own
 * footprint, w·lacᵒ for octave o (the article's `ffbm`, where w doubles along with the frequency). `w` is the
 * footprint in noise units at octave 0, for a 2D domain the larger of the two axes' (the article's isotropic case).
 * Faded octaves go to 0, the noise's mean, so the mean holds; the normaliser still counts them, so the octaves
 * that remain keep their weight. Octaves past the first one faded out entirely are not evaluated.
 */
// after Inigo Quilez, https://iquilezles.org/articles/bandlimiting/ (MIT)
export function ffbm2(x: number, y: number, w: number, octaves_?: number, seed = 0, o?: FbmOptions): number {
  const n = octaveCount(octaves_ ?? o?.octaves ?? 4), lac = o?.lacunarity ?? 2, gain = o?.gain ?? .5
  let px = x, py = y, amp = 1, sum = 0, norm = 0, wk = w > 0 ? w : 0
  for (let k = 0; k < n; k++) {
    const f = wk > 0 ? noiseFade(wk) : 1
    // amp·1 is exact, so a zero footprint sums the very terms fbm2 does
    if (f > 0) sum += (f === 1 ? amp : amp * f) * noise2(px, py, octaveSeed(seed, k))
    norm += amp
    amp *= gain
    const qx = .8 * px - .6 * py, qy = .6 * px + .8 * py
    px = qx * lac; py = qy * lac; wk *= lac
  }
  return sum / norm
}
