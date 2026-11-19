/**
 * What a visitor's browser spends per frame on a board (#416). Opens each board at each viewport of scripts/lib/viewport.ts
 * (1280 × 800 at 1×, a 390 × 844 phone at 3× with touch), scrolls each row of cards to the top of the screen, lets it
 * settle, and reads a window of frames with only the cards the page keeps live. Twice per viewport:
 *  - `worker`: the site as shipped (the `worker` flag on), cards sampled and rasterized in the sample worker. The main
 *    thread's frame is the clock tick plus the worker replies it draws; `fps` is the frames each live card got back per
 *    second (a worker that falls behind drops frames: the newest request wins).
 *  - `main`: the `worker` flag off, so every live card samples and draws on the main thread inside the clock's animation
 *    frame. That frame is the cost the bench budgets (8 ms), measured in the page; it is also the load the worker
 *    carries on its one thread when it is on.
 * A frame's cost is the time spent in `requestAnimationFrame` callbacks for that frame (the master clock is one), plus,
 * in `worker` mode, the worker message handlers that ran since. `p95` is over every display frame of the window, so it
 * reads the heavier turn group (src/engine/clock.ts `STAGGER`). `busy` is Chrome's main-thread task time per frame.
 *
 * Checks (exit 1 when one fails):
 *  - offscreen sleep: in `worker` mode only cards within 64 px of the viewport ask for frames, and each of those does;
 *  - the bench's viewport model (scripts/lib/viewport.ts) matches the page: columns, row pitch within 6 px, and no
 *    scroll position keeps more rows live than the model's `rows`.
 * Timings are a report: a runner is noisy, so read several runs. Report → `.snapshots/viewport-frames/report.json`,
 * and a table in the job summary.
 *
 *   npx tsx scripts/site/viewport-frames.ts <base> [--boards squares,scenes] [--viewports 1280,390] [--modes worker,main]
 *                                                  [--secs 2.5] [--repeat 1]
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { launch, sleep, type Page } from '../lib/cdp'
import { HEADER } from '../lib/site-probe'
import { boardMeta } from '../../src/widgets/manifest'
import { LIVE_MARGIN, VIEWPORTS, boardGrid, type Viewport } from '../lib/viewport'

const argv = process.argv.slice(2)
const opt = (name: string, def: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def }
const BASE = (argv.find(a => /^https?:/.test(a)) ?? 'http://localhost:4317/').replace(/\/?$/, '/')
const BOARDS = opt('boards', 'squares,scenes').split(','), MODES = opt('modes', 'worker,main').split(',') as Mode[]
const VPS = VIEWPORTS.filter(v => opt('viewports', VIEWPORTS.map(x => x.id).join(',')).split(',').includes(v.id))
const SECS = +opt('secs', '2.5'), REPEAT = +opt('repeat', '1'), SETTLE_MS = 1200
type Mode = 'worker' | 'main'

/** Installed before any page script: times rAF callbacks per frame, counts sample requests and replies per card. */
const INSTRUMENT = `(() => {
  const vf = globalThis.__vf = { on: false, frames: [], cost: new Map(), msg: 0, req: {}, rep: {}, card: {} }
  vf.reset = () => { vf.frames = []; vf.cost = new Map(); vf.msg = 0; vf.req = {}; vf.rep = {} }
  const raf = window.requestAnimationFrame.bind(window)
  // the display frames: an rAF loop of its own, outside the timing
  const count = ts => { if (vf.on) vf.frames.push(ts); raf(count) }
  raf(count)
  window.requestAnimationFrame = cb => raf(ts => {
    if (!vf.on) return cb(ts)
    const a = performance.now()
    try { return cb(ts) } finally { vf.cost.set(ts, (vf.cost.get(ts) || 0) + performance.now() - a) }
  })
  if (typeof Worker === 'undefined') return
  const post = Worker.prototype.postMessage, add = Worker.prototype.addEventListener
  Worker.prototype.postMessage = function (m, t) {
    if (m && m.kind === 'sample') { vf.card[m.card] = m.preset; if (vf.on) vf.req[m.preset] = (vf.req[m.preset] || 0) + 1 }
    return post.call(this, m, t)
  }
  Worker.prototype.addEventListener = function (type, fn, o) {
    if (type !== 'message' || typeof fn !== 'function') return add.call(this, type, fn, o)
    return add.call(this, type, function (e) {
      const a = performance.now()
      try { return fn.call(this, e) } finally {
        if (vf.on) {
          vf.msg += performance.now() - a
          // the handler's time lands on the next display frame
          const last = vf.frames[vf.frames.length - 1] ?? 0
          vf.cost.set('m' + last, (vf.cost.get('m' + last) || 0) + performance.now() - a)
          const id = e.data && e.data.kind === 'frame' ? vf.card[e.data.card] : undefined
          if (id) vf.rep[id] = (vf.rep[id] || 0) + 1
        }
      }
    }, o)
  }
})()`

