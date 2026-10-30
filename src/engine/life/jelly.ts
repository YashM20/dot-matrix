/**
 * Moon jellies in side view (docs/living-matter/L-pond.md §L2 `pond-jelly`): three Aurelia-style bells pulse on a
 * contraction cycle, coast and sink between pulses, and trail Verlet-rope tentacles (chain.ts) through a curl-noise
 * current that the pointer can push. Their pulse phases are Kuramoto-coupled (K = .25), so they drift into loose
 * sync. Drawn in glyph tiles: a Fresnel-lit bell (dense rim, sparse middle), line-glyph tentacles and frilled oral
 * arms, marine snow; the gonads (two horseshoe arcs per bell) are the one accent.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { curl2, dcos, dpow, dsin, ihash, noise2, TAU } from '../noise'
import { createRope, ropeInit, ropeStep, type Rope } from './chain'
import { kuramotoStep } from './oscillators'
import { turnCap, turnToward, type Agent } from './steer'
import { phaseSteps } from './pond'
import { pressDiscrete, pressInit, pressStep, PRESS_SLOTS, PRESS_TAP, seamBlend } from './loop'
import { clearTiles, EDGE3, edgeOfGradient, edgeOfTangent, glyphOf, matchTile, putGlyph, RAMP3, rampGlyph, SHAPE3, T_ACTIVE, T_FAINT, T_MID, T_VALUE, type TileGrid, type TileRaster } from './glyphTiles'

export const JELLY_DT = 1 / 30
export interface JellySpec {
  seed: number; tiles: TileGrid
  /** Per bell: rest radius R0 (cells), free pulse period (s), start position (card cells). */
  bells: { r: number; period: number; x: number; y: number }[]
  lead: number; period: number; seam: number
}
export interface JellyLayout { J: number; TENT: number; ARM: number; PUSH: number; G: number; size: number }
export interface Jelly { world: World; spec: JellySpec; layout: JellyLayout; tentacles: Rope[][]; arms: Rope[][] }
const JS = 12, J_X = 0, J_Y = 1, J_AX = 2, J_AY = 3, J_VX = 4, J_VY = 5, J_TH = 6, J_C = 7, J_DC = 8, J_ACT = 9
export const TENTACLES = 8, TENT_NODES = 10, ARMS = 4, ARM_NODES = 8, PUSH_N = 12
/**
 * Thrust per unit contraction rate (cells/s²), drag (1/s) and the sink (cells/s). The plan's 26 gives a 26 cells/s
 * lurch per pulse and crosses the card in 10 s; 7 lurches visibly and drifts about 3 cells/s.
 */
export const THRUST = 9, DRAG = .9, SINK = 1.6
/** Kuramoto coupling between the three bells. */
export const JELLY_K = .25
/** The box the bell centres keep to (card cells). */
const BOX = [20, 30, 124, 120] as const

/** Smoothstep. */
const sstep = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x))
/** Contraction c(φ) for φ ∈ [0, 1): a fast squeeze (φ < .3, smoothstep up), then a slow refill (smoothstep down). */
export const contraction = (phi: number) => (phi < .3 ? sstep(phi / .3) : 1 - sstep((phi - .3) / .7))
/** Bell radius and height at contraction c: R = R0(1 − .3c), H = .8·R0(1 + .15c). */
export const bellShape = (r0: number, c: number): [number, number] => [r0 * (1 - .3 * c), .8 * r0 * (1 + .15 * c)]

/** |x|^2.4 on [0, 2] (beyond: > 1, outside), a LUT built with dpow and read linearly. */
const P24 = Float64Array.from({ length: 1025 }, (_, i) => dpow((2 * i) / 1024, 2.4))
const pow24 = (x: number) => { const a = (x < 0 ? -x : x) * 512; if (a >= 1024) return 2; const i = a | 0, f = a - i; return P24[i] + (P24[i + 1] - P24[i]) * f }

