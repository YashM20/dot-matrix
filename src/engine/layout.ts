import type { CellBounds, Field, GridConfig, Layer } from './types'
import { glyph, glyphMetrics, textField, textWidth, type TextOptions } from './fields/bitmapFont'
import { latticeGrid } from './sampler/gridSampler'

/**
 * Cell-space layout. Every helper here takes integer dot coordinates on a known grid, so
 * glyph pixels, bars and markers land exactly on dot centres instead of being resampled
 * through fractional u/v — this is what keeps text crisp.
 */
/**
 * Attach the cell rectangle a field can be non-zero in (lets the sampler skip everything else).
 * Returns a new field — the argument is never mutated, so shared/cached fields keep their own bounds.
 */
export function bounded(field: Field, c0: number, r0: number, c1: number, r1: number): Field { const f: Field = (u, v) => field(u, v); f.bounds = [c0, r0, c1, r1]; return f }
/** Internal: tag a closure this module just created (no wrapper call on the hot path). */
function own(field: Field, c0: number, r0: number, c1: number, r1: number): Field { field.bounds = [c0, r0, c1, r1]; return field }
const union = (fields: Field[]): CellBounds | undefined => {
  if (!fields.length || fields.some(f => !f.bounds)) return undefined
  const bs = fields.map(f => f.bounds!)
  return [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))]
}
/** The max of `fields`; the words any of them drew (`Field.text`) carry over, joined, for `describe()`. */
export const combine = (...fields: Field[]): Field => {
  const f: Field = (u, v) => { let m = 0; for (const g of fields) { const x = g(u, v); if (x > m) m = x } return m }
  f.bounds = union(fields)
  const text = fields.map(g => g.text?.trim()).filter(Boolean).join(' ')
  if (text) f.text = text
  return f
}
export const dim = (field: Field, factor: number): Field => { const f: Field = (u, v) => field(u, v) * factor; f.bounds = field.bounds; return f }
/** Place a field into a fractional box (legacy helper, resamples). */
export const place = (field: Field, x: number, y: number, w: number, h: number): Field => (u, v) => (u < x || u > x + w || v < y || v > y + h) ? 0 : field((u - x) / w, (v - y) / h)

/** u/v → integer cell (inverse of the sampler's cell centre mapping). */
export const toCell = (u: number, n: number) => Math.round(u * (n - 1))

/** Place a field so it covers exactly `w × h` cells starting at (col,row); inner field sees cell centres. */
export function placeCells(grid: GridConfig, field: Field, col: number, row: number, w: number, h: number): Field {
  return own((u, v) => {
    const c = toCell(u, grid.cols) - col, r = toCell(v, grid.rows) - row
    if (c < 0 || r < 0 || c >= w || r >= h) return 0
    return field((c + 0.5) / w, (r + 0.5) / h)
  }, col, row, col + w - 1, row + h - 1)
}

/** Bitmap text anchored at a cell. `align` moves the anchor to the text's centre/right edge. */
export function textAt(grid: GridConfig, str: string, col: number, row: number, opts: TextOptions & { align?: 'left' | 'center' | 'right' } = {}): Field {
  const [w, h] = textSize(str, opts)
  const left = opts.align === 'center' ? Math.round(col - w / 2) : opts.align === 'right' ? col - w + 1 : col
  const f = placeCells(grid, textField(str, opts), left, row, w, h)
  f.text = str
  f.from = { gen: 'text', grid, args: [str, col, row, opts] }
  return f
}
export function textSize(str: string, opts: TextOptions = {}): [number, number] {
  const [sx, sy] = scaleOf(opts)
  return [textWidth(str, opts) * sx, glyphMetrics(opts).h * sy]
}
export const scaleOf = (opts: TextOptions): [number, number] => Array.isArray(opts.scale) ? opts.scale : [opts.scale ?? 1, opts.scale ?? 1]

export interface BigTextOptions extends TextOptions {
  lattice: number
  align?: 'left' | 'center' | 'right'
  /** The glyphs are a shape (a relief or engraving mask), never drawn as dots: `smooth` keeps Scale2x at any lattice. */
  mask?: boolean
}
/**
 * `smooth` (Scale2x) text needs a lattice of this many card cells or more (21 rows tall): below it the two-dot strokes
 * read as a cluster. Hero and display numbers sit above it and keep the smooth face.
 */
