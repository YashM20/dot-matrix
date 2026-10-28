/**
 * Squares renderer parity probe (docs/living-matter/Q-squares.md §2.8), headless Chrome over CDP, no npm deps. Its own
 * harness (the pattern of `scripts/webgl.ts`, which it never edits). For each squares card at t ∈ {0, 1.3}, px 2:
 * Canvas from DotInstance[] (the reference), Canvas from a DotBuffer, WebGL2, SVG through an <img>, and the CPU
 * reference (`insideJoined`, 4×4 supersampled).
 *
 *   gates: pixel parity of every renderer vs Canvas(array) (mean Δ ≤ 2/255, ≤ 2.5% px off by > 16, PSNR ≥ 32 dB);
 *          no crack: along every boundary between FULL joined cells the darkest luma ≥ interior − 3/255 (Canvas,
 *          WebGL) or − 6/255 (SVG, bleed); no double blend: at opacity .5 the brightest ≤ interior + 3/255;
 *          the first join frame falls back to Canvas (the GL hook is lazy), the next one draws on WebGL2
 *
 *   npx tsx scripts/squares-browser.ts                 # default GPU path
 *   npx tsx scripts/squares-browser.ts --swiftshader   # software rasterizer
 * PNGs (each renderer, diff ×4) and `report-<backend>.json` in `.snapshots/squares/`. Exit 1 when a gate fails.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2), swift = args.includes('--swiftshader'), backend = swift ? 'swiftshader' : 'gpu'
const OUT = '.snapshots/squares'
mkdirSync(OUT, { recursive: true })
const TOL = { pixelMean: 2, pixelOver16: 2.5, psnr: 32, crack: 3, crackSvg: 6, blend: 3 }
const CARDS = ['sq-tetris', 'sq-quads', 'sq-blob', 'sq-gameboy']

execFileSync('npx', ['esbuild', 'scripts/lib/squares-page.ts', '--bundle', '--format=iife', '--platform=browser', '--target=es2022', `--outfile=${OUT}/page.js`, '--log-level=warning'], { stdio: 'inherit', shell: true })
const html = join(OUT, 'page.html')
writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000"><script>${readFileSync(join(OUT, 'page.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script></body></html>`)

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-sq-'))
const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=900,900', ...(swift ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11']), 'about:blank']
const proc = spawn(chrome, flags, { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 150 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>(), logs: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const run = async (expr: string) => {
  const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
const png = (name: string, dataUrl: string) => writeFileSync(join(OUT, name), Buffer.from(dataUrl.split(',')[1], 'base64'))
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const report: Record<string, unknown> = { backend }

try {
  await cdp('Runtime.enable'); await cdp('Page.enable')
  await cdp('Page.navigate', { url: pathToFileURL(html).href })
  for (let i = 0; i < 80 && !(await run('!!window.SQ').catch(() => false)); i++) await sleep(100)
  const info = await run('SQ.info()')
  report.info = info
  console.log(`WebGL2: ${JSON.stringify(info)}`)
  const lazy = await run('SQ.loadGL()')
  report.lazy = lazy
  check('squares-browser: webgl (the first join frame falls back to Canvas while the GL hook loads; the next draws on WebGL2)', !info.webgl2 || (lazy.firstFellBack && lazy.thenGL), JSON.stringify(lazy))

  const rows: unknown[] = []
  for (const id of CARDS) for (const t of [0, 1.3]) {
    const r = await run(`SQ.card(${JSON.stringify(id)}, ${t}, 2)`)
    const tag = `${id}-t${t}`
    png(`${tag}-canvas.png`, r.canvas)
    const row: Record<string, unknown> = { id, t, dots: r.dots, joined: r.joined, gl: r.gl }
    for (const name of ['buffer', 'webgl', 'svg', 'cpu']) {
      const m = r[name]
      png(`${tag}-${name}.png`, m.png); png(`${tag}-${name}-diff.png`, m.diff)
      row[name] = { mean: m.mean, over16: m.over16, psnr: m.psnr, max: m.max }
      const skip = name === 'webgl' && !info.webgl2
      check(`pixels ${tag}: ${name} vs Canvas(array) @2×`, skip || (m.mean <= TOL.pixelMean && m.over16 <= TOL.pixelOver16 && m.psnr >= TOL.psnr) && (name !== 'webgl' || r.gl),
        `mean ${m.mean}/255, ${m.over16}% px > 16, PSNR ${m.psnr} dB, max ${m.max}${name === 'webgl' ? `, drawn on GL ${r.gl}` : ''}`)
    }
    rows.push(row)
  }
  report.pixels = rows

  const cracks = await run('SQ.cracks(2)') as { k: number; opacity: number; gl: boolean; canvas: { crack: number; blend: number }; webgl: { crack: number; blend: number }; svg: { crack: number; blend: number } }[]
  report.cracks = cracks
  const worst = { canvas: 0, webgl: 0, svg: 0 }, worstBlend = { canvas: 0, webgl: 0, svg: 0 }
  for (const c of cracks) for (const name of ['canvas', 'webgl', 'svg'] as const) {
    if (name === 'webgl' && !c.gl) continue
    worst[name] = Math.max(worst[name], c[name].crack)
    if (c.opacity < 1) worstBlend[name] = Math.max(worstBlend[name], c[name].blend)
  }
  check('squares-browser: no crack (FULL joined boundaries: Canvas, WebGL ≥ interior − 3/255; SVG − 6/255; k = 1, 2, 3; opacity 1 and .5)',
    worst.canvas <= TOL.crack && worst.webgl <= TOL.crack && worst.svg <= TOL.crackSvg, `worst crack /255: canvas ${worst.canvas}, webgl ${worst.webgl}, svg ${worst.svg}`)
  check('squares-browser: no double blend (opacity .5: boundary ≤ interior + 3/255)', worstBlend.canvas <= TOL.blend && worstBlend.webgl <= TOL.blend && worstBlend.svg <= TOL.blend,
    `worst /255: canvas ${worstBlend.canvas}, webgl ${worstBlend.webgl}, svg ${worstBlend.svg}`)

  if (logs.length) console.log(logs.slice(0, 8).join('\n'))
} catch (e) {
  console.log(`✗ ${(e as Error).message}`); failures++
  if (logs.length) console.log(logs.slice(0, 8).join('\n'))
} finally {
  writeFileSync(join(OUT, `report-${backend}.json`), JSON.stringify(report, null, 1))
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome still holds it */ }
}
console.log(failures ? `${failures} failed` : 'all squares browser checks passed')
process.exit(failures ? 1 : 0)
