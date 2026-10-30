/**
 * The koi scene (docs/living-matter/L-pond.md §L1): a `World` (physics/world.ts) whose one flat state holds the koi
 * (head agents + argonaut spines), the food pellets, Elias wave-equation water at tile resolution and a foam field;
 * and `drawKoiPond`, which paints a state into a glyph-tile raster (bank stones, water glyphs, foam, shadows, koi
 * bodies, pellets, lily pads). Engine side only: no chrome, no React. Shared by the `pond-koi` card and the L4 hero.
 *
 * Determinism: every step uses dsin/dcos/datan2/dpow (noise/dmath), `rngFor`/`ihash` streams, literal constants and
 * Float32 state, so the pristine run is the same in every engine. Schedules read the loop phase (`phaseSteps`), so
 * the pre-roll before `lead` lines up with the loop end and the seam has nothing to fake.
 *
 * Behaviour: Reynolds steering (wander, contain, separate, align, food, curiosity, lure) sets where a koi wants to
 * go; the heading turns toward it at a capped rate (1.4 rad/s cruising, 2.5 bursting, 14 in a C-start), and speed
 * comes from burst-and-glide swimming (burst .6–1.2 s at .9 L/s² toward 1.4 L/s, glide 1.5–3.5 s decaying toward the
 * .35 L/s cruise). The tail beats at the Strouhal frequency f = 1.5·U/L.
 */
import { createWorld, type StepInput, type World } from '../physics/world'
import { curl2, dcos, dsin, fbm2, ihash, noise2, rngFor, TAU, voronoi2 } from '../noise'
import { createRipple, rippleAdd, rippleGrad, rippleSplat, rippleStep, rippleTilt, type Ripple } from './ripple'
import { chainFollow, chainInit, createChain, type Chain } from './chain'
import { bodyRaster, createBodyRaster, koiPattern, markingAt, MARK_RED, MARK_SUMI, PART_BODY, profileAt, tailBeatHz, type BodySpec, type KoiKind } from './body'
import { align, arrive, contain, CSTART, integrate, separate, startle, turnCap, wander, type Agent } from './steer'
import { moonAcross, nightness, nightTile } from './sky'
import {
  clearTiles, EDGE3, edgeOfGradient, edgeOfTangent, flickerOn, FONT57, glyphOf, matchTile, putBig, putGlyph, RAMP3, rampGlyph, SHAPE3,
  T_ACTIVE, T_FAINT, T_IDLE, T_MID, T_VALUE, type Glyph, type TileGrid, type TileRaster,
} from './glyphTiles'

export interface KoiPondSpec {
  seed: number; tiles: TileGrid; card: { cols: number; rows: number }
  /** Pond SDF in card cells (< 0 = water); obstacle boxes for the L4 hero (`[data-pond-avoid]`). */
  sdf: (x: number, y: number) => number
  avoid?: () => readonly [number, number, number, number][]
  koi: { kind: KoiKind; length: number }[]
  /** Autopilot drops: [phase seconds, x, y, count] (none in the hero). */
  feeds?: [number, number, number, number][]
  /** Autopilot surface kisses: [phase seconds, koi index]. */
  kisses?: [number, number][]
  /** Lily pads: [x, y, radius] base positions in card cells (they drift ±6 cells, render-time). */
  pads?: [number, number, number][]
  lead: number; period: number; seam: number
  /** Koi interiors: 'lattice' (style B, the L1.0 default) or 'glyph' (style A). */
  bodyStyle?: BodyStyle
}
export type BodyStyle = 'glyph' | 'lattice'
/** The L1.0 ruling's default (L-pond.md §L1 "Body style B"): change it here to switch every pond to style A. */
export const DEFAULT_BODY_STYLE: BodyStyle = 'lattice'

export interface KoiPond {
  world: World; spec: KoiPondSpec; ripple: Ripple; chains: Chain[]
  /** koiPattern LUT per koi. */
  markings: Uint8Array[]
  bodyStyle: BodyStyle
  /** State layout (offsets). */
  layout: PondLayout
  /** Baked once: bank glyph per tile (-1 = none / water). */
  bank: Int16Array
  /** Baked once: shore line glyph per water tile next to the bank (-1 = open water). */
  shore: Int16Array
  /** Water per tile (the ripple mask). */
  water: Uint8Array
  bodies: BodySpec[]
}
export interface PondLayout { G: number; KOI: number; SPINE: number; PEL: number; RIP: number; FOAM: number; size: number; fw: number; fh: number; pellets: number }

// ── constants ───────────────────────────────────────────────────────────────────────────────────────
export const POND_DT = 1 / 30
/** Peak half-width × L: .13 (the plan's .11 read as eels at tile resolution; koi seen from above are about 1/4 as wide as long). */
export const KOI_HALF_WIDTH = .13
const NODES = 20, PELLETS = 18
/**
 * Joint limit of a koi spine. The plan's .16 rad lets a 20-node koi curl into a full C while cruising; .11 keeps the
 * body as stiff as a koi's (a C-start still curls it visibly).
 */
const BEND = .11
const KS = 19, SPS = 2 * NODES, PS = 8
/** Floats per koi in the state (the checks read slots 5 and 6, phase and beat). */
export const KOI_SLOTS = KS
/**
 * Koi slots. L3 added the circle-back (K_BACK: pellet + 1 while circling back to a missed pellet, −(pellet + 1) once
 * done with it, 0 none; K_BACKT its time left) and the startle contagion timer (K_CONTAG).
 */
const K_HX = 0, K_HY = 1, K_U = 2, K_Z = 3, K_ZT = 4, K_PHASE = 5, K_BEAT = 6, K_MODE = 7, K_LEFT = 8, K_SIGN = 9, K_REFR = 10, K_FOOD = 11, K_HUNGER = 12, K_GULP = 13, K_CURIOUS = 14, K_TURN = 15
const K_BACK = 16, K_BACKT = 17, K_CONTAG = 18
export const MODE_CRUISE = 0, MODE_BURST = 1, MODE_GLIDE = 2, MODE_BEND = 3, MODE_ESCAPE = 4
/** Globals (G_CASC: what is left of the current startle cascade, L3.2). */
const G_STILL = 0, G_PRESS = 1, G_PX = 2, G_PY = 3, G_LURE = 4, G_LX = 5, G_LY = 6, G_NEXT = 7, G_WALL = 8, G_CASC = 9
/** Pellet slots and states. */
const P_X = 0, P_Y = 1, P_H = 2, P_VH = 3, P_STATE = 4, P_AGE = 5, P_VX = 6, P_VY = 7
export const PEL_OFF = 0, PEL_FALLING = 1, PEL_FLOATING = 2, PEL_EATEN = 3, PEL_SINKING = 4

/** Loop phase in steps: ((n − start) % len + len) % len. */
export const phaseSteps = (n: number, start: number, len: number) => (((n - start) % len) + len) % len

/**
 * Swim speeds in body lengths per second. Published burst speeds (1.4 L/s) look frantic in a pond 2.4 body lengths
 * wide, so the koi here cruise at .28 L/s and burst to 1 L/s (at .6 L/s²); the C-start keeps its 2.6 L/s escape.
 */
const CRUISE = .28, BURST_U = 1, BURST_ACC = .6, ESCAPE_U = 2.6, MIN_U = .18
/** Turn caps (rad/s): cruising 1, bursting 1.8, C-start 14. */
const TURN_CRUISE = turnCap(1, POND_DT), TURN_BURST = turnCap(1.8, POND_DT), TURN_CSTART = turnCap(CSTART.omega, POND_DT)
const CSTART_STEP = CSTART.omega * POND_DT
/** A body tile at least this covered is an interior tile (style B: one lattice dot). The plan's .85 left a 3-tile-wide koi mostly edge glyphs. */
const INTERIOR = .6
/** Smallest turn radius outside a C-start, in body lengths (the turn cap is min(mode cap, U / (this · L))); tighter near the bank. */
const TURN_RADIUS = .9, TURN_RADIUS_WALL = .45
let lastW = -1, lastCap = TURN_CRUISE
/** Fixed light for koi shading, normalised (a literal: (−.45, −.55, .70) / 0.99373). */
export const KOI_LIGHT = [-.45 / .99373035, -.55 / .99373035, .70 / .99373035] as const
const KL = KOI_LIGHT
/** The light this frame's koi are shaded by (drawKoiPond's `light`, else KOI_LIGHT). */
let kl: readonly [number, number, number] = KL
/** Water crest light (screen), ∇h·L > .12 → '='. */
const WL = [-.6, -.8] as const

