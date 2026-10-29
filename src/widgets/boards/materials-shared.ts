/**
 * The materials board's shared plumbing (docs/living-matter/M-materials.md §2): the card shell, the board light
 * (`matLight`), lazy bakes, scratch rasters and the 1.5 lattice. Used by `materials.ts` (M1) and the M2 card files
 * (`materials-glass.ts`, `materials-pool.ts`, `materials-wear.ts`), which `materials.ts` gathers into one board.
 */
import { rake } from '../../engine/matter/relief'
import type { Light } from '../../engine/light/shade'
import { hourOf } from '../../engine/light/material'
import { sceneLight } from '../../engine/light/input'
import { createRaster, sample, type Raster } from '../../engine/raster/raster'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Field, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext } from '../types'

export const T = layoutFor(TILE)
export type Pt = [number, number]
export type Box = [number, number, number, number]
export const DEG = Math.PI / 180, TAU = Math.PI * 2
export const mod = (a: number, n: number) => ((a % n) + n) % n
export const pad2 = (n: number) => String(n).padStart(2, '0')
/** Lazily baked once, on first use (never at import: opening the board doesn't stall). */
export const once = <V>(make: () => V) => { let v: V | undefined; return () => (v ??= make()) }

/** The light hub's fixture values (F0): every card declares them, or `Board.tsx` never passes them in. */
export const LIGHT_DEFAULTS = { lightSrc: 0, lightAz: 0, lightEl: 7, tx: 0, ty: 0 } as const
export const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
/** Caption tier (0.72 lattice), as on the algorithms board. */
export const cap = (s: string, col: number, row: number, align?: 'left' | 'center' | 'right') => T.big(s, col, row, { lattice: .72, align })
/** Top-right: what the card is built on, faint. */
export const cite = (s: string) => layer(cap(s, 143, 1, 'right'), 'faint')

export interface MatLightOptions {
  /** The normals' lattice (card cells per dot) and its origin, to map the pointer (default: card pitch). */
  lattice?: number; origin?: [number, number]
  /** The pointer torch: height above the surface and falloff, cells of the normals' grid. */
  torch?: { height: number; falloff?: number }
  /** Clamp the elevation of a directional light to 8°..18° (engraving). Torches pass through. */
  rake?: boolean
  /** Keep the torch on a pressed pointer too (a dragged knob keeps its light instead of jumping to the sun). */
  pressed?: boolean
}
/**
 * The board light: a thin wrapper over `sceneLight` (M rule 8) that adds nothing to its order. It passes the pointer
 * while it hovers this card (mapped onto the normals' lattice), the card's torch, and `rake` when asked.
 */
export function matLight(ctx: WidgetContext, o: MatLightOptions = {}): Light {
  const p = ctx.pointers?.find(q => q.inside && !q.up && (o.pressed || !q.down)), k = o.lattice ?? 1, [ox, oy] = o.origin ?? [0, 0]
  const pointer = p ? { x: (p.x + .5 - ox) / k - .5, y: (p.y + .5 - oy) / k - .5 } : null
  const L = sceneLight({ pointer, data: ctx.data, hour: hourOf(new Date()), torch: o.torch })
  return o.rake ? rake(L) : L
}

/** Scratch rasters per card, allocated on first use and reused every frame. */
export function scratch(n: number, grid = TILE): () => Raster[] { return once(() => Array.from({ length: n }, () => createRaster(grid))) }
/** A raster's values as a layer (nearest), on a lattice or card pitch. */
export const rasterLayer = (r: Raster, tone: Tone, k?: number): Layer => (k ? { field: sample(r), tone, lattice: k, origin: [0, 0] } : { field: sample(r), tone })
/** Sites with a per-site value (one field reads it back by position). */
export function valuedSites(points: readonly (readonly [number, number, number])[], size: number): Omit<Layer, 'tone'> {
  const sites = points.map(p => [p[0], p[1]] as Pt), N = TILE.cols - 1
  const field: Field = (u, v) => {
    const x = u * N, y = v * N
    for (const p of points) if (Math.abs(p[0] - x) < 1e-3 && Math.abs(p[1] - y) < 1e-3) return p[2]
    return 0
  }
  return { field, sites, size }
}
export const L15 = 1.5, LG15 = latticeGrid(TILE, L15)
/** Card cell ↔ 1.5-lattice cell (the sampler's lattice placement, origin 0). */
export const toCard15 = (j: number) => (j + .5) * L15 - .5
/** Card cell → the 1.5-lattice cell it lies in, ⌊(c + ½) / 1.5⌋, tabled (the card is square: rows and columns alike). */
export const cellToLattice15 = once(() => Int32Array.from({ length: Math.max(TILE.cols, TILE.rows) }, (_, c) => Math.floor((c + .5) / L15)))
