/**
 * C7 display skins in headless Chrome (CDP over Node's built-in WebSocket, no deps).
 *
 *   npx tsx scripts/skins-browser.ts [--url http://localhost:5204] [--boards mosaic,components,levels] [--skins all] [--perf mosaic] [--secs 4]
 *
 * 1. Screenshots: every board × skin (`?board=…&skin=…`, after the entrance and the power-on refresh) and a
 *    few frames of a live switch (OLED → CRT, CRT → INK, INK → OLED) → `.snapshots/c7/`.
 * 2. Perf: on the `--perf` board, the stage's own JS ms per card frame (frame copy + render, from the page's
 *    `__skinPerf` probe) and the main-thread busy ms per 12 fps tick (CPU profile) per skin vs OLED.
 * 3. Console errors / exceptions are listed. Needs the dev server running; Chrome from $CHROME or the usual paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const URL0 = arg('url', 'http://localhost:5204'), BOARDS = arg('boards', 'mosaic,components,levels').split(','), PERF = arg('perf', 'mosaic'), SECS = +arg('secs', '4')
const ALL = ['oled', 'crt', 'vfd', 'led', 'eink', 'flipdisc', 'nixie']
const SKINS = arg('skins', 'all') === 'all' ? ALL : arg('skins', '').split(',')
const OUT = join(import.meta.dirname, '../.snapshots/c7')
mkdirSync(OUT, { recursive: true })

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME)'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-skins-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,1000', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
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
await cdp('Runtime.enable'); await cdp('Page.enable'); await cdp('Profiler.enable')
await cdp('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false })

// debug: `--page '?board=mosaic&skin=eink' --wait 4000 --eval '<expr>' [--shot name]` → prints the value and exits
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
    await sleep(skin === 'eink' || skin === 'flipdisc' ? 4200 : 3200)
    await shot(`${board}-${skin}`)
  }
  // live switches: the refresh itself
  await cdp('Page.navigate', { url: `${URL0}/?board=${BOARDS[0]}&skin=oled` }); await sleep(3000)
  for (const [to, times] of [['crt', [90, 260, 520]], ['eink', [250, 600, 1000]], ['oled', [120]]] as const) {
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
  for (const skin of ['oled', 'crt', 'led', 'vfd', 'nixie', 'eink', 'flipdisc']) {
    await cdp('Page.navigate', { url: `${URL0}/?board=${PERF}&skin=${skin}` })
    await sleep(6000)
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
  // the 144² gate: one animated TILE card alone (mini-game), crt and led
  console.log('\nsingle 144² animated card (mini-game), stage ms per card frame:')
  for (const skin of ['crt', 'led']) {
    await cdp('Page.navigate', { url: `${URL0}/?card=mini-game&skin=${skin}` }); await sleep(3000)
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
