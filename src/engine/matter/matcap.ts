import type { Field, Layer } from '../types'
import type { NormalRaster } from '../light/height'
import type { Vec3 } from '../light/shade'
import { METAL_BANDS, STUDIO, toneBands, type MaterialOptions, type Studio, type ToneBand } from '../light/material'
import { createRaster, sample } from '../raster/raster'

/**
 * Matcaps (docs/living-matter/M-materials.md §3.1): an environment read off the normal. A `MatcapFn` maps a unit
 * normal (x right, y down, z toward the viewer) to a value; `bakeMatcap` turns it into a size² LUT over the unit
 * disc of (nx, ny), read nearest so hard stops stay hard. `matcap` rotates the environment with the light
 * azimuth and tips it by the light hub's tilt offset (`tx`, `ty`: 0, 0 at rest, never gravity).
 */
export type MatcapFn = (nx: number, ny: number, nz: number) => number
/** A matcap baked to a size×size LUT over the unit disc of (nx, ny); nz = √(1 − nx² − ny²). Nearest lookup keeps hard stops hard. */
export interface Matcap { size: number; data: Float32Array; fn: MatcapFn }

/** Bake `fn` into a size² LUT (default 64): texel (i, j) holds fn at nx = 2i/(size−1) − 1, ny likewise (outside the disc: its edge). */
export function bakeMatcap(fn: MatcapFn, size = 64): Matcap {
  const data = new Float32Array(size * size), k = 2 / (size - 1)
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    let nx = i * k - 1, ny = j * k - 1
    const rr = nx * nx + ny * ny
    if (rr > 1) { const l = Math.sqrt(rr); nx /= l; ny /= l }
    data[j * size + i] = fn(nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny)))
  }
  return { size, data, fn }
}

export interface MatcapOptions extends MaterialOptions {
  /** Rotate the environment about the view axis (radians): e.g. the light azimuth. */
  rotate?: number
  /** Tip the environment by the hub's tilt offset (tx, ty: 0, 0 at rest, each clamped to ±1 → ±25°); bucketed to 1/32. Never gx/gy (gravity is ≈ (0, 1) upright). */
  tilt?: readonly [number, number]
  /** Use the LUT (default true) or call `fn` per cell (exact, checks only). */
  lut?: boolean
  bands?: readonly ToneBand[]
}

const TIP = 25 * Math.PI / 180
const luts = new WeakMap<MatcapFn, Matcap>()
/** The default 64² LUT of a bare function, baked once per function. */
const lutOf = (fn: MatcapFn) => { let m = luts.get(fn); if (!m) luts.set(fn, (m = bakeMatcap(fn))); return m }
/** The tilt offset as used: each axis clamped to ±1 and bucketed to 1/32. */
export const tiltBucket = (x: number) => Math.round(Math.max(-1, Math.min(1, x || 0)) * 32) / 32

/**
 * The 3×3 environment rotation n' = Rz(rotate)·Rx(25°·ty)·Ry(−25°·tx)·n (row-major), or null for the identity
 * (rotate ≡ 0 mod 2π and no tilt: the matcap then reads the normal as is, bit for bit).
 */
