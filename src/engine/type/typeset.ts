/**
 * Dot type, part 2: setting stroke-font text on a dot grid. A layout places each glyph's
 * centrelines in cell space; the field is coverage of a stroke of the weight's thickness around
 * them (signed distance, a one-cell edge ramp), so any size and any axis value is the same
 * `Field → Sampler → Renderer` path as everything else. With `hint` (default when upright) the cap
 * line, baseline, stems and arc boxes snap to the lattice and stroke thickness rounds to whole dots,
 * so static text is crisp; unhinted text moves and breathes smoothly (edge dots take part values,
 * which the sampler quantizes). Characters outside the stroke font (CJK, emoji) are drawn by the
 * browser's own fonts through an offscreen canvas when one exists, and skipped otherwise (Node,
 * goldens), so headless output never depends on installed fonts.
 */
import type { CellBounds, DotInstance, Field, GridConfig, Layer, Tone } from '../types'
import { latticeGrid } from '../sampler/gridSampler'
import { CJK_FONT_STACK } from '../fields/cjkFallback'
import { CAP, SPACE_UNITS, WHITE_UNITS, flatten, kernUnits, roundnessExponent, strokeGlyph, type Pt } from './font'

export interface TypeAxes {
  /** 0 hairline … 1 black (default .5). */
  weight?: number
  /** 0 condensed … 1 extended (default .5). */
  width?: number
  /** 1 round curves and ends … 0 squarish (default .65). */
  roundness?: number
  /** Shear, x per unit of height above the baseline (.2 ≈ 11°; default 0). */
  slant?: number
}
/** Per-letter motion: offsets in cells, its own weight, a dot value multiplier. */
export interface GlyphTweak { dx?: number; dy?: number; weight?: number; value?: number }
export type GlyphFn = (index: number, ch: string, count: number) => GlyphTweak | undefined
export interface TypeOptions extends TypeAxes {
  /** Grid the field is sampled on (a card grid or a lattice's grid). */
  grid: GridConfig
  /** Anchor cell: the left / centre / right ink edge (per `align`) and the cap line row. */
  col?: number
  row?: number
  /** Cap height in cells of `grid` (default 7). */
  size?: number
  align?: 'left' | 'center' | 'right'
  /** Extra cells between letters (may be negative). */
  tracking?: number
  /** Kerning strength, 0 … 1 (default 1). */
  kerning?: number
  /** Snap to the lattice (default: on when `slant` is 0 and no `glyph` motion moves letters by part cells). */
  hint?: boolean
  /** `soft` (default): one-cell edge ramp; `hard`: on / off dots. */
  edge?: 'soft' | 'hard'
  /** Dot value of lit cells (default 1). */
  value?: number
  /** Per-letter tweaks (wave, bounce, weight waves — see `kinetic.ts`). */
  glyph?: GlyphFn
}

/** Stroke thickness in font units at `weight`. */
export const thicknessUnits = (weight: number) => .7 + 2.4 * Math.max(0, Math.min(1, weight))
const REF_T = thicknessUnits(.5)

