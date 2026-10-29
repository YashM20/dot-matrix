/**
 * 03 SLIME (docs/living-matter/L-pond.md §L2 `pond-slime`): 1,200 physarum agents (Jones 2010) find the network
 * between five food dots. The trail shows through the tile grid as veins (line glyphs along the trail where it is
 * coherent) and density glyphs; the food dots are the accent. The loop (40 s) adds a sixth food at 14 s and takes it
 * away at 30 s, so the network re-routes and heals. Tap to add or remove food.
 */
import { createSlime, createTileRaster, drawSlime, slimeFoods, tileLayers, type Slime, type TileGrid } from '../../../engine/life'
import { worldAt } from '../../../engine/physics/world'
import { layer, type WidgetPreset } from '../../types'
import { caption, frameOf, mainThread, T, tile, touch } from './shared'

export const SLIME_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
export const slime: Slime = createSlime({
  seed: 480, tiles: SLIME_TILES,
  foods: [[24, 34], [118, 30], [70, 84], [26, 126], [116, 122]],
  extra: { x: 120, y: 76, on: 14, off: 30 },
  lead: 20, period: 40, seam: 3,
})
const raster = createTileRaster({ cols: 144, rows: 144 }, SLIME_TILES)

export const pondSlime: WidgetPreset = {
  id: 'pond-slime', name: 'Pond Slime', label: '03  SLIME', ...tile, fps: 15, controls: touch('slime', 'Add or remove food'),
  layers: ctx => {
    mainThread()
    const s = worldAt(slime.world, ctx.t, frameOf(ctx, 'slime'))
    drawSlime(slime, s, raster)
    const food = slimeFoods(slime, s).filter(f => f.on).map(f => [f.x, f.y] as [number, number])
    return [caption(`${food.length} FOOD`), ...tileLayers(raster), layer(T.dots(food, 2.6), 'active')]
  },
}
