/**
 * Charts on x and y axes (#132): bar, line, area and candlestick. Each is the engine's chart for its data at the
 * card's view (set, intro, pick), a value axis of faint gridlines with its numbers on the right, category names under
 * the plot and the readout over it. The picked bar, point or candle is red.
 */
import { areaChart, barChart, candleChart, lineAt, lineChart, type Candle } from '../../engine/charts/cartesian'
import { categoryLabels, fmt, readout, valueAxis, type Plot } from '../../engine/charts/marks'
import { grow, tween } from '../../engine/charts/motion'
import { knockSites } from '../../engine/layout'
import { nearestIndex } from '../../engine/charts/readout'
import { bands, linear, niceDomain, spread } from '../../engine/charts/scale'
import { MONTHS, ORDERS, SESSIONS, SOLAR, STOCK, SUN_HOURS, VISITS, HOURS } from './charts-data'
import { change, chartCard } from './charts-kit'

/** The plot under the readout: values from the baseline at row 124 up to row 60, data across x 2 … 122. */
const PLOT: Plot = { x0: 2, x1: 122, top: 60, base: 124 }
const LABEL_ROW = 130
const PLOT_BOX: [number, number, number, number] = [0, 50, 126, 88]

// ── BAR ─────────────────────────────────────────────────────────────────────
/** Twelve columns of big sites 4 cells apart: 16 steps from 0 to 100, so the ticks at 50 and 100 sit on site rows. */
export const BAR_XS = bands(12, PLOT.x0, PLOT.x1)
const BAR_AXIS = niceDomain(0, Math.max(...ORDERS.flat()), 2)
export const BAR_SCALE = linear(BAR_AXIS.domain, [PLOT.base, PLOT.top], 4)
export const barCard = chartCard({
  id: 'chart-bar', name: 'Bar Chart', label: 'BAR / ORDERS', sets: ['2025', '2026'], n: 12, offset: 0,
  box: PLOT_BOX, map: x => nearestIndex(BAR_XS, x),
  draw: v => {
    const vs = grow(tween(ORDERS[0], ORDERS[1], v.set), v.intro).map(Math.round)
    const c = barChart(vs, v.pick, { plot: PLOT, scale: BAR_SCALE, xs: BAR_XS, size: 3.2 }), axis = valueAxis(BAR_SCALE, BAR_AXIS.ticks, PLOT, x => fmt(x))
    // a gridline keeps its one spacing and loses only the dots a bar stands on (above a bar's top it runs through)
    const bars = c.marks.flatMap(m => m.sites)
    axis.marks[0].sites = knockSites(axis.marks[0].sites, bars, 2.1)
    return {
      marks: [...axis.marks, ...c.marks],
      labels: [
        ...axis.labels, ...categoryLabels(BAR_XS, MONTHS.map(m => m[0]), LABEL_ROW, c.pick),
        ...readout(fmt(vs[c.pick]), [{ text: MONTHS[c.pick], tone: 'value' }, { text: change(vs, c.pick, d => fmt(d, 0, true)), tone: 'idle' }, { text: 'ORDERS', tone: 'mid' }]),
      ],
    }
  },
})

// ── LINE ────────────────────────────────────────────────────────────────────
/** 24 hourly points on whole cells, a line of fine sites through them; the pick drops a dotted guide to the baseline. */
export const LINE_XS = spread(24, 4, 120)
const LINE_AXIS = niceDomain(0, Math.max(...VISITS.flat()), 4)
export const LINE_SCALE = linear(LINE_AXIS.domain, [PLOT.base, PLOT.top])
export const lineCard = chartCard({
  id: 'chart-line', name: 'Line Chart', label: 'LINE / VISITS', sets: ['MON', 'SUN'], n: 24, offset: .4,
  box: PLOT_BOX, map: x => nearestIndex(LINE_XS, x),
  draw: v => {
    const vs = grow(tween(VISITS[0], VISITS[1], v.set), v.intro, 0, .5).map(Math.round)
    const c = lineChart(vs, v.pick, { scale: LINE_SCALE, xs: LINE_XS, spacing: 2.2, size: 1.5, pickSize: 6, moat: 4, guide: PLOT.base })
    const axis = valueAxis(LINE_SCALE, LINE_AXIS.ticks.filter((_, i) => i % 2 === 0), PLOT, x => fmt(x))
    // where the line crosses a gridline, the gridline's dots give way to the line's
    axis.marks[0].sites = knockSites(axis.marks[0].sites, c.marks.flatMap(m => m.sites), 1.6)
    return {
      marks: [...axis.marks, ...c.marks],
      labels: [
        ...axis.labels, ...categoryLabels(LINE_XS, HOURS, LABEL_ROW, c.pick, 6),
        ...readout(fmt(vs[c.pick]), [{ text: `${HOURS[c.pick]}:00`, tone: 'value' }, { text: change(vs, c.pick, d => fmt(d, 0, true)), tone: 'idle' }, { text: 'VISITS', tone: 'mid' }]),
      ],
    }
  },
})