export function createJelly(spec: JellySpec): Jelly {
  const NB = spec.bells.length, J = 0, TENT = J + JS * NB, tentSize = 4 * TENT_NODES, armSize = 4 * ARM_NODES
  const ARM = TENT + NB * TENTACLES * tentSize, PUSH = ARM + NB * ARMS * armSize, G = PUSH + 2 * PUSH_N * PUSH_N, size = G + PRESS_SLOTS
  const dt = JELLY_DT, seed = spec.seed, start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const tentacles = spec.bells.map((_, b) => Array.from({ length: TENTACLES }, (_, k) => createRope(TENT_NODES, 2.2, { drag: .1, iters: 3 }, TENT + (b * TENTACLES + k) * tentSize)))
  const arms = spec.bells.map((_, b) => Array.from({ length: ARMS }, (_, k) => createRope(ARM_NODES, 1.8, { drag: .1, iters: 3 }, ARM + (b * ARMS + k) * armSize)))
  const theta = new Float32Array(NB), omega = Float32Array.from(spec.bells, b => TAU / b.period)
  const all = (i: number, visit: (j: number) => void) => { for (let j = 0; j < NB; j++) if (j !== i) visit(j) }
  const turn = turnCap(.6, dt), ag: Agent = { x: 0, y: 0, hx: 0, hy: -1, u: 0 }
  const cur: [number, number] = [0, 0]
  let tNow = 0, pushS: Float32Array = new Float32Array(0)
  const flowAt = (x: number, y: number, out: Float32Array) => {
    out[0] = cur[0]; out[1] = cur[1]
    const gx = Math.min(PUSH_N - 1, Math.max(0, Math.floor(x / 12))), gy = Math.min(PUSH_N - 1, Math.max(0, Math.floor(y / 12)))
    out[0] += pushS[PUSH + 2 * (gy * PUSH_N + gx)]; out[1] += pushS[PUSH + 2 * (gy * PUSH_N + gx) + 1]
  }
  /** The rim pins and the oral-arm roots of bell b in its current pose. */
  const pins = (s: Float32Array, b: number, out: Float32Array) => {
    const o = J + JS * b, [R, H] = bellShape(spec.bells[b].r, s[o + J_C]), ax = s[o + J_AX], ay = s[o + J_AY], nx = -ay, ny = ax
    const am = -.15 * H, bm = R * .97
    for (let k = 0; k < TENTACLES; k++) { const bb = -bm + (2 * bm * k) / (TENTACLES - 1); out[2 * k] = s[o + J_X] + ax * am + nx * bb; out[2 * k + 1] = s[o + J_Y] + ay * am + ny * bb }
    for (let k = 0; k < ARMS; k++) { const bb = (-.3 + (.6 * k) / (ARMS - 1)) * R; out[2 * (TENTACLES + k)] = s[o + J_X] + ax * am * 1.2 + nx * bb; out[2 * (TENTACLES + k) + 1] = s[o + J_Y] + ay * am * 1.2 + ny * bb }
  }
  const pinXY = new Float32Array(2 * (TENTACLES + ARMS)), flowOut = new Float32Array(2)

  function init(s: Float32Array) {
    const ph0 = phaseSteps(0, start, len)
    spec.bells.forEach((bell, b) => {
      const o = J + JS * b
      s[o + J_X] = bell.x; s[o + J_Y] = bell.y; s[o + J_AX] = 0; s[o + J_AY] = -1
      s[o + J_TH] = (TAU * (ihash(seed, b, 5) / 4294967296 + ph0 * dt / bell.period)) % TAU
      s[o + J_ACT] = .6; s[o + J_C] = contraction(s[o + J_TH] / TAU) * (.15 + .85 * .6)
      pins(s, b, pinXY)
      for (let k = 0; k < TENTACLES; k++) ropeInit(tentacles[b][k], s, pinXY[2 * k], pinXY[2 * k + 1])
      for (let k = 0; k < ARMS; k++) ropeInit(arms[b][k], s, pinXY[2 * (TENTACLES + k)], pinXY[2 * (TENTACLES + k) + 1])
    })
    pressInit(s, G)
  }
  function step(s: Float32Array, n: number, inp: StepInput) {
    const ph = phaseSteps(n, start, len)
    tNow = ph * dt; pushS = s
    // ── input: a tap pulses every bell now; a moving pointer (hover, or an engaged drag) pushes the current ──
    const p = inp.pointers[0]
    if (pressStep(s, G, p, dt) === PRESS_TAP || inp.kick) for (let b = 0; b < NB; b++) s[J + JS * b + J_TH] = 0
    for (let i = 0; i < PUSH_N * PUSH_N * 2; i++) s[PUSH + i] *= .96
    if (p && p.vx * p.vx + p.vy * p.vy > 4) {
      const gx0 = p.x / 12 - .5, gy0 = p.y / 12 - .5
      for (let gy = Math.max(0, Math.floor(gy0 - 2)); gy <= Math.min(PUSH_N - 1, Math.ceil(gy0 + 2)); gy++) for (let gx = Math.max(0, Math.floor(gx0 - 2)); gx <= Math.min(PUSH_N - 1, Math.ceil(gx0 + 2)); gx++) {
        const dx = gx - gx0, dy = gy - gy0, fall = 1 - (dx * dx + dy * dy) / 5
        if (fall <= 0) continue
        const q = PUSH + 2 * (gy * PUSH_N + gx), vx = Math.max(-80, Math.min(80, p.vx)), vy = Math.max(-80, Math.min(80, p.vy))
        s[q] += .3 * vx * fall * dt * 3; s[q + 1] += .3 * vy * fall * dt * 3
      }
    }
    // ── pulses: Kuramoto on the phase angles ──
    for (let b = 0; b < NB; b++) theta[b] = s[J + JS * b + J_TH]
    kuramotoStep(theta, omega, JELLY_K, all, dt)
    for (let b = 0; b < NB; b++) {
      // activity: spells of swimming and resting (slow noise), resting near the top, swimming near the bottom; the
      // pulse's depth follows it, so a resting bell barely pulses and sinks
      const o = J + JS * b, yb = s[o + J_Y]
      let act = .35 + 1.8 * noise2(.025 * tNow, b * 5.3 + .2, seed + 1)
      act = Math.min(act, (yb - 48) / 30, 1); if (yb > 100) act = Math.max(act, (yb - 100) / 14)
      act = act < 0 ? 0 : act > 1 ? 1 : act
      s[o + J_ACT] += (act - s[o + J_ACT]) * dt / 1.5
      const c = contraction(theta[b] / TAU) * (.15 + .85 * s[o + J_ACT]), dc = (c - s[o + J_C]) / dt
      s[o + J_TH] = theta[b]; s[o + J_DC] = dc; s[o + J_C] = c
      // the current at the bell
      curl2(s[o + J_X] / 50, s[o + J_Y] / 50, .03 * tNow, seed, cur); cur[0] *= 2; cur[1] *= 2
      flowAt(s[o + J_X], s[o + J_Y], flowOut)
      // swim: thrust along the axis while contracting, drag toward the current, a slow sink (a bell is heavy next to
      // its tentacles: it takes half the current, the ropes all of it, so upwellings don't pin bells to the top)
      const thrust = THRUST * (dc > 0 ? dc : 0)
      s[o + J_VX] += (thrust * s[o + J_AX] - DRAG * (s[o + J_VX] - .5 * flowOut[0])) * dt
      s[o + J_VY] += (thrust * s[o + J_AY] - DRAG * (s[o + J_VY] - .5 * flowOut[1] - SINK)) * dt
      // walls: a soft spring back into the box; bells nudge each other apart
      const x = s[o + J_X], y = s[o + J_Y]
      if (x < BOX[0]) s[o + J_VX] += (BOX[0] - x) * 2 * dt; else if (x > BOX[2]) s[o + J_VX] -= (x - BOX[2]) * 2 * dt
      if (y < BOX[1]) s[o + J_VY] += (BOX[1] - y) * 2 * dt; else if (y > BOX[3]) s[o + J_VY] -= (y - BOX[3]) * 2 * dt
      for (let q = 0; q < NB; q++) {
        if (q === b) continue
        const ox2 = J + JS * q, ex = x - s[ox2 + J_X], ey = y - s[ox2 + J_Y], want = spec.bells[b].r + spec.bells[q].r + 10, d2 = ex * ex + ey * ey
        if (d2 < want * want && d2 > 1e-6) { const d = Math.sqrt(d2), k = (want - d) * 1.5 * dt / d; s[o + J_VX] += ex * k; s[o + J_VY] += ey * k }
      }
      s[o + J_X] += s[o + J_VX] * dt; s[o + J_Y] += s[o + J_VY] * dt
      // the axis turns (≤ .6 rad/s) toward a wandering heading within ±.55 rad of up, leaning back in near a side
      const wa = .55 * noise2(.04 * tNow, b * 3.1 + .5, seed)
      let dx = dsin(wa)
      const dy = -dcos(wa)
      dx += x < 40 ? (40 - x) / 20 : x > 104 ? (104 - x) / 20 : 0
      const dl = Math.sqrt(dx * dx + dy * dy) || 1
      ag.hx = s[o + J_AX]; ag.hy = s[o + J_AY]
      turnToward(ag, dx / dl, dy / dl, turn)
      s[o + J_AX] = ag.hx; s[o + J_AY] = ag.hy
      // tentacles and oral arms: pinned to the bell, dragged by the current, hanging a little
      pins(s, b, pinXY)
      for (let k = 0; k < TENTACLES; k++) ropeStep(tentacles[b][k], s, dt, pinXY[2 * k], pinXY[2 * k + 1], 0, 2.5, flowAt)
      for (let k = 0; k < ARMS; k++) ropeStep(arms[b][k], s, dt, pinXY[2 * (TENTACLES + k)], pinXY[2 * (TENTACLES + k) + 1], 0, 2, flowAt)
    }
  }
  const discrete = [...pressDiscrete(G)], angles = spec.bells.map((_, b) => J + JS * b + J_TH), units = spec.bells.map((_, b) => J + JS * b + J_AX)
  const world = createWorld({
    size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 60, maxCheckpoints: 23, maxSteps: Math.round((spec.lead + spec.period) / dt) + 60, idle: 4, heal: 2, maxLiveSteps: 4,
    init, step, blend: seamBlend({ size, discrete, angles, units }),
  })
  return { world, spec, layout: { J, TENT, ARM, PUSH, G, size }, tentacles, arms }
}

