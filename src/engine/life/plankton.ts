/**
 * Plankton (docs/living-matter/X-advanced.md #4, `pond-plankton`): Particle Lenia creatures (lenia.ts) in a dish
 * under a microscope. A `World` (physics/world.ts) holds every particle's position; the step adds the dish wall,
 * the stir, a tap's burst and a pointer's drag to the Lenia descent.
 *
 * The loop: the run starts from loose seeded clumps, which pull themselves together into creatures within seconds
 * and then drift and glide. Near the end of the loop a stir (a swirl that shears the dish, strongest half way out)
 * pulls them into arcs, and the seam eases the stirred particles onto the start's clumps with a matched blend
 * (match.ts), so the wrap reads as the dish settling after the stir. Tap and a creature bursts and re-forms; drag
 * to push the water. A live world heals back onto the loop with the same matched blend.
 *
 * Units: world units are Lenia units (repulsion reach 1); a card cell is 1 / SCALE of one. Deterministic: `dmath`,
 * seeded streams, a fixed step; no allocation per step.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { dexp, rngFor, TAU, dcos, dsin } from '../noise'
import { createLenia, leniaStep, type Lenia, type LeniaParams } from './lenia'
import { matchBlend } from './match'
import { phaseSteps } from './pond'
import { pressDiscrete, pressInit, pressStep, PRESS_TAP, pressAt } from './loop'

/** Card cells per world unit. */
export const PLANKTON_SCALE = 2
/** World steps per second, and the Lenia time one step covers. */
export const PLANKTON_RATE = 90
export const PLANKTON_LDT = .2
/** The glider species: Particle Lenia with a sharper kernel and a lower density preference than the rotor. */
export const PLANKTON_PARAMS: LeniaParams = { muK: 4, sigmaK: .75, wK: .022 / .75, muG: .45, sigmaG: .12, cRep: 1 }

export interface PlanktonSpec {
  seed: number
  /** The dish, in card cells: centre and radius. */
  dish: { x: number; y: number; r: number }
  /** Seeded clumps the loop starts from (card cells): particle count, centre, radius. */
  clumps: { n: number; x: number; y: number; r: number }[]
  /** Loop period and seam (seconds); the stir fills the loop's last `stir` seconds. */
  period: number; seam: number; stir: number
}
export interface PlanktonLayout { n: number; X: number; Y: number; G: number; size: number }
export interface Plankton { world: World; spec: PlanktonSpec; layout: PlanktonLayout; lenia: Lenia }

/** Globals: the burst (x, y, seconds left), then a press tracker. */
const B_X = 0, B_Y = 1, B_LEFT = 2, G_PRESS = 4
const BURST_S = .3, BURST_R = 10, BURST_F = 3, DRAG_R = 6, DRAG_K = .7, DRAG_MAX = 30, WALL_K = 1.5, SWIRL = .55

