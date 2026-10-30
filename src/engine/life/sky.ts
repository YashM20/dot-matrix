/**
 * Day and night for the pond's scenes (docs/living-matter/L-pond.md §L3.3). Render-only: nothing here enters a
 * `step`, so a world is the same at any hour and only the drawing changes. Night is 1 from 21:00 to 05:00, day is 0
 * from 07:00 to 19:00, and dusk (19–21) and dawn (5–7) ramp linearly between them. A scene turns a tile to its
 * night look where the tile's STBN threshold is below the night level (`nightTile`), so a ramp spreads as blue
 * noise over the scene instead of switching every tile at once. At 0 (any daytime hour, the golden clock 09:41)
 * no tile is a night tile, so day frames are exactly the frames of a scene without night.
 */
import { stbn } from '../halftone/mask'
import { dsin } from '../noise'

/** Night level of a fractional hour: 0 by day (07–19), 1 by night (21–05), linear over dusk and dawn. */
export function nightness(hour: number): number {
  const h = ((hour % 24) + 24) % 24
  if (h >= 7 && h <= 19) return 0
  if (h >= 21 || h <= 5) return 1
  return h < 7 ? (7 - h) / 2 : (h - 19) / 2
}
/** Is tile (tx, ty) drawn its night way at night level `n`? (STBN dither; never at n = 0, always at n = 1.) */
export const nightTile = (tx: number, ty: number, n: number): boolean => n > 0 && (n >= 1 || stbn(tx, ty) < n)

/**
 * Where the moon's reflection falls, as a fraction 0..1 across the scene (left to right), for a night hour. The moon
 * walks the sun's arc at night (light/material.ts `sunAt`: up on the left at 18, down on the right at 6); seen from
 * above, its reflection slides with it. A sine of the arc, so it lingers mid-pond around midnight.
 */
export function moonAcross(hour: number): number {
  const h = ((hour % 24) + 24) % 24, p = (h >= 18 ? h - 18 : h + 6) / 12
  return .5 + .38 * dsin(Math.PI * (p - .5))
}