interface PlacedGlyph {
  ch: string
  /** Segments, stride 8: ax ay ux uy len capA capB (unit direction; len 0 = a point). */
  segs: Float64Array
  count: number
  /** Half stroke thickness, cells. */
  h: number
  value: number
  /** Cells this glyph can light. */
  box: CellBounds
  /** Ink rows: centreline top − h … bottom + h; diagonal ends are cut flat here, like a font's terminals. */
  top: number; bottom: number
  raster?: CanvasGlyph & { x: number; y: number; size: number }
}
export interface TypeLayout {
  text: string
  glyphs: PlacedGlyph[]
  /** Ink box, cells: left, top, right, bottom (inclusive, before per-letter motion). */
  ink: CellBounds
  /** Cells any glyph can light (motion included). */
  bounds: CellBounds
  /** Stroke thickness at the base weight, cells. */
  thickness: number
  /** Cells per font unit (vertical). */
  scale: number
  /** Superellipse / cap exponent of the roundness axis. */
  n: number
  hard: boolean
  /** Characters neither the stroke font nor a canvas could draw. */
  skipped: number
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
/** Arc sample count: about one point per .8 cell of arc, at least 8 per full turn. */
const arcSamples = (rx: number, ry: number, sweep: number) => Math.ceil((sweep / 360) * Math.max(8, (2 * Math.PI * Math.max(rx, ry)) / .8))

/** Lay `text` out on `opts.grid` (see `TypeOptions`). Pure; build it per frame for moving type. */
export function typeLayout(text: string, opts: TypeOptions): TypeLayout {
  const weight = clamp01(opts.weight ?? .5), wf = .6 + .8 * clamp01(opts.width ?? .5), n = roundnessExponent(opts.roundness ?? .65)
  const slant = Math.max(-.5, Math.min(.5, opts.slant ?? 0)), size = Math.max(3, opts.size ?? 7), kerning = clamp01(opts.kerning ?? 1)
  const hint = opts.hint ?? slant === 0, tracking = opts.tracking ?? 0, baseValue = opts.value ?? 1
  const s = size / (CAP + REF_T), sx = s * wf
  const T = hint ? Math.max(1, Math.round(thicknessUnits(weight) * s)) : Math.max(.6, thicknessUnits(weight) * s)
  const off = hint && T % 2 === 0 ? .5 : 0, snap = (v: number) => (hint ? Math.round(v - off) + off : v)
  const row = opts.row ?? 0
  const yTop = snap(row - .5 + (hint ? T : REF_T * s) / 2), yBase = snap(yTop + CAP * s), sy = (yBase - yTop) / CAP
  const white = hint ? Math.max(1, Math.round(WHITE_UNITS * sx)) : WHITE_UNITS * sx
  const chars = graphemes(text), count = chars.length
  // pass 1: pen positions (centreline-box left of each glyph) from 0
  interface Slot { ch: string; x: number; w: number; raster?: CanvasGlyph | null }
  const slots: Slot[] = []
  let pen = 0, prev = '', skipped = 0, first = true
  for (const ch of chars) {
    if (/^\s$/.test(ch)) { pen += SPACE_UNITS * sx + tracking; prev = ''; continue }
    const g = strokeGlyph(ch)
    if (!g) {
      const raster = canvasGlyph(ch)
      if (!raster) { skipped++; continue }
      const box = Math.round(size * 1.3)
      if (!first) pen += white + tracking
      slots.push({ ch, x: Math.round(pen), w: box, raster }); pen = Math.round(pen) + box; prev = ''; first = false
      continue
    }
    if (!first) pen += T + white + tracking + (prev ? kernUnits(prev, ch) * sx * kerning : 0)
    const x = snap(pen), w = hint ? Math.round(g.w * sx) : g.w * sx
    slots.push({ ch, x, w }); pen = x + w; prev = ch; first = false
  }
  // ink extent from 0: the first glyph's ink starts T/2 left of its centreline box
  const inkLeft0 = slots.length ? Math.min(...slots.map(sl => sl.raster ? sl.x : sl.x - T / 2 + .5)) : 0
  const inkRight0 = slots.length ? Math.max(...slots.map(sl => sl.raster ? sl.x + sl.w - 1 : sl.x + sl.w + T / 2 - .5)) : 0
  const width = inkRight0 - inkLeft0 + 1, col = opts.col ?? 0
  const left = opts.align === 'center' ? col - (width - 1) / 2 : opts.align === 'right' ? col - width + 1 : col
  const shift = hint ? Math.round(left - inkLeft0) : left - inkLeft0
  const glyphs: PlacedGlyph[] = []
  let b0 = Infinity, b1 = Infinity, b2 = -Infinity, b3 = -Infinity
  slots.forEach((sl, i) => {
    const tw = opts.glyph?.(i, sl.ch, count), dx = tw?.dx ?? 0, dy = tw?.dy ?? 0, value = baseValue * (tw?.value ?? 1)
    if (sl.raster) {
      const x = sl.x + shift + dx, y = Math.round(row - size * .18) + dy, box: CellBounds = [x - 1, y - 1, x + sl.w, y + sl.w]
      glyphs.push({ ch: sl.ch, segs: new Float64Array(0), count: 0, h: 0, value, box, top: box[1], bottom: box[3], raster: { ...sl.raster, x, y, size: sl.w } })
      b0 = Math.min(b0, box[0]); b1 = Math.min(b1, box[1]); b2 = Math.max(b2, box[2]); b3 = Math.max(b3, box[3])
      return
    }
    const g = strokeGlyph(sl.ch)!, x0 = sl.x + shift + dx, sxg = g.w > 0 ? sl.w / g.w : sx
    const gT = tw?.weight === undefined ? T : hint ? Math.max(1, Math.round(thicknessUnits(tw.weight) * s)) : Math.max(.6, thicknessUnits(tw.weight) * s)
    const yb = yBase + dy, sh = (y: number) => slant * (yb - y)
    const lines = flatten(g,
      (x, y) => { const X = snap(x0 + x * sxg), Y = snap(yTop + dy + y * sy); return [X, Y] },
      (cx, cy, rx, ry) => {
        const l = snap(x0 + (cx - rx) * sxg), r = snap(x0 + (cx + rx) * sxg), t = snap(yTop + dy + (cy - ry) * sy), b = snap(yTop + dy + (cy + ry) * sy)
        return [(l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2]
      }, n, arcSamples)
    // placed (and snapped) upright, then sheared about the baseline
    const sheared = slant ? lines.map(line => line.map(([x, y]): Pt => [x + sh(y), y])) : lines
    const { segs, count: m, box } = segments(sheared, gT / 2)
    glyphs.push({ ch: sl.ch, segs, count: m, h: gT / 2, value, box, top: box[1] + 1, bottom: box[3] - 1 })
    b0 = Math.min(b0, box[0]); b1 = Math.min(b1, box[1]); b2 = Math.max(b2, box[2]); b3 = Math.max(b3, box[3])
  })
  const ink: CellBounds = [inkLeft0 + shift, row, inkRight0 + shift, row + size - 1]
  const bounds: CellBounds = glyphs.length ? [Math.floor(b0), Math.floor(b1), Math.ceil(b2), Math.ceil(b3)] : [0, 0, -1, -1]
  return { text, glyphs, ink, bounds, thickness: T, scale: sy, n, hard: opts.edge === 'hard', skipped }
}
/** Ink width of `text` in cells (what `align` centres). */
export const typeWidth = (text: string, opts: TypeOptions): number => { const l = typeLayout(text, { ...opts, col: 0, align: 'left', glyph: undefined }); return l.ink[2] - l.ink[0] + 1 }

/** Corner joins (40°–120° turns) and stroke ends take the roundness exponent; curve joints stay round. */
function segments(lines: Pt[][], h: number): { segs: Float64Array; count: number; box: CellBounds } {
  const total = lines.reduce((k, l) => k + Math.max(1, l.length - 1), 0), segs = new Float64Array(total * 8)
  let k = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const cosLo = Math.cos((40 * Math.PI) / 180), cosHi = Math.cos((120 * Math.PI) / 180)
  for (const line of lines) {
    for (const [x, y] of line) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    const m = line.length, closed = m > 2 && Math.hypot(line[0][0] - line[m - 1][0], line[0][1] - line[m - 1][1]) < 1e-6
    const corner = (i: number) => {
      if (!closed && (i === 0 || i === m - 1)) return 1
      const a = line[(i - 1 + m - (closed && i === 0 ? 1 : 0)) % m], b = line[i], c = line[(i + 1 + (closed && i === m - 1 ? 1 : 0)) % m]
      const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1], d = Math.hypot(ux, uy) * Math.hypot(vx, vy)
      if (d < 1e-12) return 0
      const cos = (ux * vx + uy * vy) / d
      return cos < cosLo && cos > cosHi ? 1 : 0
    }
    if (m === 1) { segs.set([line[0][0], line[0][1], 1, 0, 0, 1, 1, 0], k * 8); k++; continue }
    for (let i = 1; i < m; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i], len = Math.hypot(bx - ax, by - ay)
      segs.set([ax, ay, len ? (bx - ax) / len : 1, len ? (by - ay) / len : 0, len, corner(i - 1), corner(i), 0], k * 8); k++
    }
  }
  const r = h + 1
  return { segs, count: k, box: [x0 - r, y0 - r, x1 + r, y1 + r] }
}

