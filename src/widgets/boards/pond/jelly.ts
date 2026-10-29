/**
 * 02 JELLY (docs/living-matter/L-pond.md §L2 `pond-jelly`): three moon jellies pulse, coast and sink, trailing
 * rope tentacles through a curl-noise current; their pulses drift into loose sync (Kuramoto). The gonads' red
 * horseshoes are the accent. Tap and they all pulse at once; move the pointer (or drag once engaged) to push the water.
 */
import { createJelly, createTileRaster, drawJelly, tileLayers, type Jelly, type TileGrid } from '../../../engine/life'
import { worldAt } from '../../../engine/physics/world'
import type { WidgetPreset } from '../../types'
import { caption, frameOf, mainThread, tile, touch } from './shared'

export const JELLY_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
export const jelly: Jelly = createJelly({
  seed: 480, tiles: JELLY_TILES,
  bells: [{ r: 13, period: 1.8, x: 46, y: 62 }, { r: 11, period: 2.1, x: 104, y: 46 }, { r: 9, period: 2.4, x: 92, y: 104 }],
  lead: 6, period: 40, seam: 3,
})
const raster = createTileRaster({ cols: 144, rows: 144 }, JELLY_TILES)

export const pondJelly: WidgetPreset = {
  id: 'pond-jelly', name: 'Pond Jelly', label: '02  JELLY', ...tile, fps: 20, controls: touch('jelly', 'Make them pulse'),
  layers: ctx => {
    mainThread()
    const s = worldAt(jelly.world, ctx.t, frameOf(ctx, 'jelly'))
    drawJelly(jelly, s, ctx.t, raster)
    return [caption('AURELIA'), ...tileLayers(raster)]
  },
}
