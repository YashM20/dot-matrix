/**
 * The murmuration (docs/living-matter/L-pond.md §L2 `pond-murmur`): 400 starlings as boids (steer.ts `flock`),
 * alignment and cohesion over each bird's 7 nearest (topological, Ballerini et al. 2008), separation within 3
 * cells, a soft elliptical sky, a falcon they flee, and the agitation wave of Procaccini et al.: a startled bird's
 * alarm passes to its 7 nearest at .88 per step, so a dark band runs through the flock. Drawn as a sheet of line
 * glyphs along each tile's mean velocity; the falcon (the one accent) is a lattice dot with two wing strokes.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { createHash, type SpatialHash } from '../physics/particles'
import { dcos, dsin, rngFor, TAU } from '../noise'
import { contain, flock, hashPoints, integrate, kNearest, turnCap, wander, type Agent } from './steer'
import { phaseSteps } from './pond'
import { pressDiscrete, pressInit, pressStep, PRESS_HOLD, PRESS_TAP, pressAt, seamBlend } from './loop'
import { clearTiles, EDGE3, edgeOfTangent, glyphOf, putBig, putGlyph, T_ACTIVE, T_IDLE, T_MID, T_VALUE, type TileGrid, type TileRaster } from './glyphTiles'

export const MURMUR_DT = 1 / 30
export const BIRDS = 400
export interface MurmurSpec { seed: number; tiles: TileGrid; lead: number; period: number; seam: number }
export interface MurmurLayout { X: number; Y: number; VX: number; VY: number; A: number; G: number; size: number }
export interface Murmur { world: World; spec: MurmurSpec; layout: MurmurLayout }
/** Globals: falcon position and velocity, mode (0 autopilot, 1 follows the pointer, 2 swoop), swoop time left, then a press tracker. */
const F_X = 0, F_Y = 1, F_VX = 2, F_VY = 3, F_MODE = 4, F_LEFT = 5, F_IDLE = 6, G_PRESS = 8
export const FALCON_AUTO = 0, FALCON_FOLLOW = 1, FALCON_SWOOP = 2
/** The sky: an ellipse inset 14 cells from the card's scene box (rows 11–143). */
const SKY = { cx: 72, cy: 77, a: 58, b: 52 }
export const skySdf = (x: number, y: number) => { const u = (x - SKY.cx) / SKY.a, v = (y - SKY.cy) / SKY.b; return (Math.sqrt(u * u + v * v) - 1) * SKY.b }
/** The falcon's autopilot: a Lissajous figure over the loop (period 20 s), x = 72 + 60·sin(2πt/20), y = 72 + 40·sin(4πt/20 + 1). */
export const falconPath = (t: number): [number, number] => [72 + 60 * dsin((TAU * t) / 20), 72 + 40 * dsin((2 * TAU * t) / 20 + 1)]
const MIN_U = 22, MAX_U = 38, ACC = 60, FLEE_R = 22, K_NN = 7

