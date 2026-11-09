import type { DotStyle, Field, GridConfig, Layer, Tone } from '../engine/types'
import type { Control, FrameContext } from '../engine/context'
import { type BigTextOptions, barsAt, bigText, centeredBarsAt, cutAround, discCells, dotAt, hRule, knockBoxes, knockSites, placeCells, polylineCells, rectCells, ringCells, rrect, snapToLattice, spriteAt, stackedRows, stadium, textAt, textSize, vRule } from '../engine/layout'
import { cellU, latticeGrid } from '../engine/sampler/gridSampler'
import { cachedIconField, iconPaths } from '../engine/fields/iconSDF'
import { cjkTextField } from '../engine/fields/cjkFallback'
import type { TextOptions } from '../engine/fields/bitmapFont'
import { combine } from '../engine/layout'
import { hash01 } from '../engine/math'
import { GAP, capSize, dotTri, fillOn, minGap, peakOn, trace } from './sites'
export { bounded, combine, dim, place, stack } from '../engine/layout'

/** Frame context a preset's `layers()` receives — see `FrameContext` in the engine. */
export type WidgetContext = FrameContext
/** Authors of the work a card is based on (a port, a remix). `source` is a URL; `note` a short line on what changed. */
export interface WidgetCredit { by: string[]; title: string; source: string; note?: string }
/** A preset's credits as a list (empty when it has none). */
export const creditsOf = (p: { credit?: WidgetCredit | readonly WidgetCredit[] }): readonly WidgetCredit[] =>
  !p.credit ? [] : 'source' in p.credit ? [p.credit] : p.credit
export interface WidgetPreset {
  id: string
  name: string
  group: 'text' | 'polar' | 'icon' | 'photo' | 'chart' | 'scatter' | 'composite'
  /** Shows the red status dot in the card header. A look only: it says nothing about the data (see `liveData`). */
  live?: boolean
  /** Shows real data from a feed (the live board): the LIVE DATA chip and "(live)" in the card's name. */
  liveData?: boolean
  /** Re-sampled on a timer with a running `t`. */
  animated?: boolean
  /**
   * Animation rate on the shared clock while the card is live (default: DotCanvas's 12, or 30 when engaged /
   * reduced motion). Halved on phones, never below 12 (`cardFps`, src/widgets/fps.ts). Goldens don't see it: they sample fixed t.
   */
  fps?: number
  /** Reads the wall clock (time/date text) — re-sampled on each minute tick; other static cards never re-sample. */
  clock?: boolean
  /**
   * Seconds of live animation after each minute tick (needs `clock`): the card is re-sampled every
   * frame with `ctx.since` = seconds since the tick, e.g. for a split-flap. Replaces the change dissolve.
   */
  burst?: number
  /** Interactive regions (P2): pointer / keyboard input edits `data[control.key]`; see `Control`. */
  controls?: Control[]
  grid: GridConfig
  style: DotStyle
  defaults?: Record<string, number>
  /** Data keys that glide to new values on a critically damped spring instead of dissolving (DotCanvas `springKeys`). */
  springKeys?: string[]
  /**
   * A data key that any control edit also sets to 0, unless the edit sets it itself: an idle demo loop that
   * hands over to the visitor on first touch (the dash board's drive loop). When the key is board-shared,
   * one touch on any card stops the loop on every card.
   */
  handover?: string
  /**
   * A card that sets words: the widget page shows a text field whose words go to `data[key]` as a `textId`
   * (src/data/text.ts). `max` caps the characters (default 40).
   */
  typing?: { key: string; label: string; placeholder?: string; max?: number }
  /** `dots`: the card label and live dot are drawn by the engine inside the grid (TILE cards). */
  chrome?: 'dots'
  /** Label text drawn by `chrome: 'dots'` (defaults to `name`; '' = no label). */
  label?: string
  /** Edge-to-edge artwork: the card has no inner padding (photo cards). */
  bleed?: boolean
  /** Live media the host feeds into `ctx.media` (app-level capture in `src/media/`, started only by a control). */
  media?: 'camera'
  /**
   * `dark`: the card stays a dark inset on a light page, like a photo (src/site/theme/polarity.ts). For cards whose
   * light is the picture (lit spheres, emissive glass, halftone portraits, night scenes) and that print as negatives on paper.
   */
  inset?: 'dark'
  /**
   * Who made the work this card is built on: one credit, or a list when it builds on several. Each shows as a small
   * `by …` line on the widget page (DESIGN.md "Credit line"). Read it through `creditsOf`.
   */
  credit?: WidgetCredit | readonly WidgetCredit[]
  layers(ctx: WidgetContext): Layer[]
}