// ── L3: feeding, startle and tilt depth ──
/**
 * Hunger rises .02/s and a pellet takes .35 off; a koi below .2 is sated and ignores food. The pristine run's first
 * feed (loop phase 6 s) meets koi at ≥ .36, so they all eat; two or three pellets sate one for about ten seconds.
 */
export const HUNGER_RATE = .02, HUNGER_BITE = .35, SATED = .2
/** A gulp shows as a head 1 cell wider for .3 s: K_GULP decays ×(1 − dt/.5) a step, so it is above .54 for .3 s. */
export const GULP_SHOW = .54
/** A missed pellet: circle back once, arriving slowly (max .6 L/s, slowing within 1 L), for at most 3 s. */
const BACK_U = .6, BACK_SLOW = 1, BACK_T = 3
/** Startle contagion: a startled koi startles the koi within .5 L of its head 80 ms later (2 steps); a cascade startles at most 3 koi. */
export const CONTAG_R = .5, CONTAG_S = .08, CASCADE = 3
/**
 * A pointer flick startles koi within .9 L at this speed (cells/s). L1 used 90, which an ordinary mouse pass reaches
 * (a 380 px card is 2.6 px a cell: 90 cells/s is 240 px/s); 200 cells/s (~520 px/s) is a deliberate flick.
 */
export const FLICK = 200
/** Water tilt forcing per step (`rippleTilt`) and the pellets' downhill drift per unit tilt (cells/s). */
export const TILT_K = .004, TILT_DRIFT = 8
/** The hover wake's depth by pointer speed: none below 10 cells/s, the L1 depth (.04) at 50, at most .06. */
const wakeAmp = (speed: number) => -.04 * Math.min(1.5, (speed - 10) / 40)

export function pondLayout(koi: number, tiles: TileGrid): PondLayout {
  const G = 0, KOI = 16, SPINE = KOI + KS * koi, PEL = SPINE + SPS * koi, RIP = PEL + PS * PELLETS
  const cells = tiles.cols * tiles.rows, FOAM = RIP + 2 * cells, fw = Math.ceil(tiles.cols / 2), fh = Math.ceil(tiles.rows / 2)
  return { G, KOI, SPINE, PEL, RIP, FOAM, size: FOAM + fw * fh, fw, fh, pellets: PELLETS }
}

