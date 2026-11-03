/**
 * Charts without a value axis (#132): donut, heatmap and sparklines. The donut sweeps in from 12 o'clock and its
 * picked segment steps out in red; the heatmap's dot size is the value in five steps; the sparklines share one
 * readout moment across three gauges.
 */
import { lineChart } from '../../engine/charts/cartesian'
import { categoryLabels, centreReadout, fmt, readout, type Label, type Mark } from '../../engine/charts/marks'
import { ease, grow, tween } from '../../engine/charts/motion'
import { clockOf, nearestIndex, nearestPoint, segmentAt } from '../../engine/charts/readout'
import { donutBounds, donutChart, heatChart, type DonutSpec, type HeatSpec } from '../../engine/charts/round'
import { extent, linear, spread } from '../../engine/charts/scale'
import type { Tone } from '../../engine/types'
import { COMMITS, DAYS, GAUGES, HEAT_HOURS, KINDS, SERVERS, SPARK_N, STORAGE } from './charts-data'
import { chartCard, style } from './charts-kit'

// ── DONUT ───────────────────────────────────────────────────────────────────
/** Two rings of 72 sites, 6 cells apart: a band of big dots. */
export const DONUT: DonutSpec = { cx: 72, cy: 82, radii: [44, 50], sites: 72, size: 2.6, pop: 4, tones: ['value', 'idle', 'mid', 'idle', 'mid'] }
/** Segment ends of the data on screen (a tap picks by what is drawn; the first set until a frame is drawn). */
let drawnBounds = donutBounds(STORAGE[0])
export const donutPick = (x: number, y: number) => segmentAt(drawnBounds, clockOf(DONUT.cx, DONUT.cy, x, y))
export const donutCard = chartCard({
  id: 'chart-donut', name: 'Donut Chart', label: 'DONUT / DISK', sets: ['PHONE', 'PC'], n: KINDS.length, offset: 1.6,
  box: [16, 26, 112, 112], map: donutPick, pick0: 0,
  draw: v => {
    const vs = tween(STORAGE[0], STORAGE[1], v.set).map(Math.round), total = vs.reduce((a, b) => a + b, 0)
    drawnBounds = donutBounds(vs)
    const c = donutChart(vs, v.pick, ease(v.intro), DONUT), p = c.pick
    return {
      marks: c.marks,
      labels: p < 0 ? [] : [
        ...centreReadout(`${fmt(total ? (vs[p] / total) * 100 : 0)}%`, { text: KINDS[p], tone: 'idle' }, DONUT.cx, DONUT.cy),
        { text: `${vs[p]} GB`, col: DONUT.cx, row: DONUT.cy + 23, tone: 'mid', align: 'center' },
      ],
    }
  },
})

