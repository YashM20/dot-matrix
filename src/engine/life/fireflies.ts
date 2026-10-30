/**
 * The firefly meadow (docs/living-matter/L-pond.md §L2 `pond-fireflies`): 160 flies drift on curl noise over an
 * L-system grass silhouette and flash by Mirollo–Strogatz pulse coupling (oscillators.ts), so flashes fall into
 * step neighbour by neighbour. Every 20 s of the loop a gust scrambles a patch of phases, and the re-sync wave that
 * follows is what t = 0 shows. The flash is the one accent: a lattice-4 red dot at its peak, then a small red dot
 * (size contrast, never activeDim), then a faint dot.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { createHash, type SpatialHash } from '../physics/particles'
import { curl2, ihash, rngFor, TAU } from '../noise'
import { kuramotoOrder, pulseF, pulseFInv, pulseStep, type PulseSpec } from './oscillators'
import { nightness, nightTile } from './sky'
import { lsystem, turtleSites } from './grow'
import { phaseSteps } from './pond'
import { pressDiscrete, pressInit, pressStep, PRESS_HOLD, PRESS_SLOTS, PRESS_TAP, pressAt, seamBlend } from './loop'
import { clearTiles, EDGE3, edgeOfTangent, flickerOn, glyphOf, putBig, putGlyph, T_ACTIVE, T_FAINT, T_MID, T_VALUE, type TileGrid, type TileRaster } from './glyphTiles'

export const FLY_DT = 1 / 30
export const FLIES = 160
/** The meadow the flies keep to (card cells): x 6–138, y 16–112. */
export const MEADOW = [6, 16, 138, 112] as const
export interface FirefliesSpec { seed: number; tiles: TileGrid; lead: number; period: number; seam: number }
export interface FlyLayout { X: number; Y: number; K: number; PH: number; AGE: number; G: number; size: number }
export interface Fireflies {
  world: World; spec: FirefliesSpec; layout: FlyLayout; pulse: PulseSpec
  /** Baked grass: per tile, an EDGE3 glyph index (−1 = none). */
  grass: Int16Array
}
/** Flash timing (s): the peak (a lattice dot), then a small red dot. */
export const FLASH_PEAK = .07, FLASH_TAIL = .2
const G_HOVER = PRESS_SLOTS // seconds since the last hover scramble
/** The lantern (L3.7): its phase (turns; 0 = not lit) and the seconds since its last flash. 0 in the pristine run. */
const G_LANT = PRESS_SLOTS + 1, G_LAGE = PRESS_SLOTS + 2
/**
 * A held press is a lantern: it flashes at 1 Hz (the flies' own period) and each flash kicks every fly within
 * LANTERN_R the Mirollo–Strogatz way, harder than a neighbour (ε .35 against .07), so the flies near the finger fall
 * into its rhythm within a few flashes.
 */
export const LANTERN_T = 1, LANTERN_R = 30, LANTERN_EPS = .35, LANTERN_LIT = .12

