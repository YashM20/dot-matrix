/**
 * Hugo Elias 2-D water (the "2D water" explainer): two height planes, H (current) and P (previous), and
 *   h'(x, y) = ((h(x−1) + h(x+1)) + (h(y−1) + h(y+1))) / 2 − hPrev(x, y), then × damp.
 * Walls are mask 0 (and the grid border): they hold h = 0, so a ring reflects inverted (a fixed end). The scheme is
 * stable at Courant number 1/√2 cells per step, so a ring crosses a 36-cell pond in about 1.7 s at dt 1/30.
 *
 * Both planes live inside a world's flat `Float32Array` (the World contract, physics/world.ts): a step writes the new
 * plane into P's slot and then swaps the contents of H and P, so there is no parity flag and two states always blend.
 * The neighbour sum is grouped (left + right) + (up + down), so a centred drop stays mirror-symmetric bit for bit.
 *
 * API frozen at L1.2: M2's caustic pool consumes createRipple / rippleStep / rippleSplat / rippleGrad (and
 * rippleEnergy). Later water features are new functions; these signatures never change.
 */
import { dcos } from '../noise/dmath'

export interface RippleSpec {
  w: number; h: number
  /** Per step (default .984 at dt 1/30: a ring keeps about 30 % of its amplitude after 2.5 s). */
  damp?: number
  /** 1 = water, 0 = wall (default: all water). */
  mask?: Uint8Array
}
export interface Ripple extends Required<RippleSpec> {
  /** Offset of plane H (current) and P (previous) inside the world state. */
  H: number; P: number
  /** Floats the ripple takes in the state (2·w·h). */
  size: number
}

/** Lay out a ripple at `offset` in a world state (2·w·h floats). */
export function createRipple(spec: RippleSpec, offset = 0): Ripple {
  const n = spec.w * spec.h
  const mask = spec.mask ?? new Uint8Array(n).fill(1)
  if (mask.length !== n) throw new Error(`ripple mask is ${mask.length} cells, want ${n}`)
  return { w: spec.w, h: spec.h, damp: spec.damp ?? .984, mask, H: offset, P: offset + n, size: 2 * n }
}

/** One step in place: the new plane goes into P's slot, then H and P swap contents (no parity flag). */
export function rippleStep(r: Ripple, s: Float32Array): void {
  const { w, h, damp, mask, H, P } = r
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const i = row + x
      if (!mask[i]) { s[P + i] = 0; continue }
      const l = x > 0 ? s[H + i - 1] : 0, rr = x < w - 1 ? s[H + i + 1] : 0
      const u = y > 0 ? s[H + i - w] : 0, d = y < h - 1 ? s[H + i + w] : 0
      s[P + i] = (((l + rr) + (u + d)) * .5 - s[P + i]) * damp
    }
  }
  const n = w * h
  for (let i = 0; i < n; i++) { const a = s[H + i]; s[H + i] = s[P + i]; s[P + i] = a }
}

/**
 * Add a raised-cosine dip of `amp` (negative = pushed down) and radius `rad` (cells) at (x, y) to the current plane.
 * Cell (i, j) has its centre at (i, j). Walls are left alone.
 */
export function rippleSplat(r: Ripple, s: Float32Array, x: number, y: number, amp: number, rad: number): void {
  if (!(rad > 0) || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amp)) return
  const { w, h, mask, H } = r
  const x0 = Math.max(0, Math.ceil(x - rad)), x1 = Math.min(w - 1, Math.floor(x + rad))
  const y0 = Math.max(0, Math.ceil(y - rad)), y1 = Math.min(h - 1, Math.floor(y + rad))
  const r2 = rad * rad, k = Math.PI / rad
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i - x, dy = j - y, d2 = dx * dx + dy * dy
    if (d2 >= r2 || !mask[j * w + i]) continue
    s[H + j * w + i] += amp * .5 * (1 + dcos(Math.sqrt(d2) * k))
  }
}

/** Add `amount` at (x, y), split bilinearly over the four nearest cells (a moving point source: a koi's wake). Walls are left alone. */
export function rippleAdd(r: Ripple, s: Float32Array, x: number, y: number, amount: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(amount)) return
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  addAt(r, s, i, j, amount * (1 - fx) * (1 - fy)); addAt(r, s, i + 1, j, amount * fx * (1 - fy))
  addAt(r, s, i, j + 1, amount * (1 - fx) * fy); addAt(r, s, i + 1, j + 1, amount * fx * fy)
}
function addAt(r: Ripple, s: Float32Array, i: number, j: number, v: number) {
  if (i >= 0 && j >= 0 && i < r.w && j < r.h && r.mask[j * r.w + i]) s[r.H + j * r.w + i] += v
}

/** Height of the current plane at a cell (0 outside the grid and on walls). */
const at = (r: Ripple, s: Float32Array, i: number, j: number) => (i < 0 || j < 0 || i >= r.w || j >= r.h ? 0 : s[r.H + j * r.w + i])
/** Bilinear height of the current plane at (x, y). */
function bilinear(r: Ripple, s: Float32Array, x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  const a = at(r, s, i, j), b = at(r, s, i + 1, j), c = at(r, s, i, j + 1), d = at(r, s, i + 1, j + 1)
  const ab = a + (b - a) * fx, cd = c + (d - c) * fx
  return ab + (cd - ab) * fy
}
/** Bilinear height and central-difference gradient at (x, y), into `out` [h, gx, gy]. */
export function rippleGrad(r: Ripple, s: Float32Array, x: number, y: number, out: Float32Array | number[]): void {
  out[0] = bilinear(r, s, x, y)
  out[1] = (bilinear(r, s, x + 1, y) - bilinear(r, s, x - 1, y)) * .5
  out[2] = (bilinear(r, s, x, y + 1) - bilinear(r, s, x, y - 1)) * .5
}

/** Σ h² over water cells (the checks: energy decays once a drop has left). */
export function rippleEnergy(r: Ripple, s: Float32Array): number {
  let e = 0
  for (let i = 0, n = r.w * r.h; i < n; i++) if (r.mask[i]) { const v = s[r.H + i]; e += v * v }
  return e
}
