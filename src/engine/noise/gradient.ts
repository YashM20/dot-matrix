/**
 * Gradient (Perlin) noise, fBm, turbulence, ridged multifractal, curl noise and the legacy value noise.
 *
 * 2-D gradient noise on the integer lattice: quintic fade 6t⁵ − 15t⁴ + 10t³ (C², Perlin 2002) and 8 gradients
 * (±1,0) (0,±1) (±√½,±√½) picked by `ihash(ix, iy, seed) & 7`. fBm rotates every octave by
 * R = [[0.8, −0.6], [0.6, 0.8]] (iq), which removes the axis alignment for 4 multiplies and no trig.
 * Every op is +, ×, floor or imul, so the values are bit-identical across JS engines. `noise/glsl.ts` mirrors
 * `noise2` / `fbm2` / `turb2` for the GPU (float32, so parity there is a tolerance).
 *
 * Conventions: one lattice cell is one noise feature (a card that wants ~6 features across 144 cells samples
 * `noise2(c * 6 / 144, …)`); `noise*` / `fbm2` are signed (map with `.5 + .5 * n` for a tone).
 */
import { hash01 } from '../math'
import { ihash } from './dmath'

const R = Math.SQRT1_2, SQRT2 = Math.SQRT2
/** The 8 gradients, indexed by `hash & 7` (noise/glsl.ts has the same table in the same order). */
const GX = Float64Array.of(1, -1, 0, 0, R, -R, R, -R)
const GY = Float64Array.of(0, 0, 1, -1, R, R, -R, -R)

/** `ihash`'s multipliers and finaliser, inlined for the 4 corners (imul(i + 1, K) = imul(i, K) + K mod 2³²). */
const HA = 0x8da6b343, HB = 0xd8163841, HC = 0xcb1ab31f
const fm = (h: number) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return h ^ (h >>> 16) }

/** Gradient noise in [−1, 1] (×√2 of the classic ±√½ bound, so the bound is exact). Lattice = integer x, y. */
export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, gx = fx - 1, gy = fy - 1
  // corner hashes = ihash(ix + i, iy + j, seed) & 7, bit for bit
  const x0 = Math.imul(ix, HA), x1 = (x0 + HA) | 0, s = Math.imul(seed, HC), y0 = Math.imul(iy, HB) ^ s, y1 = ((Math.imul(iy, HB) + HB) | 0) ^ s
  const h00 = fm(x0 ^ y0) & 7, h10 = fm(x1 ^ y0) & 7, h01 = fm(x0 ^ y1) & 7, h11 = fm(x1 ^ y1) & 7
  const a = GX[h00] * fx + GY[h00] * fy, b = GX[h10] * gx + GY[h10] * fy
  const c = GX[h01] * fx + GY[h01] * gy, d = GX[h11] * gx + GY[h11] * gy
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const ab = a + (b - a) * u, cd = c + (d - c) * u
  return (ab + (cd - ab) * v) * SQRT2
}

/** The 12 edge gradients of improved Perlin noise (components in {−1, 0, 1}), indexed by `hash % 12`. */
const G3 = Int8Array.of(1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1)
/**
 * Scale of the raw 3-D sum to [−1, 1], fixed in F0.2 from two runs (2026-10-27, Node 22):
 *  - exact sup of the raw sum: 1.03623, from Σ_corners w(p)·max_g g·(p − corner) on an 81³ grid of the unit cell
 *    (each corner picks the gradient that faces p; the peak is near (.35, .49, .5));
 *  - 1e6 uniform samples over a 64³ box, seed 0: raw max |n| 0.960 (all 8 corners facing the sample is a
 *    ~1e-8 event), so the scaled max over 1e6 samples is ≈ 0.926.
 * 1/1.0363 makes the bound exact (|n| ≤ 1 everywhere). The plan's target "1e6-sample max ∈ [0.95, 1]" would need a
 * scale ≥ 0.99, which lets rare points reach 1.026; the exact bound wins (the 1e6 max still clears the .9 gate).
 */
export const NOISE3_SCALE = 1 / 1.0363
/** Seed mixed into the z lattice coordinate (ihash takes three ints). */
const SEED3 = 0x27d4eb2d
const scratch3 = new Float64Array(3)

/**
 * noise3 plus its analytic ∂/∂x, ∂/∂y (the z derivative is not needed). Writes [n, dx, dy] into `out`, returns it.
 * No allocation. Trilinear blend of the 8 corner dot products with the quintic fade, written in the
 * k₀ + k₁u + k₂v + … form so the derivative is exact (iq, "gradient noise derivatives").
 */
