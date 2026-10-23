/**
 * SDF morph (P4): shape A becomes shape B by blending their signed distance rasters, so the
 * outline flows instead of cross-dissolving (lock → app icon, digit → digit). The exact EDT
 * (`distanceRaster`) runs once per geometry and is cached on the shape's identity; a frame is one
 * lerp + threshold over the grid (≈20k cells on a TILE card).
 */
import type { Field, GridConfig } from '../types'
import { createRaster, rasterize, tightBounds, type Raster, type SpaceId } from '../raster/raster'
import { distanceRaster } from '../raster/ops'

export interface MorphOptions {
  /** Grid a `Field` shape is rasterized on (a `Raster` brings its own). */
  grid?: GridConfig
  space?: SpaceId
  /** Coverage threshold of the input masks (default .5). */
  at?: number
}

// EDT cache: per shape identity → per grid / space / threshold, a few entries each (LRU)
const PER_SHAPE = 4
const sdfs = new WeakMap<object, Map<string, Raster>>()

/**
 * Signed distance raster (cells, negative inside) of a mask given as a `Raster` or a `Field` on
 * `grid`, cached per shape identity: keep the shape object stable and do not mutate a cached raster.
 */
export function signedDistance(shape: Raster | Field, opts: MorphOptions = {}): Raster {
  const raster = typeof shape !== 'function', grid = raster ? shape.grid : opts.grid
  if (!grid) throw new Error('signedDistance: a Field shape needs a grid')
  const space = raster ? shape.space : (opts.space ?? 'card'), at = opts.at ?? .5
  const key = `${grid.cols}x${grid.rows}|${space}|${at}`
  let per = sdfs.get(shape)
  const hit = per?.get(key)
  if (hit) { per!.delete(key); per!.set(key, hit); return hit }
  const out = distanceRaster(raster ? shape : rasterize(shape, grid, space), at)
  if (!per) sdfs.set(shape, (per = new Map()))
  per.set(key, out)
  if (per.size > PER_SHAPE) per.delete(per.keys().next().value!)
  return out
}

/** The blended signed distance (1 - k)·sdA + k·sdB on the shapes' common grid. */
export function morphSDF(a: Raster | Field, b: Raster | Field, k: number, opts: MorphOptions = {}): Raster {
  const da = signedDistance(a, opts), db = signedDistance(b, { ...opts, grid: opts.grid ?? da.grid })
  if (da.grid.cols !== db.grid.cols || da.grid.rows !== db.grid.rows) throw new Error('morph: shapes on different grids')
  const t = Math.max(0, Math.min(1, k)), out = createRaster(da.grid, da.space)
  for (let i = 0; i < out.data.length; i++) out.data[i] = da.data[i] + (db.data[i] - da.data[i]) * t
  return out
}

/**
 * Shape-to-shape morph at k ∈ [0, 1]: a coverage raster (1 inside, a one-cell ramp at the edge,
 * 0 outside) of the blended SDF, with tight bounds. k = 0 / 1 reproduce A / B's thresholded masks.
 */
export function morph(a: Raster | Field, b: Raster | Field, k: number, opts: MorphOptions = {}): Raster {
  const sd = morphSDF(a, b, k, opts), out = createRaster(sd.grid, sd.space)
  for (let i = 0; i < out.data.length; i++) { const s = sd.data[i]; out.data[i] = s <= -.5 ? 1 : s >= .5 ? 0 : .5 - s }
  out.bounds = tightBounds(out) ?? [0, 0, -1, -1]
  return out
}
