/**
 * fBm by its Hurst exponent, the noise colours, and nested domain warping (IQ5, #66).
 *
 * H sets how rough an fBm is: each octave's amplitude falls by gain = 2^−H while its frequency doubles, so the
 * power spectrum goes as f^−(2H + 1). H = 1 (gain ½, the usual hardcoded value) is the isotropic, terrain-like one;
 * H = 0 (gain 1) is pink. Built on `fbm2`, so everything here is normalised to [−1, 1] and bit-identical across engines.
 */
import { dpow } from './dmath'
import { fbm2, type FbmOptions } from './gradient'

/**
 * The noise colours by Hurst exponent H, from the article's table (power ∝ f^B, B = −(2H + 1)): blue B = +1,
 * white 0, pink −1, brown −2, yellow −3 (its name for the H = 1 fBm). The article leaves H blank for blue and
 * white; the values here are the ones B = −(2H + 1) gives (H = −1, −½), so their gain is above 1 and the finest
 * octave leads.
 */
export const NOISE_COLORS = { blue: -1, white: -.5, pink: 0, brown: .5, yellow: 1 } as const
export type NoiseColor = keyof typeof NOISE_COLORS

// after Inigo Quilez, https://iquilezles.org/articles/fbm/ (MIT)
/**
 * Per-octave gain for Hurst exponent H: lacunarity^−H, i.e. G = 2^−H at the usual frequency doubling (the
 * article's G = exp2(−H)). Exact at integer H (dpow's multiplication path), else within 1e-12 relative.
 */
export const fbmGain = (H: number, lacunarity = 2): number => dpow(lacunarity, -H)

// after Inigo Quilez, https://iquilezles.org/articles/fbm/ (MIT)
/**
 * fBm in [−1, 1] with the amplitude set by H (or a colour name): fbm2 with gain = fbmGain(H, lacunarity). Same
 * octave rules as fbm2 (`octaves` clamped to 1..8, default 4). fbmH2(x, y, 1) === fbm2(x, y).
 */
export function fbmH2(x: number, y: number, H: number | NoiseColor, octaves?: number, seed = 0, lacunarity = 2): number {
  const h = typeof H === 'number' ? H : NOISE_COLORS[H]
  return fbm2(x, y, octaves, seed, { gain: fbmGain(h, lacunarity), lacunarity })
}

export interface WarpOut {
  /** The pattern, fbm2(p + amount·r) at depth 2, in [−1, 1]. */
  f: number
  /** First warp q = (fbm(p), fbm(p + (5.2, 1.3))), each in [−1, 1]. */
  qx: number; qy: number
  /** Second warp r = (fbm(p + amount·q + (1.7, 9.2)), fbm(p + amount·q + (8.3, 2.8))), each in [−1, 1]. 0 below depth 2. */
  rx: number; ry: number
}
export interface WarpOptions extends FbmOptions {
  /** How far each warp pushes the domain, in lattice units per unit of fbm (default 4, the article's value). */
  amount?: number
  /** 0 = fbm(p), 1 = fbm(p + a·q), 2 = fbm(p + a·r) (default 2, the article's third image). */
  depth?: 0 | 1 | 2
}
const warpScratch: WarpOut = { f: 0, qx: 0, qy: 0, rx: 0, ry: 0 }

// after Inigo Quilez, https://iquilezles.org/articles/warp/ (MIT)
/**
 * Nested domain warping, the article's `pattern(p, out q, out r)`: f(p) = fbm(p + 4·r) with r and q themselves fBm
 * warps of p. Returns f and the inner warps q and r, which the article uses for tone (mix by |q|, by r.y), so a
 * card can drive a second tone or the dot size from them. The offsets are the article's; they only decorrelate the
 * fbm calls. `seed` and the fbm options (octaves default 4) apply to all five calls. Writes into `out` (default: a
 * module scratch, valid until the next call). Five fbm2 calls a sample at depth 2.
 */
export function warpFbm2(x: number, y: number, seed = 0, out: WarpOut = warpScratch, o?: WarpOptions): WarpOut {
  const n = o?.octaves ?? 4, a = o?.amount ?? 4, depth = o?.depth ?? 2
  out.qx = out.qy = out.rx = out.ry = 0
  if (depth === 0) { out.f = fbm2(x, y, n, seed, o); return out }
  const qx = fbm2(x, y, n, seed, o), qy = fbm2(x + 5.2, y + 1.3, n, seed, o)
  out.qx = qx; out.qy = qy
  if (depth === 1) { out.f = fbm2(x + a * qx, y + a * qy, n, seed, o); return out }
  const sx = x + a * qx, sy = y + a * qy
  const rx = fbm2(sx + 1.7, sy + 9.2, n, seed, o), ry = fbm2(sx + 8.3, sy + 2.8, n, seed, o)
  out.rx = rx; out.ry = ry
  out.f = fbm2(x + a * rx, y + a * ry, n, seed, o)
  return out
}
