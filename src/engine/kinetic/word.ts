/**
 * Kinetic type, part 1: the word (#129). One word drives every card of the kinetic board: uppercase, at most
 * `WORD_MAX` characters, each one of `DRUM`, the split-flap drum (blank first, like a Solari module, then
 * letters, digits and four marks), all of them glyphs of the 5 × 7 font. The word is set in 5 × 7 font pixels
 * (advance 6) and every effect moves those pixels on whole lattice cells, so the lettering stays on the grid.
 *
 * Twelve flap modules hold the word, centred; a module's value is its index in the drum (0 = blank), which is
 * how the word travels in card data (`ctx.data` holds numbers only): `wordData` / `wordOf`.
 * Pure, framework-free and deterministic.
 */
import { bitmapFont, glyph } from '../fields/bitmapFont'
import type { Tone } from '../types'

export const WORD_MAX = 12
export const DEFAULT_WORD = 'KINETIC'
/** Split-flap drum order; also the characters a word may hold. */
export const DRUM = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?-.'
/** Letters and digits: what a scrambling letter cycles through. */
export const SCRAMBLE_POOL = DRUM.slice(1, 37)
/** Font pixel box of one glyph and the advance between glyphs. */
export const GW = 5, GH = 7, ADV = 6

/**
 * A word from free text, or null: upper-cased, runs of white space folded to one space, trimmed. A character
 * outside the drum (or the font) rejects the whole word; more than `WORD_MAX` characters are cut to `WORD_MAX`.
 */
export function parseWord(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const s = raw.toUpperCase().replace(/\s+/g, ' ').trim()
  if (!s) return null
  for (const ch of s) if (!DRUM.includes(ch) || !bitmapFont[ch]) return null
  return s.slice(0, WORD_MAX).trimEnd()
}
/** The word of a `?word=` query string (`location.search`), else the default. */
export const wordParam = (search: string): string => parseWord(new URLSearchParams(search).get('word')) ?? DEFAULT_WORD

/** Width of a word in font pixels (glyphs and gaps, no trailing gap). */
export const wordWidth = (word: string) => (word.length ? word.length * ADV - 1 : 0)

/** One lit font pixel of a set word: column `x` across the whole word, row `y` (0 = cap line), letter `i`. */
export interface Px { x: number; y: number; i: number }
const pixelCache = new Map<string, readonly Px[]>()
/** The lit pixels of `word`, in letter order, then row, then column. Cached (a few words a session). */
export function wordPixels(word: string): readonly Px[] {
  let px = pixelCache.get(word)
  if (px) return px
  const out: Px[] = []
  for (let i = 0; i < word.length; i++) {
    const g = glyph(word[i])
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (g[y][x]) out.push({ x: i * ADV + x, y, i })
  }
  if (pixelCache.size > 32) pixelCache.clear()
  pixelCache.set(word, (px = out))
  return px
}
/** The 5 × 7 bits of one character (`[row][col]`). */
export const bitsOf = (ch: string): boolean[][] => glyph(ch)

// ── the twelve modules ─────────────────────────────────────────────────────
export const SLOTS = WORD_MAX
export const slotKey = (s: number) => `w${s}`
/** Drum index of each module for `word`, centred (the extra blank goes right). */
export function toSlots(word: string): number[] {
  const start = Math.floor((SLOTS - word.length) / 2)
  return Array.from({ length: SLOTS }, (_, s) => Math.max(0, DRUM.indexOf(word[s - start] ?? ' ')))
}
/** The module characters as a 12-character string (blanks kept). */
export const slotText = (slots: readonly number[]): string => slots.map(v => DRUM[drumIndex(v)]).join('')
/** A drum index from any number (rounded, wrapped into the drum). */
export const drumIndex = (v: number): number => { const n = DRUM.length, i = Math.round(Number.isFinite(v) ? v : 0); return ((i % n) + n) % n }
/** The word the modules spell (inner blanks kept, outer ones trimmed); '' when every module is blank. */
export const fromSlots = (slots: readonly number[]): string => parseWord(slotText(slots)) ?? ''
/** Card data for a word: one drum index per module (`w0` … `w11`). */
export function wordData(word: string): Record<string, number> {
  const out: Record<string, number> = {}
  toSlots(word).forEach((v, s) => { out[slotKey(s)] = v })
  return out
}
/** The modules in card data (missing keys are blank). */
export const slotsOf = (data: Record<string, number | undefined>): number[] => Array.from({ length: SLOTS }, (_, s) => drumIndex(data[slotKey(s)] ?? 0))
/** The word in card data; an all-blank board shows the default word. */
export const wordOf = (data: Record<string, number | undefined>): string => fromSlots(slotsOf(data)) || DEFAULT_WORD

// ── shared frame shape and timing helpers ─────────────────────────────────
/** One lit lattice cell of a frame, in word coordinates (font pixels; the cap line is y = 0). */
export interface Cell { x: number; y: number; tone: Tone; v: number }
/** A frame: `cells` are the word's own pixels (and their trails), `marks` everything else (a caret, the magnet). */
export interface Frame { cells: Cell[]; marks: Cell[] }
/** t folded into [0, period). */
export const loopT = (t: number, period: number) => { const x = t % period; return x < 0 ? x + period : x }
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const smooth = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
/** The settled word: every pixel at full value in `tone`. */
export const settled = (word: string, tone: Tone = 'value'): Frame => ({ cells: wordPixels(word).map(p => ({ x: p.x, y: p.y, tone, v: 1 })), marks: [] })