export function createPlankton(spec: PlanktonSpec): Plankton {
  const n = spec.clumps.reduce((a, c) => a + c.n, 0), X = 0, Y = n, G = 2 * n, size = G + 8
  const S = PLANKTON_SCALE, dt = 1 / PLANKTON_RATE, ldt = PLANKTON_LDT, toModel = 1 / (PLANKTON_RATE * ldt)
  const start = 0, len = Math.round(spec.period / dt), stirSteps = Math.round(spec.stir / dt)
  const cx = spec.dish.x / S, cy = spec.dish.y / S, R = spec.dish.r / S, bounds: [number, number, number, number] = [0, 0, 160 / S, 160 / S]
  const lenia = createLenia(PLANKTON_PARAMS, n, bounds)
  const fx = new Float64Array(n), fy = new Float64Array(n)

  function init(s: Float32Array) {
    let i = 0
    spec.clumps.forEach((c, k) => {
      const rng = rngFor(spec.seed, 0x91a + k)
      for (let m = 0; m < c.n; m++, i++) {
        const a = TAU * rng(), r = (c.r / S) * Math.sqrt(rng())
        s[X + i] = c.x / S + r * dcos(a); s[Y + i] = c.y / S + r * dsin(a)
      }
    })
    pressInit(s, G + G_PRESS)
  }

  function step(s: Float32Array, nStep: number, inp: StepInput) {
    const ph = phaseSteps(nStep, start, len)
    // the stir: a swirl around the dish centre, zero at the centre and the rim, eased in and out (sin²)
    const into = ph - (len - stirSteps), stir = into > 0 ? dsin((Math.PI * into) / stirSteps) : 0, swirl = SWIRL * stir * stir
    // input: a tap bursts, a moving pointer drags the water, a kick bursts the middle of the dish
    const p = inp.pointers[0], press = pressStep(s, G + G_PRESS, p, dt)
    if (press === PRESS_TAP || inp.kick) {
      const [bx, by] = press === PRESS_TAP ? pressAt(s, G + G_PRESS) : [cx, cy]
      s[G + B_X] = bx; s[G + B_Y] = by; s[G + B_LEFT] = BURST_S
    }
    const burst = s[G + B_LEFT] > 0 ? s[G + B_LEFT] / BURST_S : 0
    if (burst > 0) s[G + B_LEFT] = Math.max(0, s[G + B_LEFT] - dt)
    const pv = p ? Math.sqrt(p.vx * p.vx + p.vy * p.vy) : 0, drag = pv > .5, vk = drag ? (Math.min(pv, DRAG_MAX) / pv) * toModel : 0
    for (let i = 0; i < n; i++) {
      const x = s[X + i], y = s[Y + i], dx = x - cx, dy = y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1e-9
      let ax = 0, ay = 0
      // the dish wall: a soft spring past R − 2
      if (d > R - 2) { const w = -WALL_K * (d - (R - 2)) / d; ax += w * dx; ay += w * dy }
      if (swirl > 0) { const q = d / R, w = swirl * 4 * q * (1 - q) * (d < R ? 1 : 0) / d; ax += -w * dy; ay += w * dx }
      if (burst > 0) {
        const bx = x - s[G + B_X], by = y - s[G + B_Y], bd = Math.sqrt(bx * bx + by * by)
        if (bd < BURST_R && bd > 1e-6) { const w = BURST_F * burst * (1 - bd / BURST_R) / bd; ax += w * bx; ay += w * by }
      }
      if (drag) {
        const px = x - p.x, py = y - p.y, w = DRAG_K * dexp(-(px * px + py * py) / (DRAG_R * DRAG_R))
        ax += w * p.vx * vk; ay += w * p.vy * vk
      }
      fx[i] = ax; fy[i] = ay
    }
    leniaStep(lenia, s, X, Y, ldt, fx, fy)
    // the glass: nothing leaves the dish (the spring above keeps them off it; this catches a hard shove)
    for (let i = 0; i < n; i++) {
      const dx = s[X + i] - cx, dy = s[Y + i] - cy, d2 = dx * dx + dy * dy
      if (d2 > R * R) { const k = R / Math.sqrt(d2); s[X + i] = cx + dx * k; s[Y + i] = cy + dy * k }
    }
  }

  // a heal that would reach the stir or the seam can't follow the pristine run; nor while a burst is going
  const healSteps = Math.round(2.5 / dt)
  const busy = (s: Float32Array, nStep: number) => phaseSteps(nStep, start, len) >= len - stirSteps - healSteps || s[G + B_LEFT] > 0
  const blend = matchBlend({ n, X, Y, bounds, cell: 2, discrete: [G + B_LEFT, ...pressDiscrete(G + G_PRESS)] })
  const world = createWorld({
    size, dt, lead: 0, period: spec.period, seam: spec.seam, gravity: [0, 0],
    every: 120, maxCheckpoints: 48, maxSteps: len + 120, idle: 4, heal: 2.5, maxLiveSteps: 6,
    init, step, blend, busy, healBlend: blend,
  })
  return { world, spec, layout: { n, X, Y, G, size }, lenia }
}

/** Pointer map for a card: card cells → world units. */
export const planktonUnits = (x: number, y: number): [number, number] => [x / PLANKTON_SCALE, y / PLANKTON_SCALE]