export function noise3Grad(x: number, y: number, z: number, seed: number, out: Float64Array): Float64Array {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz
  const s = (iz + Math.imul(seed | 0, SEED3)) | 0
  const g000 = (ihash(ix, iy, s) % 12) * 3, g100 = (ihash(ix + 1, iy, s) % 12) * 3
  const g010 = (ihash(ix, iy + 1, s) % 12) * 3, g110 = (ihash(ix + 1, iy + 1, s) % 12) * 3
  const g001 = (ihash(ix, iy, s + 1) % 12) * 3, g101 = (ihash(ix + 1, iy, s + 1) % 12) * 3
  const g011 = (ihash(ix, iy + 1, s + 1) % 12) * 3, g111 = (ihash(ix + 1, iy + 1, s + 1) % 12) * 3
  const ex = fx - 1, ey = fy - 1, ez = fz - 1
  const d000 = G3[g000] * fx + G3[g000 + 1] * fy + G3[g000 + 2] * fz
  const d100 = G3[g100] * ex + G3[g100 + 1] * fy + G3[g100 + 2] * fz
  const d010 = G3[g010] * fx + G3[g010 + 1] * ey + G3[g010 + 2] * fz
  const d110 = G3[g110] * ex + G3[g110 + 1] * ey + G3[g110 + 2] * fz
  const d001 = G3[g001] * fx + G3[g001 + 1] * fy + G3[g001 + 2] * ez
  const d101 = G3[g101] * ex + G3[g101 + 1] * fy + G3[g101 + 2] * ez
  const d011 = G3[g011] * fx + G3[g011 + 1] * ey + G3[g011 + 2] * ez
  const d111 = G3[g111] * ex + G3[g111 + 1] * ey + G3[g111 + 2] * ez
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10), w = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
  const du = 30 * fx * fx * (fx * (fx - 2) + 1), dv = 30 * fy * fy * (fy * (fy - 2) + 1)
  const k1 = d100 - d000, k2 = d010 - d000, k3 = d001 - d000
  const k4 = d000 - d100 - d010 + d110, k5 = d000 - d010 - d001 + d011, k6 = d000 - d100 - d001 + d101
  const k7 = -d000 + d100 + d010 - d110 + d001 - d101 - d011 + d111
  const n = d000 + k1 * u + k2 * v + k3 * w + k4 * u * v + k5 * v * w + k6 * w * u + k7 * u * v * w
  // ∂/∂x of the blend: the corner gradients' x components blended with the same weights, plus the fade term
  const x000 = G3[g000], x1 = G3[g100] - x000, x2 = G3[g010] - x000, x3 = G3[g001] - x000
  const x4 = x000 - G3[g100] - G3[g010] + G3[g110], x5 = x000 - G3[g010] - G3[g001] + G3[g011], x6 = x000 - G3[g100] - G3[g001] + G3[g101]
  const x7 = -x000 + G3[g100] + G3[g010] - G3[g110] + G3[g001] - G3[g101] - G3[g011] + G3[g111]
  const y000 = G3[g000 + 1], y1 = G3[g100 + 1] - y000, y2 = G3[g010 + 1] - y000, y3 = G3[g001 + 1] - y000
  const y4 = y000 - G3[g100 + 1] - G3[g010 + 1] + G3[g110 + 1], y5 = y000 - G3[g010 + 1] - G3[g001 + 1] + G3[g011 + 1], y6 = y000 - G3[g100 + 1] - G3[g001 + 1] + G3[g101 + 1]
  const y7 = -y000 + G3[g100 + 1] + G3[g010 + 1] - G3[g110 + 1] + G3[g001 + 1] - G3[g101 + 1] - G3[g011 + 1] + G3[g111 + 1]
  const dx = x000 + x1 * u + x2 * v + x3 * w + x4 * u * v + x5 * v * w + x6 * w * u + x7 * u * v * w + du * (k1 + k4 * v + k6 * w + k7 * v * w)
  const dy = y000 + y1 * u + y2 * v + y3 * w + y4 * u * v + y5 * v * w + y6 * w * u + y7 * u * v * w + dv * (k2 + k4 * u + k5 * w + k7 * w * u)
  out[0] = n * NOISE3_SCALE; out[1] = dx * NOISE3_SCALE; out[2] = dy * NOISE3_SCALE
  return out
}
/** 3-D gradient noise in [−1, 1] (12 edge gradients of improved Perlin noise, components in {−1,0,1}, quintic fade). */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  return noise3Grad(x, y, z, seed, scratch3)[0]
}

