/**
 * Per-card and per-board perf against the docs/MASTER-PLAN.md §6 budgets (promoted from .snapshots/bench/bench.ts).
 *
 *   pnpm bench                 # print card + board tables, never fails
 *   pnpm bench --strict        # exit 1 when a board exceeds a budget
 *   pnpm bench --cards 0       # how many slowest cards to list (default 15, `all` for every card)
 *   RUNS=30 pnpm bench         # timing runs per card (median; default 15)
 *
 * Per card: layers() build + sampleLayers time (median over RUNS; animated cards over t = i/12). Mount runs start
 * with no repeated frame kept (`forgetFrames`); frame runs keep them, as the app does (a card at rest repeats its frame),
 * visible dots, renderer by the app's rule (animated or > 2000 visible → canvas, else SVG), SVG bytes.
 * The frame budgets count what the app runs. DotCanvas pauses a card outside the viewport (IntersectionObserver,
 * 64 px root margin), so a board frame is the cards on screen together, not the whole board. N (VIEWPORT_CARDS) = 20
 * is the most a 1280 × 800 viewport holds, from src/site/app/grid.css and src/tokens.css at the default CARD SIZE
 * (LARGE) on the busiest layout, a dense board (4 columns, gap 16): frame pad clamp(16px, 3vw, 40px) = 38.4 px a side
 * and a classic 15 px scrollbar leave a 1188 px grid, so square 285 px cards (under --card-max = min(62svh, 520px))
 * on a 301 px row pitch. The live band is 800 + 2 × 64 = 928 px, and 928 + 285 > 4 × 301, so it can touch 5 rows:
 * 20 cards. (With an overlay scrollbar it is 4 rows, 16 cards; COMPACT, an opt-in, fits 25.)
 * Turn-taking (src/engine/clock.ts `STAGGER`): when a window holds 2 or more live CPU cards (more than STAGGER.min), they split by
 * board order into two interleaved groups and the second runs half a frame period behind, so on a 60 Hz display the
 * groups draw on different animation frames. A card above 30 fps (half of 60 Hz) draws on most frames whatever its
 * phase, so it counts in both. The window's frame is the heavier group plus the other group's cards above 30 fps.
 * A GPU card (every animated layer GPU-tagged, so WebGL2 draws it; its CPU layers are static) is GPU work: it leaves
 * the frame and worst-live checks, and its CPU-fallback time (no WebGL2) has its own column so a regression still shows.
 * Per board, budgets:
 *   mount       Σ t=0 build+sample of every card (first frame)                                 ≤ 30 ms
 *   frame       worst per-frame time over any N consecutive animated CPU cards (board order),
 *               with turn-taking (above)                                                         ≤ 8 ms
 *   all         Σ per-frame time of every animated CPU card, no turn-taking (reference only, no budget)
 *   worst live  each animated CPU card per frame                                                 ≤ 4 ms, or 8 ms for a
 *               card on LIVE_EXCEPTIONS (showcase cards whose speed-up needs pixel changes; only the owner adds one)
 *   gpu fb      Σ CPU-fallback per-frame time of the GPU cards (reference only, no budget)
 *   SVG         Σ renderSVG bytes of the cards the app draws as SVG                               < 0.5 MB
 * Sim board cold start (`--sim-t 1,60,3600`, default those): every sim's checkpoints dropped, the board mounted
 * at t, then the median frame over the next RUNS frames (t + i/30). The warm-up above hides replay cost, this does not.
 * Writes .snapshots/bench.json.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { renderSVG } from '../src/engine/renderer/svgRenderer'
import { boards, withChrome, type WidgetPreset } from '../src/widgets'
import { median, pitchOf, theme, uniquePresets, visible } from './lib/cards'
import { freezeWallClock } from './lib/freeze'
import { simReset } from '../src/engine/sim'
import { forgetFrames } from '../src/engine/sampler/repeat'
import { STAGGER } from '../src/engine/clock'
import { hasGPULayers, splitGPULayers } from '../src/engine/renderer/webgl/passes'
import { simBoard, simBoardSims } from '../src/widgets/boards/sim'

freezeWallClock()
const args = process.argv.slice(2), strict = args.includes('--strict')
const ci = args.indexOf('--cards'), showCards = ci >= 0 ? (args[ci + 1] === 'all' ? Infinity : +args[ci + 1]) : 15
const RUNS = +(process.env.RUNS ?? 15), CANVAS_THRESHOLD = 2000
const BUDGET = { mountMs: 30, frameMs: 8, liveMs: 4, svgBytes: 0.5 * 1024 * 1024 }
/**
 * The written exceptions to the 4 ms live-card budget: showcase cards that may take up to 8 ms a frame. Speeding them up
 * needs pixel-changing work, left for a later per-card pass. No card is added without the owner.
 */
