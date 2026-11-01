/**
 * 07 MARBLE (docs/living-matter/X-advanced.md #1): suminagashi, closed-form marbling, in glyph tiles. The day's ink
 * (rings of sumi and grey laid at four or five stations, raked and swirled, then one beni ring, the newest drop) is
 * combed by three pale koi swimming beneath it: each fish's last ten seconds of path is a curved tine stroke, so the
 * water keeps a fading memory of where they went. Tap to drop ink (the newest drop is the red one); drag to comb it.
 * Pristine and looped (48 s) until touched; the visitor's ink heals back into the water 6 s after the last input.
 * The date (`day`, X1 #5) picks the pattern: day 0 is the canonical pattern the goldens pin.
 */
import { createMarble, createTileRaster, drawMarble, marbleDrops, marbleStrokes, tileLayers, type Marble, type MarbleSpec, type TileGrid } from '../../../engine/life'
import { ihash } from '../../../engine/noise/dmath'
import { worldAt } from '../../../engine/physics/world'
import type { WidgetPreset } from '../../types'
import { dayLabel } from './day'
import { caption, frameOf, mainThread, tile, touch } from './shared'

export const MARBLE_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
/** The basin: a superellipse (|x−72|/66)⁴ + (|y−77|/62)⁴ − 1 (× 30), the koi pond's outline without the rocks. */
export function marbleSdf(x: number, y: number): number {
  const ex = (x - 72) / 66, ey = (y - 77) / 62, e2 = ex * ex, f2 = ey * ey
  return (e2 * e2 + f2 * f2 - 1) * 30
}
export const MARBLE_SPEC: MarbleSpec = {
  seed: 480, tiles: MARBLE_TILES, card: { cols: 144, rows: 144 }, sdf: marbleSdf,
  koi: [{ length: 42 }, { length: 38 }, { length: 34 }], period: 48,
}
/** The canonical marble (day 0): goldens, Node checks and reduced motion read it. */
export const marble: Marble = createMarble(MARBLE_SPEC)
let today: { day: number; m: Marble } = { day: 0, m: marble }
/** The marble of day index `day` (0 = the canonical one); the last day's is kept, one bake per day. */
export function marbleFor(day: number): Marble {
  if (!day) return marble
  if (today.day !== day) today = { day, m: createMarble({ ...MARBLE_SPEC, seed: ihash(480, day, 0x3a) & 0xffffff }) }
  return today.m
}
/** The marble the card drew last (the probe and the board's world list follow it). */
export let marbleNow: Marble = marble
const raster = createTileRaster(MARBLE_SPEC.card, MARBLE_TILES)

export const pondMarble: WidgetPreset = {
  id: 'pond-marble', name: 'Pond Marble', label: '07  MARBLE', ...tile, fps: 20,
  defaults: { day: 0, age: 0 },
  controls: touch('marble', 'Drop ink'),
  layers: ctx => {
    mainThread()
    const day = ctx.data.day ?? 0, m = marbleFor(day)
    marbleNow = m
    const s = worldAt(m.world, ctx.t, frameOf(ctx, 'marble'))
    drawMarble(m, s, ctx.t, raster)
    return [caption(day ? dayLabel(day) : 'SUMINAGASHI'), ...tileLayers(raster)]
  },
}
/** Read-outs for the checks and the browser probe. */
export const marbleProbe = {
  get m() { return marbleNow }, raster,
  drops: (s: Float32Array) => marbleDrops(s),
  strokes: (s: Float32Array) => marbleStrokes(s),
}
