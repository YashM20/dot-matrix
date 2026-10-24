import type { CellBounds, Field, GridConfig } from '../types'
import { createRaster, rasterize, rasterWindow, tightBounds, type Raster, type SpaceId } from '../raster/raster'

/**
 * Height and normals (MASTER-PLAN §3.8): geometry is turned into a height raster and a normal raster
 * once and cached; per frame only the lighting runs (`lambert` / `phong`, a dot product per cell).
 * Units are cells of the raster's grid on all three axes, so slopes are true slopes.
 */

/**
 * How height rises with inset (cells inside the edge). `round` is a quarter circle (a dome bevel;
 * `width` = `height` = the radius of a circle gives a true hemisphere), `linear` a chamfer, `smooth`
 * a smoothstep pillow. `height` defaults to `width`; a negative `height` engraves instead.
 */
export interface HeightSpec { shape?: 'round' | 'linear' | 'smooth'; width: number; height?: number }
/** A spec, or any function from inset (cells, ≥ 0 inside) to height (cells). */
export type HeightProfile = HeightSpec | ((inset: number) => number)

/** Height (cells) per cell in `data`; `mask` is the shape's coverage (1 inside, a one-cell ramp at the edge). */
export interface HeightRaster extends Raster { mask: Float32Array }
/** Unit surface normals per cell (x right, y down, z toward the viewer), struct of arrays. */
export interface NormalRaster {
  grid: GridConfig
  space: SpaceId
  x: Float32Array; y: Float32Array; z: Float32Array
  /** Coverage of the shape (shading is multiplied by it). */
  mask: Float32Array
  /** Height (cells) per cell, for point lights. */
  height: Float32Array
  bounds?: CellBounds
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
function profileFn(p: HeightProfile): (inset: number) => number {
  if (typeof p === 'function') return p
  const { shape = 'round', width } = p, h = p.height ?? width, w = Math.max(1e-6, width)
  if (shape === 'linear') return s => h * clamp01(s / w)
  if (shape === 'smooth') return s => { const t = clamp01(s / w); return h * t * t * (3 - 2 * t) }
  return s => { const t = 1 - clamp01(s / w); return h * Math.sqrt(1 - t * t) }
}

// cache: per geometry (SDF field or raster identity) → per grid + profile, a few entries each (LRU)
const PER_GEOMETRY = 8
const heights = new WeakMap<object, Map<string, HeightRaster>>()
const fnIds = new WeakMap<object, number>()
let nextFn = 1
const profileKey = (p: HeightProfile) => {
  if (typeof p !== 'function') return `${p.shape ?? 'round'}|${p.width}|${p.height ?? p.width}`
  let id = fnIds.get(p); if (!id) fnIds.set(p, (id = nextFn++))
  return `fn${id}`
}
const gridKey = (g: GridConfig) => `${g.cols}x${g.rows}`
const isRaster = (x: Field | Raster): x is Raster => typeof x !== 'function'

/**
 * Height raster of a shape given as a signed distance (cells, negative inside): a `Field` evaluated on
 * `grid` (see `sdfCircle`, `sdfBox`), or a raster from `distanceRaster`. Cached per SDF identity, grid
 * and profile, so calling it from `layers()` every frame costs a map lookup — keep the SDF object stable.
 */
export function heightRaster(sdf: Field | Raster, profile: HeightProfile, grid?: GridConfig, space: SpaceId = 'card'): HeightRaster {
  const g = isRaster(sdf) ? sdf.grid : grid
  if (!g) throw new Error('heightRaster: a Field SDF needs a grid')
  const key = `${gridKey(g)}|${isRaster(sdf) ? sdf.space : space}|${profileKey(profile)}`
  let per = heights.get(sdf)
  const hit = per?.get(key)
  if (hit) { per!.delete(key); per!.set(key, hit); return hit }
  const d = isRaster(sdf) ? sdf : rasterize(sdf, g, space), fn = profileFn(profile)
  const out: HeightRaster = { ...createRaster(g, d.space), mask: new Float32Array(g.cols * g.rows) }
  for (let i = 0; i < d.data.length; i++) {
    const s = d.data[i]
    out.mask[i] = clamp01(.5 - s)
    if (s < .5) out.data[i] = fn(Math.max(0, -s))
  }
  out.bounds = tightBounds({ ...out, data: out.mask }) ?? [0, 0, -1, -1]
  if (!per) heights.set(sdf, (per = new Map()))
  per.set(key, out)
  if (per.size > PER_GEOMETRY) per.delete(per.keys().next().value!)
  return out
}

/** Sum of height rasters on one grid (an emblem embossed on a plate); coverage is the union. Not cached: keep the result. */
export function stackHeights(base: HeightRaster, ...more: HeightRaster[]): HeightRaster {
  const out: HeightRaster = { ...createRaster(base.grid, base.space), mask: Float32Array.from(base.mask) }
  out.data.set(base.data)
  for (const h of more) for (let i = 0; i < out.data.length; i++) { out.data[i] += h.data[i]; if (h.mask[i] > out.mask[i]) out.mask[i] = h.mask[i] }
  out.bounds = tightBounds({ ...out, data: out.mask }) ?? [0, 0, -1, -1]
  return out
}

const normals = new WeakMap<HeightRaster, NormalRaster>()
/**
 * Unit normals of a height raster by central differences (one-sided at the grid edge). Cached per
 * height raster; cells outside its bounds (grown by one) face the viewer.
 */
export function normalRaster(h: HeightRaster): NormalRaster {
  const hit = normals.get(h)
  if (hit) return hit
  const { cols, rows } = h.grid, n = cols * rows, H = h.data
  const out: NormalRaster = { grid: h.grid, space: h.space, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n).fill(1), mask: h.mask, height: H }
  const [c0, r0, c1, r1] = rasterWindow(h, 1)
  out.bounds = [c0, r0, c1, r1]
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const xl = c > 0 ? c - 1 : c, xr = c < cols - 1 ? c + 1 : c, yu = r > 0 ? r - 1 : r, yd = r < rows - 1 ? r + 1 : r
    const gx = (H[r * cols + xr] - H[r * cols + xl]) / Math.max(1, xr - xl), gy = (H[yd * cols + c] - H[yu * cols + c]) / Math.max(1, yd - yu)
    const k = 1 / Math.sqrt(gx * gx + gy * gy + 1), i = r * cols + c
    out.x[i] = -gx * k; out.y[i] = -gy * k; out.z[i] = k
  }
  normals.set(h, out)
  return out
}
