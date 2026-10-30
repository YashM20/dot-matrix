/** Inclusive cell rectangle [col0, row0, col1, row1] on the grid a field is laid out for. */
export type CellBounds = [number, number, number, number]
/**
 * A field maps u/v in [0,1]² to a value in [0,1]. Cell-space layout helpers also attach `bounds`
 * (the only cells that can be non-zero) so the sampler can skip the rest of the grid.
 */
export interface Field {
  (u: number, v: number): number
  bounds?: CellBounds
  /** The string a text helper (`textAt`) drew — metadata for `describe()`, never read by the sampler. */
  text?: string
  /** How a helper built this field (IR source, a named layout generator) — metadata for spec export (`src/spec`), never read by the sampler. */
  from?: FieldOrigin
}
/** Provenance of a field: compiled from Field IR `src`, or made by layout generator `gen` on `grid` with JSON-able `args` (`place` also keeps its `inner` field). */
export type FieldOrigin =
  | { ir: string; raw?: boolean }
  | { gen: string; grid: GridConfig; args: unknown[]; inner?: Field }

export interface GridConfig { cols: number; rows: number; pitch?: number; aspect?: number }
export interface DotStyle {
  shape: 'circle' | 'square' | 'squircle' | 'superformula'
  sizeMin: number; sizeMax: number; sizeCurve?: (t: number) => number
  /** 0 = circle (n=2) … 1 = square (n≈32). Mapped to a superellipse exponent by `squircleExponent()`. */
  cornerRoundness?: number; opacityMode?: 'constant' | 'fromValue'; jitter?: number; quantizeSteps?: number
  /**
   * Gutter between square cells, as a fraction of the cell pitch (`{grid.gap}`). A square-like dot's half side is
   * clamped to (1 − gap)·P/2, so two full-level neighbours leave exactly gap·P of grout. Unset = no clamp.
   */
  gap?: number
}
export interface ThemeTokens { bg: string; surface: string; surfaceRaised?: string; hairline?: string; dotIdle: string; dotMid?: string; dotFaint?: string; dotActive: string; dotActiveDim?: string; accentAmber?: string; value?: string; gridPx: number; cornerRadiusCard: number }
/** How a layer's cells fuse into polyomino blobs (quarter-tile composition, 5 shapes per quadrant; src/engine/squares). */
export interface JoinSpec {
  /** Minimum quantized value a cell needs to join; lower cells stay plain dots (default 0: every lit level). */
  at?: number
  /** 4 (default): join through shared edges. 8 (Q3): diagonal-only neighbours bridge too (quadrant code 5). */
  conn?: 4 | 8
  /** Convex corner radius, fraction of the half side s (default: the style squircle's corner, 0 for 'square'). */
  outer?: number
  /** Concave fillet radius at inner notches, fraction of the half pitch (default 0). Visible only with a gutter. */
  inner?: number
  /** Seam left between joined cells, fraction of the pitch (default 0 = fused). */
  seam?: number
  /**
   * Cells join only within the same group (default 0), 0–255. A number, or a per-cell id `(u, v) => number`
   * evaluated once per cell in the same pass as `toneOf`, so touching same-tone pieces (dominoes, tetrominoes)
   * stay apart when their ids differ.
   */
  group?: number | ((u: number, v: number) => number)
  /** Let `active` / `activeDim` cells join (default false: the accent stays discrete unless asked). */
  accent?: boolean
}
/**
 * Resolved join geometry shared by every joined dot of one layer in one frame (card px): the cell's half pitch
 * `hx` / `hy`, `ro` the convex corner radius as a fraction of the dot's half side, `ri` the concave fillet (px),
 * `seam` the seam width (px), and the lattice origin `ox` / `oy` (px; WebGL cuts the cell edges from it).
 */
export interface JointGeom { hx: number; hy: number; ro: number; ri: number; seam: number; ox?: number; oy?: number }
/**
 * Per-dot form fields (docs/living-matter/F0-foundation.md §2.5), hashed by the golden key (`scripts/lib/goldenKey.ts`).
 * On a `Layer`, `rot` / `motif` are per-layer defaults the sampler stamps onto that layer's dots (Q3); `aspect` comes from
 * a rect lattice (`Layer.lattice: [kx, ky]`, `Layer.sizeAxis`), so a layer has none of its own.
 */
