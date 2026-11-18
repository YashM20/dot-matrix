/**
 * Per-card frame cost in a real Chrome (#416): sample and Canvas draw timed apart, for the cards of the given boards, at
 * the backing scale of each viewport in scripts/lib/viewport.ts (the board's card width there, times its device pixel
 * ratio). `pnpm bench` times the sample only, in Node; the site also draws every frame (on the main thread, or in the
 * sample worker on an `OffscreenCanvas`), and a card whose draw costs more than its sample shows only here.
 * Runs `SQ.time` of scripts/lib/squares-page.ts (bundled by esbuild). A report, never fails on a timing.
 *
 *   npx tsx scripts/card-time-browser.ts [--boards squares,scenes] [--frames 48] [--warm 6]
 * Report → `.snapshots/card-time/report.json`, and a table in the job summary.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { launch } from './lib/cdp'
import { VIEWPORTS, boardGrid } from './lib/viewport'
import { boards } from '../src/widgets'

const argv = process.argv.slice(2)
const opt = (name: string, def: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def }
const BOARDS = opt('boards', 'squares,scenes').split(','), FRAMES = +opt('frames', '48'), WARM = +opt('warm', '6')
const OUT = '.snapshots/card-time'
mkdirSync(OUT, { recursive: true })
execFileSync('pnpm', ['exec', 'esbuild', 'scripts/lib/squares-page.ts', '--bundle', '--format=iife', '--platform=browser', '--target=es2022', `--outfile=${OUT}/page.js`, '--log-level=warning'], { stdio: 'inherit', shell: true })
const html = resolve(OUT, 'page.html')
writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>${readFileSync(join(OUT, 'page.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script></body></html>`)

interface Time { id: string; scale: number; dots: number; sample: number; sample95: number; draw: number; draw95: number }
const p = await launch(900, 900, { testHooks: false })
const rows: (Time & { board: string; viewport: string })[] = []
try {
  await p.cdp('Page.navigate', { url: pathToFileURL(html).href })
  if (!await p.waitFor('!!window.SQ', 30000)) throw new Error('the timing page did not load')
  for (const id of BOARDS) {
    const b = boards.find(x => x.id === id)
    if (!b) { console.log(`no board ${id}`); continue }
    for (const v of VIEWPORTS) {
      const css = Math.round(boardGrid(b.density ?? 'standard', v).card)
      console.log(`\n${id} @${v.id}: card ${css} px at ${v.dpr}×, ${FRAMES} frames after ${WARM} s (ms: sample median / p95, draw median / p95)`)
      for (const c of b.items.filter(c => c.animated)) {
        const r = await p.js<Time>(`SQ.time(${JSON.stringify(c.id)}, ${FRAMES}, ${WARM}, ${css}, ${v.dpr})`, 300_000)
        rows.push({ ...r, board: id, viewport: v.id })
        console.log(`  ${r.id.padEnd(14)} ×${String(r.scale).padEnd(4)} ${String(r.dots).padStart(6)} dots  sample ${r.sample.toFixed(2).padStart(6)} / ${r.sample95.toFixed(2).padStart(6)}  draw ${r.draw.toFixed(2).padStart(7)} / ${r.draw95.toFixed(2).padStart(7)}`)
      }
    }
  }
  if (p.logs.length) console.log(p.logs.slice(0, 6).join('\n'))
} finally { await p.close() }
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ frames: FRAMES, warm: WARM, rows }, null, 1))
const md = ['| board | viewport | card | scale | sample (ms) | draw (ms) | draw p95 (ms) |', '| --- | --- | --- | --- | --- | --- | --- |', ...rows.map(r => `| ${r.board} | ${r.viewport} | \`${r.id}\` | ${r.scale} | ${r.sample} | ${r.draw} | ${r.draw95} |`)]
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n### Card frame cost in Chrome (#416)\n\n${md.join('\n')}\n`)