// ── the world ───────────────────────────────────────────────────────────────────────────────────────
export function createKoiPond(spec: KoiPondSpec): KoiPond {
  const { tiles, seed } = spec, K = spec.koi.length, lay = pondLayout(K, tiles), dt = POND_DT
  const tileX = (tx: number) => tiles.ox + tiles.pitch * tx + 1.5, tileY = (ty: number) => tiles.oy + tiles.pitch * ty + 1.5
  const water = new Uint8Array(tiles.cols * tiles.rows)
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) water[ty * tiles.cols + tx] = spec.sdf(tileX(tx), tileY(ty)) < 0 ? 1 : 0
  const ripple = createRipple({ w: tiles.cols, h: tiles.rows, damp: .984, mask: water }, lay.RIP)
  const bodies: BodySpec[] = spec.koi.map(k => ({ length: k.length, halfWidth: KOI_HALF_WIDTH, fins: true, tail: true }))
  const chains = spec.koi.map((k, i) => createChain(NODES, k.length / (NODES - 1), BEND, lay.SPINE + SPS * i))
  const markings = spec.koi.map((k, i) => koiPattern(k.kind, (ihash(seed, i, 77) & 0xffff)))
  const start = Math.round(spec.lead / dt), len = Math.round(spec.period / dt)
  const feeds = (spec.feeds ?? []).map(([sec, x, y, count]) => ({ at: Math.round(sec / dt), x, y, count }))
  const kisses = (spec.kisses ?? []).map(([sec, koi]) => ({ at: Math.round(sec / dt), koi }))
  const dives = spec.koi.map((_, i) => { const every = Math.round((8 + 12 * (ihash(seed, i, 31) / 4294967296)) / dt); return { every, off: Math.floor((ihash(seed, i, 32) / 4294967296) * every) } })
  // the bank, baked once: voronoi stones with grout, density from fBm
  const bank = new Int16Array(tiles.cols * tiles.rows).fill(-1)
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) {
    const i = ty * tiles.cols + tx
    if (water[i]) continue
    const x = tileX(tx), y = tileY(ty), vo = voronoi2(x / 7, y / 7, seed, 'l2')
    if (vo.f2 - vo.f1 < .08) continue
    bank[i] = rampGlyph(RAMP3, .2 + .3 * (fbm2(x / 9, y / 9, 3, seed) * .5 + .5) + .3 * (1 - Math.min(1, vo.f1 * 1.4))).index
  }

  // the shore, baked once: water tiles next to the bank draw a line along it (the pond's rim)
  const shore = new Int16Array(tiles.cols * tiles.rows).fill(-1)
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) {
    const i = ty * tiles.cols + tx, x = tileX(tx), y = tileY(ty), d = spec.sdf(x, y)
    if (!water[i] || d < -3.2) continue
    shore[i] = edgeOfGradient(EDGE3, spec.sdf(x + 1, y) - spec.sdf(x - 1, y), spec.sdf(x, y + 1) - spec.sdf(x, y - 1)).index
  }

  // scratch (outside the state: the World contract)
  const f = new Float32Array(2), cs = new Float32Array(4), others = new Float32Array(4 * K), heads = new Float32Array(3 * K)
  const a: Agent = { x: 0, y: 0, hx: 1, hy: 0, u: 0 }
  const foamTmp = new Float32Array(lay.fw * lay.fh)
  const toRx = (x: number) => (x - tiles.ox - 1.5) / tiles.pitch, toRy = (y: number) => (y - tiles.oy - 1.5) / tiles.pitch

  const KO = (i: number) => lay.KOI + KS * i
  const insideWater = (x: number, y: number) => spec.sdf(x, y) < -1.5

  function dropPellets(s: Float32Array, x: number, y: number, count: number, salt: number, n: number) {
    const rng = rngFor(seed, 1000 + salt, n)
    for (let k = 0; k < count; k++) {
      const slot = s[lay.G + G_NEXT] | 0, o = lay.PEL + PS * slot
      s[lay.G + G_NEXT] = (slot + 1) % PELLETS
      const th = TAU * rng(), r = 5 * Math.sqrt(rng())
      let px = x + r * dcos(th), py = y + r * dsin(th)
      for (let it = 0; it < 12 && !insideWater(px, py); it++) { px += (72 - px) * .15; py += (77 - py) * .15 }
      s[o + P_X] = px; s[o + P_Y] = py; s[o + P_H] = 1; s[o + P_VH] = -rng() * .5; s[o + P_STATE] = PEL_FALLING; s[o + P_AGE] = 0; s[o + P_VX] = 0; s[o + P_VY] = 0
    }
  }
  /** C-start koi i away from (sx, sy) unless it is refractory; it passes the startle on 80 ms later (contagion). */
  function startleKoi(s: Float32Array, i: number, sx: number, sy: number, n: number): boolean {
    const o = KO(i), c = chains[i]
    if (s[o + K_REFR] > 0) return false
    a.x = s[c.X]; a.y = s[c.Y]; a.hx = s[o + K_HX]; a.hy = s[o + K_HY]; a.u = s[o + K_U]
    startle(a, sx, sy, ihash(seed, i, n) / 4294967296, cs)
    s[o + K_MODE] = MODE_BEND; s[o + K_LEFT] = Math.round(CSTART.bend / dt) * dt; s[o + K_SIGN] = cs[2]; s[o + K_TURN] = cs[3]; s[o + K_REFR] = CSTART.refractory
    s[o + K_CONTAG] = CONTAG_S
    return true
  }
  /** A burst; when the koi is going for food the burst also leaves a tiny ripple at its head (L3.1). */
  function burst(s: Float32Array, i: number, n: number, food: boolean) {
    newMode(s, i, MODE_BURST, n)
    if (food) { const c = chains[i]; rippleSplat(ripple, s, toRx(s[c.X]), toRy(s[c.Y]), -.08, .8) }
  }
  /** The contagion pass: each koi whose timer runs out startles the koi within .5 L of its head, while the cascade lasts. */
  function contagion(s: Float32Array, n: number) {
    for (let i = 0; i < K; i++) {
      const o = KO(i)
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
        if (near && startleKoi(s, j, x, y, n)) s[lay.G + G_CASC] -= 1
      }
    }
  }
  function newMode(s: Float32Array, i: number, mode: number, n: number) {
    const o = KO(i), rng = rngFor(seed, i, n)
    s[o + K_MODE] = mode
    s[o + K_LEFT] = mode === MODE_BURST ? .6 + .6 * rng() : 1.5 + 2 * rng()
  }

  /** A release: a press shorter than .3 s (and no lure) drops food at the press point and startles the koi near it. */
  function release(s: Float32Array, n: number) {
    const G = lay.G
    if (s[G + G_PRESS] < .3 && !s[G + G_LURE]) {
      const px = s[G + G_PX], py = s[G + G_PY]
      if (spec.sdf(px, py) < 0) {
        dropPellets(s, px, py, 5 + Math.floor(3 * (ihash(seed, n, 5) / 4294967296)), 7, n)
        rippleSplat(ripple, s, toRx(px), toRy(py), -.5, 1)
        let hit = 0
        for (let i = 0; i < K; i++) { const c = chains[i], dx = s[c.X] - px, dy = s[c.Y] - py, r = .7 * bodies[i].length; if (dx * dx + dy * dy < r * r && startleKoi(s, i, px, py, n)) hit++ }
        if (hit) s[G + G_CASC] = Math.max(0, CASCADE - hit)
      }
    }
    s[G + G_PRESS] = -1; s[G + G_LURE] = 0
  }

  function step(s: Float32Array, n: number, inp: StepInput) {
    const ph = phaseSteps(n, start, len), t = n * dt, G = lay.G
    // ── input ──
    const p = inp.pointers[0]
    let ptrX = 0, ptrY = 0, ptrIn = false, ptrDown = false, ptrSpeed = 0
    if (p) {
      ptrX = p.x; ptrY = p.y; ptrIn = spec.sdf(p.x, p.y) < 0; ptrDown = p.down; ptrSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (p.pressed) {
        if (ptrIn) rippleSplat(ripple, s, toRx(p.x), toRy(p.y), -1.2, 1.6)
        s[G + G_PRESS] = 0; s[G + G_PX] = p.x; s[G + G_PY] = p.y
      }
      if (p.down && s[G + G_PRESS] >= 0) {
        s[G + G_PRESS] += dt
        if (s[G + G_PRESS] >= .3) { s[G + G_LURE] = 1; s[G + G_LX] = p.x; s[G + G_LY] = p.y }
      }
      if (p.released && s[G + G_PRESS] >= 0) release(s, n)
      if (!p.down && !p.released) { s[G + G_PRESS] = -1; s[G + G_LURE] = 0 }
      if (!p.down && ptrIn && ptrSpeed > 10) rippleSplat(ripple, s, toRx(p.x), toRy(p.y), wakeAmp(ptrSpeed), .7)
      if (ptrSpeed > FLICK) {
        let hit = 0
        for (let i = 0; i < K; i++) {
          const c = chains[i], dx = s[c.X] - p.x, dy = s[c.Y] - p.y, r = .9 * bodies[i].length
          if (dx * dx + dy * dy < r * r && startleKoi(s, i, p.x, p.y, n)) hit++
        }
        if (hit) s[G + G_CASC] = Math.max(0, CASCADE - hit)
      }
      s[G + G_STILL] = ptrIn && !p.down && ptrSpeed < 6 ? s[G + G_STILL] + dt : 0
    } else {
      // a lifted touch leaves the frame instead of reporting down = false (framePointers drops it): that is a release
      if (s[G + G_PRESS] >= 0) release(s, n)
      s[G + G_STILL] = 0; s[G + G_PRESS] = -1; s[G + G_LURE] = 0
    }
    if (inp.kick) dropPellets(s, 72, 77, 6, 9, n)

    // ── autopilot (loop phase) ──
    for (let k = 0; k < feeds.length; k++) if (ph === feeds[k].at) dropPellets(s, feeds[k].x, feeds[k].y, feeds[k].count, k, n)
    for (let i = 0; i < K; i++) {
      const o = KO(i), d = dives[i], q = ph + d.off
      if (q % d.every === 0) s[o + K_ZT] = .1 + .55 * (ihash(seed, i, Math.floor(q / d.every) + 100) / 4294967296)
    }
    for (const k of kisses) {
      if (k.koi >= K) continue
      const o = KO(k.koi), c = chains[k.koi]
      if (ph >= k.at - 90 && ph < k.at) s[o + K_ZT] = 0
      if (ph === k.at) { rippleSplat(ripple, s, toRx(s[c.X]), toRy(s[c.Y]), -.6, 1); s[o + K_GULP] = 1; s[o + K_ZT] = .3 }
    }

    // ── startle contagion (L3.2) ──
    contagion(s, n)

    // ── steer + integrate ──
    // neighbours: heads (x, y) and (hx, hy, u)
    for (let i = 0; i < K; i++) { const o = KO(i); heads[3 * i] = s[o + K_HX]; heads[3 * i + 1] = s[o + K_HY]; heads[3 * i + 2] = s[o + K_U] }
    const curious0 = s[G + G_STILL] >= .6 && ptrIn && !ptrDown ? nearestTwo(s, ptrX, ptrY) : -1
    for (let i = 0; i < K; i++) {
      const o = KO(i), c = chains[i], L = bodies[i].length
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
          if (prevFood < 0 && back <= 0 && (mode === MODE_GLIDE || mode === MODE_CRUISE)) { burst(s, i, n, true); mode = MODE_BURST }
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
            if (mode === MODE_GLIDE || mode === MODE_CRUISE) { newMode(s, i, MODE_BURST, n); mode = MODE_BURST }
          }
        }
        // burst and glide
        let beat = s[o + K_BEAT], maxU = BURST_U * L, turn = TURN_CRUISE
        if (mode === MODE_ESCAPE) {
          a.u += (ESCAPE_U * L - a.u) * .5; beat = 1; maxU = ESCAPE_U * L; turn = TURN_BURST
          if (s[o + K_LEFT] <= 0) { newMode(s, i, MODE_GLIDE, n); mode = MODE_GLIDE }
        } else if (mode === MODE_BURST) {
          a.u = Math.min(BURST_U * L, a.u + BURST_ACC * L * dt); beat += (1 - beat) * .25; turn = TURN_BURST
          if (s[o + K_LEFT] <= 0) { newMode(s, i, MODE_GLIDE, n); mode = MODE_GLIDE }
        } else {
          // glide (and cruise: a glide that has slowed to the cruise speed paddles gently)
          beat *= 1 - dt / .6
          a.u = Math.max(CRUISE * L, a.u * (1 - dt / 2.2))
          if (a.u <= CRUISE * L * 1.05) beat = Math.max(beat, .3)
          if (s[o + K_LEFT] <= 0) { burst(s, i, n, food >= 0); mode = MODE_BURST }
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

    // ── pellets ──
    for (let k = 0; k < PELLETS; k++) {
      const o = lay.PEL + PS * k, st = s[o + P_STATE]
      if (st === PEL_OFF) continue
      s[o + P_AGE] += dt
      if (st === PEL_FALLING) {
        s[o + P_VH] -= 9.8 * dt; s[o + P_H] += s[o + P_VH] * dt
        if (s[o + P_H] <= 0) { s[o + P_H] = 0; s[o + P_STATE] = PEL_FLOATING; s[o + P_AGE] = 0; rippleSplat(ripple, s, toRx(s[o + P_X]), toRy(s[o + P_Y]), -.35, .8) }
      } else if (st === PEL_FLOATING) {
        const v = curl2(s[o + P_X] / 40, s[o + P_Y] / 40, .05 * t, seed, cv)
        s[o + P_VX] = v[0] * 1.5 + inp.gx * TILT_DRIFT; s[o + P_VY] = v[1] * 1.5 + inp.gy * TILT_DRIFT
        const x = s[o + P_X] + s[o + P_VX] * dt, y = s[o + P_Y] + s[o + P_VY] * dt
        if (insideWater(x, y)) { s[o + P_X] = x; s[o + P_Y] = y }
        if (s[o + P_AGE] > 14) { s[o + P_STATE] = PEL_SINKING; s[o + P_AGE] = 0 }
      } else if (st === PEL_SINKING) { if (s[o + P_AGE] > 1.5) s[o + P_STATE] = PEL_OFF }
      else if (st === PEL_EATEN) { if (s[o + P_AGE] > .4) s[o + P_STATE] = PEL_OFF }
    }

    // ── wake and foam ──
    const F = lay.FOAM
    for (let i = 0; i < K; i++) {
      const o = KO(i), c = chains[i], L = bodies[i].length, ul = s[o + K_U] / L
      const amt = -.01 * ul * s[o + K_BEAT] * (1 - s[o + K_Z])
      for (let q = 12; q < NODES; q++) {
        const rx = toRx(s[c.X + q]), ry = toRy(s[c.Y + q])
        rippleAdd(ripple, s, rx, ry, amt)
        const fx = Math.floor((rx + .5) / 2), fy = Math.floor((ry + .5) / 2)
        if (fx >= 0 && fy >= 0 && fx < lay.fw && fy < lay.fh) s[F + fy * lay.fw + fx] += .05 * ul * (1 - s[o + K_Z])
      }
    }
    rippleStep(ripple, s)
    // tilt (L3.6): the card passes the light hub's (tx, ty) as the world's gravity channel; 0 in the pristine run
    rippleTilt(ripple, s, inp.gx, inp.gy, TILT_K)
    const fn = lay.fw * lay.fh
    for (let i = 0; i < fn; i++) s[F + i] *= .95
    if ((n & 1) === 0) {
      for (let y = 0; y < lay.fh; y++) for (let x = 0; x < lay.fw; x++) {
        const i = y * lay.fw + x, v = s[F + i] * .125
        foamTmp[i] += s[F + i] * .5
        if (x > 0) foamTmp[i - 1] += v; else foamTmp[i] += v
        if (x < lay.fw - 1) foamTmp[i + 1] += v; else foamTmp[i] += v
        if (y > 0) foamTmp[i - lay.fw] += v; else foamTmp[i] += v
        if (y < lay.fh - 1) foamTmp[i + lay.fw] += v; else foamTmp[i] += v
      }
      for (let i = 0; i < fn; i++) { s[F + i] = foamTmp[i]; foamTmp[i] = 0 }
    }
  }
  const cv: [number, number] = [0, 0]
  /** The two nearest koi (head) within 2 L of (x, y), packed as (i + 1) | (j + 1) << 8 (index tie-break). */
  function nearestTwo(s: Float32Array, x: number, y: number): number {
    let b0 = -1, b1 = -1, d0 = Infinity, d1 = Infinity
    for (let i = 0; i < K; i++) {
      const c = chains[i], dx = s[c.X] - x, dy = s[c.Y] - y, d = dx * dx + dy * dy
      if (d > (2 * bodies[i].length) ** 2) continue
      if (d < d0) { b1 = b0; d1 = d0; b0 = i; d0 = d } else if (d < d1) { b1 = i; d1 = d }
    }
    return b0 < 0 ? -1 : (b0 + 1) | ((b1 + 1) << 8)
  }

  function init(s: Float32Array) {
    s[lay.G + G_PRESS] = -1
    for (let i = 0; i < K; i++) {
      const o = KO(i), h = (salt: number) => ihash(seed, i, salt) / 4294967296
      // spread on a ring around the centre, headings mostly along it
      const ang = TAU * (i / K + .1 * h(1)), rad = .45 + .15 * h(2)
      const x = 72 + 50 * rad * dcos(ang), y = 77 + 46 * rad * dsin(ang)
      const ha = ang + Math.PI / 2 + (h(3) - .5) * 1.2, hx = dcos(ha), hy = dsin(ha)
      s[o + K_HX] = hx; s[o + K_HY] = hy; s[o + K_U] = CRUISE * spec.koi[i].length
      s[o + K_Z] = s[o + K_ZT] = .2 + .5 * h(4); s[o + K_PHASE] = TAU * h(5); s[o + K_BEAT] = .3
      s[o + K_MODE] = MODE_GLIDE; s[o + K_LEFT] = 1 + 2.5 * h(6); s[o + K_FOOD] = -1; s[o + K_SIGN] = 1; s[o + K_HUNGER] = .25 * h(8)
      chainInit(chains[i], s, x, y, hx, hy)
    }
  }

  // blend: lerp the continuous floats; discrete slots snap at k ≥ .5; headings renormalised, phases on the circle
  const discrete = new Uint8Array(lay.size), phases: number[] = [], headsAt: number[] = []
  for (const g of [G_PRESS, G_LURE, G_NEXT]) discrete[lay.G + g] = 1
  for (let i = 0; i < K; i++) { const o = KO(i); discrete[o + K_MODE] = discrete[o + K_SIGN] = discrete[o + K_FOOD] = discrete[o + K_BACK] = 1; phases.push(o + K_PHASE); headsAt.push(o + K_HX) }
  for (let k = 0; k < PELLETS; k++) discrete[lay.PEL + PS * k + P_STATE] = 1
  const isPhase = new Uint8Array(lay.size)
  for (const q of phases) isPhase[q] = 1
  /**
   * The world's seam calls this after each of the loop's last steps with k = 1/(rem + 1), toward the fixed loop-start
   * state, while the koi keep swimming; at that k the motion reopens the gap every step and the koi land about a tile
   * off. Doubling k (capped at 1) makes the remaining gap telescope, the product of (rem - 1)/(rem + 1), to exactly 0
   * at the last step. A heal (k = 1/healLeft) still ends on the pristine state.
   */
  function blend(x: Float32Array, y: Float32Array, k0: number) {
    const k = k0 >= .5 ? 1 : 2 * k0
    for (let i = 0; i < x.length; i++) {
      if (discrete[i]) { if (k >= .5) x[i] = y[i]; continue }
      if (isPhase[i]) {
        let d = y[i] - x[i]
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU
        let v = x[i] + d * k
        if (v >= TAU) v -= TAU; else if (v < 0) v += TAU
        x[i] = v; continue
      }
      x[i] += (y[i] - x[i]) * k
    }
    for (const q of headsAt) { const hx = x[q], hy = x[q + 1], l = Math.sqrt(hx * hx + hy * hy); if (l > 1e-9) { x[q] = hx / l; x[q + 1] = hy / l } else { x[q] = 1; x[q + 1] = 0 } }
  }

  const world = createWorld({
    size: lay.size, dt, lead: spec.lead, period: spec.period, seam: spec.seam,
    every: 120, maxCheckpoints: 16, maxSteps: 2400, idle: 4, heal: 2, maxLiveSteps: 4,
    // no gravity: the pond reads the input's (gx, gy) as the hub's tilt (tx, ty), exactly 0 at rest and in the pristine run
    gravity: [0, 0],
    init, step, blend,
  })
  return { world, spec, ripple, chains, markings, bodyStyle: spec.bodyStyle ?? DEFAULT_BODY_STYLE, layout: lay, bank, shore, water, bodies }
}