/** Distance from (x, y) to a glyph's strokes, cells; p-norm ends at caps and corners. */
function strokeDistance(g: PlacedGlyph, x: number, y: number, p: number, stopBelow: number): number {
  const s = g.segs, ip = 1 / p
  let best = Infinity
  for (let i = 0; i < g.count; i++) {
    const o = i * 8, qx = x - s[o], qy = y - s[o + 1], ux = s[o + 2], uy = s[o + 3], len = s[o + 4]
    const along = qx * ux + qy * uy, perp = Math.abs(qx * uy - qy * ux)
    let d: number
    if (len === 0) d = s[o + 5] ? (Math.abs(qx) ** p + Math.abs(qy) ** p) ** ip : Math.hypot(qx, qy)
    else if (along >= 0 && along <= len) d = perp
    else {
      const e = along < 0 ? -along : along - len, cap = along < 0 ? s[o + 5] : s[o + 6]
      d = cap ? (e ** p + perp ** p) ** ip : Math.hypot(e, perp)
    }
    if (d < best) { best = d; if (best <= stopBelow) return best }
  }
  return best
}

/** Coverage of a layout at cell coordinates (x, y) of its grid (fractional allowed). */
export function typeAt(l: TypeLayout, x: number, y: number): number {
  let m = 0
  for (const g of l.glyphs) {
    const b = g.box
    if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue
    let v: number
    if (g.raster) v = rasterAt(g.raster, (x - g.raster.x + .5) / g.raster.size, (y - g.raster.y + .5) / g.raster.size)
    else {
      const d = strokeDistance(g, x, y, l.n, g.h - .5), cut = Math.min(y - g.top, g.bottom - y)
      v = l.hard ? (d <= g.h + 1e-9 && cut >= -1e-9 ? 1 : 0) : clamp01(Math.min(g.h - d, cut) + .5)
    }
    v *= g.value
    if (v > m) { m = v; if (m >= 1) break }
  }
  return m
}

