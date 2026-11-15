/**
 * Cartesian charts (#132): bar, line, area, sparkline and candlestick, each data in, marks out. Bars and candle
 * bodies are columns of big dot sites; lines are fine sites spaced along the path through each point's cell. The
 * picked point is the one red thing (`active`); everything else stays in the greys.
 */
import type { Tone } from '../types'
import { along, clear, column, emptyChart, type Chart, type Mark, type Plot, type Pt } from './marks'
import { pickIndex } from './readout'
import type { Scale } from './scale'

/** A bar is a column of sites `scale.step` cells apart rising from the baseline; its top site sits on `scale.cell(v)`. */
export interface BarSpec { plot: Plot; scale: Scale; xs: readonly number[]; size: number; tone?: Tone }
export function barChart(values: readonly number[], pick: number, s: BarSpec): Chart {
  const n = Math.min(values.length, s.xs.length), hot = pickIndex(pick, n), rest: Pt[] = [], picked: Pt[] = [], anchors: Pt[] = []
  if (!n) return emptyChart()
  const base = s.scale.range[0], step = s.scale.step, dir = s.scale.range[1] >= base ? 1 : -1
  for (let i = 0; i < n; i++) {
    const x = s.xs[i], top = s.scale.cell(values[i]), k = Math.round(((top - base) * dir) / step)
    anchors.push([x, top])
    for (let j = 1; j <= k; j++) (i === hot ? picked : rest).push([x, base + dir * j * step])
  }
  return { marks: [{ sites: rest, size: s.size, tone: s.tone ?? 'idle' }, { sites: picked, size: s.size, tone: 'active' }], labels: [], anchors, pick: hot }
}

/** A line through each point's cell: sites `spacing` apart, an optional dot on every point, the pick as a big red dot. */
export interface LineSpec {
  scale: Scale; xs: readonly number[]
  spacing: number; size: number; tone?: Tone
  /** Size of a dot on every data point (0: none). */
  knot?: number
  /** Size of the picked point's dot, and the clear moat around it in cells. */
  pickSize: number; moat: number
  /** A faint dotted drop from the picked point to this row (the baseline); omit for none. */
  guide?: number
}
export function lineChart(values: readonly number[], pick: number, s: LineSpec): Chart {
  const n = Math.min(values.length, s.xs.length), hot = pickIndex(pick, n)
  if (!n) return emptyChart()
  const anchors = Array.from({ length: n }, (_, i): Pt => [s.xs[i], s.scale.cell(values[i])]), p = hot >= 0 ? anchors[hot] : undefined
  const knots = s.knot ? clear(anchors.filter((_, i) => i !== hot), p, s.moat) : []
  // line sites give way round each knot (a gap of half a cell to its rim), so a knot never merges with a line dot
  const r = s.knot ? .42 * (s.knot + s.size) + .5 : 0, line = clear(spaced(along(anchors, s.spacing), s.spacing * .6), p, s.moat).filter(q => knots.every(k => (q[0] - k[0]) ** 2 + (q[1] - k[1]) ** 2 >= r * r))
  const marks: Mark[] = [{ sites: line, size: s.size, tone: s.tone ?? 'value' }]
  if (s.knot) marks.push({ sites: knots, size: s.knot, tone: s.tone ?? 'value' })
  if (p && s.guide !== undefined && Math.abs(s.guide - p[1]) > s.moat + 2) marks.push({ sites: column(p[0], p[1] + Math.sign(s.guide - p[1]) * (s.moat + 1), s.guide, 2.5), size: 1, tone: 'mid' })
  if (p) marks.push({ sites: [p], size: s.pickSize, tone: 'active' })
  return { marks, labels: [], anchors, pick: hot }
}

/** `pts` in order, without a site closer than `d` to the last one kept: at a sharp peak the two sites either side of the turn don't touch. */
function spaced(pts: Pt[], d: number): Pt[] {
  const out: Pt[] = []
  for (const q of pts) { const l = out[out.length - 1]; if (!l || (q[0] - l[0]) ** 2 + (q[1] - l[1]) ** 2 >= d * d) out.push(q) }
  return out
}