export interface FbmOptions { octaves?: number /* 4, clamped 1..8 */; lacunarity?: number /* 2 */; gain?: number /* .5 */ }
/** Octave count: floored, clamped to 1..8 (NaN → 1). */
export const octaveCount = (n: number) => (n >= 1 ? (n < 8 ? Math.floor(n) : 8) : 1)
/** Seed of octave o: seed ^ imul(o, 0x9e3779b9) (octave 0 keeps the seed). */
export const octaveSeed = (seed: number, o: number) => (seed ^ Math.imul(o, 0x9e3779b9)) | 0

type Shape = 0 | 1 | 2
/** Σ gainᵒ·f(noise2(Rᵒ·p·lacᵒ, seedᵒ)) / Σ gainᵒ with f = n (fbm), |n| (turb) or (1 − |n|)² (ridge). */
function octaves(shape: Shape, x: number, y: number, octs: number | undefined, seed: number, o: FbmOptions | undefined): number {
  return o === undefined ? sumOctaves(shape, x, y, octaveCount(octs ?? 4), seed, 2, .5) : sumOctaves(shape, x, y, octaveCount(octs ?? o.octaves ?? 4), seed, o.lacunarity ?? 2, o.gain ?? .5)
}
function sumOctaves(shape: Shape, x: number, y: number, n: number, seed: number, lac: number, gain: number): number {
  let px = x, py = y, amp = 1, sum = 0, norm = 0
  for (let k = 0; k < n; k++) {
    const v = noise2(px, py, octaveSeed(seed, k)), a = v < 0 ? -v : v
    sum += amp * (shape === 0 ? v : shape === 1 ? a : (1 - a) * (1 - a))
    norm += amp
    amp *= gain
    const qx = .8 * px - .6 * py, qy = .6 * px + .8 * py
    px = qx * lac; py = qy * lac
  }
  return sum / norm
}
/**
 * Fractal Brownian motion in [−1, 1]: Σ gainᵒ·noise2(Rᵒ·p·lacᵒ, seedᵒ) / Σ gainᵒ, where R is the octave rotation
 * and seedᵒ = seed ^ imul(o, 0x9e3779b9). Lacunarity 2 keeps the scaling exact. `octaves` (else `o.octaves`, else 4)
 * is floored and clamped to 1..8.
 */
export const fbm2 = (x: number, y: number, octaves_?: number, seed = 0, o?: FbmOptions): number => octaves(0, x, y, octaves_, seed, o)
/** Turbulence in [0, 1]: Σ gainᵒ·|noise2| / Σ gainᵒ (marble, rust, smoke). */
export const turb2 = (x: number, y: number, octaves_?: number, seed = 0, o?: FbmOptions): number => octaves(1, x, y, octaves_, seed, o)
/** Ridged multifractal in [0, 1]: Σ gainᵒ·(1 − |noise2|)² / Σ gainᵒ (veins, cracks, leather creases). */
export const ridge2 = (x: number, y: number, octaves_?: number, seed = 0, o?: FbmOptions): number => octaves(2, x, y, octaves_, seed, o)

/**
 * Divergence-free 2-D flow (Bridson et al. 2007, "Curl-noise for procedural fluid flow"):
 * ψ = Σ gainᵒ·noise3(x·2ᵒ, y·2ᵒ, t·speed, seedᵒ), v = (∂ψ/∂y, −∂ψ/∂x) from the analytic gradient (one noise3Grad
 * per octave; no finite differences). Default 2 octaves, speed .25, gain .5. Writes [vx, vy] into `out` (no allocation).
 * Units: noise-space per unit of ψ; callers scale. For particles/agents (lily pads, marine snow), not per-cell fields.
 */
export function curl2(x: number, y: number, t: number, seed = 0, out: [number, number] = [0, 0], o?: { octaves?: number; speed?: number }): [number, number] {
  const n = octaveCount(o?.octaves ?? 2), z = t * (o?.speed ?? .25)
  let amp = 1, f = 1, sx = 0, sy = 0
  for (let k = 0; k < n; k++) {
    noise3Grad(x * f, y * f, z, octaveSeed(seed, k), scratch3)
    sx += amp * f * scratch3[1]; sy += amp * f * scratch3[2]
    amp *= .5; f *= 2
  }
  out[0] = sy; out[1] = -sx
  return out
}

/** Value noise in [0, 1], bit-identical to cinema.ts's former private vnoise (hash01 lattice, smoothstep fade). For migration only. */
export function valueNoise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy)
  const a = hash01(xi, yi, seed), b = hash01(xi + 1, yi, seed), c = hash01(xi, yi + 1, seed), d = hash01(xi + 1, yi + 1, seed)
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy
}
