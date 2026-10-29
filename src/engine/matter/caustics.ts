import type { Field, GridConfig } from '../types'
import type { Raster } from '../raster/raster'

/**
 * Caustics from a real heightfield (docs/living-matter/M-materials.md §4.1): Evan Wallace's area-ratio caustic done as
 * photon splatting on the CPU (his WebGL version rasterises refracted triangles and takes oldArea / newArea). Light
 * comes straight down through the water surface; each photon bends by the surface slope and lands on the floor
 * `depth` cells below, so where the surface converges light, the floor gets a bright net.
 *
 * A gradient callback writes `[h, ∂h/∂x, ∂h/∂y]` at a point in the raster's cells into `out` (the layout of track L's
 * `rippleGrad`, so a ripple plugs in with a one-line adapter that maps cells).
 */
export type HeightGrad = (x: number, y: number, out: Float32Array) => void

export interface CausticOptions {
  /** Water depth over the floor in cells (default 6) and refractive index (default 1.33). */
  depth?: number; ior?: number
  /** Extra gain on the refracted offset (default 3: sim heights are small). */
  gain?: number
  /** Photons per cell per axis (default 2 → 4 per cell, stratified: an even sub-grid, so flat water is exactly 1). */
  photons?: number
  /** Cells that emit (water: > 0); default every cell inside the raster's bounds. */
  mask?: ArrayLike<number>
  /** A constant landing shift in cells (a low sun stretches the net sideways). */
  shift?: readonly [number, number]
}
/** What the last `causticSplat` emitted and lost off the raster (the energy check). */
export const causticStats = { emitted: 0, lost: 0 }

const g3 = new Float32Array(3)
let tmp = new Float32Array(0)
/** Tent-splat weight w at (qx, qy) into the four cells around it (cell centres at integers); returns what fell off. */
function tent(D: Float32Array, cols: number, rows: number, qx: number, qy: number, w: number): number {
  const i = Math.floor(qx), j = Math.floor(qy), fx = qx - i, fy = qy - j
  const a = w * (1 - fx) * (1 - fy), b = w * fx * (1 - fy), c = w * (1 - fx) * fy, d = w * fx * fy
  if (i >= 0 && j >= 0 && i + 1 < cols && j + 1 < rows) {
    const k = j * cols + i
    D[k] += a; D[k + 1] += b; D[k + cols] += c; D[k + cols + 1] += d
    return 0
  }
  let lost = 0
  const inC0 = i >= 0 && i < cols, inC1 = i + 1 >= 0 && i + 1 < cols, inR0 = j >= 0 && j < rows, inR1 = j + 1 >= 0 && j + 1 < rows
  if (inC0 && inR0) D[j * cols + i] += a; else lost += a
  if (inC1 && inR0) D[j * cols + i + 1] += b; else lost += b
  if (inC0 && inR1) D[(j + 1) * cols + i] += c; else lost += c
  if (inC1 && inR1) D[(j + 1) * cols + i + 1] += d; else lost += d
  return lost
}
/** One row of photons: cells c0 … c1 of row r, each emitting P² photons bent by the cell's own slope. */
function splatRow(grad: HeightGrad, D: Float32Array, M: ArrayLike<number> | undefined, cols: number, rows: number, r: number, c0: number, c1: number, P: number, K: number, sx: number, sy: number): number {
  const w = 1 / (P * P)
  let lost = 0
  for (let c = c0; c <= c1; c++) {
    if (M && !(M[r * cols + c] > 0)) continue
    grad(c, r, g3)
    const ox = sx - K * g3[1], oy = sy - K * g3[2]
    for (let j = 0; j < P; j++) {
      const py = r + (j + .5) / P - .5 + oy
      for (let i = 0; i < P; i++) lost += tent(D, cols, rows, c + (i + .5) / P - .5 + ox, py, w)
    }
  }
  return lost
}
/**
 * Forward-splat caustics: every photon at water cell p lands on the floor at q = p − K·∇h(p) with
 * K = gain · depth · (1 − 1/ior), and deposits 1/photons² into the floor raster with a bilinear (tent) splat,
 * then a [1 2 1]² / 16 binomial pass. Mean 1 on flat water; > 1 where the surface focuses light (the net).
 * Writes into `into` (cleared over its bounds, grown by 2 for the footprint); photons landing off the raster are dropped
 * and counted in `causticStats.lost`.
 */
