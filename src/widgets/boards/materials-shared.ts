/**
 * The materials board's shared plumbing (docs/living-matter/M-materials.md §2): the card shell, the board light
 * (`matLight`), lazy bakes, scratch rasters and the 1.5 lattice. Used by `materials.ts` (M1) and the M2 card files
 * (`materials-glass.ts`, `materials-pool.ts`, `materials-wear.ts`), which `materials.ts` gathers into one board.
 */
import { rake } from '../../engine/matter/relief'
import type { Light } from '../../engine/light/shade'
import { hourOf } from '../../engine/light/material'
import { sceneLight, type SceneLightInput } from '../../engine/light/input'
import { createRaster, rasterWindow, sample, type Raster } from '../../engine/raster/raster'
import { latticeGrid } from '../../engine/sampler/gridSampler'
export { frameMemo } from '../../engine/sampler/repeat'
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
/** Top-right: what the card is built on, in `mid` (`faint` is too dim for text). */
export const cite = (s: string) => layer(cap(s, 143, 1, 'right'), 'mid')

export interface MatLightOptions {
  /** The normals' lattice (card cells per dot) and its origin, to map the pointer (default: card pitch). */
  lattice?: number; origin?: [number, number]
  /** The pointer torch: height above the surface and falloff, cells of the normals' grid. */
  torch?: { height: number; falloff?: number }
  /** Clamp the elevation of a directional light to 8°..18° (engraving). Torches pass through. */
  rake?: boolean
  /** Keep the torch on a pressed pointer too (a dragged knob keeps its light instead of jumping to the sun). */
  pressed?: boolean
  /** The sky alone: tilt, else the sun, never the hovering pointer (the window's panes are lit from outside). */
  sky?: boolean
  /** Clamp a raked light to this elevation instead of 18° (sand grooves read at 22°). */
  rakeHi?: number
}
/** What `matLight` last resolved (input and light), for the checks (M3.10: each card's light equals `sceneLight`). */
export const lightTrace: { on: boolean; calls: { input: SceneLightInput; light: Light }[] } = { on: false, calls: [] }
/**
 * The board light: a thin wrapper over `sceneLight` (M rule 8) that adds nothing to its order. It passes the pointer
 * while it hovers this card (mapped onto the normals' lattice), the card's torch, and `rake` when asked. No card
 * decodes the hub keys itself: tilt reaches every lit card through here (M3.10).
 */
export function matLight(ctx: WidgetContext, o: MatLightOptions = {}): Light {
  const p = o.sky ? undefined : ctx.pointers?.find(q => q.inside && !q.up && (o.pressed || !q.down)), k = o.lattice ?? 1, [ox, oy] = o.origin ?? [0, 0]
  const pointer = p ? { x: (p.x + .5 - ox) / k - .5, y: (p.y + .5 - oy) / k - .5 } : null
  const input: SceneLightInput = { pointer, data: ctx.data, hour: hourOf(new Date()), torch: o.torch }, L = sceneLight(input)
  if (lightTrace.on) lightTrace.calls.push({ input, light: L })
  return o.rake ? rake(L, o.rakeHi) : L
}

/**
 * A torch snapped to a q-cell grid (directional lights pass through): a moving pointer then repeats the same light for
 * a few frames, so per-light shading caches hit while it sweeps (a torch 30–40 cells up moves its light imperceptibly).
 */
export function snapTorch(L: Light, q: number): Light {
  if (Array.isArray(L)) return L
  const p = L as { at: readonly [number, number, number]; falloff?: number }
  return { ...p, at: [Math.round(p.at[0] / q) * q, Math.round(p.at[1] / q) * q, p.at[2]] }
}
/** A light as an exact frame-memo key: every digit (a light that moved at all draws again). */
export const lightId = (L: Light) => JSON.stringify(L)
/** A copy of a scratch raster, for a frame `frameMemo` hands out again (the next frame that changes rewrites the scratch). */
export const own = (r: Raster): Raster => ({ ...r, data: r.data.slice(), bounds: r.bounds && [r.bounds[0], r.bounds[1], r.bounds[2], r.bounds[3]] })
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
/** A card-cell mask down-sampled to the 1.5 lattice: a lattice cell is lit when ≥ 50% of the card cells in it are. */
export function toLattice15(m: Raster): Raster {
  const out = createRaster(LG15), cols = TILE.cols, [b0, b1, b2, b3] = rasterWindow(m)
  // lattice cell j covers card rows ⌈1.5j − ½⌉ … < 1.5(j + 1) − ½: only cells over the mask's bounds can be lit
  const ja = Math.max(0, Math.floor((b1 + .5) / L15) - 1), jb = Math.min(LG15.rows - 1, Math.ceil((b3 + .5) / L15))
  const ia = Math.max(0, Math.floor((b0 + .5) / L15) - 1), ib = Math.min(LG15.cols - 1, Math.ceil((b2 + .5) / L15))
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    let lit = 0, all = 0
    for (let r = Math.ceil(j * L15 - .5); r < (j + 1) * L15 - .5; r++) for (let c = Math.ceil(i * L15 - .5); c < (i + 1) * L15 - .5; c++) { all++; lit += m.data[r * cols + c] }
    if (all && lit / all >= .5) out.data[j * LG15.cols + i] = 1
  }
  return out
}

/**
 * A light as a cache key (M3.10): the hub's light is bucketed (64 azimuths × 8 elevations) and the sun is fixed for an
 * hour, so a per-card cache keyed by this hits across frames; a moving torch (snap it with `snapTorch`) misses.
 */
export const lightKey = (L: Light) => (Array.isArray(L) ? (L as readonly number[]).map(x => x.toFixed(5)).join(',') : `${(L as { at: readonly number[] }).at.map(x => x.toFixed(3)).join(',')}|${(L as { falloff?: number }).falloff ?? 0}`)
/** A small LRU (default 8 entries: a card's per-light shadings, M3.10). */
export function lru<V>(size = 8): (key: string, make: () => V) => V {
  const m = new Map<string, V>()
  return (key, make) => {
    const hit = m.get(key)
    if (hit !== undefined) { m.delete(key); m.set(key, hit); return hit }
    const v = make()
    m.set(key, v)
    if (m.size > size) m.delete(m.keys().next().value!)
    return v
  }
}
/** FNV-1a 32 over a typed array's bytes (`h` chains a second array on): the probes' cross-engine hash of a pristine run. */
export function fnvBytes(a: ArrayBufferView, h = 0x811c9dc5): number {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  for (let i = 0; i < b.length; i++) h = Math.imul(h ^ b[i], 16777619) >>> 0
  return h
}
