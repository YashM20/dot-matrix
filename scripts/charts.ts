/**
 * Checks for the dot charts kit (#132, src/engine/charts, src/widgets/boards/charts*.ts):
 * - scales: min, max and the midpoint of a domain land on the expected cells (whole cells and site steps, both
 *   directions), the card scales put a bar's top site and a line point on `scale.cell(v)`, nice domains and extents;
 * - the readout: the nearest point wins (ties to the earlier one), on the engine helpers and on every card's control
 *   map, and a hovering pointer draws the same frame as picking that point by key;
 * - empty and single-point data: every chart builds and paints without errors or non-finite sites;
 * - motion: a transition ends exactly on its target data, the loop holds each set exactly, t = 0 and reduced motion
 *   are the settled first set, a visitor's set B is the loop's set B frame, the loop wraps;
 * - the cards: control boxes inside the grid, only the theme's tones (one accent), red on every settled card, the
 *   determinism lint, and the frame time (warn-only).
 * Called from verify.ts (`chartsChecks(assert)`); also runnable alone: `npx tsx scripts/charts.ts`.
 */
import { areaChart, barChart, candleChart, lineChart } from '../src/engine/charts/cartesian'
import { categoryLabels, fmt, readout, type Chart } from '../src/engine/charts/marks'
import { LOOP, grow, loopPhase, settle, stagger, tween } from '../src/engine/charts/motion'
import { chartLayers } from '../src/engine/charts/paint'
import { clockOf, nearestIndex, nearestPoint, segmentAt } from '../src/engine/charts/readout'
import { donutBounds, donutChart, heatChart } from '../src/engine/charts/round'
import { extent, linear, niceDomain, spread } from '../src/engine/charts/scale'
import type { Pointer } from '../src/engine/context'
import { sampleLayers, sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { TILE, withChrome, type WidgetPreset } from '../src/widgets'
import { chartsBoard } from '../src/widgets/boards/charts'
import { DONUT, HEAT_PTS, SPARK_XS, donutPick } from '../src/widgets/boards/charts-more'
import { AREA_XS, BAR_SCALE, BAR_XS, CANDLE_XS, LINE_SCALE, LINE_XS } from '../src/widgets/boards/charts-xy'
import { sampleCard, type CtxExtra } from './lib/cards'
import { detLint } from './lib/detLint'
import { fmtLoaded, medianLoaded } from './lib/load'

type Assert = (name: string, cond: boolean, detail?: string) => void
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => Object.is(x, b[i]))
const OFFSET: Record<string, number> = { 'chart-bar': 0, 'chart-line': .4, 'chart-area': .8, 'chart-candle': 1.2, 'chart-donut': 1.6, 'chart-heatmap': 2, 'chart-spark': 2.4 }

