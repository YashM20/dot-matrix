/**
 * The koi (docs/living-matter/L-pond.md §L1, §L3): Reynolds steering (wander, contain, separate, align, food, curiosity,
 * lure) sets where a koi wants to go; the heading turns toward it at a capped rate (1.4 rad/s cruising, 2.5 bursting,
 * 14 in a C-start), and speed comes from burst-and-glide swimming (burst .6–1.2 s at .9 L/s² toward 1.4 L/s, glide
 * 1.5–3.5 s decaying toward the .35 L/s cruise). The tail beats at the Strouhal frequency f = 1.5·U/L. Startles and
 * their contagion live here too. The world (`world.ts`) calls these once per step with its `KoiCtx`.
 */
import { dcos, dsin, ihash, rngFor, TAU } from '../../noise'
import { rippleSplat, type Ripple } from '../ripple'
import { chainFollow, type Chain } from '../chain'
import { tailBeatHz, type BodySpec } from '../body'
import { align, arrive, contain, CSTART, integrate, separate, startle, turnCap, wander, type Agent } from '../steer'
import {
  CONTAG_R, CONTAG_S, G_CASC, G_LURE, G_LX, G_LY, G_STILL, G_WALL, HUNGER_BITE, HUNGER_RATE, K_BACK, K_BACKT, K_BEAT, K_CONTAG, K_CURIOUS,
  K_FOOD, K_GULP, K_HUNGER, K_HX, K_HY, K_LEFT, K_MODE, K_PHASE, K_REFR, K_SIGN, K_TURN, K_U, K_Z, K_ZT, KS, MODE_BEND, MODE_BURST,
  MODE_CRUISE, MODE_ESCAPE, MODE_GLIDE, NODES, P_AGE, P_STATE, P_X, P_Y, PEL_EATEN, PEL_FLOATING, PELLETS, POND_DT, PS, SATED,
  type KoiPondSpec, type PondLayout,
} from './layout'

const dt = POND_DT
/**
 * Swim speeds in body lengths per second. Published burst speeds (1.4 L/s) look frantic in a pond 2.4 body lengths
 * wide, so the koi here cruise at .28 L/s and burst to 1 L/s (at .6 L/s²); the C-start keeps its 2.6 L/s escape.
 */
export const CRUISE = .28, BURST_U = 1, BURST_ACC = .6, ESCAPE_U = 2.6, MIN_U = .18
/** Turn caps (rad/s): cruising 1, bursting 1.8, C-start 14. */
const TURN_CRUISE = turnCap(1, POND_DT), TURN_BURST = turnCap(1.8, POND_DT), TURN_CSTART = turnCap(CSTART.omega, POND_DT)
const CSTART_STEP = CSTART.omega * POND_DT
/** Smallest turn radius outside a C-start, in body lengths (the turn cap is min(mode cap, U / (this · L))); tighter near the bank. */
const TURN_RADIUS = .9, TURN_RADIUS_WALL = .45
let lastW = -1, lastCap = TURN_CRUISE
/** A missed pellet: circle back once, arriving slowly (max .6 L/s, slowing within 1 L), for at most 3 s. */
const BACK_U = .6, BACK_SLOW = 1, BACK_T = 3

/** What the koi share with the world: the scene, its layout and the per-step scratch (outside the state: the World contract). */
export interface KoiCtx {
  spec: KoiPondSpec; seed: number; K: number; lay: PondLayout
  chains: Chain[]; bodies: BodySpec[]; ripple: Ripple
  /** Card cells to ripple (tile) coordinates. */
  toRx: (x: number) => number; toRy: (y: number) => number
  /** Scratch: the steering force, the C-start's out values, neighbours and head records, the agent being steered. */
  f: Float32Array; cs: Float32Array; others: Float32Array; heads: Float32Array; a: Agent
}

