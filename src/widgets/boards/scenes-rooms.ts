/**
 * Two rooms (src/engine/sdf3d): POSTS, a field of posts walked through toward a low red sun, their long soft shadows
 * streaming back through fog that thickens with distance; and CHAIN, four elongated-torus links and a red bob
 * swinging in front of a wall that catches their shadow. Both pure functions of t.
 */
import { dcos, dsin } from '../../engine/noise/dmath'
import { normalize, type V3 } from '../../engine/sdf3d/march'
import { opElongate, opLimitedRepetition } from '../../engine/sdf3d/ops'
import { sdBox, sdSphere, sdTorus, sdVerticalCapsule } from '../../engine/sdf3d/prims'
import type { Scene } from '../../engine/sdf3d/render'
import type { WidgetPreset } from '../types'
import { ACCENT, CREDIT_FOG, CREDIT_SHADOW, FLOOR, GROUND, STONE, albedo, camera, caption, footer, pad, phase, scenePlate, tile } from './scenes-kit'

const K = 2

// ── 03 POSTS ── a field of posts (vertical capsules, repeated 1.6 apart, nine across and forty deep) on a flat
// floor, walked through down the middle lane at a steady pace; the walk loops after one row, so it never ends. The
// sun sits just over the horizon at the end of the lane: its disc is the red, the fog thickens with distance and
// warms toward it, a thin height fog lies on the floor, and every post throws a long soft shadow back toward the eye.
const ROW = 1.6, PACE = .35
const post = (x: number, y: number, z: number) => sdVerticalCapsule(x, y, z, 2, .13)
const posts = opLimitedRepetition(post, ROW, 4, 0, 40)
const POSTS_SUN = normalize([0, .07, 1]) as V3
export const scPosts: WidgetPreset = {
  id: 'sc-posts', name: 'Scenes Posts', label: 'POSTS', ...tile, credit: CREDIT_FOG,
  layers: ctx => {
    const walked = ctx.t * PACE, z = phase(walked, ROW) * ROW
    const plate = scenePlate(K, (r): Scene => ({
      sd: posts, box: [-6.6, 0, -2, 6.6, 2.15, 66], planes: [GROUND], tmax: 60, steps: 120,
      cam: camera([.8, .95, z], [.8, 1.25, z + 10], 1.9, r), sun: POSTS_SUN, sunDisc: dcos(.065),
      material: (_x, _y, _z, plane) => (plane >= 0 ? FLOOR : STONE), albedo, shadow: { w: .05, maxt: 16 }, occ: .25,
      fog: { b: .085, base: [.002, .0025, .003], sun: [.15, .12, .085], height: [.03, 1.4] }, gain: [2.4, 2, 1.5], exposure: 1.6,
    }))
    return [
      caption('FOG=1-EXP(-T*B)'),
      plate.layer,
      ...footer(`ROW ${pad(walked / ROW + 1, 3)}`, 'B .085'),
    ]
  },
}

// ── 04 CHAIN ── a link is a torus elongated along y (opElongate), every other one turned a quarter round y so they
// interlock. Four hang from a bracket with a red bob at the end; the whole chain swings like a pendulum and turns
// slowly on itself. The sun comes from front left, so the shadow falls on the wall behind, sharp where the chain is
// near the wall and soft further out (Aaltonen's soft shadow).
const R = .21, TUBE = .062, LE = .13, PITCH = 2 * (LE + R - TUBE) + .006, LINKS = 4, PIVOT = 3, WALL_Z = .95
const link = opElongate((x, y, z) => sdTorus(x, z, y, R, TUBE), 0, LE, 0)
const CHAIN_SUN = normalize([-.72, .5, -.48]) as V3
export const scChain: WidgetPreset = {
  id: 'sc-chain', name: 'Scenes Chain', label: 'CHAIN', ...tile, credit: CREDIT_SHADOW,
  layers: ctx => {
    const swing = .32 * dsin(ctx.t * 1.15), spin = ctx.t * .25
    const cs = dcos(swing), ss = dsin(swing), cy = dcos(spin), sy = dsin(spin)
    const BOB = PIVOT - LINKS * PITCH - .16
    // chain space: origin at the pivot, swung round z by `swing` and spun round its own axis by `spin`
    const local = (x: number, y: number, z: number, out: V3) => {
      const px = x, py = y - PIVOT, qx = cs * px + ss * py, qy = -ss * px + cs * py
      out[0] = cy * qx - sy * z; out[1] = qy; out[2] = sy * qx + cy * z
      return out
    }
    const q: V3 = new Float64Array(3)
    const chain = (x: number, y: number, z: number) => {
      local(x, y, z, q)
      // the links near this height only (each link is one PITCH long), the bob below the last
      const i = Math.min(LINKS - 1, Math.max(0, Math.floor(-q[1] / PITCH)))
      let d = 1e9
      for (let n = Math.max(0, i - 1); n <= Math.min(LINKS - 1, i + 1); n++) {
        const ly = q[1] + (n + .5) * PITCH
        d = Math.min(d, n % 2 ? link(q[2], ly, -q[0]) : link(q[0], ly, q[2]))
      }
      return d
    }
    const bob = (x: number, y: number, z: number) => { local(x, y, z, q); return sdSphere(q[0], q[1] - (BOB - PIVOT), q[2], .26) }
    const bracket = (x: number, y: number, z: number) => sdBox(x, y - PIVOT - .1, z - .47, .14, .07, .49)
    const sd = (x: number, y: number, z: number) => Math.min(chain(x, y, z), bob(x, y, z), bracket(x, y, z))
    const plate = scenePlate(K, (r): Scene => ({
      sd, box: [-1.4, 0, -.6, 1.4, PIVOT + .2, WALL_Z], planes: [GROUND, [0, 0, -1, WALL_Z]],
      cam: camera([0, 1.6, -4.3], [.15, 1.55, 0], 2.15, r), sun: CHAIN_SUN, tmax: 14, steps: 110,
      material: (x, y, z, plane) => (plane >= 0 ? FLOOR : bob(x, y, z) < chain(x, y, z) ? ACCENT : STONE),
      albedo, shadow: { w: .05, maxt: 8 }, occ: .2,
      fog: { b: .05, base: [.002, .0025, .003], sun: [.12, .1, .08] }, gain: [1.8, 2.2, 1.8], exposure: 1.6,
    }))
    return [
      caption('Q=P-CLAMP(P,-H,H)'),
      plate.layer,
      ...footer(`SWING ${swing < 0 ? '-' : '+'}${pad(Math.abs(swing) * 180 / Math.PI, 2)}`, `${LINKS} LINKS`),
    ]
  },
}
