/**
 * The koi scene's spec, state layout and constants (docs/living-matter/L-pond.md §L1): the slot offsets of the one
 * flat state (globals, koi, spines, pellets, ripple, foam) shared by the world (`world.ts`), the koi steering
 * (`koi.ts`), the read-outs (`views.ts`) and the drawing (`draw.ts`, `type.ts`). Only the names `pond.ts` re-exports
 * are public; the slot indices stay inside the scene.
 */
import type { World } from '../../physics/world'
import type { Ripple } from '../ripple'
import type { Chain } from '../chain'
import type { BodySpec, KoiKind } from '../body'
import type { TileGrid } from '../glyphTiles'

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
  /**
   * The day's weather (X1 #5; absent = calm, the canonical pond): `rain` raindrops per second land as small ripples
   * at hashed water tiles (on the loop phase, so the loop still closes); `wind` (≥ 1) speeds the calm surface's
   * drifting contour lines and the lily pads' drift by that factor (render-time).
   */
  rain?: number
  wind?: number
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
export const NODES = 20, PELLETS = 18
/**
 * Joint limit of a koi spine. The plan's .16 rad lets a 20-node koi curl into a full C while cruising; .11 keeps the
 * body as stiff as a koi's (a C-start still curls it visibly).
 */
export const BEND = .11
export const KS = 19, SPS = 2 * NODES, PS = 8
/** Floats per koi in the state (the checks read slots 5 and 6, phase and beat). */
export const KOI_SLOTS = KS
/**
 * Koi slots. L3 added the circle-back (K_BACK: pellet + 1 while circling back to a missed pellet, −(pellet + 1) once
 * done with it, 0 none; K_BACKT its time left) and the startle contagion timer (K_CONTAG).
 */
export const K_HX = 0, K_HY = 1, K_U = 2, K_Z = 3, K_ZT = 4, K_PHASE = 5, K_BEAT = 6, K_MODE = 7, K_LEFT = 8, K_SIGN = 9, K_REFR = 10, K_FOOD = 11, K_HUNGER = 12, K_GULP = 13, K_CURIOUS = 14, K_TURN = 15
export const K_BACK = 16, K_BACKT = 17, K_CONTAG = 18
export const MODE_CRUISE = 0, MODE_BURST = 1, MODE_GLIDE = 2, MODE_BEND = 3, MODE_ESCAPE = 4
/** Globals (G_CASC: what is left of the current startle cascade, L3.2). */
export const G_STILL = 0, G_PRESS = 1, G_PX = 2, G_PY = 3, G_LURE = 4, G_LX = 5, G_LY = 6, G_NEXT = 7, G_WALL = 8, G_CASC = 9
/** Pellet slots and states. */
export const P_X = 0, P_Y = 1, P_H = 2, P_VH = 3, P_STATE = 4, P_AGE = 5, P_VX = 6, P_VY = 7
export const PEL_OFF = 0, PEL_FALLING = 1, PEL_FLOATING = 2, PEL_EATEN = 3, PEL_SINKING = 4

/** Loop phase in steps: ((n − start) % len + len) % len. */
export const phaseSteps = (n: number, start: number, len: number) => (((n - start) % len) + len) % len

/** Fixed light for koi shading, normalised (a literal: (−.45, −.55, .70) / 0.99373). */
export const KOI_LIGHT = [-.45 / .99373035, -.55 / .99373035, .70 / .99373035] as const

// ── L3: feeding, startle and tilt depth ──
/**
 * Hunger rises .02/s and a pellet takes .35 off; a koi below .2 is sated and ignores food. The pristine run's first
 * feed (loop phase 6 s) meets koi at ≥ .36, so they all eat; two or three pellets sate one for about ten seconds.
 */
export const HUNGER_RATE = .02, HUNGER_BITE = .35, SATED = .2
/** A gulp shows as a head 1 cell wider for .3 s: K_GULP decays ×(1 − dt/.5) a step, so it is above .54 for .3 s. */
export const GULP_SHOW = .54
/** Startle contagion: a startled koi startles the koi within .5 L of its head 80 ms later (2 steps); a cascade startles at most 3 koi. */
export const CONTAG_R = .5, CONTAG_S = .08, CASCADE = 3
/**
 * A pointer flick startles koi within .9 L at this speed (cells/s). L1 used 90, which an ordinary mouse pass reaches
 * (a 380 px card is 2.6 px a cell: 90 cells/s is 240 px/s); 200 cells/s (~520 px/s) is a deliberate flick.
 */
export const FLICK = 200
/** Water tilt forcing per step (`rippleTilt`) and the pellets' downhill drift per unit tilt (cells/s). */
export const TILT_K = .004, TILT_DRIFT = 8

export function pondLayout(koi: number, tiles: TileGrid): PondLayout {
  const G = 0, KOI = 16, SPINE = KOI + KS * koi, PEL = SPINE + SPS * koi, RIP = PEL + PS * PELLETS
  const cells = tiles.cols * tiles.rows, FOAM = RIP + 2 * cells, fw = Math.ceil(tiles.cols / 2), fh = Math.ceil(tiles.rows / 2)
  return { G, KOI, SPINE, PEL, RIP, FOAM, size: FOAM + fw * fh, fw, fh, pellets: PELLETS }
}
