/**
 * Site audit in headless Chrome over CDP (Node's built-in WebSocket, no deps):
 *  - every board (`/<board>/`) and every view at 375 px, touch emulation: horizontal overflow, the
 *    elements that cause it, tap targets under 24 px, console errors; full-page screenshots;
 *  - lazy loading: which JS chunks the first load fetched, that hovering a board tab prefetches its chunk;
 *  - deep links: `/<board>/` and `?board=` open the board, the title and og tags follow, the address bar
 *    moves to `/<board>/`.
 * Needs a server for dist/: `pnpm build && npx vite preview --port 4317`, then
 * `npx tsx scripts/site/mobile.ts [baseUrl]`. Screenshots → `.snapshots/w0/`. Chrome: $CHROME or the usual paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { boardIds } from '../../src/widgets/manifest'

const base = (process.argv[2] ?? 'http://localhost:4317/').replace(/\/?$/, '/')
const only = process.argv[3]?.split(',')
const out = join('.snapshots', 'w0')
mkdirSync(out, { recursive: true })
const W = 375, H = 812
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-w0-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>()
let logs: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
const waitFor = async (expr: string, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const shot = async (name: string) => {
  const h = Math.min(8000, Math.ceil(await js('document.documentElement.scrollHeight')))
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: true })
  await sleep(300)
  const r = await cdp('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64'))
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
}
const jsFiles = () => js(`performance.getEntriesByType('resource').map(e => e.name).filter(n => n.endsWith('.js')).map(n => n.split('/').pop())`) as Promise<string[]>

/** Overflow and tap-target audit of the current page at W px. */
const AUDIT = `(() => {
  const W = ${W}, doc = document.documentElement
  const wide = [], small = []
  const label = el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + (el.textContent ? ' "' + el.textContent.trim().slice(0, 18) + '"' : '')
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) continue
    // only elements that stick out of the page, not ones clipped inside a scroller of their own
    let clipped = false
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (s.overflowX !== 'visible' && s.overflowX !== 'clip' || s.overflow === 'hidden') { const pr = p.getBoundingClientRect(); if (pr.right <= W + 1) { clipped = true; break } } }
    if (!clipped && (r.right > W + 1 || r.left < -1)) wide.push(label(el) + ' ' + Math.round(r.left) + '..' + Math.round(r.right))
    if (el.matches('button, a[href], input:not([type=hidden]), select, textarea, [role=slider], [role=button], [tabindex="0"]') && getComputedStyle(el).visibility !== 'hidden') {
      if (Math.min(r.width, r.height) < 24 && !el.closest('.sr-only')) small.push(label(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height))
    }
  }
  return { scrollW: Math.max(doc.scrollWidth, document.body.scrollWidth), wide: wide.slice(0, 6), wideN: wide.length, small: small.slice(0, 6), smallN: small.length }
})()`
type Audit = { scrollW: number; wide: string[]; wideN: number; small: string[]; smallN: number }
const audit = async (name: string) => {
  const a = await js(AUDIT) as Audit
  check(`${name}: no horizontal overflow at ${W}px`, a.scrollW <= W + 1 && a.wideN === 0, a.scrollW > W + 1 || a.wideN ? `scrollWidth ${a.scrollW}; ${a.wideN} wide: ${a.wide.join(' | ')}` : '')
  if (a.smallN) console.log(`  · ${name}: ${a.smallN} tap target(s) < 24px: ${a.small.join(' | ')}`)
  return a
}

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  const boardReady = `!!document.querySelector('.board-grid canvas, .board-grid svg')`

  if (!only) {
    // first load: entry + static imports + the default board only
    await cdp('Page.navigate', { url: base })
    check('home opens the first board', await waitFor(boardReady))
    // everything fetched must be the entry or one of its modulepreloads (the static closure): no lazy chunk
    const first = await jsFiles(), html = await (await fetch(base)).text()
    const preload = new Set([...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map(m => m[1]))
    const extra = first.filter(f => !preload.has(f) && !f.startsWith('sampleWorker'))
    check('first load fetches only the entry and its static imports', extra.length === 0, `${first.length} JS files${extra.length ? `; lazy: ${extra.join(', ')}` : ''}`)
    await js(`document.querySelector('.board-tabs button:nth-child(3)').dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))`)
    await js(`document.querySelector('.board-tabs button:nth-child(3)').dispatchEvent(new PointerEvent('pointerenter'))`)
    await sleep(1500)
    const after = await jsFiles()
    check(`hovering the ${boardIds[2]} tab prefetches its chunk`, after.some(f => f.startsWith(`${boardIds[2]}-`)), after.filter(f => !first.includes(f)).join(', '))
    // deep links
    await cdp('Page.navigate', { url: `${base}light/` })
    check('/light/ opens the light board', await waitFor(`document.querySelector('.board-tabs .selected')?.textContent === 'LIGHT' && ${boardReady}`))
    check('/light/ sets the title and og:image', await js(`document.title.startsWith('LIGHT') && document.querySelector('meta[property="og:image"]').content.endsWith('/og/light.png')`))
    await cdp('Page.navigate', { url: `${base}?board=mosaic&worker=1` })
    await waitFor(boardReady)
    check('?board=mosaic moves the address bar to /mosaic/ and keeps other params', await js(`location.pathname === '/mosaic/' && location.search === '?worker=1'`), await js('location.href'))
    await js(`[...document.querySelectorAll('.board-tabs button')].find(b => b.textContent === 'CINEMA').click()`)
    check('picking a board updates path and title', await waitFor(`location.pathname === '/cinema/' && document.title.startsWith('CINEMA')`))
    const og = await fetch(`${base}og/cinema.png`)
    check('dist/og/cinema.png is served', og.ok && (og.headers.get('content-type') ?? '').includes('png'))
    const crawl = await (await fetch(`${base}cinema/`)).text()
    check('crawler HTML for /cinema/ carries its meta', crawl.includes('<title>CINEMA') && crawl.includes('/og/cinema.png'))
  }

  const items = only ?? [...boardIds, ...['gallery', 'workspace', 'studio', 'log', 'dots', 'draw'].map(t => `tab:${t}`)]
  for (const id of items.filter(i => !i.startsWith('tab:'))) {
    logs = []
    await cdp('Page.navigate', { url: `${base}${id}/` })
    const ok = await waitFor(boardReady, 20000)
    await sleep(2500) // entrances + first frames
    check(`${id}: renders`, ok)
    await audit(id)
    if (logs.length) check(`${id}: no console errors`, false, logs.slice(0, 3).join(' | '))
    await shot(`board-${id}`)
  }
  for (const tab of items.filter(i => i.startsWith('tab:')).map(i => i.slice(4))) {
    logs = []
    await cdp('Page.navigate', { url: `${base}?tab=${tab}` })
    // the view's chunk has loaded once the Suspense placeholder is gone and the view has content
    check(`tab ${tab}: loads`, await waitFor(`!document.querySelector('.view-loading') && document.querySelector('.shell > :is(section, div)')?.getBoundingClientRect().height > 100`, 30000))
    await sleep(2500)
    await audit(`tab ${tab}`)
    if (logs.length) check(`tab ${tab}: no console errors`, false, logs.slice(0, 3).join(' | '))
    await shot(`tab-${tab}`)
  }
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