export const SMOOTH_MIN_LATTICE = 1.5
/**
 * Hero text on its own lattice: `lattice` card cells per font pixel, anchored at card cell (col,row); `align` moves the
 * anchor to the text's centre or right edge. Every font pixel is one dot:
 * - `smooth` below `SMOOTH_MIN_LATTICE` draws the plain 5×7 glyph at twice the lattice (same size, one-dot strokes);
 * - `scale` multiplies the lattice instead of drawing blocks of dots. A non-uniform scale gives columns `kx` and rows
 *   `ky` apart, drawn as round dot sites (sized by the narrower pitch), so the dots stay round.
 */
export function bigText(grid: GridConfig, str: string, col: number, row: number, opts: BigTextOptions): Omit<Layer, 'tone'> {
  const [sx, sy] = scaleOf(opts), plain = !!opts.smooth && !opts.mask && opts.lattice < SMOOTH_MIN_LATTICE
  const k = plain ? opts.lattice * 2 : opts.lattice, face: TextOptions = { smooth: !!opts.smooth && !plain }
  const kx = k * sx, ky = k * sy, w = textWidth(str, face) * kx
  const left = opts.align === 'center' ? col - w / 2 : opts.align === 'right' ? col - w : col
  if (kx === ky) return { field: textAt(latticeGrid(grid, kx, [left, row]), str, 0, 0, face), lattice: kx, origin: [left, row] }
  const m = glyphMetrics(face), sites: [number, number][] = []
  ;[...str].forEach((ch, i) => glyph(ch, face).forEach((bits, y) => bits.forEach((on, x) => {
    if (on) sites.push([left + (i * m.advance + x + .5) * kx - .5, row + (y + .5) * ky - .5])
  })))
  const field: Field = () => 1
  field.text = str
  return { field, sites, size: Math.min(kx, ky) }
}

/** Single dot at a cell. */
export const dotAt = (grid: GridConfig, col: number, row: number, value = 1): Field => own((u, v) => (toCell(u, grid.cols) === col && toCell(v, grid.rows) === row ? value : 0), col, row, col, row)
/** Axis-aligned filled cell rectangle. */
export const rectCells = (grid: GridConfig, col: number, row: number, w: number, h: number, value = 1): Field => own((u, v) => { const c = toCell(u, grid.cols), r = toCell(v, grid.rows); return c >= col && c < col + w && r >= row && r < row + h ? value : 0 }, col, row, col + w - 1, row + h - 1)
/** Horizontal dotted rule — every `step`th cell. */
export const hRule = (grid: GridConfig, col: number, row: number, w: number, step = 1, value = 1): Field => own((u, v) => { const c = toCell(u, grid.cols), r = toCell(v, grid.rows); return r === row && c >= col && c < col + w && (c - col) % step === 0 ? value : 0 }, col, row, col + w - 1, row)
export const vRule = (grid: GridConfig, col: number, row: number, h: number, step = 1, value = 1): Field => own((u, v) => { const c = toCell(u, grid.cols), r = toCell(v, grid.rows); return c === col && r >= row && r < row + h && (r - row) % step === 0 ? value : 0 }, col, row, col, row + h - 1)
/** Filled disc in cell units. */
export const discCells = (grid: GridConfig, cx: number, cy: number, radius: number, value = 1): Field => own((u, v) => (Math.hypot(toCell(u, grid.cols) - cx, toCell(v, grid.rows) - cy) <= radius ? value : 0), cx - radius, cy - radius, cx + radius, cy + radius)
/** Ring (one dot thick by default) in cell units, optional arc from `start` (radians, clockwise from 12 o'clock) sweeping `sweep`. */
export function ringCells(grid: GridConfig, cx: number, cy: number, radius: number, opts: { thickness?: number; start?: number; sweep?: number; value?: number; every?: number } = {}): Field {
  const { thickness = 1, start = 0, sweep = Math.PI * 2, value = 1, every = 1 } = opts
  const reach = radius + thickness / 2 + 1
  return own((u, v) => {
    const dx = toCell(u, grid.cols) - cx, dy = toCell(v, grid.rows) - cy, d = Math.hypot(dx, dy)
    if (Math.abs(d - radius) > thickness / 2) return 0
    const a = (Math.atan2(dx, -dy) + Math.PI * 2 - start + Math.PI * 4) % (Math.PI * 2)
    if (a > sweep) return 0
    if (every > 1 && Math.round((a * radius) / every) * every !== Math.round(a * radius)) return 0
    return value
  }, cx - reach, cy - reach, cx + reach, cy + reach)
}
/** A 1-bit sprite (strings of `#`/`.`/space, or 0-9 for grey levels) drawn at a cell, optionally scaled. */
export function spriteAt(grid: GridConfig, rows: string[], col: number, row: number, scale = 1): Field {
  const h = rows.length, w = Math.max(...rows.map(r => r.length))
  const val = (ch: string) => (ch === '#' ? 1 : ch >= '1' && ch <= '9' ? +ch / 9 : 0)
  return own((u, v) => {
    const c = toCell(u, grid.cols) - col, r = toCell(v, grid.rows) - row
    if (c < 0 || r < 0 || c >= w * scale || r >= h * scale) return 0
    return val(rows[Math.floor(r / scale)][Math.floor(c / scale)] ?? ' ')
  }, col, row, col + w * scale - 1, row + h * scale - 1)
}
/** Vertical bars from the baseline (row `base`, growing upward) — one bar per entry, `barW` wide, `gap` cells between. */
export function barsAt(grid: GridConfig, values: number[], col: number, base: number, height: number, barW = 1, gap = 1, every = 1): Field {
  return own((u, v) => {
    const c = toCell(u, grid.cols) - col, r = toCell(v, grid.rows)
    if (c < 0) return 0
    const i = Math.floor(c / (barW + gap)); if (i >= values.length || c % (barW + gap) >= barW) return 0
    const top = base - Math.round(Math.max(0, Math.min(1, values[i])) * height)
    return r <= base && r > top && (base - r) % every === 0 ? 1 : 0
  }, col, base - height, col + values.length * (barW + gap), base)
}
/** Symmetric bars around a centre row (audio-waveform look). */
export function centeredBarsAt(grid: GridConfig, values: number[], col: number, centre: number, halfHeight: number, barW = 1, gap = 1): Field {
  return own((u, v) => {
    const c = toCell(u, grid.cols) - col, r = toCell(v, grid.rows)
    if (c < 0) return 0
    const i = Math.floor(c / (barW + gap)); if (i >= values.length || c % (barW + gap) >= barW) return 0
    const half = Math.max(0, Math.round(Math.max(0, Math.min(1, values[i])) * halfHeight))
    return Math.abs(r - centre) <= half ? 1 : 0
  }, col, centre - halfHeight, col + values.length * (barW + gap), centre + halfHeight)
}
/** Dotted polyline through cell points (Bresenham-like stepping), `every` controls dot spacing. */
export function polylineCells(grid: GridConfig, points: [number, number][], every = 1, value = 1): Field {
  const cells = new Set<number>(); let k = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i], [x1, y1] = points[i + 1]
    const steps = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
    for (let s = 0; s < steps || (i === points.length - 2 && s === steps); s++, k++) {
      if (k % every !== 0) continue
      cells.add(Math.round(x0 + ((x1 - x0) * s) / steps) + Math.round(y0 + ((y1 - y0) * s) / steps) * 4096)
    }
  }
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  return own((u, v) => (cells.has(toCell(u, grid.cols) + toCell(v, grid.rows) * 4096) ? value : 0), Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1)
}

