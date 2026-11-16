/**
 * C7 display skins in headless Chrome (CDP over Node's built-in WebSocket, no deps).
 *
 *   npx tsx scripts/skins-browser.ts [--url http://localhost:5204] [--boards mosaic,components,levels] [--skins all] [--perf mosaic] [--secs 4]
 *
 * 1. Screenshots: every board × skin (`?board=…&skin=…`, after the entrance and the power-on refresh) and a
 *    few frames of a live switch (OLED → CRT, CRT → NIXIE, NIXIE → OLED) → `.snapshots/c7/`.
 * 2. Perf: on the `--perf` board, the stage's own JS ms per card frame (frame copy + render, from the page's
 *    `__skinPerf` probe) and the main-thread busy ms per 12 fps tick (CPU profile) per skin vs OLED.
 * 3. Console errors / exceptions are listed. Needs the dev server running; Chrome from $CHROME or the usual paths.
 *
 *   npx tsx scripts/skins-browser.ts --fidelity   # no server: every display stage on a synthetic card
 *
 *    The skin list is OLED, NIXIE, VFD, CRT (#345) and OLED builds no stage. Each other stage lights a white block well
 *    above an unlit cell, keeps the red accent's hue (± 12°: the CRT passes it, VFD keeps it, Nixie passes the red
 *    column) and stops asking for frames once settled. Exit 1 when one fails; PNGs in .snapshots/c7/fidelity-*.png.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { pageSocket, startChrome } from './lib/chrome'

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const URL0 = arg('url', 'http://localhost:5204'), BOARDS = arg('boards', 'mosaic,components,levels').split(','), PERF = arg('perf', 'mosaic'), SECS = +arg('secs', '4')
const ALL = ['oled', 'nixie', 'vfd', 'crt']
const SKINS = arg('skins', 'all') === 'all' ? ALL : arg('skins', '').split(',')
const OUT = join(import.meta.dirname, '../.snapshots/c7')
mkdirSync(OUT, { recursive: true })

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME)'); process.exit(0) }
const { proc, port, profile } = await startChrome(chrome, ['--no-first-run', '--window-size=1400,1000', '--autoplay-policy=no-user-gesture-required', 'about:blank'], 'dot-skins-')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
const ws = new WebSocket(await pageSocket(port))
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>() // eslint-disable-line @typescript-eslint/no-explicit-any
const logs = new Set<string>()
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.add(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 200))
  if (m.method === 'Runtime.exceptionThrown') logs.add(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 200))
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) // eslint-disable-line @typescript-eslint/no-explicit-any
const evaluate = async <T,>(expression: string): Promise<T> => (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result.result.value as T
const shot = async (name: string) => {
  const r = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.result.data, 'base64'))
  console.log(`  .snapshots/c7/${name}.png`)
}
/** Wait (≤ 30 s) until the board's cards are mounted (lazy boards and a loaded machine make fixed sleeps flaky). */
const settled = async () => {
  for (let i = 0; i < 60; i++) { if (await evaluate<number>(`document.querySelectorAll('.dot-card canvas, .dot-card .dot-svg').length`) > 0) return; await sleep(500) }
}
await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Profiler.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false })