// ── AREA ────────────────────────────────────────────────────────────────────
/** Solar output: the line with dots on its hours over a coarse fill, `mid` near the line and `faint` deeper down. */
const AREA_PLOT: Plot = { ...PLOT, x0: 4 }
export const AREA_XS = spread(15, 4, 120)
const AREA_AXIS = niceDomain(0, Math.max(...SOLAR.flat()), 5)
export const AREA_SCALE = linear(AREA_AXIS.domain, [PLOT.base, PLOT.top])
export const areaCard = chartCard({
  id: 'chart-area', name: 'Area Chart', label: 'AREA / SOLAR', sets: ['SUN', 'CLOUD'], n: 15, offset: .8, pick0: 7,
  box: PLOT_BOX, map: x => nearestIndex(AREA_XS, x),
  draw: v => {
    const vs = grow(tween(SOLAR[0], SOLAR[1], v.set), v.intro, 0, .5).map(x => Math.round(x * 10) / 10)
    const c = areaChart(vs, v.pick, { plot: AREA_PLOT, scale: AREA_SCALE, xs: AREA_XS, spacing: 2.2, size: 1.6, knot: 2.6, pickSize: 6, moat: 4, guide: PLOT.base, fill: 3, fillSize: 1.3, band: 9 })
    const axis = valueAxis(AREA_SCALE, AREA_AXIS.ticks, PLOT, x => fmt(x))
    // gridlines run behind the area: under the line the fill's own rows stand in for them, so the two never interleave
    axis.marks[0].sites = axis.marks[0].sites.filter(([x, y]) => !(y > lineAt(c.anchors, x) - 1.5))
    return {
      marks: [...axis.marks, ...c.marks],
      labels: [
        ...axis.labels, ...categoryLabels(AREA_XS, SUN_HOURS, LABEL_ROW, c.pick, 3),
        ...readout(fmt(vs[c.pick], 1), [{ text: `${SUN_HOURS[c.pick]}:00`, tone: 'value' }, { text: change(vs, c.pick, d => fmt(d, 1, true)), tone: 'idle' }, { text: 'KW', tone: 'mid' }]),
      ],
    }
  },
})

// ── CANDLESTICK ─────────────────────────────────────────────────────────────
/** Twenty sessions 6 cells apart: bodies of big sites, wicks of fine ones; candles open out from their middle. */
export const CANDLE_XS = bands(20, PLOT.x0, PLOT.x1)
const CANDLE_AXIS = (() => { const all = STOCK.flat(); return niceDomain(Math.min(...all.map(d => d.l)), Math.max(...all.map(d => d.h)), 3) })()
export const CANDLE_SCALE = linear(CANDLE_AXIS.domain, [PLOT.base, PLOT.top])
const flat = (d: Candle): Candle => { const m = (d.o + d.c) / 2; return { o: m, h: m, l: m, c: m } }
const KEYS = ['o', 'h', 'l', 'c'] as const
/** Candles on their way from `a` to `b` (every price staggered along the session). */
export function tweenCandles(a: readonly Candle[], b: readonly Candle[], s: number, spread = .4): Candle[] {
  const cols = KEYS.map(k => tween(a.map(d => d[k]), b.map(d => d[k]), s, spread))
  return b.map((_, i) => ({ o: cols[0][i], h: cols[1][i], l: cols[2][i], c: cols[3][i] }))
}
export const candleCard = chartCard({
  id: 'chart-candle', name: 'Candlestick Chart', label: 'CANDLES / DTX', sets: ['MAY', 'JUN'], n: 20, offset: 1.2,
  box: PLOT_BOX, map: x => nearestIndex(CANDLE_XS, x),
  draw: v => {
    const m = tweenCandles(STOCK[0], STOCK[1], v.set), ds = tweenCandles(m.map(flat), m, v.intro, .5).map(d => ({ o: Math.round(d.o), h: Math.round(d.h), l: Math.round(d.l), c: Math.round(d.c) }))
    const c = candleChart(ds, v.pick, { scale: CANDLE_SCALE, xs: CANDLE_XS, body: { pitch: 3, size: 2.8 }, wick: { pitch: 2, size: 1 } })
    const ticks = CANDLE_AXIS.ticks.length > 3 ? CANDLE_AXIS.ticks.filter((_, i) => i % 2 === 0) : CANDLE_AXIS.ticks
    const axis = valueAxis(CANDLE_SCALE, ticks, PLOT, x => fmt(x), { avoid: CANDLE_XS, gap: 1.6 }), d = ds[c.pick], prev = ds[c.pick - 1]
    return {
      marks: [...axis.marks, ...c.marks],
      labels: [
        ...axis.labels, ...categoryLabels(CANDLE_XS, SESSIONS, LABEL_ROW, c.pick, 5),
        ...readout(fmt(d.c), [
          { text: `${v.set >= .5 ? 'JUN' : 'MAY'} ${SESSIONS[c.pick]}`, tone: 'value' },
          { text: prev ? `${fmt(((d.c - prev.c) / prev.c) * 100, 1, true)}%` : '', tone: 'idle' },
          { text: `H${d.h} L${d.l}`, tone: 'mid' },
        ]),
      ],
    }
  },
})