export interface DotForm {
  /** Join mask (squares Q1): 12 bits, 3 per quadrant (NW, NE, SE, SW), codes CONVEX…INNER (src/engine/squares/mask.ts). Set by join layers only. */
  join?: number
  /** Geometry of the joined cell (one object per layer and frame). Present iff `join` is; the golden key reads it. */
  joint?: JointGeom
  /** Reserved for Q3: rotation in radians (squares snap to multiples of π/4, stored in radians). */
  rot?: number
  /**
   * Rect cell (squares Q2): ry / rx, the half height over the half width `r`. Absent = 1 (a square-like or round dot).
   * Set by rect lattices (`Layer.lattice: [kx, ky]`, `Layer.sizeAxis`); drawn by the squares hooks (src/engine/squares).
   */
  aspect?: number
  /** Reserved for Q3: motif id inside the cell. */
  motif?: string
}
export interface DotInstance extends DotForm { x: number; y: number; r: number; opacity: number; color: string; shape?: DotStyle['shape']; roundness?: number }

/**
 * Colour role of a layer. `auto` = canonical grey band by value (colorFor);
 * the others pin every non-zero dot of that layer to one token.
 * `active` is the single accent — keep it to one element per card.
 */
export type Tone = 'auto' | 'active' | 'activeDim' | 'value' | 'idle' | 'mid' | 'faint'
export interface Layer extends Omit<DotForm, 'join' | 'joint' | 'aspect'> {
  field: Field
  tone?: Tone
  /**
   * Multi-tone layer: the tone of each dot this layer wins, read in the same sampler pass from the
   * cell's (unquantized) value and u/v on the grid being sampled. Overrides `tone`; `undefined` falls
   * back to the value-based grey scale. One such layer equals splitting it into one layer per tone
   * (each lit only where `toneOf` returns its tone) at the same place in the stack, at the cost of one scan
   * (`sites` dots come out in site order rather than tone order; the set is the same).
   */
  toneOf?: (value: number, u: number, v: number) => Tone | undefined
  /**
   * Sample this layer on its own coarser lattice: dots `lattice`× the card pitch apart and
   * `lattice`× bigger (hero numerals in the references sit on ~2–4× the label pitch).
   * The field sees u/v over that lattice, which starts at `origin` (card cells).
   * Card dots underneath a lit lattice dot are suppressed. `[kx, ky]` = rect cells (squares Q2, fractional allowed):
   * kx× the pitch across, ky× down; the dot's half sides follow each factor (`DotInstance.aspect` = ry / rx).
   */
  lattice?: number | [number, number]
  /**
   * Which side of a rect cell the size ramp drives (squares Q2): 'both' (default, keeps the cell's aspect), or 'x' /
   * 'y' for bars and line screens: that side follows the value, the other stays full ((1 − gap)·k·P/2). An 'x' / 'y'
   * cell is solid (opacity 1: its thickness is the tone), and with `join` it fuses only along its full side, across
   * levels, so a line is one stroke of varying weight.
   */
  sizeAxis?: 'both' | 'x' | 'y'
  origin?: [number, number]
  /**
   * Sample this layer at explicit dot sites (card-cell coordinates, fractional allowed) instead
   * of a rectangular lattice — evenly spaced dots along rings, arcs and rays. The field is read
   * at each site's card u/v; dots are `size`× the card dot. Sites at the same position merge
   * (highest value wins, later layer wins ties), so an accent arc can reuse its track's sites.
   */
  sites?: [number, number][]
  /**
   * Dot size of a `sites` layer relative to a card dot (2 ≈ hero dot). Every board passes this as `size`;
   * a legacy `lattice` on a site layer is still honoured when `size` is absent (`lattice` otherwise means pitch).
   */
  size?: number
  /**
   * Fuse equal cells of this layer into joined squares. Merges only cells with the same tone, group and quantized
   * step (≥ `at`), never across tones; the accent opts in with `accent`. Base and lattice layers only (sites ignore it).
   * Needs `installSquares()` (src/engine/squares) and a quantized style; without them the layer draws plain dots.
   */
  join?: JoinSpec | true
  /**
   * Per-cell roundness 0..1 (the `cornerRoundness` scale, n = 2 + 30r²), read once per emitted dot and snapped to
   * `{grid.shapeSteps}` (1/8). `undefined` = the style's roundness. Dot ↔ square morphs, hybrid boards.
   */
  shapeOf?: (value: number, u: number, v: number) => number | undefined
}
