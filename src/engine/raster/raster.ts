import type { CellBounds, Field, GridConfig } from '../types'
import { cellU } from '../sampler/gridSampler'

/**
 * The second value kind (MASTER-PLAN §3.1): a field evaluated once at every cell centre of a grid.
 * Pointwise ops stay on `Field`; neighbourhood ops (blur, dilate, normals, bloom) work on `Raster`.
 */
/** Which cell space a raster lives in: the card pitch, a coarser lattice (`lat:k|ox,oy`) or dot sites. */
export type SpaceId = 'card' | `lat:${number}|${number},${number}` | 'sites'
export interface Raster {
  grid: GridConfig
  space: SpaceId
  /** One value per cell, row-major (`row * cols + col`). */
  data: Float32Array
  /** Inclusive cell rectangle outside which every value is 0 (lets ops and the sampler skip the rest). */
  bounds?: CellBounds
}

/** The space id of a lattice layer (`Layer.lattice` / `Layer.origin`). */
export const latticeSpace = (lattice: number, origin: [number, number] = [0, 0]): SpaceId => `lat:${lattice}|${origin[0]},${origin[1]}`

/** An all-zero raster on `grid`. */
export function createRaster(grid: GridConfig, space: SpaceId = 'card', bounds?: CellBounds): Raster {
  return { grid, space, data: new Float32Array(grid.cols * grid.rows), bounds }
}

/** Integer window [c0, r0, c1, r1] a raster can be non-zero in, optionally grown by `pad` cells and clipped to the grid. */
export function rasterWindow(r: Raster, pad = 0): CellBounds {
  const { cols, rows } = r.grid, b = r.bounds
  if (!b) return [0, 0, cols - 1, rows - 1]
  return [Math.max(0, Math.floor(b[0]) - pad), Math.max(0, Math.floor(b[1]) - pad), Math.min(cols - 1, Math.ceil(b[2]) + pad), Math.min(rows - 1, Math.ceil(b[3]) + pad)]
}

/**
 * Evaluate `field` once per cell centre of `grid` (the sampler's own u/v mapping, so sampling the
 * result on the same grid reproduces the field exactly, up to Float32 rounding). A field with
 * `bounds` is only evaluated there; the raster keeps those bounds (clipped to the grid).
 */
export function rasterize(field: Field, grid: GridConfig, space: SpaceId = 'card'): Raster {
  const { cols, rows } = grid, out = createRaster(grid, space)
  let c0 = 0, r0 = 0, c1 = cols - 1, r1 = rows - 1
  if (field.bounds) {
    const b = field.bounds
    c0 = Math.max(0, Math.floor(b[0])); r0 = Math.max(0, Math.floor(b[1])); c1 = Math.min(cols - 1, Math.ceil(b[2])); r1 = Math.min(rows - 1, Math.ceil(b[3]))
    out.bounds = [c0, r0, c1, r1]
  }
  const d = out.data
  for (let r = r0; r <= r1; r++) {
    const v = cellU(r, rows)
    for (let c = c0; c <= c1; c++) d[r * cols + c] = field(cellU(c, cols), v)
  }
  return out
}

/** Cell coordinate of u on an n-wide grid, snapped to the integer when it is a centre up to float noise. */
const coord = (u: number, n: number) => { const x = n === 1 ? 0 : u * (n - 1), k = Math.round(x); return Math.abs(x - k) < 1e-7 ? k : x }

/**
 * The raster as a field on its own grid: `nearest` returns the cell value under u/v, `bilinear`
 * blends the four surrounding cell centres (edges clamp). Both return exactly the stored value on
 * a cell centre. 0 more than half a cell outside the grid. Carries the raster's `bounds`.
 */
export function sample(raster: Raster, mode: 'nearest' | 'bilinear' = 'nearest'): Field {
  const { cols, rows } = raster.grid, d = raster.data, kx = cols - 1, ky = rows - 1
  const f: Field = mode === 'nearest'
    ? (u, v) => {
      const c = Math.round(u * kx), r = Math.round(v * ky)
      return c < 0 || r < 0 || c >= cols || r >= rows ? 0 : d[r * cols + c]
    }
    : (u, v) => {
      const x = coord(u, cols), y = coord(v, rows)
      if (x < -.5 || y < -.5 || x > cols - .5 || y > rows - .5) return 0
      const cx = Math.min(cols - 1, Math.max(0, x)), cy = Math.min(rows - 1, Math.max(0, y))
      const x0 = Math.floor(cx), y0 = Math.floor(cy), fx = cx - x0, fy = cy - y0
      const x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1)
      const top = d[y0 * cols + x0] + (d[y0 * cols + x1] - d[y0 * cols + x0]) * fx
      if (fy === 0) return top
      const bottom = d[y1 * cols + x0] + (d[y1 * cols + x1] - d[y1 * cols + x0]) * fx
      return top + (bottom - top) * fy
    }
  if (raster.bounds) { const [c0, r0, c1, r1] = raster.bounds; f.bounds = [c0, r0, c1, r1] }
  return f
}

/** Sum of all values (e.g. to check an op preserves mass). */
export function rasterSum(r: Raster): number { let s = 0; for (let i = 0; i < r.data.length; i++) s += r.data[i]; return s }
/** Largest value. */
export function rasterMax(r: Raster): number { let m = 0; for (let i = 0; i < r.data.length; i++) if (r.data[i] > m) m = r.data[i]; return m }

/** Tightest bounds of the non-zero cells (undefined when the raster is empty). */
export function tightBounds(r: Raster, eps = 0): CellBounds | undefined {
  const { cols } = r.grid, [c0, r0, c1, r1] = rasterWindow(r), d = r.data
  let a = Infinity, b = Infinity, e = -1, g = -1
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) if (d[y * cols + x] > eps) { if (x < a) a = x; if (x > e) e = x; if (y < b) b = y; if (y > g) g = y }
  return e < 0 ? undefined : [a, b, e, g]
}
