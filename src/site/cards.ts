/**
 * CARD SIZE (DESIGN.md › Board grid): how many cards a board puts in a row. A display preference like the theme:
 * `html[data-cards]` scales the grid in CSS (`--board-cols-max` / `--board-cols-min`, src/tokens.css), so a change
 * re-renders nothing. LARGE (`l`, the default) is 3 a row at 1440, MEDIUM (`m`) 4, COMPACT (`s`) 5 (and 2 on a phone).
 * Persisted in localStorage `dot480:cards`; the theme boot script (`src/site/theme/boot.ts`) sets the attribute
 * from it before first paint, so a reload never reflows. Lazy: only the controls and the palette import this.
 */
export const CARD_SIZES = ['l', 'm', 's'] as const
export type CardSize = typeof CARD_SIZES[number]
export const CARD_SIZE_LABELS: Record<CardSize, string> = { l: 'LARGE', m: 'MEDIUM', s: 'COMPACT' }
/** What each size looks like, in a few words (the control's line, the palette): the most a row holds on a wide screen. */
export const CARD_SIZE_LINES: Record<CardSize, string> = { l: 'up to 3 a row', m: 'up to 4 a row', s: 'up to 5 a row, 2 on a phone' }

const KEY = 'dot480:cards'
const isSize = (v: unknown): v is CardSize => v === 'l' || v === 'm' || v === 's'
const listeners = new Set<() => void>()

/** The size in use: what the boot script (or the last pick) put on `<html>`. */
export const cardSize = (): CardSize => { const v = document.documentElement.dataset.cards; return isSize(v) ? v : 'l' }
export function subscribeCardSize(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }
export function setCardSize(size: CardSize): void {
  if (!isSize(size)) return
  document.documentElement.dataset.cards = size
  try { localStorage.setItem(KEY, size) } catch { /* storage blocked: this visit only */ }
  for (const l of listeners) l()
}
