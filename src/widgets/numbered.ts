/**
 * Card numbers (#383): a card marked `numbered: true` shows its place among the numbered cards on its board,
 * from 01, in board order. Nobody types the number: each board module exports `numberBoard([...])`, so a
 * removed card closes the gap on its own (`scripts/verify/numbers.ts` checks every board).
 *
 * The number is written onto the preset once, when its board module loads: `number` for cards that draw it
 * themselves (CINEMA's posters) and the final `label` for the chrome row. Every consumer (the board, the
 * card page, exports, OG images, `describe()`) reads the same preset, so all of them show the same number.
 */
import type { WidgetPreset } from './types'

/** The label as authored, before its number went in front (so numbering twice can't stack numbers). */
const authored = new WeakMap<WidgetPreset, string | undefined>()

export const pad2 = (n: number) => String(n).padStart(2, '0')

/**
 * Numbers the board's `numbered` cards 01..N in order and returns the same array. The number joins an authored
 * `label` with two spaces; a label taken from the card's `name` keeps one (`02 MUSIC`), as the names wrote it.
 * A card whose label is '' gets only `number` (it draws its number itself).
 */
export function numberBoard<T extends WidgetPreset>(items: T[]): T[] {
  let n = 0
  for (const p of items) {
    if (!p.numbered) continue
    if (!authored.has(p)) authored.set(p, p.label)
    const own = authored.get(p), base = own ?? p.name
    p.number = ++n
    p.label = base ? `${pad2(n)}${own === undefined ? ' ' : '  '}${base}` : base
  }
  return items
}
