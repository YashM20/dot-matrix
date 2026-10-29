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
export const fireflies: Fireflies = createFireflies({ seed: 480, tiles: FLY_TILES, lead: 25, period: 40, seam: 3 })
const raster = createTileRaster({ cols: 144, rows: 144 }, FLY_TILES)

export const pondFireflies: WidgetPreset = {
  id: 'pond-fireflies', name: 'Pond Fireflies', label: '04  FIREFLIES', ...tile, fps: 20, controls: touch('flies', 'Set off a flash'),
  layers: ctx => {
    mainThread()
    const s = worldAt(fireflies.world, ctx.t, frameOf(ctx, 'flies'))
    drawFireflies(fireflies, s, ctx.t, hourNow(), raster)
    return [caption(`SYNC ${Math.round(100 * flySync(fireflies, s))}%`), ...tileLayers(raster)]
  },
}