export interface BellView { x: number; y: number; ax: number; ay: number; vx: number; vy: number; theta: number; c: number; dc: number; R: number; H: number }
export function bellView(j: Jelly, s: Float32Array, b: number): BellView {
  const o = j.layout.J + JS * b, c = s[o + J_C], [R, H] = bellShape(j.spec.bells[b].r, c)
  return { x: s[o + J_X], y: s[o + J_Y], ax: s[o + J_AX], ay: s[o + J_AY], vx: s[o + J_VX], vy: s[o + J_VY], theta: s[o + J_TH], c, dc: s[o + J_DC], R, H }
}

const sub = new Float32Array(16), DOT = glyphOf(EDGE3, '·')
/** Marine snow: 70 motes, pure in t, sinking 4 cells/s with a slow sideways sway. */
function snow(j: Jelly, t: number, r: TileRaster) {
  const { cols, rows, pitch, ox, oy } = j.spec.tiles, seed = j.spec.seed
  for (let i = 0; i < 70; i++) {
    const x0 = 144 * (ihash(seed, i, 61) / 4294967296), y0 = 132 * (ihash(seed, i, 62) / 4294967296)
    const y = oy + ((((y0 + 4 * t) % 132) + 132) % 132), x = x0 + 3 * noise2(.2 * t, i + .5, seed)
    const tx = Math.floor((x - ox) / pitch), ty = Math.floor((y - oy) / pitch)
    if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) putGlyph(r, tx, ty, DOT, T_FAINT, .6)
  }
}
/** Line glyphs along a rope (node i to i + 1), with an optional sideways frill. */
function ropeTiles(j: Jelly, s: Float32Array, rope: Rope, r: TileRaster, tone: (i: number) => number, frill = 0, t = 0, salt = 0) {
  const { cols, rows, pitch, ox, oy } = j.spec.tiles
  for (let i = 1; i < rope.n; i++) {
    let dx = s[rope.X + i] - s[rope.X + i - 1], dy = s[rope.Y + i] - s[rope.Y + i - 1]
    const l = Math.sqrt(dx * dx + dy * dy) || 1
    dx /= l; dy /= l
    const off = frill ? frill * dsin(3 * i + 2 * t + salt) : 0
    const x = s[rope.X + i] - dy * off, y = s[rope.Y + i] + dx * off
    const tx = Math.floor((x - ox) / pitch), ty = Math.floor((y - oy) / pitch)
    if (tx >= 0 && ty >= 0 && tx < cols && ty < rows) putGlyph(r, tx, ty, edgeOfTangent(EDGE3, dx, dy), tone(i), .8)
  }
}
/**
 * Draw the scene: marine snow, tentacles and oral arms, then each bell (its tiles from 16 coverage samples of the
 * superellipse |b/R|^2.4 + |a/H|^2.4 ≤ 1, a ≥ −.15H): edge tiles shape-matched in `value`, interior tiles a density
 * glyph that thickens toward the rim (Fresnel), and the gonads' horseshoe arcs in `active`.
 */
