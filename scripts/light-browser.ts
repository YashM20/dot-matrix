/**
 * The light / tilt hub in headless Chrome over CDP (docs/living-matter/F0-foundation.md F0.8; Node's built-in
 * WebSocket, no deps), on the physics board at 390×844:
 *  - TILT: hidden without touch; with touch and an injected iOS-style `DeviceOrientationEvent.requestPermission`
 *    stub it shows, and a tap asks once and turns it on;
 *  - orientation via `DeviceOrientation.setDeviceOrientationOverride`: held normally → exactly (0, 1) and the
 *    worlds stay pristine; γ 40° → the PIT world goes live; γ back to 0 → (0, 1) within 300 ms;
 *  - scroll first (docs/UX-PLAN.md §10): a vertical swipe on a physics card scrolls the page with tilt live;
 *  - no render storm: ≤ 15 hub emits / s (every emit is one board render) while sweeping γ.
 * Starts its own Vite dev server in-process (cache in the temp dir; modules are read straight from /src, so
 * the probe sees the app's own hub and worlds) and closes it and Chrome at the end.
 *   npx tsx scripts/light-browser.ts [baseUrl]   (a baseUrl skips the server; it must be a dev server)
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const W = 390, H = 844, PORT = 5219
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let server: { close(): Promise<void> } | null = null
let base = process.argv[2]
if (!base) {
  const { createServer } = await import('vite')
  const cacheDir = join(tmpdir(), 'dot-light-vite')
  const s = await createServer({ configFile: 'vite.config.ts', cacheDir, logLevel: 'warn', server: { port: PORT, strictPort: true, hmr: false } })
  await s.listen()
  server = s
  base = `http://localhost:${PORT}/`
}
base = base.replace(/\/?$/, '/')

const profile = mkdtempSync(join(tmpdir(), 'dot-light-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' })
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
let ws: WebSocket | null = null
try {
  let port = ''
  for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
  const sock = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
  ws = sock
  await new Promise(r => sock.addEventListener('open', r, { once: true }))
  let seq = 0
  const calls = new Map<number, (m: any) => void>()
  let logs: string[] = []
  sock.addEventListener('message', e => {
    const m = JSON.parse(String(e.data))
    if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
  })
  const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); sock.send(JSON.stringify({ id, method, params })) })
  const js = async (expression: string) => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
    return r.result?.result?.value
  }
  const waitFor = async (expr: string, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
  const orient = async (beta: number, gamma: number) => {
    const r = await cdp('DeviceOrientation.setDeviceOrientationOverride', { alpha: 0, beta, gamma })
    if (r.error) throw new Error(`DeviceOrientation override: ${r.error.message}`)
  }
  const tap = async (x: number, y: number) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(60)
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(200)
  }
  const center = (sel: string) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect(); return r && r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null })()`) as Promise<[number, number] | null>
  const boardReady = `!!document.querySelector('.board-grid [data-card-id="phys-pit"] canvas, .board-grid [data-card-id="phys-pit"] svg')`
  /** Open TOOLS from the phone tab bar; returns whether TILT is in the sheet and its aria-pressed. */
  const tools = async () => {
    await js(`[...document.querySelectorAll('.tabbar button')].find(b => b.textContent.includes('TOOLS')).click()`)
    const open = await waitFor(`!!document.querySelector('.tools-sheet .tools-grid')`, 20000)
    const tilt = await js(`(() => { const b = document.querySelector('.tools-grid .tool-tilt'); return b ? b.getAttribute('aria-pressed') : null })()`) as string | null
    return { open, tilt }
  }
  // the sheet is a native <dialog>: its cancel event is what Escape sends
  const closeTools = async () => { await js(`document.querySelector('.tools-sheet')?.dispatchEvent(new Event('cancel', { cancelable: true }))`); await waitFor(`!document.querySelector('.tools-sheet')`, 3000) }
  // the app's own modules, straight from the dev server (same URL → the same instance the page runs)
  const hub = `(await import('/src/site/light.ts'))`
  /** Evaluate an async body (it may await the app's modules) and return its value. */
  const ajs = (body: string) => js(`(async () => { ${body} })()`)
  const worlds = `(await import('/src/widgets/boards/physics.ts')).physicsWorlds`

  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })

  // ── 1. no touch: TILT hidden ────────────────────────────────────────────────────────────────────────
  await cdp('Page.navigate', { url: `${base}physics/` })
  check('physics board renders (dev server)', await waitFor(boardReady, 120_000))
  const desk = await tools()
  await closeTools()
  check('TILT hidden without touch (fine pointer → unsupported)', desk.open && desk.tilt === null, `sheet ${desk.open}, TILT ${desk.tilt}`)

  // ── 2. touch + the iOS stub: TILT shows, a tap asks once and turns it on ────────────────────────────
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__tiltAsks = 0; DeviceOrientationEvent.requestPermission = () => { window.__tiltAsks++; return Promise.resolve('granted') }` })
  await orient(50, 0)
  logs = []
  await cdp('Page.navigate', { url: `${base}physics/` })
  await waitFor(boardReady, 60_000)
  await sleep(1500)
  const before = await tools()
  await sleep(800) // the sheet slides up
  const at = await center('.tools-grid .tool-tilt')
  const hit = at ? await js(`document.elementFromPoint(${at[0]}, ${at[1]})?.closest('button')?.className ?? document.elementFromPoint(${at[0]}, ${at[1]})?.tagName`) : 'no TILT'
  if (at) await tap(...at)
  await sleep(400)
  const asks = await js('window.__tiltAsks') as number
  const after = await tools()
  await closeTools()
  check('TILT shown only with the stub; tap → granted', before.tilt === 'false' && asks === 1 && after.tilt === 'true' && await ajs(`const h = ${hub}; return h.tiltState() === 'granted' && h.tiltListening()`),
    `before: aria-pressed ${before.tilt}; tap on ${hit}; requestPermission calls ${asks}; after: ${after.tilt}`)

  // record every hub emit in the page: [time, gx, gy, lightSrc]
  await ajs(`const h = ${hub}; window.__emits = []; h.lightSource.subscribe(s => window.__emits.push([performance.now(), s.data.gx, s.data.gy, s.data.lightSrc]))`)
  await js(`document.querySelector('[data-card-id="phys-pit"]').scrollIntoView({ block: 'center' })`)
  await sleep(800)

  // ── 3. held normally → (0, 1), pristine; γ 40° → live; back to 0 → (0, 1) within 300 ms ─────────────
  await orient(50, 2); await sleep(1200)
  const held = await ajs(`const d = ${hub}.lightSource.snapshot().data, w = ${worlds}; return { gx: d.gx, gy: d.gy, src: d.lightSrc, live: w.filter(x => x.mode !== 'pristine').length }`) as { gx: number; gy: number; src: number; live: number }
  check('held phone (β 50°, γ 2°): lightSrc 1, exactly gx 0, gy 1, every world pristine', held.src === 1 && held.gx === 0 && held.gy === 1 && held.live === 0, JSON.stringify(held))
  await orient(50, 40)
  const went = await waitFor(`(async () => { const d = ${hub}.lightSource.snapshot().data; return d.gx !== 0 && (${worlds})[4].mode === 'live' })()`, 5000)
  const tiltedG = await ajs(`return ${hub}.lightSource.snapshot().data.gx`)
  check('γ = 40° → the PIT card\'s world goes live (snapshot gx ≠ 0)', went, `gx ${tiltedG}`)
  await sleep(600)
  const t0 = await js('performance.now()') as number
  await orient(50, 0)
  await waitFor(`(() => { const e = window.__emits.at(-1); return e && e[1] === 0 && e[2] === 1 })()`, 3000)
  const back = await js(`(() => { const e = window.__emits.find(e => e[0] > ${t0} && e[1] === 0 && e[2] === 1); return e ? e[0] - ${t0} : -1 })()`) as number
  check('γ back to 0 → gx 0, gy 1 within 300 ms', back >= 0 && back <= 300, `${back.toFixed(0)} ms`)

  // ── 4. scroll first with tilt live (and tilted) ─────────────────────────────────────────────────────
  await orient(50, 30); await sleep(300)
  await js(`document.querySelector('[data-card-id="phys-ink"]').scrollIntoView({ block: 'center' })`)
  await sleep(500)
  const card = await center('[data-card-id="phys-ink"] canvas, [data-card-id="phys-ink"] svg')
  const y0 = await js('scrollY') as number
  if (card) {
    const [x, y] = card
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y + 60 }] })
    for (let i = 1; i <= 12; i++) { await sleep(16); await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + 60 - i * 16 }] }) }
    await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await sleep(700)
  const y1 = await js('scrollY') as number
  const engaged = await js(`!!document.querySelector('.dot-card--engaged')`) as boolean
  check('vertical swipe on a physics card still scrolls the page with tilt live (UX §10)', !!card && y1 - y0 > 60 && !engaged && await ajs(`return ${hub}.tiltListening()`), `scrolled ${(y1 - y0).toFixed(0)} px, engaged ${engaged}`)

  // ── 5. no render storm while sweeping γ ─────────────────────────────────────────────────────────────
  await js(`document.querySelector('[data-card-id="phys-pit"]').scrollIntoView({ block: 'center' })`)
  const s0 = await js('performance.now()') as number, n0 = await js('window.__emits.length') as number
  const steps = 90
  for (let i = 0; i < steps; i++) { await orient(50 + 15 * Math.sin(i / 6), 35 * Math.sin(i / 4)); await sleep(33) }
  const s1 = await js('performance.now()') as number, n1 = await js('window.__emits.length') as number
  const rate = (n1 - n0) / ((s1 - s0) / 1000)
  check('no React re-render storm: ≤ 15 board renders/s while sweeping γ', rate <= 15 + 1e-9 && n1 > n0, `${n1 - n0} emits in ${((s1 - s0) / 1000).toFixed(1)} s = ${rate.toFixed(1)}/s (each emit = one board render)`)

  await orient(50, 0); await sleep(500)
  check('no console errors (page and sample worker)', logs.length === 0, logs.slice(0, 3).join(' | '))
} finally {
  ws?.close(); proc.kill()
  await server?.close()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
