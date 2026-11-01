/**
 * Teletext pages in square cells (docs/living-matter/Q-squares.md §3.3): a page is a grid of character cells, each a
 * text character or a sextant mosaic (2 × 3 sub-cells, the SAA5050's block graphics). Text goes through `textAt` on
 * the card grid (5 × 7 glyphs, dot-aligned); a mosaic is one lattice layer per tone on a sub-cell lattice
 * `[cell[0] / 2, cell[1] / 3]` (square sub-cells for 6 × 9 characters, rect cells otherwise).
 *
 *   contiguous  sub-cells at full size, joined per tone: adjacent blocks fuse across character boundaries
 *   separated   sub-cells as spaced squares (the `{grid.gap}` gutter shows between them), never joined
 *
 * A background colour is a layer of value .5 under the foreground's 1 (the composite max lets the foreground win,
 * two tones per cell), joined in its own group so a run of background cells reads as one panel.
 */
import { combine, rectCells, textAt } from '../layout'
import { latticeGrid } from '../sampler/gridSampler'
import type { Field, GridConfig, Layer, Tone } from '../types'

/** One teletext cell: a text character, or a 6-bit sextant mosaic (bit i = sub-cell i, row-major 2 × 3); `sep` overrides the page mode. */
export type TtCell = ({ ch: string } | { sextant: number }) & { fg: Tone; bg?: Tone; sep?: boolean }
export interface TeletextOptions {
  /** The card grid the page is drawn on. */
  grid: GridConfig
  /** Page size in character cells, and its top-left in card cells. */
  cols: number; rows: number; origin: [number, number]
  /** Character cell in card cells (6 × 9 fits the 5 × 7 font with a gutter). */
  cell: [number, number]
  mode: 'contiguous' | 'separated'
  /** Row of a character's glyph top inside its cell (default: centred, ⌊(cell height − 7) / 2⌋). */
  baseline?: number
}

/** Join groups: contiguous mosaics, mosaic backgrounds, text backgrounds (tones differ anyway; the ids keep them apart if not). */
const G_FG = 1, G_BG = 2, G_TEXT_BG = 3

/**
 * Layers for a page (`null` = an empty cell): per row the text backgrounds and text, then on the sub-cell lattice the
 * mosaic backgrounds and mosaics (contiguous joined, separated spaced). Fields are bounded to the cells they light.
 */
