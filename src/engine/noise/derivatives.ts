/**
 * Noise with analytic derivatives (IQ5, #66): 2-D gradient noise `noised2`, signed value noise `valueNoised2`, fBm
 * with its gradient `fbmd2`, and the derivative-damped "erosion" fBm `erosionFbm2`. A normal from these costs one
 * call instead of the three to five a finite difference takes (materials, light, terrain slopes).
 *
 * Conventions follow gradient.ts: one lattice cell is one noise feature, values are signed, and every op is
 * +, ×, floor or imul, so the bits are the same in every JS engine. `noised2(…)[0] === noise2(…)` and
 * `fbmd2(…)[0] === fbm2(…)` bit for bit (the value is blended in gradient.ts's own op order; only the derivative
 * terms are new). The functions write `[value, ∂/∂x, ∂/∂y]` into `out` (default: a module scratch, valid until
 * the next call) and return it.
 */
import { octaveCount, octaveSeed, type FbmOptions } from './gradient'
import { fmix32, IH_A, IH_B, IH_C } from './hash'

const R = Math.SQRT1_2, SQRT2 = Math.SQRT2
/** gradient.ts's 8 gradients in the same order (indexed by `hash & 7`), so `noised2` hashes to the same field as `noise2`. */
const GX = Float64Array.of(1, -1, 0, 0, R, -R, R, -R)
const GY = Float64Array.of(0, 0, 1, -1, R, R, -R, -R)
/** Seed salt for value noise, so its lattice values don't follow the gradient choice of `noise2` at the same seed. */
const VALUE_SALT = 0x3c6ef372
const U32 = 1 / 4294967296
const scratch = new Float64Array(3), octave = new Float64Array(3)

// after Inigo Quilez, https://iquilezles.org/articles/gradientnoise/ (MIT)
/**
 * 2-D gradient noise and its analytic gradient: `[n, ∂n/∂x, ∂n/∂y]`, with n === noise2(x, y, seed). The article's
 * 2-D `noised`: the bilinear blend of the corner gradients plus du·(u.yx·(va − vb − vc + vd) + (vb, vc) − va), on
 * the quintic fade (C², so the derivative is continuous across lattice lines).
 */