// ── read-outs (cards, checks, probes) ───────────────────────────────────────────────────────────────
export interface KoiView {
  x: number; y: number; hx: number; hy: number; u: number; z: number; beat: number; phase: number; mode: number; refractory: number; curious: number
  /** L3.1: hunger 0..1, the gulp pulse, the pellet it is after (−1 none) and its circle-back slot (> 0 circling back). */
  hunger: number; gulp: number; food: number; back: number
}
export function koiView(p: KoiPond, s: Float32Array, i: number): KoiView {
  const o = p.layout.KOI + KS * i, c = p.chains[i]
  return {
    x: s[c.X], y: s[c.Y], hx: s[o + K_HX], hy: s[o + K_HY], u: s[o + K_U], z: s[o + K_Z], beat: s[o + K_BEAT], phase: s[o + K_PHASE], mode: s[o + K_MODE], refractory: s[o + K_REFR], curious: s[o + K_CURIOUS],
    hunger: s[o + K_HUNGER], gulp: s[o + K_GULP], food: s[o + K_FOOD], back: s[o + K_BACK],
  }
}
/** The head bulge (cells) koi i draws with: 1 during the first .3 s of a gulp (L3.1), else 0. */
export const koiBulge = (p: KoiPond, s: Float32Array, i: number) => (s[p.layout.KOI + KS * i + K_GULP] > GULP_SHOW ? 1 : 0)
/** Set every koi's hunger (checks: sated koi ignore food). */
export function setKoiHunger(p: KoiPond, s: Float32Array, v: number): void { for (let i = 0; i < p.spec.koi.length; i++) s[p.layout.KOI + KS * i + K_HUNGER] = v }
export interface PelletView { x: number; y: number; h: number; state: number; age: number }
export function pelletViews(p: KoiPond, s: Float32Array): PelletView[] {
  const out: PelletView[] = []
  for (let k = 0; k < PELLETS; k++) { const o = p.layout.PEL + PS * k; if (s[o + P_STATE] !== PEL_OFF) out.push({ x: s[o + P_X], y: s[o + P_Y], h: s[o + P_H], state: s[o + P_STATE], age: s[o + P_AGE] }) }
  return out
}
export const pondGlobals = (p: KoiPond, s: Float32Array) => ({ still: s[p.layout.G + G_STILL], press: s[p.layout.G + G_PRESS], lure: s[p.layout.G + G_LURE], lureX: s[p.layout.G + G_LX], lureY: s[p.layout.G + G_LY], wallHits: s[p.layout.G + G_WALL], cascade: s[p.layout.G + G_CASC] })