/** C-start koi i away from (sx, sy) unless it is refractory; it passes the startle on 80 ms later (contagion). */
export function startleKoi(ctx: KoiCtx, s: Float32Array, i: number, sx: number, sy: number, n: number): boolean {
  const { lay, chains, a, seed, cs } = ctx
  const o = lay.KOI + KS * i, c = chains[i]
  if (s[o + K_REFR] > 0) return false
  a.x = s[c.X]; a.y = s[c.Y]; a.hx = s[o + K_HX]; a.hy = s[o + K_HY]; a.u = s[o + K_U]
  startle(a, sx, sy, ihash(seed, i, n) / 4294967296, cs)
  s[o + K_MODE] = MODE_BEND; s[o + K_LEFT] = Math.round(CSTART.bend / dt) * dt; s[o + K_SIGN] = cs[2]; s[o + K_TURN] = cs[3]; s[o + K_REFR] = CSTART.refractory
  s[o + K_CONTAG] = CONTAG_S
  return true
}
/** A burst; when the koi is going for food the burst also leaves a tiny ripple at its head (L3.1). */
function burst(ctx: KoiCtx, s: Float32Array, i: number, n: number, food: boolean) {
  const { chains, ripple, toRx, toRy } = ctx
  newMode(ctx, s, i, MODE_BURST, n)
  if (food) { const c = chains[i]; rippleSplat(ripple, s, toRx(s[c.X]), toRy(s[c.Y]), -.08, .8) }
}
/** The contagion pass: each koi whose timer runs out startles the koi within .5 L of its head, while the cascade lasts. */
export function contagion(ctx: KoiCtx, s: Float32Array, n: number) {
  const { K, lay, chains, bodies } = ctx
  for (let i = 0; i < K; i++) {
    const o = lay.KOI + KS * i
    if (!(s[o + K_CONTAG] > 0)) continue
    s[o + K_CONTAG] -= dt
    if (s[o + K_CONTAG] > dt * .5) continue
    s[o + K_CONTAG] = 0
    const c = chains[i], x = s[c.X], y = s[c.Y], r = CONTAG_R * bodies[i].length
    for (let j = 0; j < K && s[lay.G + G_CASC] >= 1; j++) {
      if (j === i) continue
      const cj = chains[j]
      let near = false
      for (let q = 0; q < NODES && !near; q++) { const dx = s[cj.X + q] - x, dy = s[cj.Y + q] - y; near = dx * dx + dy * dy < r * r }
      if (near && startleKoi(ctx, s, j, x, y, n)) s[lay.G + G_CASC] -= 1
    }
  }
}
function newMode(ctx: KoiCtx, s: Float32Array, i: number, mode: number, n: number) {
  const { lay, seed } = ctx
  const o = lay.KOI + KS * i, rng = rngFor(seed, i, n)
  s[o + K_MODE] = mode
  s[o + K_LEFT] = mode === MODE_BURST ? .6 + .6 * rng() : 1.5 + 2 * rng()
}
/**
 * Steer and integrate every koi for one step (wander, contain, separate, align, food, curiosity, lure; burst and glide;
 * the bank wall; the spine follows the head; tail beat, depth, gulp, hunger). The pointer is the step's first pointer.
 */