/** Standard card raster: 80×74 dots at the 4px reference pitch, card header drawn by CSS above it. */
export const CARD: GridConfig = { cols: 80, rows: 74 }
/**
 * Reference-fidelity card raster: 144×144 dots including the dot-drawn label row. 5×7 labels
 * advance 4% of the card width like the reference boards; hero numerals sit on a coarser
 * `lattice` (2–4×) so they read as big single dots, not clusters of small ones.
 */
export const TILE: GridConfig = { cols: 144, rows: 144, pitch: 2.25 }
export const baseStyle: DotStyle = { shape: 'squircle', sizeMin: .3, sizeMax: 1.55, cornerRoundness: .25, opacityMode: 'fromValue', quantizeSteps: 5 }
/** Dot radii for the 2.25px TILE pitch: a full dot is ~85% of the pitch, like the references. */
export const tileStyle: DotStyle = { ...baseStyle, sizeMin: .2, sizeMax: .95, cornerRoundness: .1 }

/** A field placed on a coarser lattice or explicit dot sites (see `Layer.lattice` / `Layer.sites`). */
export type LatticeField = Omit<Layer, 'tone'>
type Pt = [number, number]
const one: Field = () => 1
/** A field of ones that carries the words its sites spell (`Field.text`); `one` is shared, so it never carries any. */
const said = (text: string): Field => { const f: Field = () => 1; f.text = text; return f }
export interface SiteOptions {
  /** Distance between dot centres, in card cells. */
  spacing?: number
  /** Dot size relative to a card dot (1 = card dot, 2 ≈ hero dot). Capped at 0.8 of `spacing`, so dots never touch. */
  size?: number
}
export const layer = (src: Field | LatticeField, tone: Tone = 'value'): Layer => (typeof src === 'function' ? { field: src, tone } : { ...src, tone })
/**
 * A static field memoised per cell centre of `grid`: each centre is computed once, later samples read
 * the table. Any other u/v (thumbnails, another grid) goes straight to `field`, so output is identical.
 * Only for fields that never change (no `t`, no data) — photo-like cards whose per-cell maths is heavy.
 */
export function baked(grid: GridConfig, field: Field): Field {
  const { cols, rows } = grid
  let table: Float64Array | undefined
  const f: Field = (u, v) => {
    const c = Math.round(u * (cols - 1)), r = Math.round(v * (rows - 1))
    if (c < 0 || r < 0 || c >= cols || r >= rows || u !== cellU(c, cols) || v !== cellU(r, rows)) return field(u, v)
    table ??= new Float64Array(cols * rows).fill(NaN)
    const i = r * cols + c, x = table[i]
    return x === x ? x : (table[i] = field(u, v))
  }
  if (field.bounds) { const [c0, r0, c1, r1] = field.bounds; f.bounds = [c0, r0, c1, r1] }
  return f
}
/** One band of a `toneRamp`: field values from `at` up to the next stop's `at` draw in `tone`. */
export interface ToneStop {
  at: number
  tone: Tone
  /** Dot value for field value `h` in this band (default `h`; 0 = no dot). */
  value?: (h: number) => number
  /**
   * Dissolve this band's lower edge over [at, at + blend]: a cell joins the band when its per-cell hash
   * is under (h - at) / blend, else it stays in the band below. Two tones dither into each other, no contour.
   */
  blend?: number
}
/**
 * One static field drawn in several tones (cool grey → warm → hot, shadow → mid → highlight), as a single
 * multi-tone layer (`Layer.toneOf`): `field` is evaluated once per cell of `grid` and the band and value
 * memoised, and the sampler reads value and tone in one scan. Values below the first stop draw nothing.
 * Off-grid samples (thumbnails) are computed directly. Returned as a one-element array so it spreads into
 * a layer stack. Like `baked`, only for fields that never change (no `t`, no data); `seed` picks the dither hash.
 */