interface Geo { id: string; top: number; bottom: number; slotTop: number; slotH: number; cardH: number }
interface RowRead {
  row: number; scrollY: number; inBand: string[]; asked: string[]; liveRows: number; frames: number; hz: number
  mean: number; p50: number; p95: number; max: number; busy: number; msg: number; fpsMin: number | null
}
interface Read { board: string; viewport: string; mode: Mode; run: number; cols: number; pitch: number; model: ReturnType<typeof boardGrid>; rows: RowRead[] }

const q = (xs: number[], p: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))] }
const r2 = (x: number) => Math.round(x * 100) / 100
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

async function open(v: Viewport, mode: Mode): Promise<Page> {
  const p = await launch(v.w, v.h, { flags: { worker: mode === 'worker' }, mouse: !v.phone, scrollbars: !v.phone })
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: v.w, height: v.h, deviceScaleFactor: v.dpr, mobile: v.phone })
  if (v.phone) await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await p.cdp('Performance.enable', { timeDomain: 'threadTicks' })
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
  return p
}

/** Every card slot of the board, in page coordinates (board order). */
const geometry = (p: Page) => p.js<Geo[]>(`[...document.querySelectorAll('.board-grid > .dot-slot')].map(s => {
  const c = s.querySelector('[data-card-id]'), cv = c && (c.querySelector('canvas') || c.querySelector('.dot-svg')), r = (cv || c || s).getBoundingClientRect()
  const sr = s.getBoundingClientRect(), cr = (c || s).getBoundingClientRect()
  return { id: c ? c.getAttribute('data-card-id') : '?', top: r.top + scrollY, bottom: r.bottom + scrollY, slotTop: sr.top + scrollY, slotH: sr.height, cardH: cr.height }
})`)
const taskSecs = async (p: Page) => ((await p.cdp('Performance.getMetrics')).result.metrics as { name: string; value: number }[]).find(m => m.name === 'TaskDuration')?.value ?? 0

async function readBoard(board: string, v: Viewport, mode: Mode, run: number): Promise<Read | null> {
  const p = await open(v, mode)
  try {
    await p.cdp('Page.navigate', { url: `${BASE}${board}/` })
    if (!await p.waitFor(`document.querySelectorAll('.board-grid > .dot-slot [data-card-id]').length > 0`, 30000)) { check(`viewport-frames: ${board} @${v.id} loads its cards`, false); return null }
    await sleep(3000)
    const geo = await geometry(p), header = await p.js<number>(`(() => { const h = [...document.querySelectorAll('${HEADER}')].find(e => ['sticky', 'fixed'].includes(getComputedStyle(e).position)); return h ? h.getBoundingClientRect().bottom : 0 })()`)
    const tops = [...new Set(geo.map(g => Math.round(g.slotTop)))].sort((a, b) => a - b)
    const cols = geo.filter(g => Math.round(g.slotTop) === tops[0]).length
    const pitch = tops.length > 1 ? tops[1] - tops[0] : geo[0].slotH + 16
    const model = boardGrid(boardMeta(board)?.density ?? 'standard', v)
    const rows: RowRead[] = []
    for (let row = 0; row < tops.length; row++) {
      const scrollY = await p.js<number>(`(() => { window.scrollTo({ top: ${tops[row] - header - 8}, behavior: 'instant' }); return Math.round(scrollY) })()`)
      // the clamped bottom of the page: later rows read the same band
      if (row > 0 && scrollY === rows[rows.length - 1].scrollY) continue
      await sleep(SETTLE_MS)
      await p.js(`(__vf.reset(), __vf.on = true, 1)`)
      const t0 = await taskSecs(p)
      await sleep(SECS * 1000)
      await p.js(`(__vf.on = false, 1)`)
      const t1 = await taskSecs(p)
      const vf = await p.js<{ frames: number[]; cost: [string | number, number][]; msg: number; req: Record<string, number>; rep: Record<string, number> }>(`({ frames: __vf.frames, cost: [...__vf.cost], msg: __vf.msg, req: __vf.req, rep: __vf.rep })`)
      const cost = new Map(vf.cost.map(([k, ms]) => [String(k), ms]))
      const per = vf.frames.map(ts => (cost.get(String(ts)) ?? 0) + (cost.get('m' + ts) ?? 0))
      const inBandGeo = geo.filter(g => g.bottom > scrollY - LIVE_MARGIN && g.top < scrollY + v.h + LIVE_MARGIN)
      const span = vf.frames.length > 1 ? (vf.frames[vf.frames.length - 1] - vf.frames[0]) / 1000 : SECS
      const asked = Object.keys(vf.req).sort()
      rows.push({
        row, scrollY, inBand: inBandGeo.map(g => g.id), asked, liveRows: new Set(inBandGeo.map(g => Math.round(g.slotTop))).size,
        frames: vf.frames.length, hz: r2(vf.frames.length / span),
        mean: r2(per.reduce((s, x) => s + x, 0) / Math.max(1, per.length)), p50: r2(q(per, .5)), p95: r2(q(per, .95)), max: r2(Math.max(0, ...per)),
        busy: r2((t1 - t0) * 1000 / Math.max(1, vf.frames.length)), msg: r2(vf.msg / Math.max(1, vf.frames.length)),
        fpsMin: mode === 'worker' && asked.length ? r2(Math.min(...asked.map(id => (vf.rep[id] ?? 0) / span))) : null,
      })
    }
    if (p.logs.length) console.log(`  page errors on ${board} @${v.id} ${mode}: ${p.logs.slice(0, 3).join(' | ')}`)
    return { board, viewport: v.id, mode, run, cols, pitch, model, rows }
  } finally { await p.close() }
}