// ── drawing ─────────────────────────────────────────────────────────────────────────────────────────
const body = createBodyRaster()
const grad = new Float32Array(3)
const sub16 = new Float32Array(16)
/** Per-koi tile list, filled before drawing (shadows first, then bodies). */
interface KoiTiles { n: number; ti: Int32Array; cover: Float32Array; s: Float32Array; vn: Float32Array; shade: Float32Array; part: Uint8Array; sub: Float32Array }
const koiTiles: KoiTiles[] = []
const tilesFor = (k: number): KoiTiles => (koiTiles[k] ??= { n: 0, ti: new Int32Array(512), cover: new Float32Array(512), s: new Float32Array(512), vn: new Float32Array(512), shade: new Float32Array(512), part: new Uint8Array(512), sub: new Float32Array(512 * 16) })
const tileOrder: number[] = []

/** Quantize-friendly value steps: 1 → .8 → .6 → 0 (no dot). */
const stepDown = (v: number, k: number) => { let x = v >= .95 ? 2 : v >= .75 ? 1 : 0; x -= k; return x >= 2 ? 1 : x === 1 ? .8 : x === 0 ? .6 : 0 }

export interface KoiDrawOpts {
  /** Unit light for the koi shading (x right, y down, z up; L3.6: the hub's tilt light). Default KOI_LIGHT. */
  light?: readonly [number, number, number]
  /** The hub's tilt (tx, ty): lily pads drift 3 cells per unit downhill (render-time). Default none. */
  tilt?: readonly [number, number]
}
/**
 * Draw the scene state at t into `r` (water, foam, shadows, koi, pellets, pads), day/night from `hour` (sky.ts:
 * night 21–05, ramps at dusk and dawn; by day nothing changes). Values sit on quantize steps (.6, .8, 1); the only
 * accent is the red marking of a koi (`active`, never activeDim). A raster on another tile grid than the scene's
 * (L3.4's TYPE grid, `KOI_TYPE_TILES`) is drawn in 5×7 font glyphs by `drawKoiType`.
 */
export function drawKoiPond(p: KoiPond, s: Float32Array, t: number, hour: number, r: TileRaster, opts: KoiDrawOpts = {}): void {
  const { tiles } = p.spec, { cols, rows, pitch, ox, oy } = tiles, K = p.spec.koi.length, nl = nightness(hour)
  if (r.grid.pitchY !== undefined || r.grid.cols !== cols || r.grid.rows !== rows || r.grid.pitch !== pitch) { drawKoiType(p, s, t, hour, r, opts); return }
  kl = opts.light ?? KL
  clearTiles(r)
  // bank
  for (let i = 0; i < cols * rows; i++) if (p.bank[i] >= 0) putGlyph(r, i % cols, (i / cols) | 0, RAMP3.glyphs[p.bank[i]], T_FAINT, .6)
  // water
  const F = p.layout.FOAM, { fw } = p.layout
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const i = ty * cols + tx
    if (!p.water[i]) continue
    const night = nightTile(tx, ty, nl)
    if (p.shore[i] >= 0) { putGlyph(r, tx, ty, EDGE3.glyphs[p.shore[i]], night ? T_FAINT : T_MID, .8); continue }
    rippleGrad(p.ripple, s, tx, ty, grad)
    const gx = grad[1], gy = grad[2], gl = Math.sqrt(gx * gx + gy * gy)
    const foam = s[F + (ty >> 1) * fw + (tx >> 1)]
    if (gx * WL[0] + gy * WL[1] > .12) { putGlyph(r, tx, ty, EQ, T_VALUE, 1); continue }
    if (gl >= .18) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, gx, gy), night ? T_MID : T_IDLE, .8)
    else if (gl >= .08) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, gx, gy), night ? T_FAINT : T_MID, .8)
    else if (gl >= .025) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, gx, gy), T_FAINT, .6)
    else if (foam > .2) putGlyph(r, tx, ty, COLON, T_FAINT, .6)
    else if (surfaceLine(p.spec.seed, tx, ty, t)) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, sgrad[0], sgrad[1]), T_FAINT, .6)
    else if (foam > .08 || flickerOn(tx, ty, t, night ? .07 : .035, .2)) putGlyph(r, tx, ty, DOT, T_FAINT, .6)
  }
  if (nl > 0) moonColumn(p, s, t, hour, nl, r, DASH)
  // koi tile lists (deepest first)
  tileOrder.length = 0
  for (let k = 0; k < K; k++) tileOrder.push(k)
  const zOf = (k: number) => s[p.layout.KOI + KS * k + K_Z]
  tileOrder.sort((a, b) => zOf(b) - zOf(a) || a - b)
  for (const k of tileOrder) collectTiles(p, s, k, tilesFor(k))
  // shadows
  for (const k of tileOrder) {
    const z = zOf(k), T = tilesFor(k), dx = Math.round((1 + 3 * z) / 4), dy = Math.round((1.5 + 3 * z) / 4)
    for (let q = 0; q < T.n; q++) {
      if (T.cover[q] < .5) continue
      const tx = (T.ti[q] % cols) + dx, ty = ((T.ti[q] / cols) | 0) + dy
      if (tx < cols && ty < rows && p.water[ty * cols + tx]) putGlyph(r, tx, ty, COLON, T_FAINT, .6)
    }
  }
  // bodies
  for (const k of tileOrder) drawKoi(p, s, k, tilesFor(k), t, r, nl)
  // pellets
  for (const pv of pelletViews(p, s)) {
    const tx = Math.floor((pv.x - ox) / pitch), ty = Math.floor((pv.y - oy) / pitch)
    if (pv.state === PEL_FLOATING) putGlyph(r, tx, ty, O, T_VALUE, 1)
    else if (pv.state === PEL_FALLING) putGlyph(r, tx, ty - 1, DOT, T_VALUE, .8)
    else if (pv.state === PEL_SINKING) putGlyph(r, tx, ty, DOT, T_MID, .6)
    else if (pv.state === PEL_EATEN) putGlyph(r, tx, ty, pv.age < .13 ? STAR : pv.age < .27 ? PLUS : DOT, pv.age < .2 ? T_VALUE : T_MID, .8)
  }
  // lily pads, over the koi
  const pads = p.spec.pads ?? []
  for (let i = 0; i < pads.length; i++) {
    const [bx, by, pr] = pads[i], seed = p.spec.seed
    let cx = bx + 6 * noise2(.03 * t, i, seed), cy = by + 6 * noise2(.03 * t, i + 9, seed)
    if (opts.tilt) { cx += 3 * opts.tilt[0]; cy += 3 * opts.tilt[1] }
    const na = TAU * (ihash(seed, i, 41) / 4294967296), nx = dcos(na), ny = dsin(na)
    const t0x = Math.floor((cx - pr - ox) / pitch), t1x = Math.ceil((cx + pr - ox) / pitch), t0y = Math.floor((cy - pr - oy) / pitch), t1y = Math.ceil((cy + pr - oy) / pitch)
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || !p.water[ty * cols + tx]) continue
      const qx = ox + tx * pitch + 1.5 - cx, qy = oy + ty * pitch + 1.5 - cy, d = Math.sqrt(qx * qx + qy * qy)
      if (d > pr) continue
      // the notch: a 40° wedge from the centre
      if (d > 1 && (qx * nx + qy * ny) / d > .9396926) continue
      if (d > pr - 3.2) putGlyph(r, tx, ty, edgeOfTangent(EDGE3, -qy, qx), T_IDLE, .8)
      else putGlyph(r, tx, ty, rampGlyph(RAMP3, .7), T_MID, .8)
    }
  }
}
/**
 * The calm surface: contour lines of a slowly drifting noise field (|n| < .055), drawn as faint line glyphs along the
 * contour. Pure in t; the field drifts about .4 cells/s, so a tile changes a few times a minute.
 */