export function toneRamp(field: Field, stops: ToneStop[], { grid = TILE, seed = 7 }: { grid?: GridConfig; seed?: number } = {}): Layer[] {
  const { cols, rows } = grid
  let hit = -1, hitValue = 0
  const pick = (u: number, v: number, c: number, r: number) => {
    const h = field(u, v)
    for (let i = stops.length - 1; i >= 0; i--) {
      const s = stops[i]
      if (!(h >= s.at) || (s.blend && hash01(c * 151 + r, seed) >= (h - s.at) / s.blend)) continue
      hit = i; hitValue = s.value ? s.value(h) : h; return
    }
    hit = -1; hitValue = 0
  }
  // On first use: one pass over the field's window fills the value (Float32, the sampler's own precision)
  // and band of every cell, and the box of lit cells (the layer's bounds).
  let values: Float32Array | undefined, bands: Int8Array | undefined
  const box: [number, number, number, number] = [cols, rows, -1, -1]
  const fill = () => {
    if (values) return
    values = new Float32Array(cols * rows); bands = new Int8Array(cols * rows).fill(-1)
    const b = field.bounds
    const c0 = b ? Math.max(0, Math.floor(b[0])) : 0, r0 = b ? Math.max(0, Math.floor(b[1])) : 0
    const c1 = b ? Math.min(cols - 1, Math.ceil(b[2])) : cols - 1, r1 = b ? Math.min(rows - 1, Math.ceil(b[3])) : rows - 1
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      pick(cellU(c, cols), cellU(r, rows), c, r)
      if (hit < 0) continue
      values[r * cols + c] = hitValue; bands[r * cols + c] = hit
      if (c < box[0]) box[0] = c
      if (r < box[1]) box[1] = r
      if (c > box[2]) box[2] = c
      if (r > box[3]) box[3] = r
    }
  }
  /** Table index of a cell centre of `grid`, else -1 (thumbnails, another grid: computed directly). */
  const cellAt = (u: number, v: number) => {
    const x = u * (cols - 1), y = v * (rows - 1), c = Math.round(x), r = Math.round(y)
    return c >= 0 && r >= 0 && c < cols && r < rows && Math.abs(x - c) < 1e-6 && Math.abs(y - r) < 1e-6 ? r * cols + c : -1
  }
  const offGrid = (u: number, v: number) => pick(u, v, Math.round(u * (cols - 1)), Math.round(v * (rows - 1)))
  const f: Field = (u, v) => {
    const i = cellAt(u, v)
    if (i >= 0) { fill(); return values![i] }
    offGrid(u, v)
    return hit >= 0 ? hitValue : 0
  }
  Object.defineProperty(f, 'bounds', { get: () => (fill(), box), enumerable: true })
  const toneOf = (_: number, u: number, v: number): Tone | undefined => {
    const i = cellAt(u, v)
    if (i >= 0) { fill(); return stops[bands![i]]?.tone }
    offGrid(u, v)
    return stops[hit]?.tone
  }
  return [{ field: f, toneOf }]
}
export const staticLayers = (layers: Layer[]) => () => layers
/** Flatten a preset to a single field (thumbnails, exports, tests). */
export const presetField = (p: WidgetPreset, ctx: WidgetContext = { t: 0, data: p.defaults ?? {} }): Field => {
  const ls = withChrome(p)(ctx).map(l => {
    if (l.sites) { const reach = (l.size ?? (typeof l.lattice === 'number' ? l.lattice : 1)) / 2 + .25, cells = l.sites; return (u: number, v: number) => { const x = u * (p.grid.cols - 1), y = v * (p.grid.rows - 1); return cells.some(([sx, sy]) => Math.hypot(x - sx, y - sy) <= reach) ? l.field(u, v) : 0 } }
    if (!l.lattice && !l.origin) return l.field
    // map card u/v onto the layer's lattice so the flattened field lines up
    const [kx, ky] = typeof l.lattice === 'object' ? l.lattice : [l.lattice ?? 1, l.lattice ?? 1], [ox, oy] = l.origin ?? [0, 0], sub = latticeGrid(p.grid, [kx, ky], [ox, oy])
    return (u: number, v: number) => {
      const c = Math.floor((u * (p.grid.cols - 1) + .5 - ox) / kx), r = Math.floor((v * (p.grid.rows - 1) + .5 - oy) / ky)
      return c < 0 || r < 0 || c >= sub.cols || r >= sub.rows ? 0 : l.field(sub.cols === 1 ? .5 : c / (sub.cols - 1), sub.rows === 1 ? .5 : r / (sub.rows - 1))
    }
  })
  return (u, v) => { let m = 0; for (const f of ls) { const x = f(u, v); if (x > m) m = x } return m }
}

