/**
 * Text in card data. `ctx.data` is numbers only (springs, JSON change keys), so a live string
 * (a city, a track title, a contribution grid) travels as a stable numeric id: `textId(s)` stores
 * the string in a module table under its FNV-1a hash and returns the hash; a card reads it back
 * with `textOf(data.key)`. Same string, same id on every machine, so fixtures and goldens stay
 * deterministic, and a changed string is a changed number, which the card's change dissolve picks up.
 */
import { bitmapFont } from '../engine/fields/bitmapFont'

const table = new Map<number, string>()

/** FNV-1a 32 over UTF-16 code units. */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}

/** Upper-case, accents folded, only glyphs the 5×7 font has, single spaces (what a card can draw). */
export function sanitize(s: string): string {
  let out = ''
  for (const ch of s.normalize('NFD').toUpperCase()) out += bitmapFont[ch] ? ch : /\s/.test(ch) ? ' ' : ''
  return out.replace(/ +/g, ' ').trim()
}

/** Numeric id of `s` (sanitized unless `raw`), registered so `textOf` can read it back. 0 = empty. */
export function textId(s: string, raw = false): number {
  const clean = raw ? s : sanitize(s)
  if (!clean) return 0
  const id = fnv1a(clean) || 1
  table.set(id, clean)
  return id
}

/** The string behind a `textId`, or `fallback` for 0 / unknown ids. */
export const textOf = (id: number | undefined, fallback = ''): string => (id ? table.get(id) ?? fallback : fallback)

/** Fit `s` into `max` glyphs, ending in an ellipsis when cut. */
export const fit = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`)