const sgrad = new Float64Array(2)
function surfaceLine(seed: number, tx: number, ty: number, t: number): boolean {
  const x = tx / 4.2 + .035 * t, y = ty / 2.6 + .02 * t, n = noise2(x, y, seed + 3)
  if (n > .055 || n < -.055) return false
  sgrad[0] = (noise2(x + .1, y, seed + 3) - noise2(x - .1, y, seed + 3)) / 4.2; sgrad[1] = (noise2(x, y + .1, seed + 3) - noise2(x, y - .1, seed + 3)) / 2.6
  return true
}
const EQ = glyphOf(EDGE3, '='), COLON = glyphOf(EDGE3, ':'), DOT = glyphOf(EDGE3, '·'), O = glyphOf(EDGE3, 'o'), STAR = glyphOf(EDGE3, '*'), PLUS = glyphOf(EDGE3, '+'), DASH = glyphOf(EDGE3, '-')

/**
 * The moon's reflection at night (L3.3): a broken vertical column of `-` glyphs in `value` across the water, at the
 * moon's place on its arc (sky.ts `moonAcross`), each row pushed sideways by a slow wobble and by the water's slope
 * there (∇h, so ripples bend it). Rows thin out toward the ends; at dusk and dawn the STBN night dither thins it too.
 * Works on any tile grid of the scene's card (`water` and `shore` are that grid's).
 */
function moonColumn(p: KoiPond, s: Float32Array, t: number, hour: number, nl: number, r: TileRaster, dash: Glyph, water = p.water, shore = p.shore, rx?: (tx: number, ty: number) => [number, number]) {
  const g = r.grid, seed = p.spec.seed, mid = (moonAcross(hour) * 144 - g.ox - (g.pitch - 1) / 2) / g.pitch
  for (let ty = 0; ty < g.rows; ty++) {
    const u = ty / (g.rows - 1), gap = noise2(ty * .9, t * 1.1, seed + 12)
    if (gap < -.3 + 1.1 * Math.abs(u - .45)) continue
    const at = rx ? rx(Math.round(mid), ty) : [mid, ty] as [number, number]
    rippleGrad(p.ripple, s, at[0], at[1], grad)
    const x = Math.round(mid + 1.1 * noise2(ty * .55, t * .45, seed + 11) + (g.pitch === 4 ? 8 : 5) * grad[1])
    for (let k = 0; k < (gap > .35 && u > .25 && u < .7 ? 2 : 1); k++) {
      const tx = x + k * (grad[1] >= 0 ? 1 : -1), i = ty * g.cols + tx
      if (tx < 0 || tx >= g.cols || !water[i] || shore[i] >= 0 || !nightTile(tx, ty, nl)) continue
      putGlyph(r, tx, ty, dash, T_VALUE, k ? .8 : 1)
    }
  }
}

/** Splat koi k and reduce it to tiles: cover, mean (s, vn), shade and dominant part per tile. */
function collectTiles(p: KoiPond, s: Float32Array, k: number, T: KoiTiles) {
  const { cols, rows, pitch, ox, oy } = p.spec.tiles, o = p.layout.KOI + KS * k, b = p.bodies[k]
  bodyRaster(b, p.chains[k], s, s[o + K_PHASE], s[o + K_BEAT], body, s[o + K_GULP] > GULP_SHOW ? 1 : 0)
  T.n = 0
  if (!body.w) return
  const hw = (b.halfWidth ?? .11) * b.length
  const tx0 = Math.max(0, Math.floor((body.x0 - ox) / pitch)), tx1 = Math.min(cols - 1, Math.floor((body.x0 + body.w - 1 - ox) / pitch))
  const ty0 = Math.max(0, Math.floor((body.y0 - oy) / pitch)), ty1 = Math.min(rows - 1, Math.floor((body.y0 + body.h - 1 - oy) / pitch))
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    let cov = 0, ss = 0, vv = 0, sh = 0, nb = 0, nf = 0
    const q = T.n
    if (q >= T.ti.length) return
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const cx = ox + tx * pitch + i, cy = oy + ty * pitch + j, bx = cx - body.x0, by = cy - body.y0
      let c = 0
      if (bx >= 0 && by >= 0 && bx < body.w && by < body.h) {
        const bi = by * body.w + bx
        c = body.cover[bi]
        if (c > 0) {
          const sv = body.s[bi], B = hw * profileAt(Math.min(.999, sv))
          let vn = B > 1e-6 ? body.v[bi] / B : 0
          if (vn > 1) vn = 1; else if (vn < -1) vn = -1
          const nz = Math.sqrt(1 - vn * vn), dot = vn * (body.nx[bi] * kl[0] + body.ny[bi] * kl[1]) + nz * kl[2]
          ss += sv; vv += vn; sh += .35 + .65 * (dot > 0 ? dot : 0)
          if (body.part[bi] === PART_BODY) nb++; else nf++
        }
      }
      T.sub[q * 16 + j * 4 + i] = c; cov += c
    }
    if (cov < .5) continue
    const m = nb + nf
    T.ti[q] = ty * cols + tx; T.cover[q] = cov / 16; T.s[q] = ss / m; T.vn[q] = vv / m; T.shade[q] = sh / m
    T.part[q] = nb >= nf ? PART_BODY : 2
    T.n++
  }
}

