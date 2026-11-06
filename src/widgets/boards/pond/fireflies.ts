/**
 * 04 FIREFLIES (docs/living-matter/L-pond.md §L2 `pond-fireflies`): 160 fireflies over a meadow of L-system grass
 * fall into step flash by flash (Mirollo–Strogatz pulse coupling, local). A gust scrambles a patch of them every
 * 20 s and the re-sync wave crosses the meadow. The flash is the accent. Hover to scatter their rhythm, tap to set
 * off a burst. The caption is the swarm's order parameter (100 % = all in step).
 */
import { createFireflies, createTileRaster, drawFireflies, flySync, tileLayers, type Fireflies, type TileGrid } from '../../../engine/life'
import { worldAt } from '../../../engine/physics/world'
import type { WidgetPreset } from '../../types'
import { caption, frameOf, hourNow, mainThread, tile, touch } from './shared'

export const FLY_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
export const fireflies: Fireflies = createFireflies({ seed: 480, tiles: FLY_TILES, lead: 24, period: 40, seam: 3 })
const raster = createTileRaster({ cols: 144, rows: 144 }, FLY_TILES)
/** The reduced-motion still: a flash peak of the pristine run, 145 of the 160 flies lit in step (t = 0 shows two). */
export const FLY_STILL_T = 25.167

export const pondFireflies: WidgetPreset = {
  id: 'pond-fireflies', name: 'Pond Fireflies', label: '04  FIREFLIES', ...tile, fps: 20, controls: touch('flies', 'Set off a flash'),
  credit: { by: ['Renato E. Mirollo', 'Steven H. Strogatz'], title: 'Synchronization of pulse-coupled biological oscillators (1990)', source: 'https://doi.org/10.1137/0150098', note: 'the flash coupling' },
  layers: ctx => {
    mainThread()
    const t = ctx.reducedMotion ? FLY_STILL_T : ctx.t, s = worldAt(fireflies.world, t, frameOf(ctx, 'flies'))
    drawFireflies(fireflies, s, t, hourNow(), raster)
    return [caption(`SYNC ${Math.round(100 * flySync(fireflies, s))}%`), ...tileLayers(raster)]
  },
}
