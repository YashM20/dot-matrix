/**
 * 09 TURING (docs/living-matter/X-advanced.md #15): the pond's second species, a spotted fish whose skin is a
 * Gray-Scott reaction-diffusion pattern on its own growing body (engine/life/turing.ts). It swims in as a hatchling
 * with three spots, hovers while it grows to about 2.4× its length, and its spots divide as room opens between them;
 * then it swims off and the next one comes in. The skin sits on a 2-cell lattice, the fins are fine rays at the card
 * pitch. The spot that is splitting right now is the accent. Tap the body to scratch a patch clean; the spots around
 * it split into the gap.
 */
import { GRAY_SCOTT } from '../../creditSources'
import { ADULT_PX, bodyHalf, bodyMid, createTuring, growth, lifeOf, onBody, SKIN_NX, SKIN_NY, toBody, turingPose, turingUnits, type Pose, type Turing } from '../../../engine/life/turing'
import { skinV, spotCount, SPOT_V, turingSpots, type SpotMap } from '../../../engine/life/turingView'
import { datan2, dcos, dpow, dsin } from '../../../engine/noise/dmath'
import { worldAt, worldStep } from '../../../engine/physics/world'
import type { Field, Layer, Tone } from '../../../engine/types'
import { layer, type WidgetPreset } from '../../types'
import { caption, frameOf, mainThread, T, tile, touch } from './shared'

export const turing: Turing = createTuring({ seed: 480, period: 48, lifeAt: .14, units: 20000 })

/** The lattice the skin sits on (card cells per dot). */
const K = 2, LC = Math.floor(144 / K) - 1
let pose: Pose, state: Float32Array, spots: SpotMap, eye: [number, number, number] = [0, 0, 0], lastTone: Tone | undefined, lastU = -1, lastV = -1
const nx = SKIN_NX, ny = SKIN_NY

/** Material cell under body point (ξ, η). */
const cellOf = (x: number, y: number) => Math.min(ny - 1, Math.max(0, Math.floor(((y + 1) / 2) * ny))) * nx + Math.min(nx - 1, Math.max(0, Math.floor(x * nx)))
const skin: Field = (u, v) => {
  lastTone = undefined; lastU = u; lastV = v
  const x = u * LC * K, y = v * LC * K, ex = x - eye[0], ey = y - eye[1]
  if (ex * ex + ey * ey < (eye[2] + 1.6) ** 2) return 0
  const [bx, by] = toBody(pose, x, y)
  if (!onBody(bx, by)) return 0
  const c = skinV(turing, state, bx, by)
  if (c >= SPOT_V * .7) {
    lastTone = spots.splitting >= 0 && spots.label[cellOf(bx, by)] === spots.splitting ? 'active' : 'value'
    return c >= SPOT_V ? 1 : .8
  }
  // counter-shaded: a darker back, a paler belly
  lastTone = 'idle'
  return .42 + .14 * (by - bodyMid(bx)) / Math.max(.2, bodyHalf(bx)) + .8 * c
}
// the sampler asks for the tone after the value, not always straight after: recompute unless it is the same cell
const skinLayer: Layer = { field: skin, lattice: K, origin: [0, 0], toneOf: (_, u, v) => { if (u !== lastU || v !== lastV) skin(u, v); return lastTone } }