// ── outlines, separators, knockouts and stacks as dot sites (card cells) ───────────────────────────────
type P2 = [number, number]
const TAU = Math.PI * 2
/** Evenly spaced dot sites around a stadium (pill) outline, top-left corner at (x,y). */
export function stadium(x: number, y: number, w: number, h: number, spacing: number): P2[] {
  const r = h / 2, straight = Math.max(0, w - h), perimeter = 2 * straight + TAU * r
  const n = Math.max(8, Math.round(perimeter / spacing)), step = perimeter / n, pts: P2[] = []
  const lx = x + r, rx = x + r + straight, cy = y + r
  for (let i = 0; i < n; i++) {
    let d = i * step
    if (d < straight) { pts.push([lx + d, y]); continue }                                 // top edge →
    d -= straight
    if (d < Math.PI * r) { const a = d / r; pts.push([rx + r * Math.sin(a), cy - r * Math.cos(a)]); continue } // right cap
    d -= Math.PI * r
    if (d < straight) { pts.push([rx - d, y + h]); continue }                              // bottom edge ←
    d -= straight
    const a = d / r; pts.push([lx - r * Math.sin(a), cy + r * Math.cos(a)])                 // left cap
  }
  return pts
}
/** Evenly spaced dot sites around a rounded rectangle (corner radius r; r = h/2 is a stadium, w = h = 2r a circle). */
export function rrect(x: number, y: number, w: number, h: number, r: number, spacing: number): P2[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI / 2) * r, perimeter = 2 * sw + 2 * sh + 4 * arc
  const n = Math.max(8, Math.round(perimeter / spacing)), step = perimeter / n, pts: P2[] = []
  for (let i = 0; i < n; i++) {
    let d = i * step, a = 0
    if (d < sw) { pts.push([x + r + d, y]); continue }                                       // top →
    d -= sw
    if (d < arc) { a = d / r; pts.push([x + w - r + r * Math.sin(a), y + r - r * Math.cos(a)]); continue }
    d -= arc
    if (d < sh) { pts.push([x + w, y + r + d]); continue }                                   // right ↓
    d -= sh
    if (d < arc) { a = d / r; pts.push([x + w - r + r * Math.cos(a), y + h - r + r * Math.sin(a)]); continue }
    d -= arc
    if (d < sw) { pts.push([x + w - r - d, y + h]); continue }                               // bottom ←
    d -= sw
    if (d < arc) { a = d / r; pts.push([x + r - r * Math.sin(a), y + h - r + r * Math.cos(a)]); continue }
    d -= arc
    if (d < sh || r === 0) { pts.push([x, y + h - r - d]); continue }                        // left ↑
    d -= sh; a = d / r; pts.push([x + r - r * Math.cos(a), y + r - r * Math.sin(a)])
  }
  return pts
}
/**
 * `n` stacked rows of height `rowH` inside one rounded outline at (x, y), w wide: the outline once, and one
 * separator between neighbours (never two parallel borders). `rows[i]` holds the sites that bound row i: its part
 * of the outline and the separators above and below it, so one row can take another tone. A separator belongs to
 * both rows it divides. Separator sites keep a full `spacing` clear of the outline's sides.
 */
