import type { CellBounds, Field, GridConfig } from './types'
import { glyphMetrics, textField, textWidth, type TextOptions } from './fields/bitmapFont'

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
export const combine = (...fields: Field[]): Field => { const f: Field = (u, v) => { let m = 0; for (const g of fields) { const x = g(u, v); if (x > m) m = x } return m }; f.bounds = union(fields); return f }
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
  return placeCells(grid, textField(str, opts), left, row, w, h)
}
export function textSize(str: string, opts: TextOptions = {}): [number, number] {
  const [sx, sy] = scaleOf(opts)
  return [textWidth(str, opts) * sx, glyphMetrics(opts).h * sy]
}
export const scaleOf = (opts: TextOptions): [number, number] => Array.isArray(opts.scale) ? opts.scale : [opts.scale ?? 1, opts.scale ?? 1]

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