// --fidelity: every display stage on a synthetic card (esbuild page, file://), measured in pixels
if (process.argv.includes('--fidelity')) {
  execFileSync('npx', ['esbuild', 'scripts/lib/skins-page.ts', '--bundle', '--format=iife', '--platform=browser', '--target=es2022', `--outfile=${OUT}/skins-page.js`, '--log-level=warning'], { stdio: 'inherit', shell: true })
  const html = join(OUT, 'skins-page.html')
  writeFileSync(html, `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>${readFileSync(join(OUT, 'skins-page.js'), 'utf8').replace(/<\/script/gi, '<\\/script')}</script></body></html>`)
  await cdp('Page.navigate', { url: pathToFileURL(html).href })
  for (let i = 0; i < 80 && !(await evaluate<boolean>('!!window.SK').catch(() => false)); i++) await sleep(100)
  let fail = 0
  const ok = (name: string, cond: boolean, detail: string) => { if (!cond) fail++; console.log(`${cond ? '✓' : '✗'} ${name} — ${detail}`) }
  const hd = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  const L = (c: number[]) => .2126 * c[0] + .7152 * c[1] + .0722 * c[2]
  const names = await evaluate<string[]>('SK.names')
  ok('skins-browser: the skins are OLED, NIXIE, VFD, CRT in that order', names.join() === 'oled,nixie,vfd,crt', names.join())
  for (const skin of names) {
    type Got = { white: number[]; red: number[]; unlit: number[]; settled: boolean; redHue: number; accentHue: number; png: string } | null
    const g = await evaluate<Got>(`SK.stage(${JSON.stringify(skin)})`)
    if (skin === 'oled') { ok('skins-browser: oled builds no stage', g === null, String(g)); continue }
    if (!g) { ok(`skins-browser: ${skin} builds a stage`, false, 'null'); continue }
    ok(`skins-browser: ${skin} (white lit, unlit dark, accent hue kept, settles)`, L(g.white) > 100 && L(g.unlit) < L(g.white) / 3 && hd(g.redHue, g.accentHue) <= 12 && g.settled,
      `white ${g.white}, unlit ${g.unlit}, accent ${g.red} hue ${g.redHue.toFixed(1)}°/${g.accentHue.toFixed(1)}°, settled ${g.settled}`)
    writeFileSync(join(OUT, `fidelity-${skin}.png`), Buffer.from(g.png.split(',')[1], 'base64'))
  }
  for (const m of logs) console.log('  ' + m)
  ws.close(); proc.kill(); await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome still holds it */ }
  process.exit(fail ? 1 : 0)
}

// debug: `--page '?board=mosaic&skin=nixie' --wait 4000 --eval '<expr>' [--shot name]` → prints the value and exits
const EVAL = arg('eval-file', '') ? readFileSync(arg('eval-file', ''), 'utf8') : arg('eval', ''), PAGE = arg('page', '')
if (PAGE) {
  await cdp('Page.navigate', { url: `${URL0}/${PAGE}` }); await sleep(+arg('wait', '4000'))
  if (EVAL) console.log(JSON.stringify(await evaluate(EVAL), null, 1))
  if (arg('shot', '')) await shot(arg('shot', ''))
  for (const l of logs) console.log('  ' + l)
  ws.close(); proc.kill(); process.exit(0)
}

