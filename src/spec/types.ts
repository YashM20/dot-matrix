/**
 * Card spec v1 — a card as plain JSON: grid, style, theme tokens, data defaults, controls, a layer
 * stack (Field IR / text / dot sites / raster assets / named layout generators), states and
 * transitions. Every dynamic value is Field IR source (`src`, `bind`), parsed and validated, never
 * `eval`ed, so a spec is safe to load from an MCP tool or a URL under a strict CSP.
 * Schema: `schema/card.v1.schema.json`; docs: `docs/DOT-MATRIX-ENGINE-PLAN.md` › Card spec v1.
 */
import type { Control } from '../engine/context'
import { IR_LIMITS } from '../engine/ir'
import type { EaseName, MaskName } from '../engine/motion'
import type { Tone } from '../engine/types'
import type { LayoutGenerator } from '../widgets/types'

export const SPEC_VERSION = 1
/** Hard limits: a spec over any of them is rejected by `validateSpec`. Mirrored in the JSON Schema. */
export const SPEC_LIMITS = {
  /** Serialized JSON characters (whole spec, assets included). */
  json: 4_000_000,
  /** Grid columns / rows. */
  grid: 512,
  layers: 256,
  /** Characters of an IR program (`src`, `bind`). */
  ir: IR_LIMITS.source,
  /** Characters of a literal text, label, name. */
  text: 256,
  /** Sites per `sites` layer. */
  points: 20_000,
  /** Base64 characters per raster asset (≈ 1.5 MB of samples). */
  asset: 2_000_000,
  controls: 64,
  states: 32,
  /** Keys of `data` and of each state's data. */
  dataKeys: 128,
  /** Items of any generator param array (bar values, polyline points, sprite rows). */
  params: 4096,
} as const

export const TONES = ['auto', 'active', 'activeDim', 'value', 'idle', 'mid', 'faint'] as const satisfies readonly Tone[]
export const THEME_COLORS = ['bg', 'surface', 'surfaceRaised', 'hairline', 'dotIdle', 'dotMid', 'dotFaint', 'dotActive', 'dotActiveDim', 'accentAmber', 'value'] as const
export type ThemeColor = typeof THEME_COLORS[number]
export const GROUPS = ['text', 'polar', 'icon', 'photo', 'chart', 'scatter', 'composite'] as const
export const CONTROL_KINDS = ['button', 'toggle', 'slider', 'knob', 'crank', 'xy', 'stepper', 'segmented'] as const satisfies readonly Control['kind'][]
export const MASKS = ['bayer', 'ign', 'noise', 'diagonal', 'wipe', 'radial', 'curtain', 'scan'] as const satisfies readonly MaskName[]
export const EASES = ['linear', 'standard', 'emphasized', 'decelerate', 'accelerate', 'outCubic'] as const satisfies readonly EaseName[]

export type Vec2 = [number, number]
/** Inclusive cell window [col0, row0, col1, row1]. */
export type Window = [number, number, number, number]
/** JSON value allowed in generator params. */
export type Json = number | string | boolean | null | Json[] | { [k: string]: Json }

/** Serializable `DotStyle` (no `sizeCurve`: a function cannot travel in a spec). */
export interface SpecStyle {
  shape: 'circle' | 'square' | 'squircle' | 'superformula'
  sizeMin: number; sizeMax: number
  cornerRoundness?: number; opacityMode?: 'constant' | 'fromValue'; jitter?: number; quantizeSteps?: number
  /** Gutter between square cells, fraction of the cell pitch (`{grid.gap}`, `DotStyle.gap`). */
  gap?: number
}

/**
 * Serializable `JoinSpec` (squares, docs/living-matter/Q-squares.md §2.1): equal cells of the layer fuse into joined
 * squares. `group` is a number only; a per-cell group function (like `shapeOf`) cannot travel in a spec.
 */
export type JoinLayerSpec = true | { at?: number; conn?: 4 | 8; outer?: number; inner?: number; seam?: number; group?: number; accent?: boolean }