const LIVE_EXCEPTIONS: Readonly<Record<string, number>> = { 'sq-ammann': 8, 'lv-corridor': 8, 'sc-posts': 8 }
const liveBudget = (id: string) => LIVE_EXCEPTIONS[id] ?? BUDGET.liveMs
/** Cards a 1280 × 800 viewport holds on the busiest board layout (header): the board frame window. */
const VIEWPORT_CARDS = 20

interface Row { id: string; animated: boolean; gpu: boolean; fps: number; layers: number; dots: number; visible: number; renderer: 'svg' | 'canvas'; mountMs: number; buildMs: number; sampleMs: number; frameMs: number; svgBytes: number }
function benchCard(p: WidgetPreset): Row {
  const lf = withChrome(p), data = { ...p.defaults }
  const run = (t: number) => { const a = performance.now(); const L = lf({ t, data }); const b = performance.now(); const d = sampleLayers(L, p.grid, p.style, theme); return { build: b - a, sample: performance.now() - b, L, d } }
  for (let i = 0; i < 3; i++) run(i / 12) // warm-up
  // a mount is a first frame: no repeated frame kept from the run before (src/engine/sampler/repeat.ts)
  const mount = Array.from({ length: RUNS }, () => { forgetFrames(); return run(0) })
  const frames = p.animated ? Array.from({ length: RUNS }, (_, i) => run((i + 1) / 12)) : []
  const { L, d } = mount[0], vis = d.filter(visible).length, pitch = pitchOf(p)
  // a GPU card: GPU-tagged layers, and the CPU rest draws the same dots at two times (static), as DotCanvas splits them
  const cpuKey = (t: number) => { const { cpu } = splitGPULayers(lf({ t, data }), p.grid, p.style, p.grid.pitch ?? theme.gridPx); return JSON.stringify(sampleLayers(cpu, p.grid, p.style, theme)) }
  const gpu = !!p.animated && hasGPULayers(L) && cpuKey(1 / 12) === cpuKey(1.3)
  const renderer = p.animated || vis > CANVAS_THRESHOLD ? 'canvas' : 'svg'
  return {
    id: p.id, animated: !!p.animated, gpu, fps: p.fps ?? 12, layers: L.length, dots: d.length, visible: vis, renderer,
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
  for (const r of sorted.slice(0, showCards)) console.log(`${pad(r.id, 18)} ${pad(r.gpu ? 'GPU' : r.animated ? 'Y' : '', 4)} ${lpad(r.layers, 6)} ${lpad(r.visible, 7)} ${pad(r.renderer, 6)} ${lpad(f(r.buildMs), 7)} ${lpad(f(r.sampleMs), 7)} ${lpad(f(r.mountMs), 7)} ${lpad(r.animated ? f(r.frameMs) : '-', 7)} ${lpad(r.renderer === 'svg' ? kb(r.svgBytes) : '-', 6)}`)
  console.log('')
}

interface BoardRow { id: string; cards: number; animated: number; mountMs: number; frameMs: number; allMs: number; gpuMs: number; worstLive: string; worstLiveMs: number; svgCards: number; svgBytes: number; svgAllBytes: number; over: string[] }
/** One viewport's frame with turn-taking (the clock's rule): the heavier group, plus the other group's cards above 30 fps. */
function windowFrame(w: Row[]): number {
  if (w.length <= STAGGER.min) return w.reduce((s, r) => s + r.frameMs, 0)
  const tick = (g: number) => w.reduce((s, r, i) => s + ((i & 1) === g || r.fps > 30 ? r.frameMs : 0), 0)
  return Math.max(tick(0), tick(1))
}
const boardRows: BoardRow[] = boards.map(b => {
  const rs = b.items.map(p => rows.get(p.id)!), an = rs.filter(r => r.animated && !r.gpu), svg = rs.filter(r => r.renderer === 'svg')
  // the busiest viewport: the worst sum over any VIEWPORT_CARDS consecutive animated CPU cards
  let frameMs = 0
  for (let i = 0; i <= Math.max(0, an.length - VIEWPORT_CARDS); i++) frameMs = Math.max(frameMs, windowFrame(an.slice(i, i + VIEWPORT_CARDS)))
  const worst = an.reduce<Row | undefined>((w, r) => (!w || r.frameMs > w.frameMs ? r : w), undefined)
  const row: BoardRow = {
    id: b.id, cards: rs.length, animated: rs.filter(r => r.animated).length,
    mountMs: rs.reduce((s, r) => s + r.mountMs, 0), frameMs, allMs: an.reduce((s, r) => s + r.frameMs, 0),
    gpuMs: rs.filter(r => r.gpu).reduce((s, r) => s + r.frameMs, 0),
    worstLive: worst?.id ?? '-', worstLiveMs: worst?.frameMs ?? 0,
    svgCards: svg.length, svgBytes: svg.reduce((s, r) => s + r.svgBytes, 0), svgAllBytes: rs.reduce((s, r) => s + r.svgBytes, 0), over: [],
  }
  if (row.mountMs > BUDGET.mountMs) row.over.push('mount')
  if (row.frameMs > BUDGET.frameMs) row.over.push('frame')
  if (an.some(r => r.frameMs > liveBudget(r.id))) row.over.push('live')
  if (row.svgBytes >= BUDGET.svgBytes) row.over.push('svg')
  return row
})
console.log(`Boards — budgets: mount ≤ ${BUDGET.mountMs} ms, frame (worst ${VIEWPORT_CARDS} consecutive live CPU cards, taking turns from ${STAGGER.min + 1}) ≤ ${BUDGET.frameMs} ms, live card ≤ ${BUDGET.liveMs} ms (exceptions: ${Object.entries(LIVE_EXCEPTIONS).map(([id, ms]) => `${id} ≤ ${ms}`).join(', ')}), SVG < ${kb(BUDGET.svgBytes)} KB; all and gpu fb are reference only`)
console.log(`${pad('board', 11)} ${lpad('cards', 5)} ${lpad('anim', 4)} ${lpad('mount ms', 9)} ${lpad('frame ms', 9)} ${lpad('all ms', 8)} ${lpad('gpu fb', 7)} ${pad('worst live (ms)', 26)} ${lpad('svg cards', 9)} ${lpad('SVG KB', 7)} ${lpad('all-SVG KB', 10)}  over`)
for (const r of boardRows) console.log(`${pad(r.id, 11)} ${lpad(r.cards, 5)} ${lpad(r.animated, 4)} ${lpad(f(r.mountMs), 9)} ${lpad(f(r.frameMs), 9)} ${lpad(f(r.allMs), 8)} ${lpad(r.gpuMs ? f(r.gpuMs) : '-', 7)} ${pad(r.animated ? `${r.worstLive} (${f(r.worstLiveMs)})` : '-', 26)} ${lpad(r.svgCards, 9)} ${lpad(kb(r.svgBytes), 7)} ${lpad(kb(r.svgAllBytes), 10)}  ${r.over.join(',') || 'ok'}`)
// the boards over or near (≥ 75 %) the frame budget: their live CPU cards in board order, so a fix can aim at the heavier group
const near = boardRows.filter(r => r.over.length || r.frameMs >= BUDGET.frameMs * .75)
if (near.length) console.log(`\nLive CPU cards of the boards over or near the frame budget (board order, frame ms; a/b = turn group)`)
for (const r of near) {
  const an = boards.find(b => b.id === r.id)!.items.map(p => rows.get(p.id)!).filter(c => c.animated && !c.gpu)
  console.log(`  ${pad(r.id, 11)} ${an.map((c, i) => `${c.id} ${f(c.frameMs)}${'ab'[i & 1]}`).join('  ')}`)
}

const si = args.indexOf('--sim-t'), simTs = (si >= 0 ? args[si + 1] : '1,60,3600').split(',').map(Number)
const simRows = simTs.map(T => {
  const frameAt = (t: number) => { const a = performance.now(); for (const p of simBoard) sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, theme); return performance.now() - a }
  for (const s of simBoardSims) { simReset(s); s.stepsTaken = 0 }
  const mountMs = frameAt(T), steps = simBoardSims.map(s => s.stepsTaken)
  const frameMs = median(Array.from({ length: RUNS }, (_, i) => frameAt(T + (i + 1) / 30)))
  return { t: T, mountMs, frameMs, steps }
})
console.log(`
Sim board cold start (checkpoints dropped; frame = median of ${RUNS} at 30 fps after mount)`)
for (const r of simRows) console.log(`  t=${lpad(r.t, 5)} s   mount ${lpad(f(r.mountMs), 7)} ms (${r.steps.join('/')} steps)   frame ${lpad(f(r.frameMs), 6)} ms`)