export function drawJelly(j: Jelly, s: Float32Array, t: number, r: TileRaster): void {
  const { cols, rows, pitch, ox, oy } = j.spec.tiles
  clearTiles(r)
  snow(j, t, r)
  for (let b = 0; b < j.spec.bells.length; b++) {
    for (const rope of j.tentacles[b]) ropeTiles(j, s, rope, r, i => (i < 4 ? T_MID : T_FAINT))
    j.arms[b].forEach((rope, k) => ropeTiles(j, s, rope, r, () => T_MID, 1, t, k * 1.7))
  }
  for (let b = 0; b < j.spec.bells.length; b++) {
    const v = bellView(j, s, b), { R, H } = v, nx = -v.ay, ny = v.ax
    const reach = Math.max(R, H) + 2
    const tx0 = Math.max(0, Math.floor((v.x - reach - ox) / pitch)), tx1 = Math.min(cols - 1, Math.floor((v.x + reach - ox) / pitch))
    const ty0 = Math.max(0, Math.floor((v.y - reach - oy) / pitch)), ty1 = Math.min(rows - 1, Math.floor((v.y + reach - oy) / pitch))
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      let cov = 0, gx = 0, gy = 0
      for (let q = 0; q < 16; q++) {
        const px = ox + tx * pitch + (q & 3) + .5 - v.x, py = oy + ty * pitch + (q >> 2) + .5 - v.y
        const a = px * v.ax + py * v.ay, bb = px * nx + py * ny
        const inside = a >= -.15 * H && pow24(bb / R) + pow24(a / H) <= 1 ? 1 : 0
        sub[q] = inside; cov += inside
        if (inside) { gx += (q & 3) - 1.5; gy += (q >> 2) - 1.5 }
      }
      cov /= 16
      if (cov < .2) continue
      // the rim: a line along the bell's edge (across the inward normal, the centroid of the covered cells), or the
      // shape-matched glyph where the normal is unclear (corners of the margin)
      if (cov < .85) { putGlyph(r, tx, ty, gx * gx + gy * gy > 1 ? edgeOfGradient(EDGE3, gx, gy) : matchTile(SHAPE3, sub), T_VALUE, .8); continue }
      const px = ox + tx * pitch + 2 - v.x, py = oy + ty * pitch + 2 - v.y, a = px * v.ax + py * v.ay, bb = px * nx + py * ny
      const g = pow24(bb / R) + pow24(a / H), edge = Math.min((1 - g) * Math.min(R, H) / 2.4, a + .15 * H)
      const rim = edge < 3 ? 1 - edge / 3 : 0
      putGlyph(r, tx, ty, rampGlyph(RAMP3, .15 + .35 * rim), rim > .5 ? T_VALUE : T_MID, .8)
    }
    // gonads: two horseshoes at a = .1H, b = ±.35R. Their radius (.22R ≈ 2–3 cells) is smaller than a tile, so each
    // is one ring glyph (the plan's arc of line glyphs covered 3–4 tiles of a 5-tile bell)
    for (const side of [-1, 1]) {
      const a = .1 * H, bb = side * .35 * R, x = v.x + v.ax * a + nx * bb, y = v.y + v.ay * a + ny * bb
      putGlyph(r, Math.floor((x - ox) / pitch), Math.floor((y - oy) / pitch), RING, T_ACTIVE, 1)
    }
  }
}
const RING = glyphOf(EDGE3, 'o')
