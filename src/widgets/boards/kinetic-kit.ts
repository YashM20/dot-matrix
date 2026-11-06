/**
 * Kinetic board kit (#129): the shared word, the stage a card sets it on, and the paint pass from an effect
 * frame (src/engine/kinetic) to lattice layers.
 *
 * The word lives in board-shared data as twelve drum indices (`w0` … `w11`, src/engine/kinetic/word.ts), so the
 * split-flap card's modules edit it for every card at once. It starts from `?word=` (checked against the font,
 * else KINETIC) and the flap card writes it back to `?word=` and to the cards' defaults, so a link, a reload or
 * a return to the board shows the same word. Node (goldens, checks) never sees a URL: always the default word.
 *
 * Every card sets the word on one lattice: `lattice` card cells per font pixel, the largest of 2 to 5 that fits
 * the word across the card. Behind it, a faint screen of unlit dots on the same lattice, so a pixel in motion is
 * always one dot of a visible grid.
 */
import type { Field, Layer, Tone } from '../../engine/types'
import { DEFAULT_WORD, GH, SLOTS, fromSlots, slotKey, slotsOf, wordData, wordParam, wordWidth, type Cell, type Frame } from '../../engine/kinetic/word'
import { TILE, layer, layoutFor, tileStyle, type WidgetContext } from '../types'
import { replaceUrl } from '../../site/safe-url'