try {
  // warm the dev server's module graph (the first load is slow)
  await cdp('Page.navigate', { url: `${URL0}/?board=${BOARDS[0]}` }); await sleep(10000)
  // 1) board × skin sheets
  for (const board of BOARDS) for (const skin of SKINS) {
    await cdp('Page.navigate', { url: `${URL0}/?board=${board}&skin=${skin}` })
    await settled()
    await sleep(3200)
    await shot(`${board}-${skin}`)
  }
  // live switches: the refresh itself
  await cdp('Page.navigate', { url: `${URL0}/?board=${BOARDS[0]}&skin=oled` }); await settled(); await sleep(3000)
  for (const [to, times] of [['crt', [90, 260, 520]], ['nixie', [250, 600, 1000]], ['oled', [120]]] as const) {
    await evaluate(`window.dot480.setSkin(${JSON.stringify(to)})`)
    let t0 = 0
    for (const t of times) { await sleep(t - t0); t0 = t; await shot(`switch-${to}-${t}ms`) }
    await sleep(2500)
  }

  // 2) perf on one board: stage JS per card frame + main-thread busy per 12 fps tick
  const analyse = (p: { nodes: { id: number; callFrame: { functionName: string } }[]; samples: number[]; timeDeltas: number[] }) => {
    const byId = new Map(p.nodes.map(n => [n.id, n])); let busy = 0
    p.samples.forEach((id, i) => { if (byId.get(id)!.callFrame.functionName !== '(idle)') busy += (p.timeDeltas[i + 1] ?? 0) / 1000 })
    return busy
  }
  console.log(`\nperf ${PERF} (${SECS} s steady state, headless Chrome, DPR 1)`)
  console.log('skin       cards  stage ms/card-frame (mean / p95)   frames/s   main busy ms per 12 fps tick')
  let oledBusy = 0
  for (const skin of ALL) {
    await cdp('Page.navigate', { url: `${URL0}/?board=${PERF}&skin=${skin}` })
    await settled(); await sleep(4000)
    await evaluate(`(() => { const p = window.__skinPerf || {}; for (const k in p) { p[k].frame.length = 0; p[k].render.length = 0 } })()`)
    await cdp('Profiler.setSamplingInterval', { interval: 200 }); await cdp('Profiler.start')
    await sleep(SECS * 1000)
    const busy = analyse((await cdp('Profiler.stop')).result.profile) / (SECS * 12)
    const s = await evaluate<{ n: number; frames: number; mean: number; p95: number; cards: number }>(`(() => {
      const p = (window.__skinPerf || {})[${JSON.stringify(skin)}]
      const cards = document.querySelectorAll('.skin-overlay').length
      if (!p) return { n: 0, frames: 0, mean: 0, p95: 0, cards }
      // one card frame = one copy (frame) + one render; pair them up by count
      const f = p.frame, r = p.render, n = Math.min(f.length, r.length), per = []
      for (let i = 0; i < n; i++) per.push(f[i] + r[i])
      per.sort((a, b) => a - b)
      return { n, frames: Math.max(f.length, r.length), mean: per.reduce((a, b) => a + b, 0) / (n || 1), p95: per[Math.floor(n * .95)] || 0, cards }
    })()`)
    if (skin === 'oled') oledBusy = busy
    console.log(`${skin.padEnd(10)} ${String(s.cards).padStart(5)}  ${s.mean.toFixed(3).padStart(8)} / ${s.p95.toFixed(3).padStart(6)}               ${(s.frames / SECS).toFixed(1).padStart(6)}     ${busy.toFixed(2)}${skin === 'oled' ? '' : ` (+${(busy - oledBusy).toFixed(2)})`}`)
  }
  // the 144² gate: one animated TILE card alone (mini-game), crt and vfd
  console.log('\nsingle 144² animated card (mini-game), stage ms per card frame:')
  for (const skin of ['crt', 'vfd']) {
    await cdp('Page.navigate', { url: `${URL0}/?card=mini-game&skin=${skin}` }); await settled(); await sleep(3000)
    await evaluate(`(() => { const p = window.__skinPerf || {}; for (const k in p) { p[k].frame.length = 0; p[k].render.length = 0 } })()`)
    await sleep(SECS * 1000)
    const s = await evaluate<{ mean: number; p95: number; n: number; w: number }>(`(() => {
      const p = (window.__skinPerf || {})[${JSON.stringify(skin)}] || { frame: [], render: [] }, f = p.frame, r = p.render, n = Math.min(f.length, r.length), per = []
      for (let i = 0; i < n; i++) per.push(f[i] + r[i])
      per.sort((a, b) => a - b)
      return { n, mean: per.reduce((a, b) => a + b, 0) / (n || 1), p95: per[Math.floor(n * .95)] || 0, w: document.querySelector('.skin-overlay')?.width ?? 0 }
    })()`)
    console.log(`  ${skin}: ${s.mean.toFixed(3)} ms mean, ${s.p95.toFixed(3)} ms p95 over ${s.n} frames (backing ${s.w} px)`)
  }
} finally {
  if (logs.size) { console.log('\nconsole errors:'); for (const l of logs) console.log('  ' + l) } else console.log('\nno console errors')
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome still holds it */ }
}
