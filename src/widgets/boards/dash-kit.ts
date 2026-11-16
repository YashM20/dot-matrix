/**
 * Drawing pieces shared by the dash cards: the components board's interaction grammar (hover glow, press,
 * marching focus) reused as is, the dial geometry and needles (`src/widgets/dials.ts`), and the chunky arrow sprites
 * the signal and nav cards put on a coarse lattice.
 */
import { TILE, layoutFor, tileCircleStyle, type LatticeField, type WidgetPreset } from '../types'
import { DASH_DEFAULTS } from './dash-drive'

export { PRESS, at, circle, dimmed, glow, marching, rr, states, ui } from './components-kit'
export { angleOf, dialArc, dialLabels, dialMap, dialTicks, needle, polar, type Dial } from '../dials'
export const T = layoutFor(TILE)
export type Pt = [number, number]
/** Knobs and status dots are true circles, like the components board. */
export const style = tileCircleStyle
export const BODY = { lattice: 1.3 }
/** Fine outline sites (the components board's stadium outlines). */
export const LINE = { spacing: 3.3, size: 1.5 }

/** What every dash card shares: TILE grid, dot label, the drive loop's keys and its hand-over. */
export const card = (id: string, name: string, extra: Partial<WidgetPreset> & Pick<WidgetPreset, 'layers'>): WidgetPreset => ({
  id, name, group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
  handover: 'drive', ...extra, defaults: { ...DASH_DEFAULTS, ...extra.defaults },
})

export const mod = (x: number, m: number) => ((x % m) + m) % m
/** The hero face on `lattice`: smooth `fine` numerals (8×14 digits, 2 dots apart). */
export const heroOpts = (lattice = 2) => ({ lattice, smooth: true, face: 'fine' as const })
/** Hero number on a 2× smooth lattice, centred (8×14 digits → 16×28 cells). */
export const hero = (s: string, cx: number, top: number, lattice = 2) => T.big(s, cx, top, { ...heroOpts(lattice), align: 'center' })

// ── sprites ─────────────────────────────────────────────────────────────────
/** A sprite on its own coarse lattice, top-left at card cell (col,row). */
export const spriteAt = (rows: string[], col: number, row: number, k: number): LatticeField => T.lattice(k, col, row).at(T.lattice(k, col, row).sprite(rows, 0, 0))
export const mirror = (rows: string[]) => rows.map(r => [...r].reverse().join(''))
export const spriteW = (rows: string[]) => Math.max(...rows.map(r => r.length))
/** The indicator arrow, pointing left (11 × 7). */
export const SIGNAL_ARROW = [
  '...#.......',
  '..##.......',
  '.##########',
  '###########',
  '.##########',
  '..##.......',
  '...#.......',
]
/** The indicator arrow at small size (7 × 5), for a coarser lattice than the full one. */
export const SMALL_ARROW = ['..#....', '.######', '#######', '.######', '..#....']
/** Nav manoeuvres (10 × 10): turn left (mirror for right), straight on, arrive. */
export const TURN_LEFT = [
  '...#......',
  '..##......',
  '.########.',
  '#########.',
  '.########.',
  '..##..###.',
  '...#..###.',
  '......###.',
  '......###.',
  '......###.',
]
export const STRAIGHT = [
  '....##....',
  '...####...',
  '..######..',
  '.########.',
  '....##....',
  '....##....',
  '....##....',
  '....##....',
  '....##....',
  '....##....',
]
export const ARRIVE = [
  '...####...',
  '..######..',
  '.###..###.',
  '.##....##.',
  '.###..###.',
  '..######..',
  '...####...',
  '....##....',
  '....##....',
  '..######..',
]