export function causticSplat(grad: HeightGrad, into: Raster, o: CausticOptions = {}): Raster {
  const { cols, rows } = into.grid, P = Math.max(1, Math.round(o.photons ?? 2)), K = (o.gain ?? 3) * (o.depth ?? 6) * (1 - 1 / (o.ior ?? 1.33))
  const [sx, sy] = o.shift ?? [0, 0], D = into.data, b = into.bounds ?? [0, 0, cols - 1, rows - 1]
  const c0 = Math.max(0, b[0] - 2), r0 = Math.max(0, b[1] - 2), c1 = Math.min(cols - 1, b[2] + 2), r1 = Math.min(rows - 1, b[3] + 2)
  for (let r = r0; r <= r1; r++) D.fill(0, r * cols + c0, r * cols + c1 + 1)
  let lost = 0, emitted = 0
  for (let r = Math.max(0, b[1]); r <= Math.min(rows - 1, b[3]); r++) {
    lost += splatRow(grad, D, o.mask, cols, rows, r, Math.max(0, b[0]), Math.min(cols - 1, b[2]), P, K, sx, sy)
    if (o.mask) { for (let c = b[0]; c <= b[2]; c++) if (o.mask[r * cols + c] > 0) emitted++ } else emitted += b[2] - b[0] + 1
  }
  // the binomial [1 2 1] / 4 along x, then y, over the grown window (zero outside the raster)
  if (tmp.length < D.length) tmp = new Float32Array(D.length)
  for (let r = r0; r <= r1; r++) blurRowX(D, tmp, r * cols, c0, c1, cols)
  for (let r = r0; r <= r1; r++) blurRowY(tmp, D, r, c0, c1, cols, rows)
  causticStats.emitted = emitted; causticStats.lost = lost
  into.bounds = [c0, r0, c1, r1]
  return into
}
function blurRowX(S: Float32Array, O: Float32Array, row: number, c0: number, c1: number, cols: number): void {
  for (let c = c0; c <= c1; c++) {
    const i = row + c
    O[i] = .25 * ((c > 0 ? S[i - 1] : 0) + 2 * S[i] + (c < cols - 1 ? S[i + 1] : 0))
  }
}
function blurRowY(S: Float32Array, O: Float32Array, r: number, c0: number, c1: number, cols: number, rows: number): void {
  for (let c = c0; c <= c1; c++) {
    const i = r * cols + c
    O[i] = .25 * ((r > 0 ? S[i - cols] : 0) + 2 * S[i] + (r < rows - 1 ? S[i + cols] : 0))
  }
}

/** The floor seen through the water: `floor` read at p − K'·∇h with K' = depth·(1 − 1/ior) (no extra gain). */
export function refractFloor(floor: Field, grad: HeightGrad, grid: GridConfig, o: Pick<CausticOptions, 'depth' | 'ior'> = {}): Field {
  const W = grid.cols - 1 || 1, H = grid.rows - 1 || 1, K = (o.depth ?? 6) * (1 - 1 / (o.ior ?? 1.33)), g = new Float32Array(3)
  const f: Field = (u, v) => {
    const c = u * W, r = v * H
    grad(c, r, g)
    if (g[1] === 0 && g[2] === 0) return floor(u, v)
    return floor((c - K * g[1]) / W, (r - K * g[2]) / H)
  }
  if (floor.bounds) f.bounds = floor.bounds
  return f
}
