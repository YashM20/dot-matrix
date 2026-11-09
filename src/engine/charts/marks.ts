/**
 * Chart marks (#132): what a chart is made of before it becomes layers. A chart is dot sites in tones (marks),
 * 5×7 or lattice text (labels), the cell of every data point (anchors, for the readout) and the picked point.
 * Geometry only: `paint.ts` turns it into `Layer[]`. Sizes are relative to a card dot, like `Layer.size`.
 */
import type { Tone } from '../types'
import { textSize } from '../layout'
import type { Scale } from './scale'

export type Pt = [number, number]
export interface Mark { sites: Pt[]; size: number; tone: Tone; /** Field value of every site (default 1); the sampler quantizes it to a size step. */ value?: number }
export interface Label {
  text: string; col: number; row: number; tone: Tone
  align?: 'left' | 'center' | 'right'
  /** Card cells per font pixel (default 1: card dots). */
  lattice?: number
  /** 10×14 Scale2x glyphs (the hero weight). */
  smooth?: boolean
}
export interface Chart { marks: Mark[]; labels: Label[]; /** Cell of each data point, in data order. */ anchors: Pt[]; /** Picked data index, -1 for none. */ pick: number }
/** The plot rectangle in card cells: data runs x0 → x1, values base (bottom) → top. */
export interface Plot { x0: number; x1: number; top: number; base: number }

export const emptyChart = (): Chart => ({ marks: [], labels: [], anchors: [], pick: -1 })
/** Gridlines and their numbers. */
export const AXIS = { spacing: 3, size: 1, tone: 'faint' as Tone, label: 'mid' as Tone }

/** Sites evenly spaced along a polyline, about `spacing` apart, both ends included. */
export function along(pts: readonly Pt[], spacing: number): Pt[] {
  if (pts.length < 2) return pts.map(p => [p[0], p[1]])
  const segs: number[] = []
  let total = 0
  for (let i = 1; i < pts.length; i++) { const l = Math.sqrt((pts[i][0] - pts[i - 1][0]) ** 2 + (pts[i][1] - pts[i - 1][1]) ** 2); segs.push(l); total += l }
  const n = Math.max(1, Math.round(total / spacing)), out: Pt[] = []
  let seg = 0, start = 0
  for (let k = 0; k <= n; k++) {
    const d = k === n ? total : (k * total) / n
    while (seg < segs.length - 1 && d > start + segs[seg]) { start += segs[seg]; seg++ }
    const f = segs[seg] ? Math.min(1, (d - start) / segs[seg]) : 0, [ax, ay] = pts[seg], [bx, by] = pts[seg + 1]
    out.push([ax + (bx - ax) * f, ay + (by - ay) * f])
  }
  return out
}

/** Sites from y0 to y1 on column x, ends included, about `pitch` apart (one site when they meet). */
export function column(x: number, y0: number, y1: number, pitch: number): Pt[] {
  const n = Math.round(Math.abs(y1 - y0) / pitch)
  if (n === 0) return [[x, (y0 + y1) / 2]]
  return Array.from({ length: n + 1 }, (_, k): Pt => [x, k === n ? y1 : y0 + ((y1 - y0) * k) / n])
}

/** A dotted horizontal rule at row y, skipping `gap` cells either side of each x in `avoid` (bars standing on it). */
export function rule(y: number, x0: number, x1: number, spacing: number, avoid: readonly number[] = [], gap = 0): Pt[] {
  const out: Pt[] = []
  for (let k = 0, x = x0; x <= x1 + 1e-9; k++, x = x0 + k * spacing) if (!avoid.some(a => Math.abs(a - x) < gap)) out.push([x, y])
  return out
}

/** Sites within `r` of `p` dropped, so a big readout dot sits in a clear moat instead of on top of small ones. */
export const clear = (pts: Pt[], p: Pt | undefined, r: number): Pt[] => (p ? pts.filter(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 >= r * r) : pts)

/** Horizontal gridlines at the ticks, numbers right-aligned at `col` and centred on each line. */
export function valueAxis(scale: Scale, ticks: readonly number[], plot: Plot, fmt: (v: number) => string, o: { col?: number; avoid?: readonly number[]; gap?: number } = {}): Pick<Chart, 'marks' | 'labels'> {
  const { col = 143, avoid = [], gap = 0 } = o, rows = ticks.map(v => scale.cell(v))
  return {
    marks: [{ sites: rows.flatMap(y => rule(y, plot.x0, plot.x1, AXIS.spacing, avoid, gap)), size: AXIS.size, tone: AXIS.tone }],
    labels: ticks.map((v, i) => ({ text: fmt(v), col, row: rows[i] - 3, tone: AXIS.label, align: 'right' })),
  }
}

/**
 * Category names under the data: every `every`th, plus the picked one in `value` (its close neighbours give way).
 * Each name is centred on its x but kept whole inside cells 0..`cols` − 1 (default: a 144-cell TILE card), so the
 * first and last names shift inward instead of being cut at the card edge.
 */
export function categoryLabels(xs: readonly number[], names: readonly string[], row: number, pick: number, every = 1, cols = 144): Label[] {
  const n = Math.min(xs.length, names.length), w = (s: string) => textSize(s)[0]
  const out: Label[] = []
  for (let i = 0; i < n; i++) {
    if (i !== pick && i % every) continue
    if (i !== pick && pick >= 0 && pick < n && Math.abs(xs[i] - xs[pick]) < (w(names[i]) + w(names[pick])) / 2 + 4) continue
    const half = w(names[i]) / 2, col = Math.min(Math.max(Math.round(xs[i]), Math.ceil(half)), Math.floor(cols - half))
    out.push({ text: names[i], col, row, tone: i === pick ? 'value' : AXIS.label, align: 'center' })
  }
  return out
}

/** Lattice of the readout's hero number: the plain 5×7 glyph at 4 cells per pixel (28 cells tall, one-dot strokes). */
export const HERO = { lattice: 4, h: 28 }
export const heroWidth = (s: string) => textSize(s)[0] * HERO.lattice
/** The readout: the picked value as the hero at (col, row), up to three short lines stacked beside it. */
export function readout(hero: string, lines: readonly { text: string; tone: Tone }[], col = 0, row = 14): Label[] {
  const x = col + heroWidth(hero) + 6
  return [
    { text: hero, col, row, tone: 'value', lattice: HERO.lattice },
    ...lines.slice(0, 3).map((l, i): Label => ({ text: l.text, col: x, row: row + 1 + i * 10, tone: l.tone })),
  ]
}
/** The readout centred on (cx, cy): the hero, one line under it (a donut's hole). */
export function centreReadout(hero: string, line: { text: string; tone: Tone }, cx: number, cy: number): Label[] {
  return [
    { text: hero, col: cx, row: cy - 19, tone: 'value', lattice: HERO.lattice, align: 'center' },
    { text: line.text, col: cx, row: cy + 13, tone: line.tone, align: 'center' },
  ]
}

/** A number with `d` decimals, `-0` written as 0; `sign` adds a + to positives. */
export function fmt(v: number, d = 0, sign = false): string {
  if (!Number.isFinite(v)) return '-'
  const half = .5 / (d <= 0 ? 1 : d === 1 ? 10 : d === 2 ? 100 : 1000), s = (Math.abs(v) < half ? 0 : v).toFixed(d)
  return sign && !s.startsWith('-') && Number(s) !== 0 ? `+${s}` : s
}
