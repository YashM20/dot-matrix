/**
 * WebGL2 renderer checks in headless Chrome (CDP over Node's built-in WebSocket, no npm deps):
 *   1. GPU ≡ JS IR parity: the 20 `IR_TEST_FIELDS` × 3 envs over 48×48, GPU value readback vs `compileJS`; then the
 *      noise row, the IR noise pack's `IR_NOISE_FIELDS` (scripts/noise.ts) under its own gate (flips ≤ 0.5%).
 *   2. Pixel parity: presets drawn by canvas 2D vs WebGL2 (explicit dots), and the GPU board's passes at
 *      density 1 vs the CPU sample. PNGs (canvas / webgl / diff×4) in `.snapshots/p5a/`.
 *   3. Context loss + restore.
 *   4. Frame rate: 500k GPU IR dots, 100k CPU dots (value texture, instance buffer, canvas 2D).
 *
 *   npx tsx scripts/webgl.ts                 # default GPU path (ANGLE → the machine's GPU when headless has one)
 *   npx tsx scripts/webgl.ts --swiftshader   # force the software rasterizer
 *   npx tsx scripts/webgl.ts --no-perf       # skip the frame-rate probes
 *   npx tsx scripts/webgl.ts --fields f.json # IR parity over the fields in f.json ({ name: source }) instead of IR_TEST_FIELDS
 *   npx tsx scripts/webgl.ts --no-noise      # skip the IR noise row
 *   npx tsx scripts/webgl.ts --canvas        # also time the same 100k dots on canvas 2D (slow: ~30 s a frame here)
 * Writes `.snapshots/p5a/report-<backend>.json`. Exit 1 when a parity check fails. Chrome: $CHROME or the usual paths.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { IR_TEST_FIELDS } from './ir'
import { IR_NOISE_FIELDS } from './noise'

const args = process.argv.slice(2), swift = args.includes('--swiftshader'), backend = swift ? 'swiftshader' : 'gpu'
const OUT = '.snapshots/p5a'
mkdirSync(OUT, { recursive: true })
/** Tolerances (documented in DESIGN.md › renderer rule). */
// pixels: Skia under-covers sub-pixel circles (probe: canvas draws 96% of the exact area at r = 2 px, 79% at 0.6 px; WebGL 100–109%),
// so cards built from sub-2px dots read a few % heavier on WebGL; the gate bounds that, not a bias in the shapes
const TOL = { irAbs: 1e-3, noiseFlips: .005, pixelMean: 2, pixelOver16: 2.5, psnr: 32 }

