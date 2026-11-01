/**
 * 05 MURMUR (docs/living-matter/L-pond.md §L2 `pond-murmur`): 400 starlings, each watching its seven nearest
 * (topological boids, Ballerini et al. 2008), fold and turn as one sheet of line glyphs. A falcon (the accent) hunts
 * on a Lissajous path; birds near it flee and the alarm runs through the flock as a dark band (Procaccini et al.).
 * On a desktop the cursor is the falcon and a click is a swoop; on touch a tap swoops, a held drag steers it.
 */
import { createMurmur, createTileRaster, drawMurmur, tileLayers, type Murmur, type TileGrid } from '../../../engine/life'
import { worldAt } from '../../../engine/physics/world'
import type { WidgetPreset } from '../../types'
import { caption, frameOf, mainThread, tile, touch } from './shared'

export const MURMUR_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
export const murmur: Murmur = createMurmur({ seed: 480, tiles: MURMUR_TILES, lead: 8, period: 40, seam: 3 })
const raster = createTileRaster({ cols: 144, rows: 144 }, MURMUR_TILES)

export const pondMurmur: WidgetPreset = {
  id: 'pond-murmur', name: 'Pond Murmur', label: '05  MURMUR', ...tile, fps: 24, controls: touch('murmur', 'Swoop'),
  layers: ctx => {
    mainThread()
    const s = worldAt(murmur.world, ctx.t, frameOf(ctx, 'murmur'))
    drawMurmur(murmur, s, raster)
    return [caption('400 BIRDS'), ...tileLayers(raster)]
  },
}