export function createFireflies(spec: FirefliesSpec): Fireflies {
  const N = FLIES, X = 0, Y = N, K = 2 * N, PH = 3 * N, AGE = 4 * N, G = 5 * N, size = G + PRESS_SLOTS + 4
  const dt = FLY_DT, seed = spec.seed, start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const period = new Float32Array(N)
  for (let i = 0; i < N; i++) period[i] = 1 + .08 * (2 * (ihash(seed, i, 3) / 4294967296) - 1)
  const pulse: PulseSpec = { n: N, period, eps: .07, refractory: .12, radius: 22 }
  const hash: SpatialHash = createHash(N, [MEADOW[0] - 10, MEADOW[1] - 10, MEADOW[2] + 10, MEADOW[3] + 10], 22)
  // gusts: every 20 s of the loop, 2 s before the half and the end (so the re-sync wave is under way at t = 0)
  const gusts = [len / 2 - Math.round(2 / dt), len - Math.round(2 / dt)].map((at, k) => ({ at, x: 40 + 64 * (ihash(seed, k, 11) / 4294967296), y: 40 + 50 * (ihash(seed, k, 12) / 4294967296) }))
  const cv: [number, number] = [0, 0]
  const scramble = (s: Float32Array, cx: number, cy: number, r: number, salt: number) => {
    for (let i = 0; i < N; i++) { const dx = s[X + i] - cx, dy = s[Y + i] - cy; if (dx * dx + dy * dy < r * r) s[PH + i] = ihash(seed, i, salt) / 4294967296 }
  }

  function init(s: Float32Array) {
    const rng = rngFor(seed, 0xf1, 0)
    for (let i = 0; i < N; i++) {
      s[X + i] = MEADOW[0] + rng() * (MEADOW[2] - MEADOW[0]); s[Y + i] = MEADOW[1] + rng() * (MEADOW[3] - MEADOW[1])
      s[K + i] = 1; s[PH + i] = rng(); s[AGE + i] = 1
    }
    pressInit(s, G); s[G + G_HOVER] = 0
  }
  function step(s: Float32Array, n: number, inp: StepInput) {
    const ph = phaseSteps(n, start, len), tp = ph * dt
    // ── input: hover scrambles, a tap is a burst ──
    const p = inp.pointers[0]
    s[G + G_HOVER] += dt
    if (p && !p.down && p.vx * p.vx + p.vy * p.vy > 25 && s[G + G_HOVER] >= .25) { s[G + G_HOVER] = 0; scramble(s, p.x, p.y, 20, n + 101) }
    const press = pressStep(s, G, p, dt), tap = press === PRESS_TAP
    if (press === PRESS_HOLD) {
      s[G + G_LAGE] += dt
      if (s[G + G_LANT] <= 0 || s[G + G_LANT] >= 1) {
        // flash: kick the flies within reach (x = f(φ) + ε; x ≥ 1 fires on this step's pulse round)
        const [lx, ly] = pressAt(s, G)
        for (let i = 0; i < N; i++) {
          const dx = s[X + i] - lx, dy = s[Y + i] - ly
          if (dx * dx + dy * dy >= LANTERN_R * LANTERN_R) continue
          const x = pulseF(s[PH + i]) + LANTERN_EPS
          s[PH + i] = x >= 1 ? 1 : pulseFInv(x)
        }
        s[G + G_LANT] = dt / LANTERN_T; s[G + G_LAGE] = 0
      } else s[G + G_LANT] += dt / LANTERN_T
    } else if (s[G + G_LANT] !== 0) { s[G + G_LANT] = 0; s[G + G_LAGE] = 0 }
    if (tap || inp.kick) {
      const [px, py] = tap ? pressAt(s, G) : [72, 64]
      for (let i = 0; i < N; i++) { const dx = s[X + i] - px, dy = s[Y + i] - py; if (dx * dx + dy * dy < 30 * 30) s[PH + i] = 1 }
    }
    // ── autopilot ──
    for (let k = 0; k < gusts.length; k++) if (ph === gusts[k].at) scramble(s, gusts[k].x, gusts[k].y, 30, 1000 + k)
    // ── drift ──
    for (let i = 0; i < N; i++) {
      const x = s[X + i], y = s[Y + i], v = curl2(x / 40, y / 40, .05 * tp, seed, cv)
      let vx = v[0] * 3, vy = v[1] * 3
      if (x < MEADOW[0]) vx += (MEADOW[0] - x) * 1.5; else if (x > MEADOW[2]) vx -= (x - MEADOW[2]) * 1.5
      if (y < MEADOW[1]) vy += (MEADOW[1] - y) * 1.5; else if (y > MEADOW[3]) vy -= (y - MEADOW[3]) * 1.5
      s[X + i] = x + vx * dt; s[Y + i] = y + vy * dt
    }
    pulseStep(s.subarray(PH, PH + N), s.subarray(AGE, AGE + N), s.subarray(X, X + 3 * N), hash, pulse, n, dt)
  }
  const blend = seamBlend({ size, discrete: [...pressDiscrete(G), ...Array.from({ length: N }, (_, i) => K + i)], turns: Array.from({ length: N }, (_, i) => PH + i) })
  const world = createWorld({
    size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 80, maxCheckpoints: 24, maxSteps: Math.round((spec.lead + spec.period) / dt) + 60, idle: 4, heal: 2, maxLiveSteps: 4,
    init, step, blend,
  })
  return { world, spec, layout: { X, Y, K, PH, AGE, G, size }, pulse, grass: bakeGrass(spec, seed) }
}

/**
 * The grass silhouette, baked once: an L-system (X → F[+X]F[−X]+X | F[−X]F[+X]−X, F → FF; 4 generations, 22°)
 * grown as tufts along the bottom, its turtle sites binned per tile (bottom 26 card rows) into a line glyph along
 * the mean stroke direction.
 */
