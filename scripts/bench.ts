/**
 * Per-card and per-board perf against the docs/MASTER-PLAN.md §6 budgets (promoted from .snapshots/bench/bench.ts).
 *
 *   pnpm bench                 # print card + board tables, never fails
 *   pnpm bench --strict        # exit 1 when a board exceeds a budget
 *   pnpm bench --cards 0       # how many slowest cards to list (default 15, `all` for every card)
 *   RUNS=30 pnpm bench         # timing runs per card (median; default 15)
 *
 * Per card: layers() build + sampleLayers time (median over RUNS; animated cards over t = i/12),
 * visible dots, renderer by the app's rule (animated or > 2000 visible → canvas, else SVG), SVG bytes.
 * Per board, budgets:
 *   mount       Σ t=0 build+sample of every card (first frame)                ≤ 30 ms
 *   frame       Σ animated-card per-frame time (board frame, 30 fps tier)       ≤ 8 ms
 *   worst live  slowest animated card per frame                                ≤ 4 ms (hero)
 *   SVG         Σ renderSVG bytes of the cards the app draws as SVG              < 0.5 MB
 * Writes .snapshots/bench.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { renderSVG } from '../src/engine/renderer/svgRenderer'
import { boards, withChrome, type WidgetPreset } from '../src/widgets'
import { median, pitchOf, theme, uniquePresets, visible } from './lib/cards'
import { freezeWallClock } from './lib/freeze'

freezeWallClock()
const args = process.argv.slice(2), strict = args.includes('--strict')
const ci = args.indexOf('--cards'), showCards = ci >= 0 ? (args[ci + 1] === 'all' ? Infinity : +args[ci + 1]) : 15
const RUNS = +(process.env.RUNS ?? 15), CANVAS_THRESHOLD = 2000
const BUDGET = { mountMs: 30, frameMs: 8, liveMs: 4, svgBytes: 0.5 * 1024 * 1024 }

interface Row { id: string; animated: boolean; layers: number; dots: number; visible: number; renderer: 'svg' | 'canvas'; mountMs: number; buildMs: number; sampleMs: number; frameMs: number; svgBytes: number }
function benchCard(p: WidgetPreset): Row {
  const lf = withChrome(p), data = { ...p.defaults }
  const run = (t: number) => { const a = performance.now(); const L = lf({ t, data }); const b = performance.now(); const d = sampleLayers(L, p.grid, p.style, theme); return { build: b - a, sample: performance.now() - b, L, d } }
  for (let i = 0; i < 3; i++) run(i / 12) // warm-up
  const mount = Array.from({ length: RUNS }, () => run(0))
  const frames = p.animated ? Array.from({ length: RUNS }, (_, i) => run((i + 1) / 12)) : []
  const { L, d } = mount[0], vis = d.filter(visible).length, pitch = pitchOf(p)
  const renderer = p.animated || vis > CANVAS_THRESHOLD ? 'canvas' : 'svg'
  return {
    id: p.id, animated: !!p.animated, layers: L.length, dots: d.length, visible: vis, renderer,
    mountMs: median(mount.map(r => r.build + r.sample)), buildMs: median(mount.map(r => r.build)), sampleMs: median(mount.map(r => r.sample)),
    frameMs: frames.length ? median(frames.map(r => r.build + r.sample)) : 0,
    svgBytes: Buffer.byteLength(renderSVG(d, p.grid.cols * pitch, p.grid.rows * pitch)),
  }
}

const rows = new Map(uniquePresets().map(p => [p.id, benchCard(p)]))
const f = (x: number) => x.toFixed(2), kb = (b: number) => (b / 1024).toFixed(0)
const pad = (s: string | number, n: number) => String(s).padEnd(n), lpad = (s: string | number, n: number) => String(s).padStart(n)

const sorted = [...rows.values()].sort((a, b) => Math.max(b.mountMs, b.frameMs) - Math.max(a.mountMs, a.frameMs))
if (showCards > 0) {
  console.log(`Cards (slowest ${Math.min(showCards, sorted.length)} of ${sorted.length}, median of ${RUNS})`)
  console.log(`${pad('card', 18)} ${pad('anim', 4)} ${lpad('layers', 6)} ${lpad('visible', 7)} ${pad('rend', 6)} ${lpad('build', 7)} ${lpad('sample', 7)} ${lpad('mount', 7)} ${lpad('frame', 7)} ${lpad('svgKB', 6)}`)
  for (const r of sorted.slice(0, showCards)) console.log(`${pad(r.id, 18)} ${pad(r.animated ? 'Y' : '', 4)} ${lpad(r.layers, 6)} ${lpad(r.visible, 7)} ${pad(r.renderer, 6)} ${lpad(f(r.buildMs), 7)} ${lpad(f(r.sampleMs), 7)} ${lpad(f(r.mountMs), 7)} ${lpad(r.animated ? f(r.frameMs) : '-', 7)} ${lpad(r.renderer === 'svg' ? kb(r.svgBytes) : '-', 6)}`)
  console.log('')
}

interface BoardRow { id: string; cards: number; animated: number; mountMs: number; frameMs: number; worstLive: string; worstLiveMs: number; svgCards: number; svgBytes: number; svgAllBytes: number; over: string[] }
const boardRows: BoardRow[] = boards.map(b => {
  const rs = b.items.map(p => rows.get(p.id)!), an = rs.filter(r => r.animated), svg = rs.filter(r => r.renderer === 'svg')
  const worst = an.reduce<Row | undefined>((w, r) => (!w || r.frameMs > w.frameMs ? r : w), undefined)
  const row: BoardRow = {
    id: b.id, cards: rs.length, animated: an.length,
    mountMs: rs.reduce((s, r) => s + r.mountMs, 0), frameMs: an.reduce((s, r) => s + r.frameMs, 0),
    worstLive: worst?.id ?? '-', worstLiveMs: worst?.frameMs ?? 0,
    svgCards: svg.length, svgBytes: svg.reduce((s, r) => s + r.svgBytes, 0), svgAllBytes: rs.reduce((s, r) => s + r.svgBytes, 0), over: [],
  }
  if (row.mountMs > BUDGET.mountMs) row.over.push('mount')
  if (row.frameMs > BUDGET.frameMs) row.over.push('frame')
  if (row.worstLiveMs > BUDGET.liveMs) row.over.push('live')
  if (row.svgBytes >= BUDGET.svgBytes) row.over.push('svg')
  return row
})
console.log(`Boards — budgets: mount ≤ ${BUDGET.mountMs} ms, frame ≤ ${BUDGET.frameMs} ms, worst live ≤ ${BUDGET.liveMs} ms, SVG < ${kb(BUDGET.svgBytes)} KB`)
console.log(`${pad('board', 11)} ${lpad('cards', 5)} ${lpad('anim', 4)} ${lpad('mount ms', 9)} ${lpad('frame ms', 9)} ${pad('worst live (ms)', 26)} ${lpad('svg cards', 9)} ${lpad('SVG KB', 7)} ${lpad('all-SVG KB', 10)}  over`)
for (const r of boardRows) console.log(`${pad(r.id, 11)} ${lpad(r.cards, 5)} ${lpad(r.animated, 4)} ${lpad(f(r.mountMs), 9)} ${lpad(f(r.frameMs), 9)} ${pad(r.animated ? `${r.worstLive} (${f(r.worstLiveMs)})` : '-', 26)} ${lpad(r.svgCards, 9)} ${lpad(kb(r.svgBytes), 7)} ${lpad(kb(r.svgAllBytes), 10)}  ${r.over.join(',') || 'ok'}`)

mkdirSync('.snapshots', { recursive: true })
writeFileSync('.snapshots/bench.json', JSON.stringify({ runs: RUNS, budget: BUDGET, boards: boardRows, cards: sorted }, null, 1))
const failing = boardRows.filter(r => r.over.length)
console.log(`\n${failing.length}/${boardRows.length} boards over budget${strict ? '' : ' (report only; --strict to fail)'} — .snapshots/bench.json`)
if (strict && failing.length) process.exit(1)