/** Fins at the card pitch: a forked tail that foreshortens as it beats, the dorsal, the pectoral and the anal fin, as rays. */
const fins: Field = (u, v) => {
  const x = u * 143, y = v * 143, p = pose, half = (SKIN_NY / 2) * p.py, bodyL = SKIN_NX * p.px
  const root = p.headX - bodyL, mid = p.midY
  // tail
  const tl = .3 * bodyL * (.5 + .5 * Math.abs(dcos(p.beat))), d = (root - x) / tl
  if (d > -.05 && d <= 1) {
    const dd = Math.max(0, d), sk = .18 * half * dsin(p.beat) * dd, h = half * (.17 + .62 * dpow(dd, 1.4)), dy = y - mid - sk
    if (Math.abs(dy) < h && !(dd > .62 && Math.abs(dy) < h * (dd - .62) * 1.6)) return ray(datan2(dy, dd * tl + 3), 9)
  }
  // dorsal: over ξ ∈ [.3, .74], swept back
  const [bx, by] = toBody(p, x, y)
  if (bx > .3 && bx < .78) {
    const s = (bx - .3) / .48, top = bodyMid(bx) - .96 * bodyHalf(bx), hd = .42 * dsin(Math.PI * Math.min(1, s * 1.15)) * (1 - .3 * s)
    if (by < top && by > top - hd) return ray(bx * 40 + (top - by) * 9, 0)
  }
  // anal: under ξ ∈ [.6, .86]
  if (bx > .6 && bx < .88) {
    const s = (bx - .6) / .28, bot = bodyMid(bx) + .96 * bodyHalf(bx), ha = .24 * dsin(Math.PI * s)
    if (by > bot && by < bot + ha) return ray(bx * 46 - (by - bot) * 9, 0)
  }
  // pectoral: a small fan behind the gill, fluttering
  const px = p.headX - .3 * bodyL, py = mid + .22 * half, pl = .16 * bodyL * (.75 + .25 * dsin(1.4 * p.beat)), qx = (px - x) / pl, qy = (y - py) / pl
  if (qx > 0 && qx < 1 && qy > -.1 && qy < .2 + .45 * qx) return ray(datan2(qy, qx), 8)
  return 0
}
const finBox: [number, number, number, number] = [0, 0, 143, 143]
fins.bounds = finBox
/** A ray texture: lit on `n` rays per radian of `a` (n = 0: `a` is already in ray units). */
const ray = (a: number, n: number) => { const r = n ? a * n : a, f = r - Math.floor(r); return f < .45 ? .85 : 0 }

/** Motes drifting past (the water the fish swims in): seeded, pure in t. */
const MOTES = Array.from({ length: 16 }, (_, i) => [(i * 89.3) % 144, 18 + ((i * 53.7) % 120), 1.2 + (i % 4) * .5] as const)

export const pondTuring: WidgetPreset = {
  id: 'pond-turing', name: 'Pond Turing', label: '09  TURING', ...tile, fps: 18, controls: touch('turing', 'Scratch the skin'),
  credit: [
    { by: ['Alan Turing', 'Edmund Crampin', 'Eamonn Gaffney', 'Philip Maini'], title: 'The chemical basis of morphogenesis (1952); reaction and diffusion on growing domains (1999)', source: 'https://doi.org/10.1006/bulm.1999.0131', note: 'technique' },
    GRAY_SCOTT,
    { by: ['Shigeru Kondo', 'Rihito Asai'], title: 'A reaction-diffusion wave on the skin of the marine angelfish Pomacanthus (1995)', source: 'https://doi.org/10.1038/376765a0', note: 'spots that multiply as the fish grows' },
  ],
  layers: ctx => {
    mainThread()
    state = worldAt(turing.world, ctx.t, frameOf(ctx, 'turing', turingUnits))
    const lam = lifeOf(turing, worldStep(turing.world, ctx.t)), [lx, ly] = growth(turing.spec, lam)
    pose = turingPose(turing, lam); spots = turingSpots(turing, state, lx, ly)
    const er = 1.3 + 1.5 * (pose.px / ADULT_PX)
    eye = [pose.headX - .11 * SKIN_NX * pose.px, pose.midY - .2 * (SKIN_NY / 2) * pose.py, er]
    // the fins' box: the tail's reach behind the body to the snout, the fins above and below
    const bodyL = SKIN_NX * pose.px, half = (SKIN_NY / 2) * pose.py
    finBox[0] = Math.max(0, Math.floor(pose.headX - 1.32 * bodyL)); finBox[2] = Math.min(143, Math.ceil(pose.headX))
    finBox[1] = Math.max(0, Math.floor(pose.midY - 1.5 * half)); finBox[3] = Math.min(143, Math.ceil(pose.midY + 1.4 * half))
    const n = spotCount(spots), motes: [number, number][] = []
    for (const [x0, y0, sp] of MOTES) motes.push([((x0 - sp * ctx.t) % 143 + 143) % 143, y0 + 2 * dsin(.4 * ctx.t + x0)])
    return [
      // the count, while any of the fish is in the pond
      caption(pose.headX < 0 || pose.headX - 1.3 * bodyL > 143 ? '' : n === 1 ? '1 SPOT' : `${n} SPOTS`),
      layer(T.dots(motes, .8), 'faint'),
      layer(fins, 'idle'),
      skinLayer,
      // the eye, once it is in the pond (sites never leave the card)
      ...(eye[0] - er >= 0 && eye[0] + er <= 143 ? [
        layer(T.dotRing(eye[0], eye[1], er, { spacing: 1.5, size: .9 }), 'value'),
        layer(T.dots([[eye[0] + .25 * er, eye[1]]], 1.2 + .5 * (pose.px / ADULT_PX)), 'value'),
      ] : []),
    ]
  },
}
