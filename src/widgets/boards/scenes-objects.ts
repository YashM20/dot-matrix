/**
 * Two objects on a floor (src/engine/sdf3d): LATHE, a vase turned from a 2D profile (revolution, onion) under a sun
 * that circles it, and TWIST, a star column extruded from a 2D hexagram and twisted, with a red ring riding up and
 * down it. Both pure functions of t.
 */
import { dcos, dsin } from '../../engine/noise/dmath'
import { sdCircle, sdTrapezoid } from '../../engine/sdf/basic'
import { sdHexagram } from '../../engine/sdf/polygons'
import { sminQuad } from '../../engine/sdf/smin'
import type { V3 } from '../../engine/sdf3d/march'
import { onion, opExtrusion, opRevolution, opRound, opTwist } from '../../engine/sdf3d/ops'
import { sdTorus } from '../../engine/sdf3d/prims'
import type { Scene } from '../../engine/sdf3d/render'
import type { WidgetPreset } from '../types'
import { ACCENT, CREDIT_SDF, FLOOR, GROUND, STONE, albedo, camera, caption, footer, pad, scenePlate, tile } from './scenes-kit'

const K = 2
const sunAt = (az: number, el: number): V3 => [dcos(el) * dcos(az), dsin(el), dcos(el) * dsin(az)]
const deg = (a: number) => Math.round(((a * 180 / Math.PI) % 360 + 360) % 360)
/** What the two cards share: the floor, the dark fog that warms toward the sun, the light. */
const room = { planes: [GROUND], albedo, tmax: 14, occ: .25, fog: { b: .1, base: [.002, .0025, .003] as V3, sun: [.12, .1, .08] as V3 }, gain: [1.1, 2.2, 1.8] as V3, exposure: 1.6 }

// ── 01 LATHE ── the profile is a 2D SDF in (distance from the axis, height): a belly circle melted into a flared
// neck, revolved round y. The onion turns it into a .03 shell, the plane y = MOUTH opens it, and the inside of the
// shell (where the solid profile is negative) is the red. The sun circles once every 14 s, so its shadow sweeps the
// floor and the light moves across the belly.
const MOUTH = 1.4, WALL = .03
const profile = (r: number, y: number) => sminQuad(sdCircle(r, y - .62, .5), sdTrapezoid(r, y - 1.15, .13, .3, .27), .06)
const solid = opRevolution(profile, 0)
const vase = (x: number, y: number, z: number) => Math.max(onion(solid(x, y, z), WALL), y - MOUTH)
export const scLathe: WidgetPreset = {
  id: 'sc-lathe', name: 'Scenes Lathe', label: 'LATHE', ...tile, credit: CREDIT_SDF,
  layers: ctx => {
    const az = ctx.t * (Math.PI * 2 / 14) - 2.8
    const plate = scenePlate(K, (rows): Scene => ({
      ...room, sd: vase, box: [-.56, 0, -.56, .56, MOUTH + .01, .56],
      cam: camera([0, 2.75, -3.2], [0, .62, 0], 2.75, rows), sun: sunAt(az, .62),
      material: (x, y, z, plane) => (plane >= 0 ? FLOOR : solid(x, y, z) < 0 ? ACCENT : STONE),
      shadow: { w: .08, maxt: 6 },
    }))
    return [
      caption('SD2(|P.XZ|,P.Y)'),
      plate.layer,
      ...footer(`SUN ${pad(deg(az), 3)}`, `ONION .0${WALL * 100}`),
    ]
  },
}

// ── 02 TWIST ── a hexagram extruded 2 units tall (opExtrusion works in xy, so the column is drawn in x, z, y),
// rounded, then twisted round y by a rate that swings between ±2 rad a unit. The twist is a bound, so the march
// steps at .55. A red torus rides up and down the column, tilted a little, and throws its soft shadow on it.
const star = (a: number, b: number) => sdHexagram(a, b, .19)
const prism = opRound(opExtrusion(star, .95), .035)
export const scTwist: WidgetPreset = {
  id: 'sc-twist', name: 'Scenes Twist', label: 'TWIST', ...tile, credit: CREDIT_SDF,
  layers: ctx => {
    const k = 2 * dsin(ctx.t * .4 + .3), ry = 1.05 + .62 * dsin(ctx.t * .7 + 1), tilt = .22 * dsin(ctx.t * .5)
    const column = opTwist((x, y, z) => prism(x, z, y - 1.05), k)
    const ct = dcos(tilt), st = dsin(tilt)
    const ring = (x: number, y: number, z: number) => { const yy = y - ry; return sdTorus(ct * x + st * yy, -st * x + ct * yy, z, .64, .06) }
    const sd = (x: number, y: number, z: number) => Math.min(column(x, y, z), ring(x, y, z))
    const plate = scenePlate(K, (rows): Scene => ({
      ...room, sd, box: [-.8, 0, -.8, .8, 2.1, .8], stepScale: .55, steps: 140,
      cam: camera([2, 1.7, -3], [0, 1, 0], 2.45, rows), sun: sunAt(-2.2, .7),
      material: (x, y, z, plane) => (plane >= 0 ? FLOOR : ring(x, y, z) < column(x, y, z) ? ACCENT : STONE),
      shadow: { w: .06, maxt: 6 },
    }))
    return [
      caption('Q=ROT(K*P.Y)*P.XZ'),
      plate.layer,
      ...footer(`K ${k < 0 ? '-' : '+'}${Math.abs(k).toFixed(2)}`, `RING Y ${ry.toFixed(2)}`),
    ]
  },
}
