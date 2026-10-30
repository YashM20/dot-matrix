/**
 * 06 TERRARIUM (docs/living-matter/L-pond.md §L2 `pond-terrarium`): a floor seen from above. A creeper grows toward
 * the sun by space colonisation (Runions et al. 2007; its sunny side follows the hour), thick stems as lattice dots,
 * the newest growth in red (the accent); ninety ants lay home and food trails between their nest and the crumbs.
 * Tap to drop a crumb; hold to light a lamp the ants shy away from.
 */
import { antViews, createTerrarium, createTileRaster, creeperFor, crumbViews, drawTerrarium, terraLamp, tileLayers, type Terrarium, type TileGrid } from '../../../engine/life'
import { sunAt } from '../../../engine/light/material'
import { worldAt } from '../../../engine/physics/world'
import type { Layer } from '../../../engine/types'
import { layer, type WidgetPreset } from '../../types'
import { caption, frameOf, hourNow, mainThread, T, tile, timeOfDay, touch } from './shared'

export const TERRA_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
export const terrarium: Terrarium = createTerrarium({
  seed: 480, tiles: TERRA_TILES, nest: [34, 116], root: [12, 20],
  crumbs: [[104, 112], [70, 58], [126, 46]],
  drops: [[14, 120, 82], [30, 64, 40], [44, 96, 128]],
  lead: 10, period: 60, seam: 3,
})
const raster = createTileRaster({ cols: 144, rows: 144 }, TERRA_TILES)
/** The sun's direction on the floor for an hour (x right, y down), from the light hub's sun path. */
export function sunOnFloor(hour: number): [number, number] {
  const d = sunAt(hour), l = Math.hypot(d[0], d[1]) || 1
  return [d[0] / l, d[1] / l]
}
/** The creeper of the current hour bucket (cached in grow.ts, two buckets kept). */
export const creeperNow = (hour: number) => creeperFor(terrarium, Math.floor(hour), sunOnFloor(Math.floor(hour) + .5))

export const pondTerrarium: WidgetPreset = {
  id: 'pond-terrarium', name: 'Pond Terrarium', label: '06  TERRARIUM', ...tile, fps: 12, controls: touch('terra', 'Drop a crumb'),
  layers: ctx => {
    mainThread()
    const s = worldAt(terrarium.world, ctx.t, frameOf(ctx, 'terra')), hour = hourNow()
    drawTerrarium(terrarium, s, creeperNow(hour), ctx.t, raster, terraLamp(terrarium, s))
    const ants = antViews(terrarium, s), crumbs = crumbViews(terrarium, s).filter(c => c.bites >= 1)
    const out: Layer[] = [caption(timeOfDay(hour)), ...tileLayers(raster)]
    if (crumbs.length) out.push(layer(T.dots(crumbs.map(c => [c.x, c.y]), 2.2), 'value'))
    out.push(layer(T.dots(ants.map(a => [a.x, a.y]), 1), 'idle'))
    const loads = ants.filter(a => a.carrying).map(a => [a.x, a.y - 1.5] as [number, number])
    if (loads.length) out.push(layer(T.dots(loads, .8), 'value'))
    return out
  },
}
