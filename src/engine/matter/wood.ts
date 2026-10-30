import type { CellBounds, GridConfig } from '../types'
import { createRaster, type Raster } from '../raster/raster'
import { fbm2 } from '../noise/gradient'
import { voronoi2 } from '../noise/voronoi'
import { hash01 } from '../math'

/**
 * Wood grain (docs/living-matter/M-materials.md §5, `mat-wood`): growth rings are concentric cylinders round the
 * pith; a flat-sawn board cuts them along a plane, so the face shows `fract(k · dist + warp)`, nested arches where
 * the pith dives under the face (the cathedral). Ray flecks are short lenses along the grain (Worley stretched 6:1).
 * A bake: three rasters on `grid`, in the grid's own cells.
 */
export interface WoodOptions {
  /** The pith: a line along x at row `y`, `depth` cells under the face at column `x`, diving `slope` cells a cell. */
  pith?: { y: number; x?: number; depth?: number; slope?: number }
  /** Rings per cell (default 1/5.5: a 5.5-cell ring, ≥ 3 everywhere with the warp and knots below). */
  k?: number
  /** Ring warp: fBm amplitude in rings (default 1.4) and its scale (cells per noise unit, default 48 along the grain, 16 across). */
  warp?: number; warpScale?: readonly [number, number]
  /** Knots: (x, y, radius) in cells; each bends the rings round it (≤ 1 ring) and has a dark core of radius / 3. */
  knots?: readonly (readonly [number, number, number])[]
  /** Ray flecks: share of Worley cells that carry one (default .35). */
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

/** The ring phase at cell (x, y). */
export function woodPhase(x: number, y: number, o: WoodOptions = {}): number {
  const p = o.pith ?? { y: -30 }, k = o.k ?? 1 / 5.5, w = o.warp ?? 1.4, [sx, sy] = o.warpScale ?? [48, 16], seed = o.seed ?? 7
  const z = (p.depth ?? 18) + (p.slope ?? .2) * (x - (p.x ?? 0)), dy = y - p.y
  let ph = k * Math.sqrt(dy * dy + z * z) + w * fbm2(x / sx, y / sy, 3, seed)
  for (const [kx, ky, kr] of o.knots ?? []) { const dx = x - kx, dk = y - ky; ph += .9 * Math.exp(-(dx * dx + dk * dk) / (kr * kr)) }
  return ph
}

/** The board's rings, phase and flecks over `box` (default the grid), baked. */
export function woodRings(grid: GridConfig, o: WoodOptions = {}): Wood {
  const { cols, rows } = grid, box = o.box ?? [0, 0, cols - 1, rows - 1], seed = o.seed ?? 7, share = o.flecks ?? .35
  const phase = createRaster(grid, 'card', box), ring = createRaster(grid, 'card', box), fleck = createRaster(grid, 'card', box)
  for (let r = Math.max(0, box[1]); r <= Math.min(rows - 1, box[3]); r++) for (let c = Math.max(0, box[0]); c <= Math.min(cols - 1, box[2]); c++) {
    const i = r * cols + c, ph = woodPhase(c, r, o)
    phase.data[i] = ph; ring.data[i] = ph - Math.floor(ph)
    const v = voronoi2(c / 18, r / 3, seed + 1)
    if (v.f1 < .17 && hash01(v.id, seed) < share) fleck.data[i] = 1
    for (const [kx, ky, kr] of o.knots ?? []) if (Math.hypot(c - kx, r - ky) < kr / 3) fleck.data[i] = 2
  }
  return { phase, ring, fleck }
}