export function createMurmur(spec: MurmurSpec): Murmur {
  const N = BIRDS, X = 0, Y = N, VX = 2 * N, VY = 3 * N, A = 4 * N, G = 5 * N, size = G + 16
  const dt = MURMUR_DT, seed = spec.seed, start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const hash: SpatialHash = createHash(N, [-30, -20, 174, 174], 6)
  const nn = new Int32Array(N * K_NN), force = new Float32Array(2 * N), aNew = new Float32Array(N), f = new Float32Array(2)
  const ag: Agent = { x: 0, y: 0, hx: 1, hy: 0, u: 0 }, turn = turnCap(4, dt)

  function init(s: Float32Array) {
    const rng = rngFor(seed, 0xb1d, 0)
    // a long folded band, every bird flying along it
    for (let i = 0; i < N; i++) {
      const u = rng(), w = rng() - .5, ang = -.6 + 1.9 * u
      const x = 72 + 46 * dcos(ang + 1.2) * (1 - .25 * u) + 6 * w, y = 77 + 34 * dsin(ang + 1.2) + 4 * w
      s[X + i] = x; s[Y + i] = y
      const sp = 28 + 6 * rng()
      s[VX + i] = -dsin(ang + 1.2) * sp; s[VY + i] = dcos(ang + 1.2) * sp * .75
      s[A + i] = 0
    }
    const [fx, fy] = falconPath(phaseSteps(0, start, len) * dt)
    s[G + F_X] = fx; s[G + F_Y] = fy; s[G + F_MODE] = FALCON_AUTO
    pressInit(s, G + G_PRESS)
  }
  function step(s: Float32Array, n: number, inp: StepInput) {
    const ph = phaseSteps(n, start, len), tp = ph * dt
    // ── the falcon ──
    const p = inp.pointers[0], press = pressStep(s, G + G_PRESS, p, dt)
    const moving = !!p && !p.down && p.vx * p.vx + p.vy * p.vy > 9
    s[G + F_IDLE] = moving || press === PRESS_HOLD ? 0 : s[G + F_IDLE] + dt
    let mode = s[G + F_MODE]
    if (press === PRESS_TAP) {
      // a swoop: a .8 s dive through the flock near the tap (its centroid within 30 cells), or through the tap point
      const [px, py] = pressAt(s, G + G_PRESS)
      let cx = 0, cy = 0, m = 0
      for (let i = 0; i < N; i++) { const dx = s[X + i] - px, dy = s[Y + i] - py; if (dx * dx + dy * dy < 900) { cx += s[X + i]; cy += s[Y + i]; m++ } }
      const tx = m ? cx / m : px, ty = m ? cy / m : py
      s[G + F_VX] = (tx - s[G + F_X]) / .4; s[G + F_VY] = (ty - s[G + F_Y]) / .4
      mode = FALCON_SWOOP; s[G + F_LEFT] = .8
    } else if (mode !== FALCON_SWOOP && p && (moving || press === PRESS_HOLD)) mode = FALCON_FOLLOW
    else if (mode === FALCON_FOLLOW && s[G + F_IDLE] > 1.5) mode = FALCON_AUTO
    const fx0 = s[G + F_X], fy0 = s[G + F_Y]
    if (mode === FALCON_SWOOP) {
      s[G + F_X] += s[G + F_VX] * dt; s[G + F_Y] += s[G + F_VY] * dt
      if ((s[G + F_LEFT] -= dt) <= 0) mode = FALCON_AUTO
    } else {
      const [tx, ty] = mode === FALCON_FOLLOW && p ? [p.x, p.y] : falconPath(tp), k = mode === FALCON_FOLLOW ? .35 : .15
      s[G + F_X] += (tx - s[G + F_X]) * k; s[G + F_Y] += (ty - s[G + F_Y]) * k
      s[G + F_VX] = (s[G + F_X] - fx0) / dt; s[G + F_VY] = (s[G + F_Y] - fy0) / dt
    }
    s[G + F_MODE] = mode
    const fx = s[G + F_X], fy = s[G + F_Y]
    // ── the flock ──
    hashPoints(hash, s, N, X, Y)
    kNearest(s, N, X, Y, hash, K_NN, nn)
    force.fill(0)
    flock(s, N, { X, Y, VX, VY }, hash, { k: K_NN, sep: 3, wSep: 2, wAli: 1, wCoh: .6, nn }, force)
    for (let i = 0; i < N; i++) {
      const vx = s[VX + i], vy = s[VY + i], u = Math.sqrt(vx * vx + vy * vy) || 1
      ag.x = s[X + i]; ag.y = s[Y + i]; ag.hx = vx / u; ag.hy = vy / u; ag.u = u
      f[0] = force[2 * i]; f[1] = force[2 * i + 1]
      contain(ag, skySdf, .4, 10, 1.5, f)
      wander(ag, i, n, dt, { dist: 8, rad: 4, rate: .25, seed }, .2, f)
      const dx = ag.x - fx, dy = ag.y - fy, d2 = dx * dx + dy * dy
      let alarm = 0
      if (d2 < FLEE_R * FLEE_R) { const d = Math.sqrt(d2) || 1, w = 3.5 * (1 - d / FLEE_R); f[0] += (w * dx) / d; f[1] += (w * dy) / d; alarm = 1 }
      f[0] *= ACC; f[1] *= ACC
      integrate(ag, f, dt, 4 * ACC, turn, MIN_U, MAX_U)
      s[X + i] = ag.x; s[Y + i] = ag.y; s[VX + i] = ag.hx * ag.u; s[VY + i] = ag.hy * ag.u
      // agitation: decays, passes on from the 7 nearest at .88 a step (Jacobi: everyone reads last step's values)
      let a = .9 * s[A + i]
      for (let q = 0; q < K_NN; q++) { const j = nn[i * K_NN + q]; if (j >= 0 && .88 * s[A + j] > a) a = .88 * s[A + j] }
      aNew[i] = alarm > a ? alarm : a
    }
    for (let i = 0; i < N; i++) s[A + i] = aNew[i]
  }
  const discrete = [G + F_MODE, ...pressDiscrete(G + G_PRESS)]
  const blend = seamBlend({ size, discrete })
  const world = createWorld({
    size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 60, maxCheckpoints: 24, maxSteps: Math.round((spec.lead + spec.period) / dt) + 60, idle: 4, heal: 2, maxLiveSteps: 4,
    init, step, blend,
  })
  return { world, spec, layout: { X, Y, VX, VY, A, G, size } }
}