export function chartsChecks(assert: Assert): void {
  // ── scales ─────────────────────────────────────────────────────────────────────────────────────────
  {
    const bad: string[] = []
    const expect = (name: string, got: number, want: number) => { if (!Object.is(got, want)) bad.push(`${name}: ${got} ≠ ${want}`) }
    const up = linear([0, 100], [124, 60], 4), cells = linear([0, 80], [124, 60]), across = linear([-5, 5], [10, 110]), odd = linear([3, 9], [0, 12], 2)
    expect('sites min', up.cell(0), 124); expect('sites max', up.cell(100), 60); expect('sites mid', up.cell(50), 92); expect('sites quarter', up.cell(25), 108)
    expect('cells min', cells.cell(0), 124); expect('cells max', cells.cell(80), 60); expect('cells mid', cells.cell(40), 92)
    expect('across min', across.cell(-5), 10); expect('across max', across.cell(5), 110); expect('across mid', across.cell(0), 60)
    expect('offset min', odd.cell(3), 0); expect('offset max', odd.cell(9), 12); expect('offset mid', odd.cell(6), 6)
    expect('clamp below', up.cell(-40), 124); expect('clamp above', up.cell(400), 60); expect('NaN', up.cell(NaN), 124)
    expect('invert', up.invert(92), 50); expect('at', cells.at(20), 108)
    assert('charts: scales map min, max and midpoint onto the expected cells (site steps and whole cells, both ways, clamped)', bad.length === 0, bad.join('; '))

    // the card scales, through the charts that use them: the bar's top site and the line's point are scale.cell(v)
    const { domain: [d0, d1] } = BAR_SCALE, mid = (d0 + d1) / 2, vs = [d0, d1, mid]
    const bars = barChart(vs, -1, { plot: { x0: 2, x1: 122, top: 60, base: 124 }, scale: BAR_SCALE, xs: BAR_XS, size: 3 })
    const tops = BAR_XS.slice(0, 3).map(x => Math.min(...bars.marks.flatMap(m => m.sites).filter(p => p[0] === x).map(p => p[1])))
    const line = lineChart([0, 80, 40], -1, { scale: LINE_SCALE, xs: LINE_XS, spacing: 2, size: 1, pickSize: 6, moat: 4 })
    const cardOk = same(bars.anchors.map(p => p[1]), [124, 60, 92]) && same(tops, [Infinity, 60, 92]) && same(line.anchors.map(p => p[1]), [124, 60, 92])
    assert('charts: the bar card\'s top sites and the line card\'s points land on scale.cell (0 → baseline 124, max → 60, mid → 92)', cardOk, `bars ${bars.anchors.map(p => p[1])} tops ${tops}, line ${line.anchors.map(p => p[1])}`)

    const nice = niceDomain(0, 87, 2), nice2 = niceDomain(0, 5.1, 5), wide = niceDomain(163, 197, 3)
    const ext = [extent([]), extent([5]), extent([5], true), extent([3, NaN, 7]), extent([-2, 4], true), extent([0, 0], true)]
    const extOk = JSON.stringify(ext) === JSON.stringify([[0, 1], [4, 6], [0, 5], [3, 7], [-2, 4], [0, 1]])
    const niceOk = same(nice.ticks, [0, 50, 100]) && same(nice2.ticks, [0, 2, 4, 6]) && wide.domain[0] <= 163 && wide.domain[1] >= 197 && same(spread(1, 0, 10), [5]) && spread(0, 0, 1).length === 0 && same(spread(3, 0, 10), [0, 5, 10])
    assert('charts: nice domains, extents (empty, flat, gaps, zero) and spread positions', niceOk && extOk, `${nice.ticks} | ${nice2.ticks} | ${wide.ticks} | ${JSON.stringify(ext)}`)
  }

  // ── the readout ────────────────────────────────────────────────────────────────────────────────────
  {
    const xs = [0, 10, 20, 30]
    const helpers = nearestIndex(xs, 14) === 1 && nearestIndex(xs, 16) === 2 && nearestIndex(xs, 15) === 1 && nearestIndex(xs, -9) === 0 && nearestIndex(xs, 99) === 3 && nearestIndex([], 3) === -1
      && nearestPoint([[0, 0], [10, 0], [0, 10]], 2, 7) === 2 && nearestPoint([], 0, 0) === -1
      && segmentAt([.25, .5, 1], .3) === 1 && segmentAt([.25, .5, 1], 0) === 0 && segmentAt([], .5) === -1
      && Math.abs(clockOf(0, 0, 1, 0) - .25) < 1e-9 && Math.abs(clockOf(0, 0, 0, 1) - .5) < 1e-9 && clockOf(0, 0, 0, -1) === 0
    assert('charts: nearest point helpers (1D ties to the earlier point, 2D, clock segments, empty → -1)', helpers)

    // every card's control map: a pointer within half a spacing of point i picks i
    const wrong: string[] = []
    const lines: [string, readonly number[]][] = [['chart-bar', BAR_XS], ['chart-line', LINE_XS], ['chart-area', AREA_XS], ['chart-candle', CANDLE_XS], ['chart-spark', SPARK_XS]]
    for (const [id, pts] of lines) {
      const map = chartsBoard.find(p => p.id === id)!.controls![1].map!, h = (pts[1] - pts[0]) / 2 - .01
      pts.forEach((x, i) => { for (const dx of [-h, 0, h]) if (map(x + dx, 90, 0) !== i) wrong.push(`${id} ${i}@${dx.toFixed(2)}`) })
    }
    HEAT_PTS.forEach(([x, y], i) => { for (const [dx, dy] of [[0, 0], [3.9, 4.4], [-3.9, -4.4]]) if (nearestPoint(HEAT_PTS, x + dx, y + dy) !== i) wrong.push(`heat ${i}`) })
    // the donut picks by what it drew last: draw the settled first set, then aim at its segments
    sampleCard(chartsBoard.find(p => p.id === 'chart-donut')!, 0)
    const bounds = donutBounds([48, 22, 17, 6, 9])
    bounds.forEach((b, i) => {
      const a = ((i ? bounds[i - 1] : 0) + b) / 2, x = DONUT.cx + 47 * Math.sin(a * 2 * Math.PI), y = DONUT.cy - 47 * Math.cos(a * 2 * Math.PI)
      if (donutPick(x, y) !== i) wrong.push(`donut ${i}`)
    })
    assert('charts: every card\'s readout control snaps a tap to the nearest point (bars, line, area, candles, sparklines, heat cells, donut segments)', wrong.length === 0, wrong.slice(0, 8).join(', '))

    // hovering point i draws the same frame as picking i by key
    const hovered: string[] = []
    const ptr = (x: number, y: number): Pointer => ({ id: 1, x, y, inside: true, down: false, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: 0 })
    const probes: [string, number, number, number][] = [['chart-bar', BAR_XS[3] + 2, 100, 3], ['chart-line', LINE_XS[9] - 1, 80, 9], ['chart-candle', CANDLE_XS[14], 70, 14], ['chart-spark', SPARK_XS[5] + 1, 60, 5], ['chart-heatmap', HEAT_PTS[37][0] + 2, HEAT_PTS[37][1] - 2, 37]]
    for (const [id, x, y, i] of probes) {
      const p = chartsBoard.find(q => q.id === id)!, key = (e: CtxExtra) => JSON.stringify(sampleCard(p, 0, p.style, undefined, e))
      if (key({ pointers: [ptr(x, y)] }) !== key({ data: { pick: i } })) hovered.push(id)
    }
    assert('charts: a hovering pointer moves the readout to the nearest point (same frame as picking it)', hovered.length === 0, hovered.join(', '))
  }

  // ── empty and single-point data ────────────────────────────────────────────────────────────────────
  {
    const plot = { x0: 2, x1: 122, top: 60, base: 124 }, scale = linear([0, 1], [124, 60])
    const line = { scale, xs: [40], spacing: 2, size: 1, pickSize: 6, moat: 4, guide: 124 }
    const builds: [string, () => Chart][] = [
      ['bar []', () => barChart([], 0, { plot, scale, xs: [], size: 3 })], ['bar [v]', () => barChart([.5], 0, { plot, scale: linear([0, 1], [124, 60], 4), xs: [60], size: 3 })],
      ['line []', () => lineChart([], 0, { ...line, xs: [] })], ['line [v]', () => lineChart([.4], 0, line)], ['line [NaN]', () => lineChart([NaN], 0, line)],
      ['area []', () => areaChart([], 0, { ...line, xs: [], plot, fill: 3, fillSize: 1, band: 9 })], ['area [v]', () => areaChart([.7], 0, { ...line, plot, fill: 3, fillSize: 1, band: 9 })],
      ['candle []', () => candleChart([], 0, { scale, xs: [], body: { pitch: 3, size: 2 }, wick: { pitch: 2, size: 1 } })],
      ['candle [v]', () => candleChart([{ o: .4, h: .9, l: .1, c: .6 }], 0, { scale, xs: [60], body: { pitch: 3, size: 2 }, wick: { pitch: 2, size: 1 } })],
      ['donut []', () => donutChart([], 0, 1, DONUT)], ['donut [v]', () => donutChart([7], 0, 1, DONUT)], ['donut zeros', () => donutChart([0, 0], 0, 1, DONUT)],
      ['heat []', () => heatChart([], 0, { x0: 0, y0: 0, dx: 8, dy: 8, size: 6, domain: [0, 1], tones: ['faint', 'value'] })],
      ['heat [[]]', () => heatChart([[]], 0, { x0: 0, y0: 0, dx: 8, dy: 8, size: 6, domain: [0, 1], tones: ['faint', 'value'] })],
      ['heat [[v]]', () => heatChart([[.5]], 0, { x0: 20, y0: 20, dx: 8, dy: 8, size: 6, domain: [.5, .5], tones: ['faint', 'value'] })],
      ['labels', () => ({ marks: [], anchors: [], pick: -1, labels: [...categoryLabels([], [], 0, 0), ...categoryLabels([40], ['A'], 130, 0), ...readout(fmt(NaN), [])] })],
    ]
    const failed: string[] = []
    for (const [name, build] of builds) {
      try {
        const c = build(), dots = sampleLayers(chartLayers(c, TILE), TILE, chartsBoard[0].style, dot480)
        const finite = c.marks.every(m => m.sites.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) && dots.every(d => Number.isFinite(d.x) && Number.isFinite(d.y) && Number.isFinite(d.r))
        const one = name.includes('[v]') ? c.anchors.length === 1 && c.pick === 0 : name.includes('[]') ? c.anchors.length === 0 && c.pick === -1 : true
        if (!finite || !one) failed.push(name)
      } catch (e) { failed.push(`${name}: ${(e as Error).message}`) }
    }
    assert('charts: empty and single-point data build and paint without errors (no non-finite sites, one anchor for one point)', failed.length === 0, failed.join(', '))
  }

  // ── motion ─────────────────────────────────────────────────────────────────────────────────────────
  {
    const a = [3, 141.7, .1, 0, -8.25], b = [.3, 9, 1e-7, 55.5, 13]
    const ends = same(tween(a, b, 1), b) && same(tween(a, b, 0), a) && same(grow(b, 1), b) && same(grow(b, 0), [0, 0, 0, 0, 0]) && same(tween([], b, 1), b)
      && stagger(1, 4, 5) === 1 && stagger(0, 0, 5) === 0 && settle(.9995) === 1 && settle(.0004) === 0 && settle(.5) === .5
    const mids = tween(a, b, .5).some((v, i) => v !== a[i] && v !== b[i])
    const holds = [0, 1.3, 4.99, LOOP.period * 3].every(t => JSON.stringify(loopPhase(t)) === '{"intro":1,"set":0}') && [6.2, 8, 10.99].every(t => JSON.stringify(loopPhase(t)) === '{"intro":1,"set":1}')
      && loopPhase(12).intro === 0 && loopPhase(5.6).set > 0 && loopPhase(5.6).set < 1 && JSON.stringify(loopPhase(-1)) === JSON.stringify(loopPhase(LOOP.period - 1))
    assert('charts: a transition ends exactly on its target data (and starts exactly on its source); the loop holds each set exactly', ends && mids && holds)

    const off: string[] = []
    for (const p of chartsBoard) {
      const key = (t: number, e: CtxExtra = {}) => JSON.stringify(sampleCard(p, t, p.style, undefined, e)), o = OFFSET[p.id] ?? 0
      if (key(0) !== key(1.3) || key(7.3, { reducedMotion: true }) !== key(0)) off.push(`${p.id} settle`)
      // the visitor's set B, settled, is the loop's set B hold
      if (key(8 - o) !== key(0, { data: { demo: 0, set: 1 } }) || key(0, { data: { demo: 0, set: .9995 } }) !== key(8 - o)) off.push(`${p.id} set B`)
      if (key(5.5) !== key(5.5 + LOOP.period) || key(11.5) !== key(11.5 + 2 * LOOP.period)) off.push(`${p.id} loop`)
      if (key(5.6 - o) === key(0) || key(12 - o) === key(0)) off.push(`${p.id} still`)
    }
    assert('charts: t = 0 and reduced motion show the settled first set; a visitor\'s set B lands on the loop\'s B frame; the loop wraps and moves', off.length === 0, off.join(', '))
  }

  // ── the cards ──────────────────────────────────────────────────────────────────────────────────────
  {
    const tones = new Set([dot480.dotFaint, dot480.dotMid, dot480.dotIdle, dot480.value, dot480.dotActive])
    const boxes: string[] = [], colours: string[] = [], red: string[] = []
    for (const p of chartsBoard) {
      for (const c of p.controls ?? []) { const [x, y, w, h] = c.box; if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > p.grid.cols || y + h > p.grid.rows) boxes.push(`${p.id}:${c.key}`) }
      for (const t of [0, 5.6, 8, 12.8]) for (const d of sampleCard(p, t)) if (!tones.has(d.color)) colours.push(`${p.id}@${t} ${d.color}`)
      if (!sampleCard(p, 0).some(d => d.color === dot480.dotActive)) red.push(p.id)
    }
    assert('charts: control boxes are [col, row, width, height] inside the card grid', boxes.length === 0, boxes.join(', '))
    assert('charts: one accent (only the theme greys and dotActive on every card), and the settled card shows its red pick', colours.length === 0 && red.length === 0, [...colours.slice(0, 4), ...red].join(', '))
    const det = detLint(['src/engine/charts/', 'src/widgets/boards/charts'])
    assert('det: no engine-specific Math in the charts module or board (in the determinism lint)', !det.violations.length && det.scanned.length >= 11, det.violations.map(x => `${x.file}:${x.line} ${x.rule}`).join('; ') || `${det.scanned.length} files`)

    const frame = (p: WidgetPreset, t: number) => sampleLayersInto(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480)
    for (const p of chartsBoard) {
      for (let i = 0; i < 4; i++) frame(p, 5 + i / 12)
      const r = medianLoaded(i => frame(p, 5 + i * .13), 9)
      assert(`charts: ${p.id} frame ≤ 4 ms (layers + sample, median warm × load, mid-morph)`, r.ms <= 4 * r.load, `${fmtLoaded(r)}, ${frame(p, 5.5).n} dots`)
    }
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('charts')
  chartsChecks(assert)
  done()
}
