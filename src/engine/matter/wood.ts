import type { CellBounds, GridConfig } from '../types'
import { createRaster, type Raster } from '../raster/raster'
import { fbm2 } from '../noise/gradient'
import { hash01 } from '../math'

/**
 * Wood grain (docs/living-matter/M-materials.md §5, `mat-wood`): growth rings are concentric cylinders round the
 * pith; a flat-sawn board cuts them along a plane, so the face shows `fract(k · dist + warp)`, nested arches where
 * the pith dives under the face (the cathedral). Ray flecks are short lenses along the grain, 6:1 (one per cell of a
 * jittered 18 × 3 grid, a share of them shown). A bake: three rasters on `grid`, in the grid's own cells.
 */
export interface WoodOptions {
  /** The pith: a line along x at row `y`, `depth` cells under the face at column `x`, diving `slope` cells a cell. */
  pith?: { y: number; x?: number; depth?: number; slope?: number }
  /** Rings per cell (default 1/5.5: a 5.5-cell ring, ≥ 3 everywhere with the warp and knots below). */
  k?: number
  /** Ring warp: fBm amplitude in rings (default 1.1) and its scale (cells per noise unit, default 56 along the grain, 32 across). */
  warp?: number; warpScale?: readonly [number, number]
  /** Knots: (x, y, radius) in cells; each bends the rings round it (.7 ring) and has a dark core of radius / 3. */
  knots?: readonly (readonly [number, number, number])[]
  /** Ray flecks: share of the grid's lenses shown (default .35). */
  flecks?: number
  seed?: number
  box?: CellBounds
}
export interface Wood {
  /** Continuous ring phase (rings): its gradient is the ring density (period = 1 / |∇phase|). */
  phase: Raster
  /** fract(phase): 0 at the start of a ring (earlywood) → 1 (latewood). */
  ring: Raster
  /** 1 in a ray fleck or a knot's core (2 = core), else 0. */
  fleck: Raster
}

/** The warp is smooth (≥ 16 cells a noise unit): read off a grid of fBm every `WARP_STEP` cells, bilinearly. */
const WARP_STEP = 4
/** The ring phase at cell (x, y), given the warp there (rings). */
function phaseAt(x: number, y: number, warp: number, o: WoodOptions): number {
  const p = o.pith ?? { y: -30 }, k = o.k ?? 1 / 5.5
  const z = (p.depth ?? 18) + (p.slope ?? .2) * (x - (p.x ?? 0)), dy = y - p.y
  let ph = k * Math.sqrt(dy * dy + z * z) + warp
  const knots = o.knots ?? []
  for (let q = 0; q < knots.length; q++) { const dx = x - knots[q][0], dk = y - knots[q][1], kr = knots[q][2]; ph += .7 * Math.exp(-(dx * dx + dk * dk) / (kr * kr)) }
  return ph
}
/** The ring phase at cell (x, y) with the exact (not gridded) warp: for checks. */
export function woodPhase(x: number, y: number, o: WoodOptions = {}): number {
  const [sx, sy] = o.warpScale ?? [56, 32]
  return phaseAt(x, y, (o.warp ?? 1.1) * fbm2(x / sx, y / sy, 3, o.seed ?? 7), o)
}
/**
 * Ray flecks: a share of the cells of an 18 × 3 grid each hold a lens (centre hashed into the cell, 3.2 × .6 cells);
 * a cell is in a fleck when it lies in the lens of its grid cell or of the one beside it. The table holds the lenses
 * over grid columns i0 … and rows j0 … (lw wide): each one's centre, or NaN where the grid cell shows none, so the
 * hashes are taken once per grid cell, not three times per raster cell.
 */