export function steerKoi(ctx: KoiCtx, s: Float32Array, n: number, ptrX: number, ptrY: number, ptrIn: boolean, ptrDown: boolean) {
  const { spec, seed, K, lay, chains, bodies, ripple, toRx, toRy, f, others, heads, a } = ctx, G = lay.G
  // neighbours: heads (x, y) and (hx, hy, u)
  for (let i = 0; i < K; i++) { const o = lay.KOI + KS * i; heads[3 * i] = s[o + K_HX]; heads[3 * i + 1] = s[o + K_HY]; heads[3 * i + 2] = s[o + K_U] }
  const curious0 = s[G + G_STILL] >= .6 && ptrIn && !ptrDown ? nearestTwo(ctx, s, ptrX, ptrY) : -1
  for (let i = 0; i < K; i++) {
    const o = lay.KOI + KS * i, c = chains[i], L = bodies[i].length
    a.x = s[c.X]; a.y = s[c.Y]; a.hx = s[o + K_HX]; a.hy = s[o + K_HY]; a.u = s[o + K_U]
    if (s[o + K_REFR] > 0) s[o + K_REFR] = Math.max(0, s[o + K_REFR] - dt)
    s[o + K_LEFT] -= dt
    let mode = s[o + K_MODE]
    if (mode === MODE_BEND) {
      // the C-start: a fast turn away, the body curls (the spine's bend limit makes the C)
      const turn = Math.min(CSTART_STEP, s[o + K_TURN]), sg = s[o + K_SIGN]
      const cc = turn === CSTART_STEP ? TURN_CSTART.c : dcos(turn), ss = (turn === CSTART_STEP ? TURN_CSTART.s : dsin(turn)) * sg
      const hx = a.hx * cc - a.hy * ss, hy = a.hx * ss + a.hy * cc, l = Math.sqrt(hx * hx + hy * hy) || 1
      a.hx = hx / l; a.hy = hy / l; s[o + K_TURN] -= turn
      a.u *= .85; s[o + K_BEAT] = 1
      a.x += a.hx * a.u * dt; a.y += a.hy * a.u * dt
      if (s[o + K_LEFT] <= dt * .5) { s[o + K_MODE] = MODE_ESCAPE; s[o + K_LEFT] = CSTART.burst }
    } else {
      f[0] = 0; f[1] = 0
      wander(a, i, n, dt, { dist: .8 * L, rad: .35 * L, rate: .12, seed }, .6 * L, f)
      // contain looks 1.2 s ahead (the plan's .5 s is too late for a koi that turns on a body-length radius)
      const f0 = f[0], f1 = f[1]
      contain(a, spec.sdf, 1.2, .45 * L, 2.5 * L, f)
      const walled = f[0] !== f0 || f[1] !== f1
      // separate from other heads and from the nearest node of each other spine
      let m = 0
      for (let j = 0; j < K; j++) {
        if (j === i) continue
        const cj = chains[j]
        others[2 * m] = s[cj.X]; others[2 * m + 1] = s[cj.Y]; m++
        let best = 0, bd = Infinity
        for (let q = 1; q < NODES; q++) { const dx = s[cj.X + q] - a.x, dy = s[cj.Y + q] - a.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = q } }
        others[2 * m] = s[cj.X + best]; others[2 * m + 1] = s[cj.Y + best]; m++
      }
      separate(a, others, m, .6 * L, 1.4 * L, f)
      let na = 0
      for (let j = 0; j < K; j++) {
        if (j === i) continue
        const cj = chains[j], dx = s[cj.X] - a.x, dy = s[cj.Y] - a.y
        if (dx * dx + dy * dy < (1.2 * L) ** 2) { others[3 * na] = heads[3 * j]; others[3 * na + 1] = heads[3 * j + 1]; others[3 * na + 2] = heads[3 * j + 2]; na++ }
      }
      align(a, others, na, .15 * L, f)
      // food (L3.1): a hungry koi takes the nearest floating pellet within 2.5 L, in front; a sated one ignores food.
      // A koi that loses its pellet behind it circles back for it once, slowly.
      const hungry = s[o + K_HUNGER] >= SATED, prevFood = s[o + K_FOOD]
      let food = -1, fd = (2.5 * L) ** 2, back = s[o + K_BACK]
      if (back > 0) {
        const k = back - 1
        s[o + K_BACKT] -= dt
        if (hungry && s[o + K_BACKT] > 0 && s[lay.PEL + PS * k + P_STATE] === PEL_FLOATING) food = k
        else { s[o + K_BACK] = -back; back = 0 }
      }
      if (food < 0 && hungry) for (let k = 0; k < PELLETS; k++) {
        const po = lay.PEL + PS * k
        if (s[po + P_STATE] !== PEL_FLOATING) continue
        const dx = s[po + P_X] - a.x, dy = s[po + P_Y] - a.y, d = dx * dx + dy * dy
        if (d < fd && (dx * a.hx + dy * a.hy) > -.2 * Math.sqrt(d)) { fd = d; food = k }
      }
      if (food < 0 && hungry && prevFood >= 0 && s[o + K_BACK] !== -(prevFood + 1)) {
        const po = lay.PEL + PS * prevFood, dx = s[po + P_X] - a.x, dy = s[po + P_Y] - a.y
        if (s[po + P_STATE] === PEL_FLOATING && dx * dx + dy * dy < (2.5 * L) ** 2) { food = prevFood; back = prevFood + 1; s[o + K_BACK] = back; s[o + K_BACKT] = BACK_T }
      }
      s[o + K_FOOD] = food
      if (food >= 0) {
        const po = lay.PEL + PS * food
        if (back > 0) arrive(a, s[po + P_X], s[po + P_Y], BACK_U * L, BACK_SLOW * L, 1.2 * L, f)
        else arrive(a, s[po + P_X], s[po + P_Y], BURST_U * L, .3 * L, 1.2 * L, f)
        s[o + K_ZT] = Math.min(s[o + K_ZT], .1)
        // a koi that has just spotted food rushes it
        if (prevFood < 0 && back <= 0 && (mode === MODE_GLIDE || mode === MODE_CRUISE)) { burst(ctx, s, i, n, true); mode = MODE_BURST }
        const dx = s[po + P_X] - a.x, dy = s[po + P_Y] - a.y
        if (dx * dx + dy * dy < 2.2 * 2.2 + (.05 * L) ** 2 && s[o + K_Z] < .35) {
          s[po + P_STATE] = PEL_EATEN; s[po + P_AGE] = 0; s[o + K_GULP] = 1; s[o + K_HUNGER] = Math.max(0, s[o + K_HUNGER] - HUNGER_BITE)
          if (back > 0) s[o + K_BACK] = -back
          rippleSplat(ripple, s, toRx(s[po + P_X]), toRy(s[po + P_Y]), -.25, .8)
        }
      }
      // curiosity: the two nearest koi orbit a still pointer
      s[o + K_CURIOUS] = curious0 >= 0 && ((curious0 & 0xff) === i + 1 || ((curious0 >> 8) & 0xff) === i + 1) ? 1 : 0
      if (s[o + K_CURIOUS]) {
        const dx = a.x - ptrX, dy = a.y - ptrY, l = Math.sqrt(dx * dx + dy * dy) || 1, rx = dx / l, ry = dy / l
        const sg = a.hx * -ry + a.hy * rx >= 0 ? 1 : -1
        arrive(a, ptrX + rx * .5 * L - ry * sg * .3 * L, ptrY + ry * .5 * L + rx * sg * .3 * L, .3 * L, .3 * L, .8 * L, f)
      }
      // lure: a held press draws every koi within 3 L (they hurry: a burst, and the tight turn radius)
      let eager = food >= 0
      if (s[G + G_LURE]) {
        const dx = s[G + G_LX] - a.x, dy = s[G + G_LY] - a.y
        if (dx * dx + dy * dy < (3 * L) ** 2) {
          arrive(a, s[G + G_LX], s[G + G_LY], BURST_U * L, .25 * L, 1.6 * L, f); s[o + K_ZT] = Math.min(s[o + K_ZT], .15)
          eager = true
          if (mode === MODE_GLIDE || mode === MODE_CRUISE) { newMode(ctx, s, i, MODE_BURST, n); mode = MODE_BURST }
        }
      }
      // burst and glide
      let beat = s[o + K_BEAT], maxU = BURST_U * L, turn = TURN_CRUISE
      if (mode === MODE_ESCAPE) {
        a.u += (ESCAPE_U * L - a.u) * .5; beat = 1; maxU = ESCAPE_U * L; turn = TURN_BURST
        if (s[o + K_LEFT] <= 0) { newMode(ctx, s, i, MODE_GLIDE, n); mode = MODE_GLIDE }
      } else if (mode === MODE_BURST) {
        a.u = Math.min(BURST_U * L, a.u + BURST_ACC * L * dt); beat += (1 - beat) * .25; turn = TURN_BURST
        if (s[o + K_LEFT] <= 0) { newMode(ctx, s, i, MODE_GLIDE, n); mode = MODE_GLIDE }
      } else {
        // glide (and cruise: a glide that has slowed to the cruise speed paddles gently)
        beat *= 1 - dt / .6
        a.u = Math.max(CRUISE * L, a.u * (1 - dt / 2.2))
        if (a.u <= CRUISE * L * 1.05) beat = Math.max(beat, .3)
        if (s[o + K_LEFT] <= 0) { burst(ctx, s, i, n, food >= 0); mode = MODE_BURST }
      }
      s[o + K_BEAT] = beat
      // curious or lured koi slow down near the point
      if (s[o + K_CURIOUS]) maxU = Math.min(maxU, .5 * L)
      // a fish turns on a radius of about a body length when it isn't bursting: the cap follows the speed
      if (mode !== MODE_ESCAPE) { const w = Math.min(turn === TURN_BURST ? 1.8 : 1, Math.max(.3, a.u / ((walled || eager ? TURN_RADIUS_WALL : TURN_RADIUS) * L))); turn = w === lastW ? lastCap : (lastW = w, lastCap = turnCap(w, dt)) }
      integrate(a, f, dt, .9 * L, turn, MIN_U * L, maxU, 1)
    }
    // the bank is a hard wall: a head that reaches it is pushed back (the heading keeps its capped turn; contain turns it)
    const d = spec.sdf(a.x, a.y)
    if (d > -1.5) {
      const gx = spec.sdf(a.x + .5, a.y) - spec.sdf(a.x - .5, a.y), gy = spec.sdf(a.x, a.y + .5) - spec.sdf(a.x, a.y - .5), gl = Math.sqrt(gx * gx + gy * gy) || 1
      a.x -= (gx / gl) * (d + 1.5) * .6; a.y -= (gy / gl) * (d + 1.5) * .6
      a.u *= .97
      s[G + G_WALL] += 1
    }
    s[o + K_HX] = a.hx; s[o + K_HY] = a.hy; s[o + K_U] = a.u
    chainFollow(c, s, a.x, a.y)
    // tail beat (Strouhal), depth, gulp
    let phase = s[o + K_PHASE] + TAU * tailBeatHz(a.u, L) * dt
    if (phase >= TAU) phase -= TAU
    s[o + K_PHASE] = phase
    s[o + K_Z] += (s[o + K_ZT] - s[o + K_Z]) * (dt / 2)
    s[o + K_GULP] *= 1 - dt / .5
    s[o + K_HUNGER] = Math.min(1, s[o + K_HUNGER] + HUNGER_RATE * dt)
  }
}
/** The two nearest koi (head) within 2 L of (x, y), packed as (i + 1) | (j + 1) << 8 (index tie-break). */
function nearestTwo(ctx: KoiCtx, s: Float32Array, x: number, y: number): number {
  const { K, chains, bodies } = ctx
  let b0 = -1, b1 = -1, d0 = Infinity, d1 = Infinity
  for (let i = 0; i < K; i++) {
    const c = chains[i], dx = s[c.X] - x, dy = s[c.Y] - y, d = dx * dx + dy * dy
    if (d > (2 * bodies[i].length) ** 2) continue
    if (d < d0) { b1 = b0; d1 = d0; b0 = i; d0 = d } else if (d < d1) { b1 = i; d1 = d }
  }
  return b0 < 0 ? -1 : (b0 + 1) | ((b1 + 1) << 8)
}
