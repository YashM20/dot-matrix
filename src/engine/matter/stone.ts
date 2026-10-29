import type { GridConfig } from '../types'
import { createRaster, type Raster } from '../raster/raster'
import { turb2 } from '../noise/gradient'
import { poissonDiscPoints } from '../fields/scatterField'
import { hash01 } from '../math'

/**
 * Stone (docs/living-matter/M-materials.md §3.1): marble by Perlin's turbulence-sine (1985) and terrazzo aggregate
 * by Poisson-disc sites. Both are bakes (cached per options), never per frame.
 */
export interface MarbleOptions {
  seed?: number
  /** Cells between main veins (default 30), vein direction (default .6 rad), turbulence gain in radians (default 5.5). */
  period?: number; angle?: number; warp?: number
  /** Turbulence base frequency per cell (default 1/26) and octaves (default 5). */
  scale?: number; octaves?: number
  /** Vein sharpness (default 2.5: a 2.5-cell vein at period 30) and the fine secondary veins' weight (default .35). */
  sharp?: number; fine?: number
}

const marbles = new Map<string, Raster>()
/** One vein system: (1 − |sin φ|)^sharp with φ = 2π·(x cos α + y sin α)/period + warp·turb2(x·scale, y·scale). */
function veins(x: number, y: number, period: number, ca: number, sa: number, warp: number, scale: number, octaves: number, seed: number, sharp: number): number {
  const phi = 2 * Math.PI * (x * ca + y * sa) / period + warp * turb2(x * scale, y * scale, octaves, seed)
  return (1 - Math.abs(Math.sin(phi))) ** sharp
}
/**
 * Marble body 0..1 (1 = white stone, → 0 in the veins), baked on `grid` (cells of that grid), cached per grid and
 * options. The fine veins repeat the main ones at period 11, warp 3, sharpness 4 and seed + 1.
 */
export function marble(grid: GridConfig, o: MarbleOptions = {}): Raster {
  const seed = o.seed ?? 7, period = o.period ?? 30, angle = o.angle ?? .6, warp = o.warp ?? 5.5
  const scale = o.scale ?? 1 / 26, octaves = o.octaves ?? 5, sharp = o.sharp ?? 2.5, fine = o.fine ?? .35
  const key = `${grid.cols}x${grid.rows}|${seed}|${period}|${angle}|${warp}|${scale}|${octaves}|${sharp}|${fine}`
  const hit = marbles.get(key)
  if (hit) return hit
  const out = createRaster(grid), ca = Math.cos(angle), sa = Math.sin(angle), { cols, rows } = grid
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const main = veins(c, r, period, ca, sa, warp, scale, octaves, seed, sharp)
    const thin = fine > 0 ? veins(c, r, 11, ca, sa, 3, scale, octaves, seed + 1, 4) * fine : 0
    out.data[r * cols + c] = 1 - Math.max(main, thin)
  }
  marbles.set(key, out)
  if (marbles.size > 8) marbles.delete(marbles.keys().next().value!)
  return out
}

/**
 * Terrazzo aggregate: chip sites (Poisson, min distance `d`) in three size classes, avoiding `keepOut` (a 0/1 raster
 * in the same cells as `box`, lit ≥ .5 = no chip). `box` is [col0, row0, col1, row1] in cells. Class by
 * hash01(seed, i): < .15 → a (big), < .5 → b, else c (small).
 */
export function terrazzo(box: [number, number, number, number], o: { d?: number; seed?: number; keepOut?: Raster } = {}): { a: [number, number][]; b: [number, number][]; c: [number, number][] } {
  const d = o.d ?? 3.4, seed = o.seed ?? 11, [x0, y0, x1, y1] = box, k = o.keepOut
  const pts = poissonDiscPoints(x1 - x0, y1 - y0, d, seed), out = { a: [] as [number, number][], b: [] as [number, number][], c: [] as [number, number][] }
  pts.forEach(([px, py], i) => {
    const x = x0 + px, y = y0 + py
    if (k) {
      const c = Math.round(x), r = Math.round(y)
      if (c >= 0 && r >= 0 && c < k.grid.cols && r < k.grid.rows && k.data[r * k.grid.cols + c] >= .5) return
    }
    const h = hash01(seed, i)
    ;(h < .15 ? out.a : h < .5 ? out.b : out.c).push([x, y])
  })
  return out
}

export interface SiteVoronoi {
  /** Per cell of the grid: the nearest site's index, −1 outside the box. */
  id: Int16Array
  /** Per cell: the exact distance (cells) to the nearest bisector, i.e. to the cell's pane border; Infinity outside the box. */
  border: Float32Array
}
/** Cells c0 … c1 of row r: the nearest site, then the distance to the nearest bisector with any other site. */
function siteRow(xs: Float64Array, ys: Float64Array, id: Int16Array, border: Float32Array, r: number, c0: number, c1: number, cols: number): void {
  const n = xs.length
  for (let c = c0; c <= c1; c++) {
    let best = 0, bd = Infinity
    for (let k = 0; k < n; k++) { const dx = xs[k] - c, dy = ys[k] - r, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = k } }
    const ax = xs[best] - c, ay = ys[best] - r
    let md = Infinity
    for (let k = 0; k < n; k++) {
      if (k === best) continue
      const ex = xs[k] - xs[best], ey = ys[k] - ys[best], l = Math.sqrt(ex * ex + ey * ey)
      if (l === 0) continue
      const d = ((ax + .5 * ex) * ex + (ay + .5 * ey) * ey) / l // the cell's distance to the bisector of best and k
      if (d < md) md = d
    }
    id[r * cols + c] = best; border[r * cols + c] = md
  }
}
/**
 * A Voronoi tessellation of custom sites (a rose window's petals), brute force over the box: per cell the nearest
 * site and the exact distance to the nearest bisector (even-width lead between panes). Sites and cells are in the
 * grid's cells. A bake: about 2n distance tests per cell (19 sites over 70² cells ≈ 0.2M).
 */
export function voronoiSites(sites: readonly (readonly [number, number])[], grid: GridConfig, box?: [number, number, number, number]): SiteVoronoi {
  const { cols, rows } = grid, id = new Int16Array(cols * rows).fill(-1), border = new Float32Array(cols * rows).fill(Infinity)
  const xs = Float64Array.from(sites, s => s[0]), ys = Float64Array.from(sites, s => s[1])
  const [c0, r0, c1, r1] = box ?? [0, 0, cols - 1, rows - 1]
  if (sites.length) for (let r = Math.max(0, r0); r <= Math.min(rows - 1, r1); r++) siteRow(xs, ys, id, border, r, Math.max(0, c0), Math.min(cols - 1, c1), cols)
  return { id, border }
}