// P5-A WebGL2: frame rates need a browser, so they come from the last `npx tsx scripts/webgl.ts [--swiftshader]` run
type GLPerf = { kind: string; dots: number; fps: number; cpuMsPerFrame: number; gpuMsPerFrame: number; syncMsPerFrame: number | null }
for (const backend of ['gpu', 'swiftshader']) {
  const file = `.snapshots/p5a/report-${backend}.json`
  if (!existsSync(file)) { console.log(`\nWebGL2 (${backend}): no ${file} yet — run npx tsx scripts/webgl.ts${backend === 'gpu' ? '' : ' --swiftshader'}`); continue }
  const r = JSON.parse(readFileSync(file, 'utf8')) as { info?: { renderer?: string }; perf?: GLPerf[] }
  console.log(`\nWebGL2 (${backend}: ${r.info?.renderer ?? '?'}) — gates: 500k IR dots and 100k CPU dots at 60 fps (16.7 ms)`)
  for (const p of r.perf ?? []) console.log(`  ${pad(p.kind, 7)} ${lpad(p.dots, 7)} dots   ${lpad(p.fps, 6)} fps rAF   main ${lpad(p.cpuMsPerFrame, 7)} ms   GPU ${lpad(p.gpuMsPerFrame ?? '-', 7)} ms   sync ${lpad(p.syncMsPerFrame ?? '-', 7)} ms`)
}

mkdirSync('.snapshots', { recursive: true })
writeFileSync('.snapshots/bench.json', JSON.stringify({ runs: RUNS, budget: BUDGET, boards: boardRows, cards: sorted, simColdStart: simRows }, null, 1))
const failing = boardRows.filter(r => r.over.length)
console.log(`\n${failing.length}/${boardRows.length} boards over budget${strict ? '' : ' (report only; --strict to fail)'} — .snapshots/bench.json`)
if (strict && failing.length) process.exit(1)