function drawKoi(p: KoiPond, s: Float32Array, k: number, T: KoiTiles, t: number, r: TileRaster, nl: number) {
  const { cols } = p.spec.tiles, o = p.layout.KOI + KS * k, z = s[o + K_Z], lut = p.markings[k], lattice = p.bodyStyle === 'lattice'
  const deep = z > .6, dz = z > .45 ? 1 : 0
  for (let q = 0; q < T.n; q++) {
    const cover = T.cover[q], tx = T.ti[q] % cols, ty = (T.ti[q] / cols) | 0
    if (cover < .2) continue
    const fin = T.part[q] !== PART_BODY, mark = fin ? 0 : markingAt(lut, T.s[q], T.vn[q])
    const red = mark === MARK_RED, sumi = mark === MARK_SUMI
    // at night the whites come down a tone (value → idle, idle → mid); red stays red
    const dark = nl > 0 && nightTile(tx, ty, nl) ? 1 : 0
    let bright = red ? T_ACTIVE : sumi ? T_MID : (deep ? T_IDLE : T_VALUE) - dark
    const flick = flickerOn(tx, ty, t, .03, .25, k * .37) ? 1 : 0
    if (cover < INTERIOR) {
      for (let i = 0; i < 16; i++) sub16[i] = T.sub[q * 16 + i]
      putGlyph(r, tx, ty, matchTile(SHAPE3, sub16), bright, stepDown(.8, dz))
      continue
    }
    if (fin) { putGlyph(r, tx, ty, rampGlyph(RAMP3, .5), (deep ? T_IDLE : T_VALUE) - dark, stepDown(.8, dz)); continue }
    const shade = T.shade[q]
    if (lattice) {
      // style B: one lattice-4 dot per interior tile; shading is dot size (red stays one colour)
      let v = shade >= .75 ? 1 : shade >= .5 ? .8 : .6
      v = stepDown(v, flick + dz + (red && deep ? 1 : 0))
      if (v > 0) putBig(r, tx, ty, bright, v)
      continue
    }
    // style A: a full micro-glyph tile, the darker glyph by size contrast
    const g = rampGlyph(RAMP3, Math.min(1, .2 + .6 * (1 - shade) + flick * .12))
    if (red) {
      const bg = deep ? .8 : 1
      putGlyph(r, tx, ty, g, shade < .5 || deep ? -1 : T_ACTIVE, .6, T_ACTIVE, bg)
    } else {
      if (sumi) bright = T_MID
      putGlyph(r, tx, ty, g, sumi ? T_FAINT : deep ? T_MID : T_IDLE, stepDown(1, dz), bright, stepDown(.8, dz))
    }
  }
  // eyes (s = .06, vn = ±.55) and barbels
  const c = p.chains[k], b = p.bodies[k], { pitch, ox, oy } = p.spec.tiles
  const hx = s[o + K_HX], hy = s[o + K_HY], nx = hy, ny = -hx
  const ex = s[c.X] - hx * .06 * b.length, ey = s[c.Y] - hy * .06 * b.length, ev = .55 * (b.halfWidth ?? .11) * b.length * profileAt(.06)
  for (let side = 1; side >= -1; side -= 2) {
    const tx = Math.floor((ex + nx * ev * side - ox) / pitch), ty = Math.floor((ey + ny * ev * side - oy) / pitch)
    putGlyph(r, tx, ty, DOT, T_FAINT, .6)
    // barbel: a short stroke off the snout, swept back
    const bxv = hx * .7 + nx * side * .7, byv = hy * .7 + ny * side * .7
    const bx = s[c.X] + hx * 2 + nx * side * 3, by = s[c.Y] + hy * 2 + ny * side * 3
    const btx = Math.floor((bx - ox) / pitch), bty = Math.floor((by - oy) / pitch)
    if (btx >= 0 && bty >= 0 && btx < cols && bty < p.spec.tiles.rows && p.water[bty * cols + btx] && r.bigTone[bty * cols + btx] < 0 && !occupied(r, btx, bty)) putGlyph(r, btx, bty, edgeOfTangent(EDGE3, bxv, byv), T_MID, .8)
  }
}
/** Does the tile hold a koi pixel (a bright body tone) already? Barbels never draw over a body. */
function occupied(r: TileRaster, tx: number, ty: number): boolean {
  const { pitch, ox, oy } = r.grid
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const t = r.tone[(oy + ty * pitch + j) * r.cardW + ox + tx * pitch + i]; if (t === T_ACTIVE || t === T_VALUE) return true }
  return false
}

// ── TYPE (L3.4): the same scene in 5×7 font glyphs ─────────────────────────────────────────────────
/** The TYPE look's tile grid: 24 × 16 tiles of 6 × 8 card cells (a 5×7 glyph + gutter) from card row 12. */
export const KOI_TYPE_TILES: TileGrid = { cols: 24, rows: 16, pitch: 6, pitchY: 8, ox: 0, oy: 12 }
interface TypeBake { water: Uint8Array; bank: Int16Array; shore: Int16Array; rx: Float32Array; ry: Float32Array }
const typeBakes = new WeakMap<KoiPond, Map<string, TypeBake>>()
/** Font glyphs by density, for stones and koi interiors (FONT57 has no ramp order of its own that reads as density). */
const TYPE_RAMP = ['.', ':', '+', '*', '%', '#'].map(c => glyphOf(FONT57, c))
const TYPE_BODY = ['=', '*', '%', '#'].map(c => glyphOf(FONT57, c))
const F_TILDE = glyphOf(FONT57, '~'), F_COLON = glyphOf(FONT57, ':'), F_DOT = glyphOf(FONT57, '.'), F_O = glyphOf(FONT57, 'o')
const F_STAR = glyphOf(FONT57, '*'), F_PLUS = glyphOf(FONT57, '+'), F_DASH = glyphOf(FONT57, '-'), F_RING = glyphOf(FONT57, '○')
/** Card-cell centre of a TYPE tile's glyph (5 × 7 from the tile's corner). */
const glyphCx = (g: TileGrid, tx: number) => g.ox + tx * g.pitch + 2, glyphCy = (g: TileGrid, ty: number) => g.oy + ty * (g.pitchY ?? g.pitch) + 3
/** Water, bank and shore of the scene on another tile grid, baked once per grid; plus each tile's ripple coordinates. */
function typeBake(p: KoiPond, g: TileGrid): TypeBake {
  let m = typeBakes.get(p)
  if (!m) typeBakes.set(p, (m = new Map()))
  const key = `${g.cols}x${g.rows}/${g.pitch}x${g.pitchY}@${g.ox},${g.oy}`
  const hit = m.get(key)
  if (hit) return hit
  const n = g.cols * g.rows, kt = p.spec.tiles, sdf = p.spec.sdf, seed = p.spec.seed
  const b: TypeBake = { water: new Uint8Array(n), bank: new Int16Array(n).fill(-1), shore: new Int16Array(n).fill(-1), rx: new Float32Array(n), ry: new Float32Array(n) }
  for (let ty = 0; ty < g.rows; ty++) for (let tx = 0; tx < g.cols; tx++) {
    const i = ty * g.cols + tx, x = glyphCx(g, tx), y = glyphCy(g, ty), d = sdf(x, y)
    b.rx[i] = (x - kt.ox - 1.5) / kt.pitch; b.ry[i] = (y - kt.oy - 1.5) / kt.pitch
    if (d < 0) {
      b.water[i] = 1
      if (d > -4.5) b.shore[i] = edgeOfGradient(FONT57, sdf(x + 1, y) - sdf(x - 1, y), sdf(x, y + 1) - sdf(x, y - 1)).index
      continue
    }
    const vo = voronoi2(x / 9, y / 9, seed, 'l2')
    if (vo.f2 - vo.f1 < .1) continue
    const lv = .3 * (fbm2(x / 9, y / 9, 3, seed) * .5 + .5) + .6 * (1 - Math.min(1, vo.f1 * 1.4))
    b.bank[i] = TYPE_RAMP[Math.max(0, Math.min(TYPE_RAMP.length - 1, Math.floor(lv * TYPE_RAMP.length)))].index
  }
  m.set(key, b)
  return b
}
const tsub = new Float32Array(16)
/**
 * The TYPE look (L3.4): the same world drawn in 5×7 font glyphs on 6×8 tiles. Water slopes are font line glyphs,
 * crests `~`, calm water `.` twinkles; the bank is font density glyphs; koi interiors are density glyphs by shade
 * (`= * % #`), edges and fins the best-matching font glyph; red markings stay the one accent. No lattice dots: on a
 * font grid every mark is a glyph.
 */
