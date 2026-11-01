import type { CellBounds, GridConfig } from '../types'
import { createRaster, type Raster } from '../raster/raster'
import { voronoi2 } from '../noise/voronoi'
import { hash01 } from '../math'

/**
 * Pebble-grain leather (docs/living-matter/M-materials.md §5, `mat-leather`): each Worley cell is a pebble, its
 * border a crease. Height h = smoothstep(0, .25, F2 − F1) of `voronoi2(x / scale, y / scale)`, so the creases are
 * exactly the cell borders (F2 = F1) and the pebbles are flat-topped with rounded shoulders; each pebble's top is
 * a little higher or lower than its neighbours' (± `vary`, by its id). A bake, 0..1 over `box`.
 */
export interface LeatherOptions { scale?: number /* cells per pebble, 3.2 */; seed?: number; vary?: number /* .15 */; box?: CellBounds }

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))
/** Grain height (0 in a crease, ≈ 1 on a pebble) at cell (x, y). */
export function leatherAt(x: number, y: number, o: LeatherOptions = {}): number {
  const s = o.scale ?? 3.2, v = voronoi2(x / s, y / s, o.seed ?? 11), vary = o.vary ?? .15
  return smooth((v.f2 - v.f1) / .25) * (1 - vary + 2 * vary * hash01(v.id, 3))
}
export function leatherGrain(grid: GridConfig, o: LeatherOptions = {}): Raster {
  const { cols, rows } = grid, box = o.box ?? [0, 0, cols - 1, rows - 1], out = createRaster(grid, 'card', box)
  for (let r = Math.max(0, box[1]); r <= Math.min(rows - 1, box[3]); r++) for (let c = Math.max(0, box[0]); c <= Math.min(cols - 1, box[2]); c++) out.data[r * cols + c] = leatherAt(c, r, o)
  return out
}