// ── HEATMAP ─────────────────────────────────────────────────────────────────
/** 7 days × 16 hours, one site per cell, 8 × 9 cells apart; five size steps with their tones. */
const HEAT_TONES: Tone[] = ['faint', 'mid', 'idle', 'idle', 'value']
const COLS = HEAT_HOURS.length, ROWS = DAYS.length
export const HEAT: HeatSpec = { x0: 18, y0: 56, dx: 8, dy: 9, size: 6.4, domain: [0, Math.max(...COMMITS.flat(2))], tones: HEAT_TONES }
export const HEAT_PTS = Array.from({ length: ROWS * COLS }, (_, i): [number, number] => [HEAT.x0 + (i % COLS) * HEAT.dx, HEAT.y0 + Math.floor(i / COLS) * HEAT.dy])
const HEAT_XS = Array.from({ length: COLS }, (_, c) => HEAT.x0 + c * HEAT.dx)
const flatA = COMMITS[0].flat(), flatB = COMMITS[1].flat()
const LEGEND = { x: 30, y: 132, gap: 9 }
export const heatCard = chartCard({
  id: 'chart-heatmap', name: 'Heatmap', label: 'HEAT / COMMITS', sets: ['THIS', 'LAST'], n: ROWS * COLS, offset: 2,
  box: [12, 50, 132, 64], map: (x, y) => nearestPoint(HEAT_PTS, x, y), pick0: flatA.indexOf(Math.max(...flatA)),
  style: { ...style, cornerRoundness: 1 },
  draw: v => {
    const flat = grow(tween(flatA, flatB, v.set, .5), v.intro, 0, .6).map(Math.round)
    const matrix = DAYS.map((_, r) => flat.slice(r * COLS, (r + 1) * COLS))
    const c = heatChart(matrix, v.pick, HEAT), r = Math.floor(c.pick / COLS), col = c.pick % COLS
    const legend: Mark[] = HEAT_TONES.map((tone, l) => ({ sites: [[LEGEND.x + l * LEGEND.gap, LEGEND.y + 3]], size: HEAT.size * .8, tone, value: (l + 1) / HEAT_TONES.length }))
    const days: Label[] = DAYS.map((d, i) => ({ text: d[0], col: 2, row: HEAT.y0 + i * HEAT.dy - 3, tone: i === r ? 'value' : 'mid' }))
    return {
      marks: [...c.marks, ...legend],
      labels: [
        ...days, ...categoryLabels(HEAT_XS, HEAT_HOURS, 116, col, 4),
        { text: 'LESS', col: 0, row: LEGEND.y, tone: 'mid' }, { text: 'MORE', col: LEGEND.x + 4 * LEGEND.gap + 7, row: LEGEND.y, tone: 'mid' },
        ...readout(String(flat[c.pick]), [{ text: DAYS[r], tone: 'value' }, { text: `${HEAT_HOURS[col]}:00`, tone: 'idle' }, { text: 'COMMITS', tone: 'mid' }]),
      ],
    }
  },
})

// ── SPARKLINES ──────────────────────────────────────────────────────────────
/** Three gauges, each a 20-cell band of fine sites with its reading on the right; one picked minute across all three. */
export const SPARK_XS = spread(SPARK_N, 2, 104)
const SPARK_ROWS = GAUGES.map((_, k) => {
  const y0 = 16 + k * 38, base = y0 + 30
  return { y0, base, scale: linear(extent([...SERVERS[0][k], ...SERVERS[1][k]]), [base, y0 + 10]) }
})
export const sparkCard = chartCard({
  id: 'chart-spark', name: 'Sparklines', label: 'SPARK / SERVERS', sets: ['WEB', 'DB'], n: SPARK_N, offset: 2.4,
  box: [0, 12, 110, 118], map: x => nearestIndex(SPARK_XS, x),
  draw: v => {
    const marks: Mark[] = [], labels: Label[] = []
    let pick = v.pick
    GAUGES.forEach((g, k) => {
      const row = SPARK_ROWS[k], lo = row.scale.domain[0]
      const vs = grow(tween(SERVERS[0][k], SERVERS[1][k], v.set, .5), v.intro, lo, .5).map(x => (g.d ? Math.round(x * 10) / 10 : Math.round(x)))
      const c = lineChart(vs, v.pick, { scale: row.scale, xs: SPARK_XS, spacing: 1.8, size: 1.2, tone: 'idle', pickSize: 4.4, moat: 3 })
      pick = c.pick
      marks.push(...c.marks)
      labels.push(
        { text: g.name, col: 0, row: row.y0, tone: 'idle' },
        { text: `${fmt(vs[c.pick], g.d)}${g.unit}`, col: 143, row: row.base - 16, tone: 'value', align: 'right', lattice: 1.6 },
        ...(g.unit ? [] : [{ text: 'MB/S', col: 143, row: row.base - 2, tone: 'mid' as Tone, align: 'right' as const }]),
      )
    })
    labels.push({ text: pick === SPARK_N - 1 ? 'NOW' : `${SPARK_N - 1 - pick} MIN AGO`, col: 0, row: 132, tone: 'value' })
    return { marks, labels }
  },
})