function drawKoiType(p: KoiPond, s: Float32Array, t: number, hour: number, r: TileRaster, opts: KoiDrawOpts) {
  const g = r.grid, { cols, rows } = g, py = g.pitchY ?? g.pitch, K = p.spec.koi.length, nl = nightness(hour), bk = typeBake(p, g)
  kl = opts.light ?? KL
  clearTiles(r)
  for (let i = 0; i < cols * rows; i++) if (bk.bank[i] >= 0) putGlyph(r, i % cols, (i / cols) | 0, FONT57.glyphs[bk.bank[i]], T_FAINT, .6)
  const F = p.layout.FOAM, { fw, fh } = p.layout
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const i = ty * cols + tx
    if (!bk.water[i]) continue
    const night = nightTile(tx, ty, nl)
    if (bk.shore[i] >= 0) { putGlyph(r, tx, ty, FONT57.glyphs[bk.shore[i]], night ? T_FAINT : T_MID, .8); continue }
    rippleGrad(p.ripple, s, bk.rx[i], bk.ry[i], grad)
    const gx = grad[1], gy = grad[2], gl = Math.sqrt(gx * gx + gy * gy)
    const fx = Math.max(0, Math.min(fw - 1, Math.round(bk.rx[i] / 2))), fy = Math.max(0, Math.min(fh - 1, Math.round(bk.ry[i] / 2))), foam = s[F + fy * fw + fx]
    if (gx * WL[0] + gy * WL[1] > .12) { putGlyph(r, tx, ty, F_TILDE, T_VALUE, 1); continue }
    if (gl >= .18) putGlyph(r, tx, ty, edgeOfGradient(FONT57, gx, gy), night ? T_MID : T_IDLE, .8)
    else if (gl >= .08) putGlyph(r, tx, ty, edgeOfGradient(FONT57, gx, gy), night ? T_FAINT : T_MID, .8)
    else if (gl >= .025) putGlyph(r, tx, ty, edgeOfGradient(FONT57, gx, gy), T_FAINT, .6)
    else if (foam > .2) putGlyph(r, tx, ty, F_COLON, T_FAINT, .6)
    else if (foam > .08 || flickerOn(tx, ty, t, night ? .07 : .035, .2)) putGlyph(r, tx, ty, F_DOT, T_FAINT, .6)
  }
  if (nl > 0) moonColumn(p, s, t, hour, nl, r, F_DASH, bk.water, bk.shore, (tx, ty) => { const i = ty * cols + Math.max(0, Math.min(cols - 1, tx)); return [bk.rx[i], bk.ry[i]] })
  // koi, deepest first: splat the body, then per font tile its cover, mean (s, v/B), shade and part
  tileOrder.length = 0
  for (let k = 0; k < K; k++) tileOrder.push(k)
  const zOf = (k: number) => s[p.layout.KOI + KS * k + K_Z]
  tileOrder.sort((a, b) => zOf(b) - zOf(a) || a - b)
  for (const k of tileOrder) {
    const o = p.layout.KOI + KS * k, b = p.bodies[k], z = zOf(k), deep = z > .6, dz = z > .45 ? 1 : 0, lut = p.markings[k]
    bodyRaster(b, p.chains[k], s, s[o + K_PHASE], s[o + K_BEAT], body, s[o + K_GULP] > GULP_SHOW ? 1 : 0)
    if (!body.w) continue
    const hw = (b.halfWidth ?? .11) * b.length
    const tx0 = Math.max(0, Math.floor((body.x0 - g.ox) / g.pitch)), tx1 = Math.min(cols - 1, Math.floor((body.x0 + body.w - 1 - g.ox) / g.pitch))
    const ty0 = Math.max(0, Math.floor((body.y0 - g.oy) / py)), ty1 = Math.min(rows - 1, Math.floor((body.y0 + body.h - 1 - g.oy) / py))
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      let cov = 0, ss = 0, vv = 0, sh = 0, nb = 0, nf = 0
      tsub.fill(0)
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        const bx = g.ox + tx * g.pitch + x - body.x0, by = g.oy + ty * py + y - body.y0
        if (bx < 0 || by < 0 || bx >= body.w || by >= body.h) continue
        const bi = by * body.w + bx, c = body.cover[bi]
        if (!(c > 0)) continue
        cov += c
        const sv = body.s[bi], B = hw * profileAt(Math.min(.999, sv))
        let vn = B > 1e-6 ? body.v[bi] / B : 0
        if (vn > 1) vn = 1; else if (vn < -1) vn = -1
        const nz = Math.sqrt(1 - vn * vn), dot = vn * (body.nx[bi] * kl[0] + body.ny[bi] * kl[1]) + nz * kl[2]
        ss += sv; vv += vn; sh += .35 + .65 * (dot > 0 ? dot : 0)
        if (body.part[bi] === PART_BODY) nb++; else nf++
      }
      const cover = cov / 35
      if (cover < .15) continue
      // the matcher's 16 samples, at the alphabet's own descriptor points
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const bx = g.ox + tx * g.pitch + Math.floor(((i + .5) * 5) / 4) - body.x0, by = g.oy + ty * py + Math.floor(((j + .5) * 7) / 4) - body.y0
        tsub[j * 4 + i] = bx >= 0 && by >= 0 && bx < body.w && by < body.h ? body.cover[by * body.w + bx] : 0
      }
      const m = nb + nf, fin = nf > nb, mark = fin ? 0 : markingAt(lut, ss / m, vv / m), red = mark === MARK_RED, sumi = mark === MARK_SUMI
      const dark = nl > 0 && nightTile(tx, ty, nl) ? 1 : 0
      const tone = red ? T_ACTIVE : sumi ? T_MID : (deep ? T_IDLE : T_VALUE) - dark
      if (cover < .55 || fin) { putGlyph(r, tx, ty, matchTile(FONT57, tsub), tone, stepDown(.8, dz)); continue }
      const shade = sh / m, gi = Math.max(0, Math.min(TYPE_BODY.length - 1, Math.floor(shade * TYPE_BODY.length)))
      putGlyph(r, tx, ty, TYPE_BODY[gi], tone, stepDown(shade >= .75 ? 1 : shade >= .5 ? .8 : .6, dz + (red && deep ? 1 : 0)) || .6)
    }
  }
  // pellets
  for (const pv of pelletViews(p, s)) {
    const tx = Math.floor((pv.x - g.ox) / g.pitch), ty = Math.floor((pv.y - g.oy) / py)
    if (pv.state === PEL_FLOATING) putGlyph(r, tx, ty, F_O, T_VALUE, 1)
    else if (pv.state === PEL_FALLING) putGlyph(r, tx, ty, F_DOT, T_VALUE, .8)
    else if (pv.state === PEL_SINKING) putGlyph(r, tx, ty, F_DOT, T_MID, .6)
    else if (pv.state === PEL_EATEN) putGlyph(r, tx, ty, pv.age < .2 ? F_STAR : F_PLUS, pv.age < .2 ? T_VALUE : T_MID, .8)
  }
  // lily pads, over the koi: a ring of font line glyphs around `%`, the notch left open
  const pads = p.spec.pads ?? []
  for (let i = 0; i < pads.length; i++) {
    const [bx, by, pr] = pads[i], seed = p.spec.seed
    let cx = bx + 6 * noise2(.03 * t, i, seed), cy = by + 6 * noise2(.03 * t, i + 9, seed)
    if (opts.tilt) { cx += 3 * opts.tilt[0]; cy += 3 * opts.tilt[1] }
    const na = TAU * (ihash(seed, i, 41) / 4294967296), nx = dcos(na), ny = dsin(na)
    for (let ty = Math.floor((cy - pr - g.oy) / py); ty <= Math.ceil((cy + pr - g.oy) / py); ty++) for (let tx = Math.floor((cx - pr - g.ox) / g.pitch); tx <= Math.ceil((cx + pr - g.ox) / g.pitch); tx++) {
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || !bk.water[ty * cols + tx]) continue
      const qx = glyphCx(g, tx) - cx, qy = glyphCy(g, ty) - cy, d = Math.sqrt(qx * qx + qy * qy)
      if (d > pr + 1) continue
      if (d > 1 && (qx * nx + qy * ny) / d > .9396926) continue
      if (d > pr - 3.5) putGlyph(r, tx, ty, edgeOfTangent(FONT57, -qy, qx), T_IDLE, .8)
      else putGlyph(r, tx, ty, F_RING, T_MID, .8)
    }
  }
}
