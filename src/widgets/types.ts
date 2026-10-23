import type { DotStyle, Field, GridConfig, Layer, Tone } from '../engine/types'
import type { Control, FrameContext } from '../engine/context'
import { barsAt, centeredBarsAt, discCells, dotAt, hRule, placeCells, polylineCells, rectCells, ringCells, spriteAt, textAt, textSize, vRule } from '../engine/layout'
import { cellU, latticeGrid } from '../engine/sampler/gridSampler'
import { cachedIconField, iconPaths } from '../engine/fields/iconSDF'
import { cjkTextField } from '../engine/fields/cjkFallback'
import type { TextOptions } from '../engine/fields/bitmapFont'
import { combine } from '../engine/layout'
import { hash01 } from '../engine/math'
export { bounded, combine, dim, place } from '../engine/layout'

/** Frame context a preset's `layers()` receives — see `FrameContext` in the engine. */
export type WidgetContext = FrameContext
export interface WidgetPreset {
  id: string
  name: string
  group: 'text' | 'polar' | 'icon' | 'photo' | 'chart' | 'scatter' | 'composite'
  /** Shows the status dot in the card header. */
  live?: boolean
  /** Re-sampled on a timer with a running `t`. */
  animated?: boolean
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
  /** `dots`: the card label and live dot are drawn by the engine inside the grid (TILE cards). */
  chrome?: 'dots'
  /** Label text drawn by `chrome: 'dots'` (defaults to `name`; '' = no label). */
  label?: string
  /** Edge-to-edge artwork: the card has no inner padding (photo cards). */
  bleed?: boolean
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
export interface SiteOptions {
  /** Distance between dot centres, in card cells. */
  spacing?: number
  /** Dot size relative to a card dot (1 = card dot, 2 ≈ hero dot). */
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
 * Split one static field into tone layers (cool grey → warm → hot, shadow → mid → highlight). `field` is
 * evaluated once per cell of `grid` and the band and value memoised, so N tones cost one evaluation, not N.
 * Values below the first stop draw nothing. Off-grid samples (thumbnails) are computed directly.
 * Like `baked`, only for fields that never change (no `t`, no data); `seed` picks the dither hash.
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
  // On first use: one pass over the field's window fills a value table per tone (Float32, the sampler's own
  // precision) and a cell box per tone per band of STRIP rows. Each tone is emitted as one layer per strip,
  // bounded to that box, so the sampler visits a tone only where it lands (N tones ≈ one pass, not N).
  const STRIP = 12, strips = Math.ceil(rows / STRIP)
  let tables: Float32Array[] | undefined, boxes: [number, number, number, number][] = []
  const fill = () => {
    if (tables) return tables
    tables = stops.map(() => new Float32Array(cols * rows))
    boxes = Array.from({ length: stops.length * strips }, (): [number, number, number, number] => [cols, rows, -1, -1])
    const b = field.bounds
    const c0 = b ? Math.max(0, Math.floor(b[0])) : 0, r0 = b ? Math.max(0, Math.floor(b[1])) : 0
    const c1 = b ? Math.min(cols - 1, Math.ceil(b[2])) : cols - 1, r1 = b ? Math.min(rows - 1, Math.ceil(b[3])) : rows - 1
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      pick(cellU(c, cols), cellU(r, rows), c, r)
      if (hit < 0) continue
      tables[hit][r * cols + c] = hitValue
      const box = boxes[hit * strips + Math.floor(r / STRIP)]
      if (c < box[0]) box[0] = c
      if (r < box[1]) box[1] = r
      if (c > box[2]) box[2] = c
      if (r > box[3]) box[3] = r
    }
    return tables
  }
  return stops.flatMap((s, k) => Array.from({ length: strips }, (_, strip) => {
    const f: Field = (u, v) => {
      const x = u * (cols - 1), y = v * (rows - 1), c = Math.round(x), r = Math.round(y)
      // a cell centre reads the table (its own strip only); anything else (thumbnails, another grid) is computed directly
      if (c >= 0 && r >= 0 && c < cols && r < rows && Math.abs(x - c) < 1e-6 && Math.abs(y - r) < 1e-6) return Math.floor(r / STRIP) === strip ? fill()[k][r * cols + c] : 0
      if (Math.floor(Math.max(0, Math.min(rows - 1, r)) / STRIP) !== strip) return 0
      pick(u, v, c, r)
      return hit === k ? hitValue : 0
    }
    Object.defineProperty(f, 'bounds', { get: () => (fill(), boxes[k * strips + strip]), enumerable: true })
    return { field: f, tone: s.tone }
  }))
}
export const staticLayers = (layers: Layer[]) => () => layers
/** Flatten a preset to a single field (thumbnails, exports, tests). */
export const presetField = (p: WidgetPreset, ctx: WidgetContext = { t: 0, data: p.defaults ?? {} }): Field => {
  const ls = withChrome(p)(ctx).map(l => {
    if (l.sites) { const reach = (l.size ?? l.lattice ?? 1) / 2 + .25, cells = l.sites; return (u: number, v: number) => { const x = u * (p.grid.cols - 1), y = v * (p.grid.rows - 1); return cells.some(([sx, sy]) => Math.hypot(x - sx, y - sy) <= reach) ? l.field(u, v) : 0 } }
    if (!l.lattice && !l.origin) return l.field
    // map card u/v onto the layer's lattice so the flattened field lines up
    const k = l.lattice ?? 1, [ox, oy] = l.origin ?? [0, 0], sub = latticeGrid(p.grid, k, [ox, oy])
    return (u: number, v: number) => {
      const c = Math.floor((u * (p.grid.cols - 1) + .5 - ox) / k), r = Math.floor((v * (p.grid.rows - 1) + .5 - oy) / k)
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
export function layoutFor(grid: GridConfig) {
  const W = grid.cols, H = grid.rows
  return {
    W, H,
    text: (str: string, col: number, row: number, opts: TextOptions & { align?: 'left' | 'center' | 'right' } = {}) => textAt(grid, str, col, row, opts),
    size: textSize,
    dot: (col: number, row: number, value = 1) => dotAt(grid, col, row, value),
    rect: (col: number, row: number, w: number, h: number, value = 1) => rectCells(grid, col, row, w, h, value),
    hrule: (col: number, row: number, w: number, step = 1, value = 1) => hRule(grid, col, row, w, step, value),
    vrule: (col: number, row: number, h: number, step = 1, value = 1) => vRule(grid, col, row, h, step, value),
    disc: (cx: number, cy: number, r: number, value = 1) => discCells(grid, cx, cy, r, value),
    ring: (cx: number, cy: number, r: number, opts: Parameters<typeof ringCells>[4] = {}) => ringCells(grid, cx, cy, r, opts),
    /** Outlined rectangle, `step` controls dotting of the outline. */
    box: (col: number, row: number, w: number, h: number, step = 1, value = 1): Field => {
      return combine(hRule(grid, col, row, w, step, value), hRule(grid, col, row + h - 1, w, step, value), vRule(grid, col, row, h, step, value), vRule(grid, col + w - 1, row, h, step, value))
    },
    sprite: (rows: string[], col: number, row: number, scale = 1) => spriteAt(grid, rows, col, row, scale),
    bars: (values: number[], col: number, base: number, height: number, barW = 1, gap = 1, every = 1) => barsAt(grid, values, col, base, height, barW, gap, every),
    cbars: (values: number[], col: number, centre: number, half: number, barW = 1, gap = 1) => centeredBarsAt(grid, values, col, centre, half, barW, gap),
    line: (points: [number, number][], every = 1, value = 1) => polylineCells(grid, points, every, value),
    place: (field: Field, col: number, row: number, w: number, h: number) => placeCells(grid, field, col, row, w, h),
    icon: (name: keyof typeof iconPaths, col: number, row: number, size: number, opts: { fill?: boolean; stroke?: number } = {}) => placeCells(grid, cachedIconField(name, iconPaths[name], 64, opts), col, row, size, size),
    cjk: (text: string, col: number, row: number, cell: number) => placeCells(grid, cjkTextField(text), col, row, cell * [...text].length, cell),
    /**
     * Hero text on its own lattice: `lattice` card cells per dot, anchored at card cell (col,row).
     * `smooth` gives the 2-dot-stroke display weight. Width in card cells = size(...)[0] * lattice.
     */
    big: (str: string, col: number, row: number, opts: TextOptions & { lattice: number; align?: 'left' | 'center' | 'right' }): LatticeField => {
      const w = textSize(str, opts)[0] * opts.lattice
      const left = opts.align === 'center' ? col - w / 2 : opts.align === 'right' ? col - w : col
      return { field: textAt(latticeGrid(grid, opts.lattice, [left, row]), str, 0, 0, { scale: opts.scale, smooth: opts.smooth }), lattice: opts.lattice, origin: [left, row] }
    },
    /**
     * Evenly spaced dots on a circle (radius in cells), optionally an arc: `start` clockwise from
     * 12 o'clock, `sweep` radians. Sites are fixed by `spacing`, so an arc lands exactly on its
     * full-ring track's dots — draw the track, then the arc on top in another tone.
     */
    dotRing: (cx: number, cy: number, r: number, opts: SiteOptions & { start?: number; sweep?: number } = {}): LatticeField => {
      const { spacing = 4.5, size = 1.8, start = 0, sweep = TAU } = opts
      const n = Math.max(3, Math.round((TAU * r) / spacing)), sites: Pt[] = []
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, rel = (((a - start) % TAU) + TAU) % TAU
        if (rel <= sweep + 1e-9) sites.push([cx + r * Math.sin(a), cy - r * Math.cos(a)])
      }
      return { field: one, sites, size }
    },
    /** Evenly spaced dots from (x0,y0) to (x1,y1), first dot `from` cells along. */
    dotLine: (x0: number, y0: number, x1: number, y1: number, opts: SiteOptions & { from?: number } = {}): LatticeField => {
      const { spacing = 4.5, size = 1.8, from = 0 } = opts, len = Math.hypot(x1 - x0, y1 - y0), sites: Pt[] = []
      for (let d = from; d <= len + 1e-9; d += spacing) sites.push([x0 + ((x1 - x0) * d) / (len || 1), y0 + ((y1 - y0) * d) / (len || 1)])
      return { field: one, sites, size }
    },
    /** Square-packed dots filling a disc. */
    dotDisc: (cx: number, cy: number, r: number, opts: SiteOptions = {}): LatticeField => {
      const { spacing = 4.5, size = 1.8 } = opts, n = Math.floor(r / spacing), sites: Pt[] = []
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
    /** Arbitrary dot sites. */
    dots: (points: Pt[], size = 1.8): LatticeField => ({ field: one, sites: points, size }),
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