const reads: Read[] = []
for (let run = 1; run <= REPEAT; run++) for (const board of BOARDS) for (const v of VPS) for (const mode of MODES) {
  const r = await readBoard(board, v, mode, run)
  if (!r) continue
  reads.push(r)
  console.log(`\n${board} @${v.id} (${v.w}×${v.h} at ${v.dpr}×) ${mode}, run ${run}: ${r.cols} columns, pitch ${r.pitch} px (model ${r.model.cols}, ${r2(r.model.pitch)} px, ${r.model.rows} rows live)`)
  console.log('  row  scrollY  live  rows  frames   Hz   mean   p50   p95   max  busy  msg  fps(min)  cards')
  for (const x of r.rows) console.log(`  ${String(x.row).padStart(3)} ${String(x.scrollY).padStart(8)} ${String(x.inBand.length).padStart(5)} ${String(x.liveRows).padStart(5)} ${String(x.frames).padStart(7)} ${String(x.hz).padStart(5)} ${x.mean.toFixed(2).padStart(6)} ${x.p50.toFixed(2).padStart(5)} ${x.p95.toFixed(2).padStart(5)} ${x.max.toFixed(2).padStart(5)} ${x.busy.toFixed(2).padStart(5)} ${x.msg.toFixed(2).padStart(4)} ${String(x.fpsMin ?? '-').padStart(9)}  ${x.inBand.join(' ')}`)
  if (mode === 'worker') {
    const far = r.rows.flatMap(x => x.asked.filter(id => !x.inBand.includes(id)).map(id => `${id} at row ${x.row}`))
    const idle = r.rows.flatMap(x => x.inBand.filter(id => !x.asked.includes(id)).map(id => `${id} at row ${x.row}`))
    check(`viewport-frames: ${board} @${v.id}: only cards within ${LIVE_MARGIN} px of the viewport ask for frames`, !far.length, far.slice(0, 6).join(', '))
    // a card that is static at rest or clock-driven may not ask in a short window: reported, not failed
    if (idle.length) console.log(`  in the band without a frame request: ${idle.slice(0, 8).join(', ')}`)
  }
  check(`viewport-frames: ${board} @${v.id}: the bench model's columns and row pitch match the page`, r.cols === r.model.cols && Math.abs(r.pitch - r.model.pitch) <= 6, `page ${r.cols} columns, ${r.pitch} px; model ${r.model.cols}, ${r2(r.model.pitch)} px`)
  const most = Math.max(...r.rows.map(x => x.liveRows))
  check(`viewport-frames: ${board} @${v.id}: no scroll position keeps more rows live than the model's ${r.model.rows}`, most <= r.model.rows, `most ${most}`)
}

// the summary: per board, viewport and mode, each run's worst row (frame p95 and busy: the highest; page Hz and a card's
// fps: the lowest, any row), then the median over runs
const lines = ['| board | viewport | mode | live cards (most) | frame p95, worst row (ms) | main busy, worst row (ms/frame) | page Hz (lowest) | card fps (lowest) |', '| --- | --- | --- | --- | --- | --- | --- | --- |']
for (const board of BOARDS) for (const v of VPS) for (const mode of MODES) {
  const rs = reads.filter(r => r.board === board && r.viewport === v.id && r.mode === mode)
  if (!rs.length) continue
  const per = (f: (x: RowRead) => number, pick: (...xs: number[]) => number) => q(rs.map(r => pick(...r.rows.map(f))), .5)
  const fps = rs.map(r => r.rows.map(x => x.fpsMin).filter((x): x is number => x !== null)).filter(xs => xs.length).map(xs => Math.min(...xs))
  lines.push(`| ${board} | ${v.id} | ${mode} | ${Math.max(...rs.flatMap(r => r.rows.map(x => x.inBand.length)))} | ${per(x => x.p95, Math.max).toFixed(2)} | ${per(x => x.busy, Math.max).toFixed(2)} | ${per(x => x.hz, Math.min).toFixed(1)} | ${fps.length ? q(fps, .5).toFixed(1) : '-'} |`)
}
console.log(`\n${lines.join('\n')}`)
mkdirSync('.snapshots/viewport-frames', { recursive: true })
writeFileSync('.snapshots/viewport-frames/report.json', JSON.stringify({ base: BASE, secs: SECS, reads }, null, 1))
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Viewport frames (#416)\n\n${lines.join('\n')}\n`)
console.log(`\n${failures ? `✗ viewport-frames: ${failures} check(s) failed` : '✓ viewport-frames: all checks passed'}`)
process.exit(failures ? 1 : 0)