const T = layoutFor(TILE)
type Pt = [number, number]
export const tile = { group: 'text', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const

// ── the shared word ─────────────────────────────────────────────────────────
const browser = () => typeof window !== 'undefined' && typeof location !== 'undefined' && typeof history !== 'undefined'
const first = browser() ? wordParam(location.search) : DEFAULT_WORD
/**
 * Every card's defaults, one object: the modules of the word (and the magnet's resting spot). The board store
 * seeds from it on mount, so `keepWord` updating it in place is what a remount comes back to.
 */
export const WORD: Record<string, number> = { ...wordData(first), mag: .5, magY: .5 }
/** The board-shared keys: the twelve modules. */
export const WORD_KEYS = Array.from({ length: SLOTS }, (_, s) => slotKey(s))
let written = first
/** Keep the word the board shows: into the defaults, and into `?word=` (dropped for the default word). Browser only. */
export function keepWord(data: Record<string, number>): void {
  if (!browser()) return
  const slots = slotsOf(data)
  slots.forEach((v, s) => { WORD[slotKey(s)] = v })
  const word = fromSlots(slots) || DEFAULT_WORD
  if (word === written) return
  written = word
  try {
    const url = new URL(location.href)
    if (word === DEFAULT_WORD) url.searchParams.delete('word'); else url.searchParams.set('word', word)
    replaceUrl(url)
  } catch { /* no history API (a sandboxed frame): the word still works, it just isn't in the link */ }
}
/** The loop time a card draws: 0 (the settled word) under reduced motion. */
export const loopTime = (ctx: WidgetContext) => (ctx.reducedMotion ? 0 : ctx.t)

// ── the stage ───────────────────────────────────────────────────────────────
/** The card rows of the screen (between the label and the footer). */
export const SCREEN = { top: 12, bottom: 126, middle: 69 }
/** A word on one lattice: `k` cells per pixel, lattice `origin` (card cells), lattice size, the word's top-left lattice cell. */
export interface Stage { k: number; origin: Pt; cols: number; rows: number; c0: number; r0: number }
/** The largest lattice (2 to 5) that sets `width` font pixels across the card with a little margin. */
export const latticeFor = (width: number) => Math.max(2, Math.min(5, Math.floor(138 / Math.max(1, width))))
/** A word `width` pixels wide on lattice `k`, centred across the card, cap line at card row `capRow`. */
export function stage(width: number, k: number, capRow: number): Stage {
  const left = Math.floor((TILE.cols - width * k) / 2), ox = ((left % k) + k) % k, oy = ((capRow % k) + k) % k
  return { k, origin: [ox, oy], cols: Math.floor((TILE.cols - ox) / k), rows: Math.floor((TILE.rows - oy) / k), c0: (left - ox) / k, r0: (capRow - oy) / k }
}
/** The word's stage on a card: its own lattice, centred across, the cap line where `capRow(k)` puts it. */
export const wordStage = (word: string, capRow: (k: number) => number): Stage => { const w = wordWidth(word), k = latticeFor(w); return stage(w, k, capRow(k)) }
/** Cap line that centres the word's 7 rows on the screen. */
export const centred = (k: number) => Math.round(SCREEN.middle - (GH * k) / 2)
/** Letters of the word, spaces not counted. */
export const letters = (word: string) => [...word].filter(ch => ch !== ' ').length
/** Lattice rows inside the screen. */
const screenRows = (st: Stage): [number, number] => [Math.ceil((SCREEN.top - st.origin[1]) / st.k), Math.floor((SCREEN.bottom + 1 - st.origin[1]) / st.k) - 1]

// ── paint ───────────────────────────────────────────────────────────────────
/** Unlit screen dots: faint and small. */
export const PANEL = .25
const ORDER: Tone[] = ['faint', 'mid', 'idle', 'value', 'active']
const panels = new Map<string, Float32Array>()
function panelOf(st: Stage): Float32Array {
  const key = `${st.k}|${st.origin}`
  let p = panels.get(key)
  if (!p) {
    p = new Float32Array(st.cols * st.rows)
    const [r0, r1] = screenRows(st)
    for (let r = r0; r <= r1; r++) p.fill(PANEL, r * st.cols, (r + 1) * st.cols)
    panels.set(key, p)
  }
  return p
}
const tableField = (st: Stage, vals: Float32Array): Field => (u, v) => {
  const c = Math.round(u * (st.cols - 1)), r = Math.round(v * (st.rows - 1))
  return c < 0 || r < 0 || c >= st.cols || r >= st.rows ? 0 : vals[r * st.cols + c]
}
export interface PaintOptions {
  /** Draw the faint screen behind (default true). */
  screen?: boolean
  /** Extra cells under the frame (housings, highlights), word coordinates like the frame. */
  under?: Cell[]
}
/**
 * Lattice layers for a frame: one layer per tone on the stage's lattice, the screen first and the accent last
 * (the sampler keeps the brightest cell, and the later layer on a tie). Cells off the screen rows are dropped.
 */
export function paint(st: Stage, f: Frame, o: PaintOptions = {}): Layer[] {
  const n = st.cols * st.rows, [top, bottom] = screenRows(st), tables = new Map<Tone, Float32Array>()
  const put = (c: Cell) => {
    const col = st.c0 + c.x, row = st.r0 + c.y
    if (col < 0 || col >= st.cols || row < top || row > bottom) return
    let tb = tables.get(c.tone)
    if (!tb) tables.set(c.tone, (tb = new Float32Array(n)))
    const i = row * st.cols + col
    if (c.v > tb[i]) tb[i] = c.v
  }
  for (const c of o.under ?? []) put(c)
  for (const c of f.cells) put(c)
  for (const c of f.marks) put(c)
  const at = { lattice: st.k, origin: st.origin }
  const out: Layer[] = o.screen === false ? [] : [{ field: tableField(st, panelOf(st)), ...at, tone: 'faint' }]
  for (const tone of ORDER) { const tb = tables.get(tone); if (tb) out.push({ field: tableField(st, tb), ...at, tone }) }
  return out
}

// ── footer ──────────────────────────────────────────────────────────────────
const RAIL = 132, FOOT = 137
/** A dotted rail through the loop (done in mid), a state on the left and a count on the right. */
export function footer(k: number, left: string, right: string): Layer[] {
  const done: Pt[] = [], rest: Pt[] = [], end = (TILE.cols - 1) * Math.max(0, Math.min(1, k))
  for (let c = 0; c < TILE.cols; c += 3) (c <= end ? done : rest).push([c, RAIL])
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    layer(T.text(left, 0, FOOT), 'idle'),
    layer(T.text(right, TILE.cols - 1, FOOT, { align: 'right' }), 'mid'),
  ]
}
export { T }