function bakeGrass(spec: FirefliesSpec, seed: number): Int16Array {
  const { cols, rows, pitch, ox, oy } = spec.tiles, tx = new Float32Array(cols * rows), ty = new Float32Array(cols * rows), cnt = new Uint16Array(cols * rows)
  const top = 144 - 26
  for (let k = 0; k < 10; k++) {
    const str = lsystem({ axiom: 'X', rules: { X: [['F[+X]F[-X]+X', .5], ['F[-X]F[+X]-X', .5]], F: 'FF' }, generations: 4, seed: seed + k })
    const lean = (ihash(seed, k, 21) / 4294967296 - .5) * .5
    const t = turtleSites(str, { x: 4 + 15 * k + 6 * (ihash(seed, k, 22) / 4294967296), y: 144, heading: -TAU / 4 + lean, angle: 22 * TAU / 360, step: .62, spacing: .5 })
    for (let q = 0; q < t.count; q++) {
      const x = t.x[q], y = t.y[q]
      if (y < top || y >= 143 || x < 0 || x >= 144) continue
      const cx = Math.floor((x - ox) / pitch), cy = Math.floor((y - oy) / pitch)
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue
      const i = cy * cols + cx, sg = t.hy[q] > 0 ? -1 : 1
      tx[i] += t.hx[q] * sg; ty[i] += t.hy[q] * sg; cnt[i]++
    }
  }
  const out = new Int16Array(cols * rows).fill(-1)
  for (let i = 0; i < out.length; i++) if (cnt[i] >= 2) out[i] = edgeOfTangent(EDGE3, tx[i], ty[i]).index
  return out
}

/** The lantern while a press is held (card cells; `lit` during its flash), else undefined. */
export function flyLantern(f: Fireflies, s: Float32Array): { x: number; y: number; lit: boolean } | undefined {
  const G = f.layout.G
  return s[G + 3] > .5 ? { x: s[G + 1], y: s[G + 2], lit: s[G + G_LAGE] < LANTERN_LIT } : undefined
}
export interface FlyView { x: number; y: number; phase: number; age: number }
export function flyViews(f: Fireflies, s: Float32Array): FlyView[] {
  const { X, Y, PH, AGE } = f.layout
  return Array.from({ length: FLIES }, (_, i) => ({ x: s[X + i], y: s[Y + i], phase: s[PH + i], age: s[AGE + i] }))
}
const syncTheta = new Float32Array(FLIES)
/** The swarm's order parameter r = |Σ e^{2πiφ}| / N (1 = every fly in step), for the caption and the checks. */
export function flySync(f: Fireflies, s: Float32Array): number {
  for (let i = 0; i < FLIES; i++) syncTheta[i] = s[f.layout.PH + i] * TAU
  return kuramotoOrder(syncTheta)
}
const DOT = glyphOf(EDGE3, '·')
/**
 * Draw the meadow: stars (by the hour: they come out through dusk, sky.ts), grass, then the flies (resting dots, then
 * flashes on top), and the lantern while a press is held (a white lattice dot when it flashes: the finger's light is
 * not a fly's, so it is never the accent).
 */
export function drawFireflies(f: Fireflies, s: Float32Array, t: number, hour: number, r: TileRaster): void {
  const { cols, rows, pitch, ox, oy } = f.spec.tiles, { X, Y, AGE } = f.layout
  clearTiles(r)
  const nl = nightness(hour)
  if (nl > 0) for (let ty = 0; ty < 18; ty++) for (let tx = 0; tx < cols; tx++) if (flickerOn(tx, ty, t, .025, .02, .3) && nightTile(tx, ty, nl)) putGlyph(r, tx, ty, DOT, T_FAINT, .6)
  for (let i = 0; i < cols * rows; i++) if (f.grass[i] >= 0) putGlyph(r, i % cols, (i / cols) | 0, EDGE3.glyphs[f.grass[i]], T_MID, .6)
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < FLIES; i++) {
    const a = s[AGE + i], kind = a < FLASH_PEAK ? 2 : a < FLASH_TAIL ? 1 : 0
    if (kind !== pass) continue
    const tx = Math.floor((s[X + i] - ox) / pitch), ty = Math.floor((s[Y + i] - oy) / pitch)
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) continue
    if (kind === 2) putBig(r, tx, ty, T_ACTIVE, 1)
    else if (kind === 1) { if (r.bigTone[ty * cols + tx] < 0) putGlyph(r, tx, ty, DOT, T_ACTIVE, .6) }
    else putGlyph(r, tx, ty, DOT, T_MID, .6)
  }
  const lantern = flyLantern(f, s)
  if (lantern) {
    const tx = Math.floor((lantern.x - ox) / pitch), ty = Math.floor((lantern.y - oy) / pitch)
    if (lantern.lit) putBig(r, tx, ty, T_VALUE, 1)
    else putGlyph(r, tx, ty, glyphOf(EDGE3, 'o'), T_MID, .8)
  }
}