// esbuild ships with the toolchain (tsx/vite) but is not a direct dependency: call its binary
execFileSync('npx', ['esbuild', 'scripts/lib/webgl-page.ts', '--bundle', '--format=iife', '--platform=browser', '--target=es2022', `--outfile=${OUT}/page.js`, '--log-level=warning'], { stdio: 'inherit', shell: true })
const html = join(OUT, 'page.html')
writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#000"><script>${readFileSync(join(OUT, 'page.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script></body></html>`)

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-p5a-'))
const flags = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1100,1100', ...(swift ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11']), 'about:blank']
const proc = spawn(chrome, flags, { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
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
  await cdp('Runtime.enable')
  await cdp('Page.enable')
  await cdp('Page.navigate', { url: pathToFileURL(html).href })
  for (let i = 0; i < 50 && !(await run('!!window.P5').catch(() => false)); i++) await sleep(100)
  const info = await run('P5.info()')
  report.info = info
  console.log(`WebGL2: ${JSON.stringify(info)}`)
  if (!info.webgl2) throw new Error('no WebGL2 in this Chrome')

  // 0. single-shape probes: ink ratio (WebGL / canvas) per shape, size and opacity
  const probe = (shape: string, r: number, opacity: number, roundness = .1) => {
    const dots = Array.from({ length: 64 }, (_, i) => ({ x: 12 + (i % 8) * 25, y: 12 + Math.floor(i / 8) * 25, r, opacity, color: '#8A8F98', shape, roundness }))
    return run(`P5.dotsParity(${JSON.stringify(dots)}, 200, 200, 2)`)
  }
  const probes: string[] = []
  for (const [shape, r, o, rr] of [['circle', 8, 1], ['circle', 1, 1], ['circle', .3, 1], ['circle', .1, 1], ['squircle', 1, 1, .1], ['squircle', 1, .4, .1], ['squircle', 1.5, 1, .25], ['squircle', 1.5, 1, .5], ['square', 1, 1]] as const) {
    const q = await probe(shape, r, o, rr)
    const exact = 64 * (shape === 'square' ? 4 : Math.PI) * (2 * r) ** 2 * 376 * o
    probes.push(`${shape}${rr !== undefined ? `(${rr})` : ''} r=${r} a=${o}: webgl/canvas ${q.ink}, canvas/exact ${(q.inkA / exact).toFixed(3)}, webgl/exact ${(q.inkB / exact).toFixed(3)}`)
  }
  report.probes = probes
  console.log(`  shape probes @2× (ink = WebGL / canvas): ${probes.join(' | ')}`)

  // 1. IR parity
  const fi = args.indexOf("--fields"), fields = fi >= 0 ? JSON.parse(readFileSync(args[fi + 1], "utf8")) as Record<string, string> : IR_TEST_FIELDS
  const ir = await run(`P5.irParity(${JSON.stringify(fields)}, ${TOL.irAbs})`) as { name: string; maxAbs: number; maxSmooth: number; flips: number; nanMismatch: number; worstAt: string; error?: string }[]
  report.ir = ir
  const cells = 3 * 48 * 48
  for (const r of ir) if (r.error || r.maxAbs > TOL.irAbs || r.nanMismatch) console.log(`  ${r.name}: max ${r.maxAbs.toExponential(2)}, smooth ${r.maxSmooth.toExponential(2)}, ${r.flips}/${cells} discontinuity flips, nan≠ ${r.nanMismatch} ${r.error ?? r.worstAt}`)
  const smooth = Math.max(...ir.map(r => r.maxSmooth)), flips = ir.reduce((n, r) => n + r.flips, 0)
  check(`IR parity: ${ir.length} fields × 3 envs × 48², GPU (float32) readback vs JS (float64)`, ir.every(r => !r.error && r.maxSmooth <= TOL.irAbs && !r.nanMismatch && r.flips <= cells * .01),
    `max |Δ| ${smooth.toExponential(2)} off discontinuities; ${flips} of ${ir.length * cells} cells flip at an exact jump (${ir.filter(r => r.flips).map(r => `${r.name} ${r.flips}`).join(', ') || 'none'})`)

  // 1b. the IR noise pack (scripts/noise.ts IR_NOISE_FIELDS): float32 lattice floors flip at cell lines, so the gate is
  // max |Δ| ≤ 1e-3 off those lines and at most 0.5% of cells flipping (docs/living-matter/F0-foundation.md F0.4)
  if (!args.includes('--no-noise')) {
    const nr = await run(`P5.irParity(${JSON.stringify(IR_NOISE_FIELDS)}, ${TOL.irAbs})`) as typeof ir
    report.irNoise = nr
    for (const r of nr) if (r.error || r.maxSmooth > TOL.irAbs || r.nanMismatch || r.flips > cells * TOL.noiseFlips) console.log(`  ${r.name}: max ${r.maxAbs.toExponential(2)}, smooth ${r.maxSmooth.toExponential(2)}, ${r.flips}/${cells} flips, nan≠ ${r.nanMismatch} ${r.error ?? r.worstAt}`)
    const nSmooth = Math.max(...nr.map(r => r.maxSmooth)), nFlips = nr.reduce((n, r) => n + r.flips, 0)
    check(`IR noise parity: ${nr.length} noise fields × 3 envs × 48², GPU (float32) vs JS (float64), flips ≤ 0.5%`, nr.every(r => !r.error && r.maxSmooth <= TOL.irAbs && !r.nanMismatch && r.flips <= cells * TOL.noiseFlips),
      `max |Δ| ${nSmooth.toExponential(2)} off lattice lines; ${nFlips} of ${nr.length * cells} cells flip (${(100 * nFlips / (nr.length * cells)).toFixed(3)}%; ${nr.filter(r => r.flips).map(r => `${r.name} ${r.flips}`).join(', ') || 'none'})`)
  }

  if (args.includes("--ir-only")) throw new Error("--ir-only: stopped after IR parity")
  // 2. pixel parity
  const presets: [string, number, number?][] = [['ir-plasma', 1.3], ['ir-dial', 0], ['level-03', 0], ['ui-knob', 0], ['afterlight', 0], ['gpu-plasma', 1.3, 1], ['gpu-starfield', 1.3, 1], ['gpu-moire', 1.3, 1]]
  const px: unknown[] = []
  for (const [id, t, density] of presets) {
    const r = await run(`P5.presetParity(${JSON.stringify(id)}, ${t}, 2, ${density ?? 'undefined'})`)
    const tag = density === undefined ? id : `${id}-pass-d1`
    png(`${tag}-canvas.png`, r.canvas); png(`${tag}-webgl.png`, r.webgl); png(`${tag}-diff.png`, r.diff)
    const { canvas: _a, webgl: _b, diff: _c, ...rest } = r
    px.push(rest)
    // under --swiftshader the canvas reference is software Skia too, which under-covers small dots further (probe: 88% at r = 2 px): report only
    check(`pixels ${tag}: canvas vs WebGL2 @2×${swift ? " (report only)" : ""}`, r.ok && (swift || r.mean <= TOL.pixelMean && r.over16 <= TOL.pixelOver16 && r.psnr >= TOL.psnr), `mean ${r.mean}/255, ${r.over16}% px off by >16, PSNR ${r.psnr} dB, max ${r.max}, ink ${r.ink}, ${r.dots} dots${r.passes.length ? `, passes ${r.passes}` : ''}`)
  }
  report.pixels = px
  for (const id of ['gpu-plasma', 'gpu-starfield', 'gpu-moire']) {
    const r = await run(`P5.gpuShot(${JSON.stringify(id)}, 2.5, 3)`)
    png(`${id}-gpu.png`, r.png)
    check(`${id} at authored density`, r.ok, `${r.dots} GPU dots → ${OUT}/${id}-gpu.png`)
  }

  // 3. context loss
  const loss = await run('P5.contextLoss()')
  report.contextLoss = loss
  check('context loss: render refuses while lost, works after restore', !loss.supported || (loss.before && !loss.during && loss.after && loss.centrePixel > 200), JSON.stringify(loss))

  // 4. perf
  if (!args.includes('--no-perf')) {
    const perf: unknown[] = []
    for (const [kind, side] of [['ir', 708], ['values', 317], ['table', 317], ['dots', 317], ...(args.includes('--canvas') ? [['canvas', 317]] : [])] as const) {
      const r = await run(`P5.perf(${JSON.stringify(kind)}, ${side}, 3)`)
      perf.push(r)
      console.log(`  perf ${kind.padEnd(6)} ${String(r.dots).padStart(7)} dots: ${r.fps} fps (rAF), main thread ${r.cpuMsPerFrame} ms/frame, GPU ${r.gpuMsPerFrame} ms/frame (timer query, n=${r.gpuSamples}), forced-sync ${r.syncMsPerFrame} ms/frame`)
    }
    report.perf = perf
  }
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
console.log(failures ? `${failures} failed` : 'all webgl checks passed')
process.exit(failures ? 1 : 0)