interface Placed {
  tone?: Tone
  /** Sample on a lattice `lattice`× the card pitch (hero numerals, coarse fields). */
  lattice?: number
  /** Lattice origin in card cells. */
  origin?: Vec2
  /** Fuse equal cells into joined squares (`Layer.join`). */
  join?: JoinLayerSpec
}
/** One band of an IR layer's tone ramp: values ≥ `at` draw in `tone` (highest band wins); `blend` dithers the band's lower edge. */
export interface ToneStopSpec { at: number; tone: Tone; blend?: number }
/** A Field IR program sampled on the layer grid, or placed into `bounds` = [col, row, w, h] layer cells. */
export interface IRLayerSpec extends Placed { kind: 'ir'; src: string; bounds?: [number, number, number, number]; toneStops?: ToneStopSpec[] }
/** Bitmap text anchored at layer cell `at`. Either a literal `text`, or `bind` (IR, evaluated raw at u=v=0) formatted as a number. */
export interface TextLayerSpec extends Placed {
  kind: 'text'
  text?: string
  bind?: string
  format?: { decimals?: number; pad?: number; prefix?: string; suffix?: string }
  at: Vec2
  align?: 'left' | 'center' | 'right'
  scale?: number | Vec2
  smooth?: boolean
}
/** Dots at explicit card-cell sites. Value per site: `bind` (IR at the site's card u/v), the point's third number, or 1. */
export interface SitesLayerSpec {
  kind: 'sites'
  points: ([number, number] | [number, number, number])[]
  bind?: string
  /** Dot size relative to a card dot (default 1). */
  size?: number
  tone?: Tone
  /** Per-site tone (null = value-based grey), parallel to `points`. */
  tones?: (Tone | null)[]
}
/**
 * Baked samples (a bespoke TS field, a photo, a luma map) on `grid`, read nearest-cell on the layer grid.
 * `asset` = base64 little-endian Float64 / Float32 / Uint8 (÷255) over `window` (row-major); cells outside are 0.
 * `tones`: base64 Uint8 palette indices per window cell (255 = value-based grey).
 */
export interface RasterLayerSpec extends Omit<Placed, 'lattice'> {
  kind: 'raster'
  /** As `Placed.lattice`, or `[kx, ky]`: rect cells (squares Q2, `Layer.lattice`; a baked layer only). */
  lattice?: number | Vec2
  /** Rect cells: which side the size ramp drives ('x' / 'y': solid bars and line screens, `Layer.sizeAxis`). */
  sizeAxis?: 'both' | 'x' | 'y'
  grid: { cols: number; rows: number }
  window?: Window
  format: 'f64' | 'f32' | 'u8'
  asset: string
  tones?: { palette: Tone[]; asset: string }
}
/** A named layout helper (`layoutFor(grid)[name](...params)`) on the layer grid. */
export interface GeneratorLayerSpec extends Placed { kind: 'generator'; name: LayoutGenerator; params: Json[] }
export type LayerSpec = IRLayerSpec | TextLayerSpec | SitesLayerSpec | RasterLayerSpec | GeneratorLayerSpec
export type LayerKind = LayerSpec['kind']
export const LAYER_KINDS = ['ir', 'text', 'sites', 'raster', 'generator'] as const satisfies readonly LayerKind[]

/** A dot transition: dots switch in `mask` order over `duration` ms after `delay` ms, progress shaped by `ease`. */
export interface TransitionSpec { mask: MaskName; ease?: EaseName; duration?: number; delay?: number }
/** A named data patch: while `ctx.state` names it, its values override the card's data. */
export interface StateSpec { data: Record<string, number> }

export interface CardSpec {
  version: 1
  id: string
  name: string
  group?: typeof GROUPS[number]
  grid: { cols: number; rows: number; pitch?: number; aspect?: number }
  style: SpecStyle
  /** Theme token overrides (`DESIGN.md` colour tokens), `#rrggbb` / `#rrggbbaa`. */
  theme?: Partial<Record<ThemeColor, string>>
  /** Data defaults (`WidgetPreset.defaults`). */
  data?: Record<string, number>
  controls?: Control[]
  layers: LayerSpec[]
  states?: Record<string, StateSpec>
  initial?: string
  transitions?: { enter?: TransitionSpec; change?: TransitionSpec | false; exit?: TransitionSpec }
  springKeys?: string[]
  live?: boolean
  clock?: boolean
  burst?: number
  chrome?: 'dots'
  label?: string
  bleed?: boolean
  media?: 'camera'
}

export interface SpecIssue { path: string; message: string }
export class SpecError extends Error {
  readonly errors: SpecIssue[]
  constructor(errors: SpecIssue[]) {
    super(errors.map(e => `${e.path}: ${e.message}`).join('; '))
    this.name = 'SpecError'; this.errors = errors
  }
}