export function stackedRows(x: number, y: number, w: number, rowH: number, n: number, r: number, spacing: number): { all: P2[]; rows: P2[][] } {
  const h = rowH * n, outline = rrect(x, y, w, h, r, spacing), rows: P2[][] = Array.from({ length: n }, () => [])
  const rowOf = (py: number) => Math.max(0, Math.min(n - 1, Math.floor((py - y) / rowH)))
  for (const p of outline) rows[rowOf(p[1])].push(p)
  const span = w - 2 * spacing, m = Math.max(1, Math.round(span / spacing)), seps: P2[] = []
  for (let k = 1; k < n; k++) {
    const sy = y + k * rowH
    for (let i = 0; i <= m; i++) { const p: P2 = [x + spacing + (span * i) / m, sy]; seps.push(p); rows[k - 1].push(p); rows[k].push(p) }
  }
  return { all: [...outline, ...seps], rows }
}
/** The sites of `track` farther than `r` cells from every site of `over`: a marker, needle or knot sits in clear air. */
export const knockSites = (track: readonly P2[], over: readonly P2[], r: number): P2[] =>
  track.filter(([x, y]) => over.every(([ox, oy]) => Math.hypot(x - ox, y - oy) > r))
/** The sites outside every box [x0, y0, x1, y1] grown by `pad` (text read over a fill of sites). */
export const knockBoxes = (sites: readonly P2[], boxes: readonly [number, number, number, number][], pad = 1.5): P2[] =>
  sites.filter(([x, y]) => !boxes.some(([x0, y0, x1, y1]) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad))
/** The site of a `lattice` (anchored at `origin`) nearest card point `p`: a marker snapped onto the dots under it. */
export const snapToLattice = ([x, y]: P2, lattice: number, [ox, oy]: P2 = [0, 0]): P2 =>
  [ox + (Math.round((x + .5 - ox) / lattice - .5) + .5) * lattice - .5, oy + (Math.round((y + .5 - oy) / lattice - .5) + .5) * lattice - .5]
/**
 * `field` with a hole of radius `r` card cells round each centre, sampled on `grid` or on its `lattice` (anchored at
 * `origin`): what a marker cuts in the layer it sits on, so no dot of that layer hides half under it.
 */
export function cutAround(grid: GridConfig, field: Field, centres: readonly P2[], r: number, lattice = 1, origin: P2 = [0, 0]): Field {
  const sub = lattice === 1 && !origin[0] && !origin[1] ? grid : latticeGrid(grid, lattice, origin), [ox, oy] = origin
  const sx = Math.max(1, sub.cols - 1), sy = Math.max(1, sub.rows - 1), r2 = r * r
  const f: Field = (u, v) => {
    const x = ox + (u * sx + .5) * lattice - .5, y = oy + (v * sy + .5) * lattice - .5
    for (const [cx, cy] of centres) if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) return 0
    return field(u, v)
  }
  if (field.bounds) f.bounds = field.bounds
  if (field.text) f.text = field.text
  return f
}
/** Row tops for a stack of elements `heights` cells tall from `top`, with at least `gap` empty rows between neighbours. */
export function stack(top: number, heights: readonly number[], gap = 1): number[] {
  const out: number[] = []
  let y = top
  for (const h of heights) { out.push(y); y += h + gap }
  return out
}