export function noised2(x: number, y: number, seed = 0, out: Float64Array = scratch): Float64Array {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, gx = fx - 1, gy = fy - 1
  // corner hashes exactly as noise2: ihash(ix + i, iy + j, seed) & 7 with ihash inlined
  const x0 = Math.imul(ix, IH_A), x1 = (x0 + IH_A) | 0, s = Math.imul(seed, IH_C), yb = Math.imul(iy, IH_B), y0 = yb ^ s, y1 = ((yb + IH_B) | 0) ^ s
  const h00 = fmix32(x0 ^ y0) & 7, h10 = fmix32(x1 ^ y0) & 7, h01 = fmix32(x0 ^ y1) & 7, h11 = fmix32(x1 ^ y1) & 7
  const a = GX[h00] * fx + GY[h00] * fy, b = GX[h10] * gx + GY[h10] * fy
  const c = GX[h01] * fx + GY[h01] * gy, d = GX[h11] * gx + GY[h11] * gy
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const du = 30 * fx * fx * (fx * (fx - 2) + 1), dv = 30 * fy * fy * (fy * (fy - 2) + 1)
  const ab = a + (b - a) * u, cd = c + (d - c) * u, k = a - b - c + d, uv = u * v
  out[0] = (ab + (cd - ab) * v) * SQRT2
  out[1] = (GX[h00] + u * (GX[h10] - GX[h00]) + v * (GX[h01] - GX[h00]) + uv * (GX[h00] - GX[h10] - GX[h01] + GX[h11]) + du * (v * k + b - a)) * SQRT2
  out[2] = (GY[h00] + u * (GY[h10] - GY[h00]) + v * (GY[h01] - GY[h00]) + uv * (GY[h00] - GY[h10] - GY[h01] + GY[h11]) + dv * (u * k + c - a)) * SQRT2
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/morenoise/ (MIT)
/**
 * Signed value noise in [−1, 1] and its analytic gradient: `[n, ∂n/∂x, ∂n/∂y]`. Random values on the integer
 * lattice (ihash of the corner, salted), blended as k0 + k1·u + k2·v + k4·u·v on the quintic fade, so
 * ∂n/∂x = 2·u′(x)·(k1 + k4·v) and ∂n/∂y = 2·v′(y)·(k2 + k4·u). The article's 3-D `noised`, cut to 2-D.
 * Not the legacy `valueNoise2` (hash01 lattice, cubic fade, [0, 1]): that one is kept bit-exact for cinema.
 */
export function valueNoised2(x: number, y: number, seed = 0, out: Float64Array = scratch): Float64Array {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy
  const x0 = Math.imul(ix, IH_A), x1 = (x0 + IH_A) | 0, s = Math.imul(seed ^ VALUE_SALT, IH_C), yb = Math.imul(iy, IH_B), y0 = yb ^ s, y1 = ((yb + IH_B) | 0) ^ s
  const a = fmix32(x0 ^ y0) * U32, b = fmix32(x1 ^ y0) * U32, c = fmix32(x0 ^ y1) * U32, d = fmix32(x1 ^ y1) * U32
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
  const du = 30 * fx * fx * (fx * (fx - 2) + 1), dv = 30 * fy * fy * (fy * (fy - 2) + 1)
  const k1 = b - a, k2 = c - a, k4 = a - b - c + d
  out[0] = -1 + 2 * (a + k1 * u + k2 * v + k4 * u * v)
  out[1] = 2 * du * (k1 + k4 * v)
  out[2] = 2 * dv * (k2 + k4 * u)
  return out
}

export interface FbmdOptions extends FbmOptions {
  /** The noise summed per octave: 'gradient' (default, `noised2`, so the value equals `fbm2`) or 'value' (`valueNoised2`). */
  basis?: 'gradient' | 'value'
}

// after Inigo Quilez, https://iquilezles.org/articles/morenoise/ (MIT)
/**
 * fBm and its analytic gradient: `[f, ∂f/∂x, ∂f/∂y]`. Octave k samples the noise at Jₖ·p with Jₖ = (lac·R)ᵏ (R the
 * octave rotation of gradient.ts), so its gradient with respect to p is Jₖᵀ·∇n; the article's running matrix
 * `m = f·m3i·m` is that Jₖᵀ. Same octave count, seeds, rotation and normalisation as `fbm2`, so with the default
 * 'gradient' basis f === fbm2(x, y, octaves, seed, o) bit for bit. `octaves` (else `o.octaves`, else 4) is clamped to 1..8.
 */
export function fbmd2(x: number, y: number, octaves?: number, seed = 0, out: Float64Array = scratch, o?: FbmdOptions): Float64Array {
  const n = octaveCount(octaves ?? o?.octaves ?? 4), lac = o?.lacunarity ?? 2, gain = o?.gain ?? .5, value = o?.basis === 'value'
  let px = x, py = y, amp = 1, sum = 0, norm = 0, dx = 0, dy = 0
  let m00 = 1, m01 = 0, m10 = 0, m11 = 1
  for (let k = 0; k < n; k++) {
    const N = value ? valueNoised2(px, py, octaveSeed(seed, k), octave) : noised2(px, py, octaveSeed(seed, k), octave)
    sum += amp * N[0]
    norm += amp
    dx += amp * (m00 * N[1] + m01 * N[2]); dy += amp * (m10 * N[1] + m11 * N[2])
    amp *= gain
    const qx = .8 * px - .6 * py, qy = .6 * px + .8 * py
    px = qx * lac; py = qy * lac
    // Jᵀ ← lac·Jᵀ·Rᵀ, Rᵀ = [[.8, .6], [−.6, .8]]
    const a00 = lac * (m00 * .8 - m01 * .6), a01 = lac * (m00 * .6 + m01 * .8), a10 = lac * (m10 * .8 - m11 * .6), a11 = lac * (m10 * .6 + m11 * .8)
    m00 = a00; m01 = a01; m10 = a10; m11 = a11
  }
  out[0] = sum / norm; out[1] = dx / norm; out[2] = dy / norm
  return out
}

export interface ErosionOptions {
  /** Octave count, clamped to 1..16 (default 8; the article runs 15 for a full-screen terrain). */
  octaves?: number
  /** Amplitude falloff per octave (default .5). */
  gain?: number
  /** The noise summed per octave: 'value' (default, as the article) or 'gradient'. */
  basis?: 'gradient' | 'value'
}

// after Inigo Quilez, https://iquilezles.org/articles/morenoise/ (MIT)
/**
 * Erosion fBm in [−1, 1], the article's `terrain()`: the running sum of the raw octave derivatives d damps each
 * new octave by 1 / (1 + d·d), so slopes stay smooth and flats pick up detail (eroded ridges, dry ground, rock).
 * Octave k samples at (2R)ᵏ·p with its own seed; the sum is divided by Σ gainᵏ so the bound is exact.
 */
export function erosionFbm2(x: number, y: number, seed = 0, o?: ErosionOptions): number {
  const no = o?.octaves ?? 8, n = no >= 1 ? (no < 16 ? Math.floor(no) : 16) : 1, gain = o?.gain ?? .5, value = o?.basis !== 'gradient'
  let px = x, py = y, amp = 1, sum = 0, norm = 0, dx = 0, dy = 0
  for (let k = 0; k < n; k++) {
    const N = value ? valueNoised2(px, py, octaveSeed(seed, k), octave) : noised2(px, py, octaveSeed(seed, k), octave)
    dx += N[1]; dy += N[2]
    sum += amp * N[0] / (1 + dx * dx + dy * dy)
    norm += amp
    amp *= gain
    const qx = .8 * px - .6 * py, qy = .6 * px + .8 * py
    px = qx * 2; py = qy * 2
  }
  return sum / norm
}