/** Label row drawn in dots (TILE cards): name top-left, red live dot top-right. */
export function cardChrome(p: WidgetPreset): Layer[] {
  if (p.chrome !== 'dots') return []
  const M = layoutFor(p.grid), label = (p.label ?? p.name).toUpperCase()
  return [...(label ? [layer(M.text(label, 0, 0), 'idle')] : []), ...(p.live ? [layer(M.dots([[p.grid.cols - 4, 3]], 7), 'active')] : [])]
}
/** The preset's layers with its chrome in front — what every renderer should draw. */
const chromed = new WeakMap<WidgetPreset, WidgetPreset['layers']>()
/** The preset's layers plus its dot-drawn label. Cached per preset so callers get a stable function (no needless re-samples). */
export const withChrome = (p: WidgetPreset): WidgetPreset['layers'] => {
  if (p.chrome !== 'dots') return p.layers
  let f = chromed.get(p)
  if (!f) chromed.set(p, (f = (ctx: WidgetContext) => [...cardChrome(p), ...p.layers(ctx)]))
  return f
}

/** Cell-space drawing helpers bound to one grid — what every reference card is built from. */
export const TAU = Math.PI * 2
/** Layout helpers whose fields `presetToSpec` (src/spec) can carry as `generator` layers: same name, same JSON args. */
export const LAYOUT_GENERATORS = ['dot', 'rect', 'hrule', 'vrule', 'disc', 'ring', 'box', 'sprite', 'bars', 'cbars', 'line', 'icon', 'cjk'] as const
export type LayoutGenerator = typeof LAYOUT_GENERATORS[number]
export function layoutFor(grid: GridConfig) {
  const W = grid.cols, H = grid.rows
  /** Tag a helper's fields with their name, grid and args (Field.from) — spec export metadata only. */
  const tag = <F extends (...args: never[]) => Field>(gen: LayoutGenerator, make: F): F => ((...args: Parameters<F>) => { const f = make(...args); f.from = { gen, grid, args }; return f }) as F
  return {
    W, H,
    text: (str: string, col: number, row: number, opts: TextOptions & { align?: 'left' | 'center' | 'right' } = {}) => textAt(grid, str, col, row, opts),
    size: textSize,
    dot: tag('dot', (col: number, row: number, value = 1) => dotAt(grid, col, row, value)),
    rect: tag('rect', (col: number, row: number, w: number, h: number, value = 1) => rectCells(grid, col, row, w, h, value)),
    hrule: tag('hrule', (col: number, row: number, w: number, step = 1, value = 1) => hRule(grid, col, row, w, step, value)),
    vrule: tag('vrule', (col: number, row: number, h: number, step = 1, value = 1) => vRule(grid, col, row, h, step, value)),
    disc: tag('disc', (cx: number, cy: number, r: number, value = 1) => discCells(grid, cx, cy, r, value)),
    ring: tag('ring', (cx: number, cy: number, r: number, opts: Parameters<typeof ringCells>[4] = {}) => ringCells(grid, cx, cy, r, opts)),
    /** Outlined rectangle, `step` controls dotting of the outline. */
    box: tag('box', (col: number, row: number, w: number, h: number, step = 1, value = 1): Field => {
      return combine(hRule(grid, col, row, w, step, value), hRule(grid, col, row + h - 1, w, step, value), vRule(grid, col, row, h, step, value), vRule(grid, col + w - 1, row, h, step, value))
    }),
    sprite: tag('sprite', (rows: string[], col: number, row: number, scale = 1) => spriteAt(grid, rows, col, row, scale)),
    bars: tag('bars', (values: number[], col: number, base: number, height: number, barW = 1, gap = 1, every = 1) => barsAt(grid, values, col, base, height, barW, gap, every)),
    cbars: tag('cbars', (values: number[], col: number, centre: number, half: number, barW = 1, gap = 1) => centeredBarsAt(grid, values, col, centre, half, barW, gap)),
    line: tag('line', (points: [number, number][], every = 1, value = 1) => polylineCells(grid, points, every, value)),
    place: (field: Field, col: number, row: number, w: number, h: number) => { const f = placeCells(grid, field, col, row, w, h); f.from = { gen: 'place', grid, args: [col, row, w, h], inner: field }; return f },
    icon: tag('icon', (name: keyof typeof iconPaths, col: number, row: number, size: number, opts: { fill?: boolean; stroke?: number } = {}) => placeCells(grid, cachedIconField(name, iconPaths[name], 64, opts), col, row, size, size)),
    cjk: tag('cjk', (text: string, col: number, row: number, cell: number) => placeCells(grid, cjkTextField(text), col, row, cell * [...text].length, cell)),
    /**
     * Hero text on its own lattice: `lattice` card cells per dot, anchored at card cell (col,row). Width in card cells
     * = size(...)[0] * lattice. `smooth` is the 2-dot-stroke display weight from a lattice of 1.5 up; below that it
     * draws the plain glyph at twice the lattice, and `scale` multiplies the lattice (`bigText`, engine/layout).
     */
    big: (str: string, col: number, row: number, opts: BigTextOptions): LatticeField => bigText(grid, str, col, row, opts),
    /**
     * Evenly spaced dots on a circle (radius in cells), optionally an arc: `start` clockwise from
     * 12 o'clock, `sweep` radians. Sites are fixed by `spacing`, so an arc lands exactly on its
     * full-ring track's dots — draw the track, then the arc on top in another tone.
     */
    dotRing: (cx: number, cy: number, r: number, opts: SiteOptions & { start?: number; sweep?: number } = {}): LatticeField => {
      const { spacing = 4.5, start = 0, sweep = TAU } = opts
      // the cap uses the chord between neighbours: the site count rounds, so the real spacing differs a little
      const n = Math.max(3, Math.round((TAU * r) / spacing)), size = capSize(opts.size ?? 1.8, 2 * r * Math.sin(Math.PI / n) || spacing), sites: Pt[] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, rel = (((a - start) % TAU) + TAU) % TAU
        if (rel <= sweep + 1e-9) sites.push([cx + r * Math.sin(a), cy - r * Math.cos(a)])
      }
      return { field: one, sites, size }
    },
    /** Evenly spaced dots from (x0,y0) to (x1,y1), first dot `from` cells along. */
    dotLine: (x0: number, y0: number, x1: number, y1: number, opts: SiteOptions & { from?: number } = {}): LatticeField => {
      const { spacing = 4.5, from = 0 } = opts, size = capSize(opts.size ?? 1.8, spacing), len = Math.hypot(x1 - x0, y1 - y0), sites: Pt[] = []
      for (let d = from; d <= len + 1e-9; d += spacing) sites.push([x0 + ((x1 - x0) * d) / (len || 1), y0 + ((y1 - y0) * d) / (len || 1)])
      return { field: one, sites, size }
    },
    /** Square-packed dots filling a disc. */
    dotDisc: (cx: number, cy: number, r: number, opts: SiteOptions = {}): LatticeField => {
      const { spacing = 4.5 } = opts, size = capSize(opts.size ?? 1.8, spacing), n = Math.floor(r / spacing), sites: Pt[] = []
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) if (Math.hypot(i, j) * spacing <= r + 1e-9) sites.push([cx + i * spacing, cy + j * spacing])
      return { field: one, sites, size }
    },
    /**
     * Audio-style bars made of dot sites: one column per value, `gap` cells apart, dots `pitch`
     * cells apart up from `base` (or mirrored around it with `mirror`), `height` cells at value 1.
     */
    dotBars: (values: number[], x0: number, base: number, opts: SiteOptions & { gap?: number; pitch?: number; height?: number; mirror?: boolean } = {}): LatticeField => {
      const { gap = 3, pitch = 2.2, height = 20, size = 1.4, mirror = false } = opts, sites: Pt[] = []
      values.forEach((value, i) => {
        const n = Math.round((Math.max(0, Math.min(1, value)) * height) / pitch), x = x0 + i * gap
        for (let j = mirror ? -n : 0; j <= n; j++) sites.push([x, base - j * pitch])
      })
      return { field: one, sites, size }
    },
    /** Rounded-rectangle outline as evenly spaced sites (default: the components board's outline, 3.3 apart, size 1.5). */
    rrect: (x: number, y: number, w: number, h: number, r: number, { spacing = 3.3, size = 1.5 }: SiteOptions = {}): LatticeField => ({ field: one, sites: rrect(x, y, w, h, r, spacing), size }),
    /** Stadium (pill) outline as evenly spaced sites. */
    stadium: (x: number, y: number, w: number, h: number, { spacing = 3.3, size = 1.5 }: SiteOptions = {}): LatticeField => ({ field: one, sites: stadium(x, y, w, h, spacing), size }),
    /**
     * `n` stacked rows in one rounded outline with one separator between neighbours (`stackedRows`). Returns
     * `[rest, picked]`: row `pick`'s outline and separators as their own layer (empty when `pick` is unset).
     */
    rows: (x: number, y: number, w: number, rowH: number, n: number, o: SiteOptions & { r?: number; pick?: number } = {}): [LatticeField, LatticeField] => {
      const { spacing = 3.3, size = 1.5, r = 4, pick = -1 } = o, { all, rows } = stackedRows(x, y, w, rowH, n, r, spacing), mine = new Set(rows[pick] ?? [])
      return [{ field: one, sites: all.filter(p => !mine.has(p)), size }, { field: one, sites: [...mine], size }]
    },
    /** `track` without the sites within `r` cells of `over` (sites or a site layer): a marker sits in clear air. */
    knockout: (track: LatticeField, over: LatticeField | Pt[], r: number): LatticeField =>
      ({ ...track, sites: knockSites(track.sites ?? [], Array.isArray(over) ? over : over.sites ?? [], r) }),
    /** `lf` without the sites inside any box [x0, y0, x1, y1] grown by `pad`, so text reads over a fill. */
    knock: (lf: LatticeField, boxes: [number, number, number, number][], pad = 1.5): LatticeField => ({ ...lf, sites: lf.sites && knockBoxes(lf.sites, boxes, pad) }),
    /**
     * A marker dot at `pt` and `cut`, which clears the dots of the layer it sits on within `gap` cells of its rim: no
     * grey dot shows half under the accent. `cut` takes that layer's field (on the same `lattice` / `origin`). The
     * marker snaps to the cell or lattice site under it, unless `snap` is false (a centre between sites).
     */
    marker: (pt: Pt, size: number, o: { lattice?: number; origin?: Pt; gap?: number; snap?: boolean } = {}) => {
      const { lattice = 1, origin = [0, 0] as Pt, gap = 1, snap = true } = o, at = snap ? snapToLattice(pt, lattice, origin) : pt
      return { at, dot: { field: one, sites: [at], size } as LatticeField, cut: (f: Field) => cutAround(grid, f, [at], size / 2 + gap, lattice, origin) }
    },
    /**
     * Arbitrary dot sites. `text`: the words they spell (glyphs drawn as sites), for `describe()` and screen readers.
     * A point closer than `gap` cells (default 0.8 × size) to one kept before it is dropped, so sites that land on
     * top of each other draw one dot; `gap: 0` keeps every point (photo and simulation layers that want overlap).
     */
    dots: (points: Pt[], size = 1.8, text?: string, gap = GAP * size): LatticeField => ({ field: text ? said(text) : one, sites: minGap(points, gap), size }),
    /** Dots along a polyline `spacing` cells apart by arc length (joins between arcs stay even); size capped at 0.8 of the spacing. */
    dotPath: (points: Pt[], spacing: number, size = 1.8, closed = false): LatticeField => {
      const s = capSize(size, spacing)
      return { field: one, sites: minGap(trace(points, spacing, closed), GAP * s), size: s }
    },
    /**
     * A filled shape (button, knob, node, transport glyph) as a few big dots `k` cells apart instead of the card's fine
     * grid, on a lattice centred on `box` [x0, y0, x1, y1] (card cells). k = 2 up to about 16 cells across, 3 above.
     * Fills with the same `k` and `box` share their sites (a glyph in another tone on a button). See src/widgets/sites.ts.
     */
    fillOn,
    /** A filled triangle (play, prev, next) as hex-packed dots: tip at (x, y), `n` dots on the base, optional bar behind it. */
    dotTri,
    /**
     * A highlight's bright core as one dot: `field` sampled on the `k` lattice at `origin`, its cells at `top` of the peak
     * or more become one site (`dot`) sized to their area; `cut(f)` clears the lattice dots of `f` under it.
     */
    peak: (k: number, origin: Pt, field: Field, opts?: Parameters<typeof peakOn>[4]) => peakOn(grid, k, origin, field, opts),
    /** Layout helpers for a coarser lattice anchored at card cell (col,row); wrap results with `.at()`. */
    lattice: (k: number, col = 0, row = 0) => {
      const sub = latticeGrid(grid, k, [col, row])
      return { ...layoutFor(sub), at: (field: Field): LatticeField => ({ field, lattice: k, origin: [col, row] }) }
    },
  }
}
export const L = layoutFor(CARD)
/** Clockwise ring start at 12 o'clock. */
export const TOP = 0