/** A layout as a field on its grid, with `bounds`. */
export function layoutField(l: TypeLayout, grid: GridConfig): Field {
  const cx = Math.max(1, grid.cols - 1), cy = Math.max(1, grid.rows - 1)
  const f: Field = (u, v) => typeAt(l, u * cx, v * cy)
  f.bounds = l.bounds
  f.text = l.text
  return f
}
/** Stroke-font text as a field on `opts.grid` (see `TypeOptions`). */
export const typeField = (text: string, opts: TypeOptions): Field => layoutField(typeLayout(text, opts), opts.grid)

// ── lattices: big type as bigger dots ───────────────────────────────────────
export interface TypeFrame {
  /** The lattice's own grid (what `TypeOptions.grid` should be). */
  grid: GridConfig
  lattice: number
  origin: [number, number]
  /** Card cell → lattice cell (fractional). */
  colOf(cardX: number): number
  rowOf(cardY: number): number
  /** Lattice cell → card cell (a site coordinate). */
  cardX(col: number): number
  cardY(row: number): number
  /** A field on this lattice as a layer. */
  layer(field: Field, tone?: Tone): Layer
}
/** A coarser lattice over `grid` starting at card cell `origin` (`lattice` card cells per dot). */
export function typeFrame(grid: GridConfig, lattice = 1, origin: [number, number] = [0, 0]): TypeFrame {
  const k = lattice, [ox, oy] = origin, sub = k === 1 && !ox && !oy ? grid : latticeGrid(grid, k, origin)
  return {
    grid: sub, lattice: k, origin,
    colOf: x => (x + .5 - ox) / k - .5, rowOf: y => (y + .5 - oy) / k - .5,
    cardX: c => ox + (c + .5) * k - .5, cardY: r => oy + (r + .5) * k - .5,
    layer: (field, tone = 'value') => (k === 1 && !ox && !oy ? { field, tone } : { field, tone, lattice: k, origin }),
  }
}
/**
 * Stroke-font text as one layer: `grid` is the card grid, `col` / `row` card cells, `size` the cap
 * height in lattice dots. `lattice` > 1 sets the text on a coarser lattice (bigger dots, never
 * clusters of small ones).
 */
export function typeLayers(text: string, opts: TypeOptions & { lattice?: number; origin?: [number, number]; tone?: Tone }): Layer[] {
  const fr = typeFrame(opts.grid, opts.lattice ?? 1, opts.origin ?? [0, 0])
  return [fr.layer(typeField(text, { ...opts, grid: fr.grid, col: fr.colOf(opts.col ?? 0), row: Math.round(fr.rowOf(opts.row ?? 0)) }), opts.tone)]
}