interface FleckTable { i0: number; j0: number; lw: number; fx: Float64Array; fy: Float64Array }
function fleckTable(c0: number, r0: number, c1: number, r1: number, seed: number, share: number): FleckTable {
  const i0 = Math.floor(c0 / 18) - 1, j0 = Math.floor(r0 / 3), lw = Math.floor(c1 / 18) + 1 - i0 + 1, lh = Math.floor(r1 / 3) - j0 + 1
  const fx = new Float64Array(lw * lh).fill(NaN), fy = new Float64Array(lw * lh)
  for (let j = j0; j < j0 + lh; j++) for (let i = i0; i < i0 + lw; i++) {
    if (hash01(i, j, seed) >= share) continue
    const k = (j - j0) * lw + i - i0
    fx[k] = 18 * (i + hash01(i, j, seed + 1)); fy[k] = 3 * (j + .2 + .6 * hash01(i, j, seed + 2))
  }
  return { i0, j0, lw, fx, fy }
}
/** Is (x, y) inside a ray fleck: the lens of the grid cell it lies in, or of the one either side. */
function fleckIn(t: FleckTable, x: number, y: number): boolean {
  const row = (Math.floor(y / 3) - t.j0) * t.lw - t.i0
  for (let i = Math.floor(x / 18) - 1, i1 = i + 2; i <= i1; i++) {
    const fx = t.fx[row + i]
    if (fx !== fx) continue
    const dx = (x - fx) / 3.2, dy = (y - t.fy[row + i]) / .6
    if (dx * dx + dy * dy < 1) return true
  }
  return false
}

/** The board's rings, phase and flecks over `box` (default the grid), baked. */
export function woodRings(grid: GridConfig, o: WoodOptions = {}): Wood {
  const { cols, rows } = grid, box = o.box ?? [0, 0, cols - 1, rows - 1], seed = o.seed ?? 7, share = o.flecks ?? .35, amp = o.warp ?? 1.1, [sx, sy] = o.warpScale ?? [56, 32]
  const phase = createRaster(grid, 'card', box), ring = createRaster(grid, 'card', box), fleck = createRaster(grid, 'card', box)
  const c0 = Math.max(0, box[0]), r0 = Math.max(0, box[1]), c1 = Math.min(cols - 1, box[2]), r1 = Math.min(rows - 1, box[3])
  const gw = Math.ceil((c1 - c0) / WARP_STEP) + 2, gh = Math.ceil((r1 - r0) / WARP_STEP) + 2, G = new Float64Array(gw * gh)
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) G[j * gw + i] = amp * fbm2((c0 + WARP_STEP * i) / sx, (r0 + WARP_STEP * j) / sy, 3, seed)
  const ft = c0 <= c1 && r0 <= r1 ? fleckTable(c0, r0, c1, r1, seed + 1, share) : null
  for (let r = r0; r <= r1; r++) woodRow(G, gw, o, ft!, phase.data, ring.data, fleck.data, cols, r, r0, c0, c1)
  return { phase, ring, fleck }
}
function woodRow(G: Float64Array, gw: number, o: WoodOptions, ft: FleckTable, P: Float32Array, R: Float32Array, F: Float32Array, cols: number, r: number, r0: number, c0: number, c1: number): void {
  const fy = (r - r0) / WARP_STEP, j = Math.floor(fy), ty = fy - j
  for (let c = c0; c <= c1; c++) {
    const fx = (c - c0) / WARP_STEP, k = Math.floor(fx), tx = fx - k, a = j * gw + k
    const top = G[a] + (G[a + 1] - G[a]) * tx, bot = G[a + gw] + (G[a + gw + 1] - G[a + gw]) * tx
    const i = r * cols + c, ph = phaseAt(c, r, top + (bot - top) * ty, o)
    P[i] = ph; R[i] = ph - Math.floor(ph)
    if (fleckIn(ft, c, r)) F[i] = 1
    const knots = o.knots ?? []
    for (let q = 0; q < knots.length; q++) { const dx = c - knots[q][0], dy = r - knots[q][1]; if (dx * dx + dy * dy < knots[q][2] * knots[q][2] / 9) F[i] = 2 }
  }
}
