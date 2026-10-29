import type { Layer, Tone } from '../types'
import type { ToneBand } from '../light/material'
import { createRaster, sample, type Raster } from '../raster/raster'

/**
 * A lit material surface as ONE multi-tone layer (`Layer.toneOf`): the sampler scans it once instead of once per tone
 * band (docs/living-matter/M-materials.md). Per frame and allocation-light: the merge buffers are reused.
 */

/** The tones a surface can carry, by index (a `tones` byte raster holds these indices). */
export const SURFACE_TONES: readonly Tone[] = ['faint', 'mid', 'idle', 'value', 'active']
const toneIndex = (t: Tone) => SURFACE_TONES.indexOf(t)

/**
 * A value raster and a parallel tone-index raster (`SURFACE_TONES`) as one layer: nearest lookups on the raster's own
 * grid, placed on lattice `k` (origin 0) when given. Cells whose value is 0 draw nothing, whatever their tone byte.
 */
export function tonedLayer(values: Raster, tones: Uint8Array, k?: number): Layer {
  const { cols, rows } = values.grid
  const toneOf = (_x: number, u: number, v: number): Tone => SURFACE_TONES[tones[Math.round(v * (rows - 1)) * cols + Math.round(u * (cols - 1))]]
  return k ? { field: sample(values), toneOf, lattice: k, origin: [0, 0] } : { field: sample(values), toneOf }
}

/** One part of a surface: a raster and its tone bands, or one tone for every lit cell. */
export type SurfacePart = readonly [Raster, readonly ToneBand[] | Tone]
const surfaces = new WeakMap<Raster, { values: Raster; tones: Uint8Array }>()
/**
 * Disjoint per-cell rasters (each with its tone bands, or one tone) merged into one multi-tone layer: equal to drawing
 * `toneBands` of each part (values outside every band draw nothing; the first part lit at a cell owns it). The merge
 * buffers are kept per first raster (per card's scratch), so a surface redrawn every frame allocates nothing big.
 */
export function surfaceLayer(parts: readonly SurfacePart[], k?: number): Layer {
  const first = parts[0][0], grid = first.grid, { cols, rows } = grid
  let sf = surfaces.get(first)
  if (!sf) surfaces.set(first, (sf = { values: createRaster(grid), tones: new Uint8Array(cols * rows) }))
  const V = sf.values.data, Tn = sf.tones
  V.fill(0)
  let c0 = cols, r0 = rows, c1 = -1, r1 = -1
  // flattened per part: its data, then (lo, hi, tone index) triples; a single tone is one open band
  const np = parts.length, datas: Float32Array[] = [], bands: number[][] = []
  for (let p = 0; p < np; p++) {
    const [r, how] = parts[p], b = r.bounds ?? [0, 0, cols - 1, rows - 1]
    c0 = Math.min(c0, b[0]); r0 = Math.min(r0, b[1]); c1 = Math.max(c1, b[2]); r1 = Math.max(r1, b[3])
    datas.push(r.data)
    bands.push(typeof how === 'string' ? [-Infinity, Infinity, toneIndex(how)] : how.flatMap(([lo, hi, t]) => [lo, hi, toneIndex(t)]))
  }
  for (let r = Math.max(0, r0), rEnd = Math.min(rows - 1, r1); r <= rEnd; r++) {
    for (let i = r * cols + Math.max(0, c0), end = r * cols + Math.min(cols - 1, c1); i <= end; i++) {
      for (let p = 0; p < np; p++) {
        const x = datas[p][i]
        if (!(x > 0)) continue
        const bs = bands[p]
        for (let q = 0; q < bs.length; q += 3) if (x >= bs[q] && x < bs[q + 1]) { V[i] = x; Tn[i] = bs[q + 2]; break }
        break
      }
    }
  }
  sf.values.bounds = c1 < 0 ? [0, 0, -1, -1] : [c0, r0, c1, r1]
  return tonedLayer(sf.values, Tn, k)
}