export interface FalconView { x: number; y: number; vx: number; vy: number; mode: number }
export const falconView = (m: Murmur, s: Float32Array): FalconView => { const G = m.layout.G; return { x: s[G + F_X], y: s[G + F_Y], vx: s[G + F_VX], vy: s[G + F_VY], mode: s[G + F_MODE] } }

const cnt = new Uint16Array(36 * 33), sx = new Float32Array(36 * 33), sy = new Float32Array(36 * 33), amax = new Float32Array(36 * 33)
const X_GLYPH = glyphOf(EDGE3, 'x')
/**
 * Draw: per tile, the birds' mean velocity as a line glyph (a sheet of dashes that turns with the flock), tone by
 * count (1 mid, 2 idle, ≥ 3 value); agitation > .5 draws 'x' a tone down (the dark band). Then the falcon.
 */
export function drawMurmur(m: Murmur, s: Float32Array, r: TileRaster): void {
  const { cols, rows, pitch, ox, oy } = m.spec.tiles, { X, Y, VX, VY, A } = m.layout, T = cols * rows
  clearTiles(r)
  cnt.fill(0, 0, T); sx.fill(0, 0, T); sy.fill(0, 0, T); amax.fill(0, 0, T)
  for (let i = 0; i < BIRDS; i++) {
    const tx = Math.floor((s[X + i] - ox) / pitch), ty = Math.floor((s[Y + i] - oy) / pitch)
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue
    const k = ty * cols + tx
    cnt[k]++; sx[k] += s[VX + i]; sy[k] += s[VY + i]; if (s[A + i] > amax[k]) amax[k] = s[A + i]
  }
  for (let k = 0; k < T; k++) {
    const c = cnt[k]
    if (!c) continue
    const tone = c === 1 ? T_MID : c === 2 ? T_IDLE : T_VALUE
    if (amax[k] > .5) putGlyph(r, k % cols, (k / cols) | 0, X_GLYPH, tone === T_VALUE ? T_IDLE : T_MID, .8)
    else putGlyph(r, k % cols, (k / cols) | 0, edgeOfTangent(EDGE3, sx[k], sy[k]), tone, c >= 3 ? 1 : .8)
  }
  // the falcon: a lattice dot with two swept-back wing strokes
  const G = m.layout.G, fx = s[G + F_X], fy = s[G + F_Y]
  let hx = s[G + F_VX], hy = s[G + F_VY]
  const hl = Math.sqrt(hx * hx + hy * hy)
  if (hl > 1e-6) { hx /= hl; hy /= hl } else { hx = 0; hy = -1 }
  const nx = -hy, ny = hx
  const at = (x: number, y: number): [number, number] => [Math.floor((x - ox) / pitch), Math.floor((y - oy) / pitch)]
  for (const side of [1, -1]) {
    const [tx, ty] = at(fx + nx * side * 4.5 - hx * 2.5, fy + ny * side * 4.5 - hy * 2.5)
    putGlyph(r, tx, ty, edgeOfTangent(EDGE3, nx * side - hx * .8, ny * side - hy * .8), T_ACTIVE, 1)
  }
  const [cx, cy] = at(fx, fy)
  putBig(r, cx, cy, T_ACTIVE, 1)
}