/** Row of the line through `anchors` at column x (linear between points), or NaN outside them. */
export function lineAt(anchors: readonly Pt[], x: number): number {
  if (!anchors.length || x < anchors[0][0] || x > anchors[anchors.length - 1][0]) return NaN
  for (let i = 1; i < anchors.length; i++) {
    const [ax, ay] = anchors[i - 1], [bx, by] = anchors[i]
    if (x <= bx) return bx === ax ? by : ay + ((by - ay) * (x - ax)) / (bx - ax)
  }
  return anchors[anchors.length - 1][1]
}

/**
 * The line with the area under it filled by a coarse lattice of small sites, `fill` cells apart from the baseline
 * up to a cell under the line: the band near the line in `mid`, deeper in `faint`.
 */
export interface AreaSpec extends LineSpec { plot: Plot; fill: number; fillSize: number; band: number }
export function areaChart(values: readonly number[], pick: number, s: AreaSpec): Chart {
  const chart = lineChart(values, pick, s)
  if (chart.anchors.length < 2) return chart
  const near: Pt[] = [], deep: Pt[] = [], p = chart.pick >= 0 ? chart.anchors[chart.pick] : undefined
  for (let k = 0, x = s.plot.x0; x <= s.plot.x1 + 1e-9; k++, x = s.plot.x0 + k * s.fill) {
    const top = lineAt(chart.anchors, x)
    // the picked point's drop runs down a slot in the fill
    if (!Number.isFinite(top) || (p && s.guide !== undefined && Math.abs(x - p[0]) < s.fill * .75)) continue
    for (let y = s.plot.base; y > top + s.fill * .6; y -= s.fill) (y - top < s.band ? near : deep).push([x, y])
  }
  // on a steep stretch a fill site can sit closer to the line than a row: it gives way to the line's dots
  const lineSites = chart.marks.flatMap(m => m.tone === 'active' ? [] : m.sites), r2 = (.42 * (s.fillSize + s.size) + .4) ** 2
  const off = (pts: Pt[]) => clear(pts, p, s.moat).filter(q => lineSites.every(l => (q[0] - l[0]) ** 2 + (q[1] - l[1]) ** 2 >= r2))
  chart.marks.unshift({ sites: off(deep), size: s.fillSize, tone: 'faint' }, { sites: off(near), size: s.fillSize, tone: 'mid' })
  return chart
}

/** One trading day: open, high, low, close. */
export interface Candle { o: number; h: number; l: number; c: number }
/**
 * Candles: a body of big sites from open to close (`value` when it closed up, `mid` when down), a wick of fine sites
 * to the high and the low. The picked candle is red; its anchor is the close.
 */
export interface CandleSpec { scale: Scale; xs: readonly number[]; body: { pitch: number; size: number }; wick: { pitch: number; size: number } }
export function candleChart(data: readonly Candle[], pick: number, s: CandleSpec): Chart {
  const n = Math.min(data.length, s.xs.length), hot = pickIndex(pick, n)
  if (!n) return emptyChart()
  const groups: Record<'up' | 'down' | 'hot', { body: Pt[]; wick: Pt[] }> = { up: { body: [], wick: [] }, down: { body: [], wick: [] }, hot: { body: [], wick: [] } }
  const anchors: Pt[] = []
  for (let i = 0; i < n; i++) {
    const d = data[i], x = s.xs[i], c = s.scale.cell(d.c), o = s.scale.cell(d.o), hi = s.scale.cell(d.h), lo = s.scale.cell(d.l)
    const top = Math.min(o, c), bot = Math.max(o, c), g = groups[i === hot ? 'hot' : d.c >= d.o ? 'up' : 'down'], gap = s.body.pitch * .8
    anchors.push([x, c])
    g.body.push(...column(x, top, bot, s.body.pitch, true))
    if (top - Math.min(hi, lo) > gap) g.wick.push(...column(x, Math.min(hi, lo), top - gap, s.wick.pitch))
    if (Math.max(hi, lo) - bot > gap) g.wick.push(...column(x, bot + gap, Math.max(hi, lo), s.wick.pitch))
  }
  const tones = { up: 'value', down: 'mid', hot: 'active' } as const
  const marks = (['up', 'down', 'hot'] as const).flatMap((k): Mark[] => [
    { sites: groups[k].wick, size: s.wick.size, tone: tones[k] }, { sites: groups[k].body, size: s.body.size, tone: tones[k] },
  ])
  return { marks, labels: [], anchors, pick: hot }
}