export function teletextLayers(page: (TtCell | null)[][], o: TeletextOptions): Layer[] {
  const { grid, origin: [ox, oy], cell: [cw, ch] } = o, k: [number, number] = [cw / 2, ch / 3]
  const sub = latticeGrid(grid, k, [ox, oy]), SX = Math.max(1, sub.cols - 1), SY = Math.max(1, sub.rows - 1)
  // mosaic planes per (tone, kind): sub-cell values, row-major over the page's sub-cell grid
  const W = o.cols * 2, H = o.rows * 3, planes = new Map<string, { tone: Tone; kind: 'fg' | 'sep' | 'bg'; data: Uint8Array }>()
  const plane = (tone: Tone, kind: 'fg' | 'sep' | 'bg') => {
    const key = `${kind}|${tone}`
    let p = planes.get(key)
    if (!p) planes.set(key, (p = { tone, kind, data: new Uint8Array(W * H) }))
    return p.data
  }
  const out: Layer[] = [], ty = o.baseline ?? Math.floor((ch - 7) / 2)
  for (let r = 0; r < Math.min(o.rows, page.length); r++) {
    const row = page[r], y0 = oy + r * ch
    // text: one `textAt` per run of characters in one tone, one layer per (row, tone) bounded to its row; a run of one
    // background is one rect. (Equal background cells join across layers and rows: the key is tone, group and level.)
    const text = new Map<Tone, Field[]>(), bg = new Map<Tone, Field[]>()
    for (let c = 0; c < Math.min(o.cols, row.length);) {
      const cell = row[c]
      if (!cell || !('ch' in cell)) { c++; continue }
      let e = c + 1, str = cell.ch
      while (e < Math.min(o.cols, row.length)) { const n = row[e]; if (!n || !('ch' in n) || n.fg !== cell.fg || n.bg !== cell.bg) break; str += n.ch; e++ }
      if (cell.bg) push(bg, cell.bg, rectCells(grid, ox + c * cw, y0, (e - c) * cw, ch, .5))
      // the font advances 6 cells: a wider cell spaces the glyphs one by one
      if (str.trim()) {
        if (cw === 6) push(text, cell.fg, textAt(grid, str, ox + c * cw, y0 + ty))
        else for (let i = 0; i < str.length; i++) if (str[i] !== ' ') push(text, cell.fg, textAt(grid, str[i], ox + (c + i) * cw, y0 + ty))
      }
      c = e
    }
    for (const [tone, fs] of bg) out.push({ field: combine(...fs), tone, join: { group: G_TEXT_BG } })
    for (const [tone, fs] of text) out.push({ field: combine(...fs), tone })
    for (let c = 0; c < Math.min(o.cols, row.length); c++) {
      const cell = row[c]
      if (!cell || 'ch' in cell) continue
      const sep = cell.sep ?? o.mode === 'separated'
      for (let i = 0; i < 6; i++) {
        const j = (r * 3 + (i >> 1)) * W + c * 2 + (i & 1)
        if (cell.bg) plane(cell.bg, 'bg')[j] = 1
        if (cell.sextant >> i & 1) plane(cell.fg, sep ? 'sep' : 'fg')[j] = 1
      }
    }
  }
  // mosaics: backgrounds first, so a lit sub-cell of the same value would win the tie
  const kinds = [...planes.values()].sort((a, b) => (a.kind === 'bg' ? 0 : 1) - (b.kind === 'bg' ? 0 : 1))
  for (const { tone, kind, data } of kinds) {
    const v = kind === 'bg' ? .5 : 1
    const field: Field = (u, w) => { const c = Math.round(u * SX), r = Math.round(w * SY); return c < 0 || r < 0 || c >= W || r >= H || !data[r * W + c] ? 0 : v }
    field.bounds = [0, 0, W - 1, H - 1]
    out.push({ field, lattice: k[0] === k[1] ? k[0] : k, origin: [ox, oy], tone, ...(kind === 'sep' ? {} : { join: { group: kind === 'bg' ? G_BG : G_FG } }) })
  }
  return out
}
const push = <K, V>(m: Map<K, V[]>, k: K, v: V) => { const a = m.get(k); if (a) a.push(v); else m.set(k, [v]) }

/** A 2 × 3 bitmap (rows of booleans, row-major) → its 6-bit sextant. */
export const sextantOf = (cells: readonly (readonly boolean[])[]): number => {
  let b = 0
  for (let i = 0; i < 6; i++) if (cells[i >> 1]?.[i & 1]) b |= 1 << i
  return b
}
/**
 * U+1FB00…1FB3B (Symbols for Legacy Computing) ↔ 6-bit sextant, for describe() / text export. Bit i is sub-cell i + 1
 * of the Unicode names; the four patterns Unicode already had are a space, ▌ (left column), ▐ (right column) and █.
 */
export function sextantChar(bits: number): string {
  const b = bits & 63
  if (b === 0) return ' '
  if (b === 21) return '▌'
  if (b === 42) return '▐'
  if (b === 63) return '█'
  return String.fromCodePoint(0x1FB00 + b - 1 - (b > 21 ? 1 : 0) - (b > 42 ? 1 : 0))
}
/** The sextant of a character from `sextantChar`, or -1. */
export function sextantBits(ch: string): number {
  if (ch === ' ') return 0
  if (ch === '▌') return 21
  if (ch === '▐') return 42
  if (ch === '█') return 63
  const i = (ch.codePointAt(0) ?? 0) - 0x1FB00
  if (i < 0 || i > 0x3B) return -1
  const b = i + 1
  return b >= 21 ? (b + 1 >= 42 ? b + 2 : b + 1) : b
}
