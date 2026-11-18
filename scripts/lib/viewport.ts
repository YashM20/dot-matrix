/**
 * Which cards of a board a visitor's viewport keeps live (#416): the model behind `pnpm bench`'s viewport mode, checked
 * against the real layout by the `viewport-frames` probe (scripts/site/viewport-frames.ts).
 *
 * DotCanvas runs an animated card only while its canvas is within `LIVE_MARGIN` px of the viewport (IntersectionObserver,
 * `rootMargin: 64px`), and the master clock stops while the tab is hidden. So at any scroll position the live cards are
 * the rows the live band (the viewport plus 64 px above and below) touches. The board grid (src/site/app/grid.css, at
 * the default CARD SIZE, LARGE) fits as many columns as hold `--card-min` for the board's density, up to 3 (4 on a dense
 * board), and every card is square, capped at `--card-max = min(62svh, 520px)`. Each slot is the card plus its row
 * (src/components/CardRow.tsx), `rowExtra` px taller than the card, read from the site by the probe.
 *
 * The busiest scroll position is the one whose band touches the most rows: `rows` consecutive rows, in board order. A
 * run starts on a row, so a board's viewport windows are its runs of `rows` rows (`viewportWindows`).
 */
import type { BoardDensity } from '../../src/widgets/manifest'

export interface Viewport {
  id: string
  w: number
  h: number
  /** Classic scrollbar width (Windows desktop); 0 for an overlay scrollbar (phones). */
  scrollbar: number
  /** Device pixel ratio the probe emulates: a 1280 laptop at 1, a phone at 3. */
  dpr: number
  /** Touch and a mobile viewport (the probe emulates both; cards with their own fps drop a tier). */
  phone: boolean
  /** Slot height minus card height: the card row under each card (its height changes with touch targets). */
  rowExtra: number
}

/** The two viewports #416 reads: a 1280 × 800 laptop and a 390 × 844 phone. */
export const VIEWPORTS: readonly Viewport[] = [
  { id: '1280', w: 1280, h: 800, scrollbar: 15, dpr: 1, phone: false, rowExtra: 20 },
  { id: '390', w: 390, h: 844, scrollbar: 0, dpr: 3, phone: true, rowExtra: 28 },
]
/** DotCanvas's IntersectionObserver root margin (src/components/DotCanvas.tsx `useOnScreen`). */
export const LIVE_MARGIN = 64
const GAP = 16
const CARD_MIN: Record<BoardDensity, number> = { hero: 340, standard: 240, dense: 200 }
/** LARGE: at most 3 columns, one more on a dense board (src/tokens.css `--board-cols-max`). */
const COLS_MAX: Record<BoardDensity, number> = { hero: 3, standard: 3, dense: 4 }

export interface BoardGrid { cols: number; card: number; slot: number; pitch: number; rows: number }

/** The board grid at viewport `v`: columns, card and slot height, row pitch, and the most rows the live band touches. */
export function boardGrid(density: BoardDensity, v: Viewport): BoardGrid {
  // frame pad clamp(16px, 3vw, 40px) a side, then the scrollbar
  const pad = Math.min(40, Math.max(16, v.w * .03)), width = v.w - 2 * pad - v.scrollbar
  let cols = 1
  for (let n = COLS_MAX[density]; n > 1; n--) if (n * CARD_MIN[density] + (n - 1) * GAP <= width) { cols = n; break }
  const card = Math.min((width - (cols - 1) * GAP) / cols, Math.min(.62 * v.h, 520)), slot = card + v.rowExtra, pitch = slot + GAP
  return { cols, card, slot, pitch, rows: bandRows(v.h + 2 * LIVE_MARGIN, slot, pitch) }
}

/**
 * The most rows a band `band` px tall can touch, rows `slot` px tall on a `pitch`: row k covers [k·pitch, k·pitch + slot),
 * so a band at y touches the k with y − slot < k·pitch < y + band, an open interval `band + slot` long.
 */
export const bandRows = (band: number, slot: number, pitch: number) => Math.floor((band + slot - 1e-6) / pitch) + 1

/** A board of `n` cards on `cols` columns: the card indices of each run of `rows` consecutive rows (one run for a short board). */
export function viewportWindows(n: number, cols: number, rows: number): number[][] {
  const total = Math.ceil(n / cols), out: number[][] = []
  for (let r = 0; r <= Math.max(0, total - rows); r++) {
    const w: number[] = []
    for (let i = r * cols; i < Math.min(n, (r + rows) * cols); i++) w.push(i)
    out.push(w)
  }
  return out
}