/**
 * The lit cells of a field on a frame, as card-cell dots (`r` = dot size, `opacity` = value quantized
 * to quarters, `color` = tone name) — the input `migrate` pairs up.
 */
export function frameDots(field: Field, fr: TypeFrame, tone: Tone = 'value', min = .25): DotInstance[] {
  const { cols, rows } = fr.grid, b = field.bounds, out: DotInstance[] = []
  const c0 = b ? Math.max(0, Math.floor(b[0])) : 0, r0 = b ? Math.max(0, Math.floor(b[1])) : 0
  const c1 = b ? Math.min(cols - 1, Math.ceil(b[2])) : cols - 1, r1 = b ? Math.min(rows - 1, Math.ceil(b[3])) : rows - 1
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const v = Math.round(field(cols === 1 ? .5 : c / (cols - 1), rows === 1 ? .5 : r / (rows - 1)) * 4) / 4
    if (v >= min) out.push({ x: fr.cardX(c), y: fr.cardY(r), r: fr.lattice, opacity: v, color: tone })
  }
  return out
}

// ── characters outside the stroke font: the browser's fonts, via an offscreen canvas ──
export interface CanvasGlyph { data: Float32Array; res: number }
const RES = 48
const canvasCache = new Map<string, CanvasGlyph | null>()
type Ctx2D = { font: string; textAlign: string; textBaseline: string; fillStyle: string; fillText(s: string, x: number, y: number): void; getImageData(x: number, y: number, w: number, h: number): { data: ArrayLike<number> } }
/** True when this environment can rasterise system fonts (a browser); Node and workers without OffscreenCanvas say no. */
export function canRasterText(): boolean { return makeContext() !== null }
function makeContext(): Ctx2D | null {
  const g = globalThis as { OffscreenCanvas?: new (w: number, h: number) => { getContext(k: '2d'): unknown }; document?: { createElement(t: 'canvas'): { width: number; height: number; getContext(k: '2d'): unknown } } }
  try {
    if (g.OffscreenCanvas) { const ctx = new g.OffscreenCanvas(RES, RES).getContext('2d') as Ctx2D | null; if (ctx && typeof ctx.fillText === 'function') return ctx }
    if (g.document?.createElement) { const c = g.document.createElement('canvas'); c.width = c.height = RES; const ctx = c.getContext('2d') as Ctx2D | null; if (ctx && typeof ctx.fillText === 'function') return ctx }
  } catch { /* no canvas */ }
  return null
}
/** Luma × alpha raster of one character in the system CJK / emoji fonts, or null outside a browser. */
export function canvasGlyph(ch: string): CanvasGlyph | null {
  let g = canvasCache.get(ch)
  if (g !== undefined) return g
  const ctx = makeContext()
  g = null
  if (ctx) {
    ctx.font = `${Math.round(RES * .86)}px ${CJK_FONT_STACK}, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff'
    ctx.fillText(ch, RES / 2, RES / 2 + RES * .04)
    const px = ctx.getImageData(0, 0, RES, RES).data, data = new Float32Array(RES * RES)
    let any = false
    for (let i = 0; i < RES * RES; i++) {
      const a = px[i * 4 + 3] / 255, luma = (.2126 * px[i * 4] + .7152 * px[i * 4 + 1] + .0722 * px[i * 4 + 2]) / 255
      data[i] = a * (.3 + .7 * luma); if (data[i] > .05) any = true
    }
    g = any ? { data, res: RES } : null
  }
  canvasCache.set(ch, g)
  return g
}
/** Bilinear read of a canvas glyph at u, v ∈ [0, 1]. */
function rasterAt(g: CanvasGlyph, u: number, v: number): number {
  if (u < 0 || v < 0 || u > 1 || v > 1) return 0
  const n = g.res, x = u * n - .5, y = v * n - .5, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= n || j >= n ? 0 : g.data[j * n + i])
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
}
/** User-perceived characters (emoji ZWJ sequences stay whole when `Intl.Segmenter` exists). */
function graphemes(text: string): string[] {
  const Seg = (Intl as { Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
  return Seg ? [...new Seg(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment) : [...text]
}
