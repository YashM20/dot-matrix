import type { CellBounds, GridConfig } from '../types'
import { createRaster, type Raster } from '../raster/raster'
import { voronoi2 } from '../noise/voronoi'
import { fmix32, IH_A, IH_B, IH_C, ihash } from '../noise/hash'
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
  const b: CellBounds = [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(cols - 1, box[2]), Math.min(rows - 1, box[3])]
  if (b[0] <= b[2] && b[1] <= b[3]) out.data.set(leatherCells(cols, b, o).subarray(b[1] * cols, (b[3] + 1) * cols), b[1] * cols)
  return out
}

/** voronoi.ts's id salt and point scale (its cell ids are ihash(cell, seed ^ salt); points are 16-bit). */
const ID_SALT = 0x68e31da4, Q16 = 1 / 65536, JITTER = 1
/**
 * `leatherAt(c, r, o)` at every cell of `box`, into `out` (row-major, `cols` wide, float64): bit for bit the same
 * values. It runs `voronoi2`'s exact L2 search (the same points, scan order, ring early-out and ties), but each
 * lattice cell's feature point and pebble lift are tabled once instead of rehashed for every cell that looks at
 * them (at scale 3.2, ~90 cell lookups share each lattice cell). Cells outside `box` are left as they are.
 */
export function leatherCells(cols: number, box: CellBounds, o: LeatherOptions = {}, out = new Float64Array(cols * (box[3] + 1))): Float64Array {
  const s = o.scale ?? 3.2, seed = o.seed ?? 11, vary = o.vary ?? .15, [c0, r0, c1, r1] = box
  // every lattice cell a search can reach: the ±2 ring round each cell's own lattice cell
  const i0 = Math.floor(c0 / s) - 2, j0 = Math.floor(r0 / s) - 2, lw = Math.floor(c1 / s) + 2 - i0 + 1, lh = Math.floor(r1 / s) + 2 - j0 + 1
  const PX = new Float64Array(lw * lh), PY = new Float64Array(lw * lh), LIFT = new Float64Array(lw * lh), sc = Math.imul(seed, IH_C)
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) {
    const ci = i0 + i, cj = j0 + j, h = fmix32(Math.imul(ci, IH_A) ^ Math.imul(cj, IH_B) ^ sc), k = j * lw + i
    PX[k] = ci + JITTER * (h & 0xffff) * Q16; PY[k] = cj + JITTER * (h >>> 16) * Q16
    LIFT[k] = 1 - vary + 2 * vary * hash01(ihash(ci, cj, seed ^ ID_SALT), 3)
  }
  for (let r = r0; r <= r1; r++) leatherCellRow(out, PX, PY, LIFT, lw, i0, j0, s, r * cols, r, c0, c1)
  return out
}
function leatherCellRow(out: Float64Array, PX: Float64Array, PY: Float64Array, LIFT: Float64Array, lw: number, i0: number, j0: number, s: number, row: number, r: number, c0: number, c1: number): void {
  const y = r / s, cy = Math.floor(y), fy = y - cy
  for (let c = c0; c <= c1; c++) {
    const x = c / s, cx = Math.floor(x), fx = x - cx, base = (cy - j0) * lw + (cx - i0)
    let f1 = Infinity, f2 = Infinity, bk = 0
    for (let j = -1; j <= 1; j++) for (let i = -1, k = base + j * lw - 1; i <= 1; i++, k++) {
      const dx = PX[k] - x, dy = PY[k] - y, d = dx * dx + dy * dy
      if (d < f1) { f2 = f1; f1 = d; bk = k } else if (d < f2) f2 = d
    }
    if (f2 > 1) {
      for (let j = -2; j <= 2; j++) {
        const ly = j === 2 ? 2 - fy : j === -2 ? 1 + fy : 0, edge = j === -2 || j === 2
        for (let i = -2, step = edge ? 1 : 4; i <= 2; i += step) {
          const lx = i === 2 ? 2 - fx : i === -2 ? 1 + fx : 0, lb = lx * lx + ly * ly
          if (!(lb < f2)) continue
          const k = base + j * lw + i, dx = PX[k] - x, dy = PY[k] - y, d = dx * dx + dy * dy
          if (d < f1) { f2 = f1; f1 = d; bk = k } else if (d < f2) f2 = d
        }
      }
    }
    out[row + c] = smooth((Math.sqrt(f2) - Math.sqrt(f1)) / .25) * LIFT[bk]
  }
}
