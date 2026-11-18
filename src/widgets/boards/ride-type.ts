/**
 * RIDE board type (#258): bitmaps drawn one pixel per lattice dot, so rows and columns share one pitch.
 * - Poster caps (`THU 20`, `SHIP THE IDEA`): the condensed hero face's digits (`fields/heroFaces`) plus the capitals
 *   these cards need, drawn the same way: 14 dots tall, two-dot strokes, flat sides, 45° corners three dots a row.
 * - Tall body text: the 5×7 font with rows 1 and 5 doubled (stems, not bars), 5×9 on one lattice. It replaces a
 *   `[1, 9/7]` glyph scale, whose rows sat further apart than its columns.
 */
import { glyph } from '../../engine/fields/bitmapFont'
import { HERO_H, heroCovers, heroRows } from '../../engine/fields/heroFaces'
import { TILE, layoutFor, type LatticeField } from '../types'

const T = layoutFor(TILE)
const rows = (s: string) => s.trim().split(/\s+/)
/** Dots between glyphs, as in the hero faces. */
const GAP = 2

const CAPS: Record<string, string[]> = {
  A: rows('.######. ######## ##....## ##....## ##....## ##....## ######## ######## ##....## ##....## ##....## ##....## ##....## ##....##'),
  D: rows('######.. #######. ##...### ##....## ##....## ##....## ##....## ##....## ##....## ##....## ##....## ##...### #######. ######..'),
  E: rows('######## ######## ##...... ##...... ##...... ##...... ######.. ######.. ##...... ##...... ##...... ##...... ######## ########'),
  H: rows('##....## ##....## ##....## ##....## ##....## ##....## ######## ######## ##....## ##....## ##....## ##....## ##....## ##....##'),
  I: rows('###### ###### ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ..##.. ###### ######'),
  P: rows('#######. ######## ##....## ##....## ##....## ##....## ######## #######. ##...... ##...... ##...... ##...... ##...... ##......'),
  S: rows('.######. ######## ##....## ##...... ##...... ##...... #######. .####### ......## ......## ......## ##....## ######## .######.'),
  T: rows('######## ######## ...##... ...##... ...##... ...##... ...##... ...##... ...##... ...##... ...##... ...##... ...##... ...##...'),
  U: rows('##....## ##....## ##....## ##....## ##....## ##....## ##....## ##....## ##....## ##....## ##....## ##....## ######## .######.'),
}
/** Characters the poster face draws: its capitals, and the condensed hero face's digits and space. */
export const posterCovers = (s: string) => [...s].every(ch => ch in CAPS || heroCovers('condensed', ch))
/** `s` in the poster face: `HERO_H` rows of `#` and `.`, glyphs two dots apart. */
export function posterRows(s: string): string[] {
  const glyphs = [...s].map(ch => CAPS[ch] ?? heroRows('condensed', ch))
  return Array.from({ length: HERO_H }, (_, y) => glyphs.map(g => g[y]).join('.'.repeat(GAP)))
}

/** 5×7 rows each 5×9 row comes from: rows 1 and 5 drawn twice. */
const TALL_ROWS = [0, 1, 1, 2, 3, 4, 5, 5, 6]
/** `s` in the 5×7 font, 9 rows tall, glyphs one dot apart. */
export function tallRows(s: string): string[] {
  const glyphs = [...s].map(ch => glyph(ch))
  return TALL_ROWS.map(y => glyphs.map(g => g[y].map(on => (on ? '#' : '.')).join('')).join('.'))
}

/** A bitmap on a `k`-cell lattice at (col,row) (`align` moves the anchor), read as `text` by `describe()`. */
function bitmapAt(bits: string[], text: string, k: number, col: number, row: number, align: 'left' | 'center' = 'left'): LatticeField {
  const left = align === 'center' ? col - (bits[0].length * k) / 2 : col
  const G = T.lattice(k, left, row), field = G.sprite(bits, 0, 0)
  field.text = text
  return G.at(field)
}
/** Poster caps on a `k` lattice (14 dots tall). */
export const poster = (s: string, k: number, col: number, row: number, said = s) => bitmapAt(posterRows(s), said, k, col, row)
/** Tall body text on a `k` lattice (9 dots tall, as wide as the 5×7 text). */
export const tall = (s: string, k: number, col: number, row: number, align: 'left' | 'center' = 'left') =>
  bitmapAt(tallRows(s), s, k, col, row, align)
