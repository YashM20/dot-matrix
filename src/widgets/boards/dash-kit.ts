/**
 * Drawing pieces shared by the dash cards: the components board's interaction grammar (hover glow, press,
 * marching focus) reused as is, plus dial geometry, needles and the chunky arrow sprites the signal and nav
 * cards put on a coarse lattice.
 */
import type { Layer, Tone } from '../../engine/types'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { DASH_DEFAULTS } from './dash-drive'

export { PRESS, at, circle, dimmed, glow, marching, rr, states, ui } from './components'
export const T = layoutFor(TILE)
export type Pt = [number, number]
/** Knobs and status dots are true circles, like the components board. */
export const style = { ...tileStyle, cornerRoundness: 0 }
export const BODY = { lattice: 1.3 }
/** Fine outline sites (the components board's stadium outlines). */
export const LINE = { spacing: 3.3, size: 1.5 }

/** What every dash card shares: TILE grid, dot label, the drive loop's keys and its hand-over. */
export const card = (id: string, name: string, extra: Partial<WidgetPreset> & Pick<WidgetPreset, 'layers'>): WidgetPreset => ({
  id, name, group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
  handover: 'drive', ...extra, defaults: { ...DASH_DEFAULTS, ...extra.defaults },
})

export const mod = (x: number, m: number) => ((x % m) + m) % m
/** A point at clock angle `a` (clockwise from 12) on a circle. */
export const polar = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)]

/** A dial: centre, radius and its arc (start clockwise from 12, sweep), both in radians. */
export interface Dial { cx: number; cy: number; r: number; start: number; sweep: number }
export const angleOf = (d: Dial, f: number) => d.start + Math.max(0, Math.min(1, f)) * d.sweep
/** A knob control's `map`: the pointer's angle on the dial → value, so a tap on the scale jumps there. */
export const dialMap = (d: Dial) => (x: number, y: number, v: number): number => {
  const dx = x - d.cx, dy = y - d.cy
  if (Math.hypot(dx, dy) < 8) return v
  const rel = mod(Math.atan2(dx, -dy) - d.start, TAU)
  return rel <= d.sweep ? rel / d.sweep : rel - d.sweep < TAU - rel ? 1 : 0
}
/** The dial's dotted track, and the stretch from fraction `f0` to `f1` lit on the same sites. */
export function dialArc(d: Dial, f0: number, f1: number, tone: Tone = 'value'): Layer[] {
  const lo = Math.min(f0, f1), hi = Math.max(f0, f1), ring = { spacing: LINE.spacing, size: LINE.size }
  return [
    layer(T.dotRing(d.cx, d.cy, d.r, { ...ring, start: d.start, sweep: d.sweep }), 'mid'),
    ...(hi - lo > 1e-3 ? [layer(T.dotRing(d.cx, d.cy, d.r, { ...ring, start: angleOf(d, lo), sweep: (hi - lo) * d.sweep, size: 2.2 }), tone)] : []),
  ]
}
/** Tick sites just inside the track at fractions `fs`. */
export const dialTicks = (d: Dial, fs: number[], size = 2.4): LatticeField => T.dots(fs.map(f => polar(d.cx, d.cy, d.r - 6, angleOf(d, f))), size)
/** Scale numbers inside the ticks, 5×7 type centred on their angle. */
export const dialLabels = (d: Dial, marks: [number, string][], inset = 15): Layer[] => marks.map(([f, s]) => {
  const [x, y] = polar(d.cx, d.cy, d.r - inset, angleOf(d, f))
  return layer(T.text(s, Math.round(x), Math.round(y - 3), { align: 'center' }), 'idle')
})
/** The needle: a short run of big sites across the track at fraction `f`. */
export const needle = (d: Dial, f: number, v = 1): LatticeField => {
  const a = angleOf(d, f), pts = [-13, -9, -5, -1, 3].map(k => polar(d.cx, d.cy, d.r + k, a))
  return { field: () => v, sites: pts, size: 2.6 }
}

/** Hero number on a 2× smooth lattice, centred (10×14 glyphs → 20×28 cells). */
export const hero = (s: string, cx: number, top: number, lattice = 2) => T.big(s, cx, top, { lattice, smooth: true, align: 'center' })

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
