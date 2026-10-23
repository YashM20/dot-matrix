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
}

export interface GridConfig { cols: number; rows: number; pitch?: number; aspect?: number }
export interface DotStyle {
  shape: 'circle' | 'square' | 'squircle' | 'superformula'
  sizeMin: number; sizeMax: number; sizeCurve?: (t: number) => number
  /** 0 = circle (n=2) … 1 = square (n≈32). Mapped to a superellipse exponent by `squircleExponent()`. */
  cornerRoundness?: number; opacityMode?: 'constant' | 'fromValue'; jitter?: number; quantizeSteps?: number
}
export interface ThemeTokens { bg: string; surface: string; surfaceRaised?: string; hairline?: string; dotIdle: string; dotMid?: string; dotFaint?: string; dotActive: string; dotActiveDim?: string; accentAmber?: string; value?: string; gridPx: number; cornerRadiusCard: number }
export interface DotInstance { x: number; y: number; r: number; opacity: number; color: string; shape?: DotStyle['shape']; roundness?: number }

/**
 * Colour role of a layer. `auto` = canonical grey band by value (colorFor);
 * the others pin every non-zero dot of that layer to one token.
 * `active` is the single accent — keep it to one element per card.
 */
export type Tone = 'auto' | 'active' | 'activeDim' | 'value' | 'idle' | 'mid' | 'faint'
export interface Layer {
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
   * Card dots underneath a lit lattice dot are suppressed.
   */
  lattice?: number
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
}