export function matcapMatrix(rotate = 0, tilt: readonly [number, number] = [0, 0]): number[] | null {
  const tx = tiltBucket(tilt[0]), ty = tiltBucket(tilt[1])
  const turns = rotate / (2 * Math.PI)
  if (tx === 0 && ty === 0 && Math.abs(turns - Math.round(turns)) < 1e-12) return null
  const a = rotate, ca = Math.cos(a), sa = Math.sin(a)
  const b = TIP * ty, cb = Math.cos(b), sb = Math.sin(b)
  const g = -TIP * tx, cg = Math.cos(g), sg = Math.sin(g)
  // Rz · Rx · Ry
  const Rz = [ca, -sa, 0, sa, ca, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cb, -sb, 0, sb, cb], Ry = [cg, 0, sg, 0, 1, 0, -sg, 0, cg]
  const mul = (A: number[], B: number[]) => { const C = new Array<number>(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return C }
  return mul(mul(Rz, Rx), Ry)
}

/** Environment-mapped tone read off the normal: `{ env, layers }` (bands default to `METAL_BANDS`). Coverage edges fade as in `metal()`. */
export function matcap(n: NormalRaster, cap: Matcap | MatcapFn, o: MatcapOptions = {}): { env: Field; layers: Layer[] } {
  const useLut = o.lut ?? true, m = typeof cap === 'function' ? (useLut ? lutOf(cap) : null) : cap
  const fn = typeof cap === 'function' ? cap : cap.fn, R = matcapMatrix(o.rotate, o.tilt)
  const out = createRaster(n.grid, n.space, n.bounds), cols = n.grid.cols, b = n.bounds ?? [0, 0, cols - 1, n.grid.rows - 1]
  const size = m?.size ?? 0, half = (size - 1) / 2, LUT = m?.data
  for (let r = b[1]; r <= b[3]; r++) for (let c = b[0]; c <= b[2]; c++) {
    const i = r * cols + c, mask = n.mask[i]
    if (mask <= 0) continue
    let nx = n.x[i], ny = n.y[i], nz = n.z[i]
    if (R) {
      const x = R[0] * nx + R[1] * ny + R[2] * nz, y = R[3] * nx + R[4] * ny + R[5] * nz, z = R[6] * nx + R[7] * ny + R[8] * nz
      nx = x; ny = y; nz = z
    }
    const edge = Math.min(1, mask * 2)
    let val: number
    if (useLut && LUT) {
      const ix = Math.round((nx + 1) * half), iy = Math.round((ny + 1) * half)
      val = LUT[(iy < 0 ? 0 : iy >= size ? size - 1 : iy) * size + (ix < 0 ? 0 : ix >= size ? size - 1 : ix)]
    } else val = fn(nx, ny, nz)
    out.data[i] = val * edge
  }
  const env = sample(out), at = { lattice: o.lattice, origin: o.origin }
  if (at.lattice === undefined) delete at.lattice
  if (!at.origin) delete at.origin
  return { env, layers: toneBands(env, o.bands ?? METAL_BANDS, at) }
}

/**
 * The studio of `metal()` (material.ts) as a matcap for light direction L: equal to `metal(n, L).env` cell for cell
 * (with `lut: false`; same arithmetic in the same order). `sun` is the R·L above which the light itself is reflected.
 */
export function studioMatcap(L: Vec3, studio: Studio = STUDIO, sun = .96): MatcapFn {
  const k0 = 1 / (Math.hypot(L[0], L[1], L[2]) || 1), Lx = L[0] * k0, Ly = L[1] * k0, Lz = L[2] * k0
  const { horizon, bend, stops } = studio
  const lx = Lx / 3, ly = Ly / 3 - 1, h = Math.hypot(lx, ly), ax = lx / h, ay = ly / h
  return (nx, ny, nz) => {
    const k = 2 * nz
    if (k * nx * Lx + k * ny * Ly + (k * nz - 1) * Lz >= sun) return 1
    const d = nx * ax + ny * ay - (horizon - bend * (1 - nz))
    for (const [lo, val] of stops) if (d >= lo) return val
    return 0
  }
}

/** Stops over d = (screen-up · n) − horizon(nz), first match wins. */
const striped = (horizon: number, bend: number, stops: readonly (readonly [number, number])[]): MatcapFn => (_nx, ny, nz) => {
  const d = -ny - (horizon - bend * (1 - nz))
  for (const [lo, val] of stops) if (d >= lo) return val
  return 0
}
/** Hard chrome: sky, a white window strip, the black horizon, ground and a lit floor at the bottom rim. */
export const CHROME: MatcapFn = striped(-.06, .35, [[.62, .5], [.22, .75], [.08, 1], [-.12, 0], [-.5, .5], [-.62, 0], [-2, .25]])
/** Satin metal: two wide soft bands (a bright upper half, a mid lower half) and a dark rim, no black horizon line. */
export const SATIN: MatcapFn = (_nx, ny, nz) => (nz < .22 ? .25 : -ny > .05 ? .75 : -ny > -.55 ? .5 : .25)
/** Liquid (mercury): CHROME with a wider sky and a bright floor. */
export const LIQUID: MatcapFn = striped(-.1, .3, [[.4, .75], [.1, 1], [-.08, 0], [-.45, .5], [-2, .75]])
