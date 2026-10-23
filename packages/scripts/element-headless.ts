/**
 * Headless check of `packages/element/demo.html` (run after build.ts): serves packages/element over
 * node:http (module scripts don't load from file://), drives Chrome over CDP with Node's built-in
 * WebSocket (no new deps), and checks every <dot-card> drew dots, data-* edits re-render, a bad id
 * shows an error, and reduced motion gives a still frame. Screenshot: .snapshots/p6b/element-demo.png.
 * Chrome path: $CHROME, else the usual install paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

const PKGS = join(dirname(fileURLToPath(import.meta.url)), '..'), ELEMENT = join(PKGS, 'element')
const snaps = join(PKGS, '..', '.snapshots', 'p6b')
mkdirSync(snaps, { recursive: true })
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.map': 'application/json' }
const server = createServer((req, res) => {
  const path = normalize(join(ELEMENT, decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)))
  if (!path.startsWith(ELEMENT) || !existsSync(path)) { res.writeHead(404).end(); return }
  res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' }).end(readFileSync(path))
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/demo.html`

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); server.close(); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-p6b-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1560,900', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: { result?: Record<string, unknown> & { result?: { value?: unknown }; exceptionDetails?: { exception?: { description?: string } } } }) => void>(), logs: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ')}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<Parameters<typeof calls extends Map<number, infer F> ? F : never>[0]>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const evaluate = async <T>(expression: string): Promise<T> => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value as T
}
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

/** Per card: renderer mode, lit dots (SVG shapes or canvas pixels with alpha), error text. */
const PROBE = `(() => [...document.querySelectorAll('dot-card')].map(el => {
  const body = el.shadowRoot.querySelector('.body'), svg = body.querySelector('svg'), canvas = body.querySelector('canvas')
  const err = body.querySelector('.err')?.textContent ?? ''
  const mode = el.card?.mode ?? 'none'
  let lit = 0
  if (mode === 'svg' && svg) lit = svg.querySelectorAll('circle,rect,path,use').length
  if (mode === 'canvas' && canvas && canvas.width) { const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) lit++ }
  return { id: el.id, mode, lit, err, label: body.getAttribute('aria-label') ?? '', w: Math.round(el.getBoundingClientRect().width) }
}))()`
type Probe = { id: string; mode: string; lit: number; err: string; label: string; w: number }

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url })
  await sleep(2000)
  const cards = await evaluate<Probe[]>(PROBE)
  console.log(cards.map(c => `  ${c.id.padEnd(7)} ${c.mode.padEnd(6)} lit=${c.lit} w=${c.w}${c.err ? ` err="${c.err}"` : ''}`).join('\n'))
  check('custom element defined', await evaluate<boolean>(`!!customElements.get('dot-card')`))
  for (const id of ['timer', 'weather', 'knob', 'toggle', 'spec']) {
    const c = cards.find(x => x.id === id)
    check(`<dot-card id=${id}> rendered dots`, !!c && c.lit > 0 && !c.err, c ? `${c.mode}, ${c.lit} lit` : 'missing')
  }
  check('renderer="canvas" honoured', cards.find(c => c.id === 'toggle')?.mode === 'canvas')
  check('animated card uses canvas', cards.find(c => c.id === 'weather')?.mode === 'canvas')
  check('static card under 2000 dots uses SVG', cards.find(c => c.id === 'timer')?.mode === 'svg')
  check('unknown card shows an error', /unknown card/.test(cards.find(c => c.id === 'bad')?.err ?? ''))
  check('aria-label from describe()', (cards.find(c => c.id === 'knob')?.label ?? '').length > 4, cards.find(c => c.id === 'knob')?.label)
  await cdp('Page.captureScreenshot', { format: 'png' }).then(r => writeFileSync(join(snaps, 'element-demo.png'), Buffer.from(String(r.result?.data), 'base64')))

  const before = await evaluate<number>(`document.getElementById('knob').data.value`)
  await evaluate(`document.getElementById('knob').dataset.value = '0.2'`)
  await sleep(600)
  const after = await evaluate<number>(`document.getElementById('knob').data.value`)
  check('data-* edit reaches card data', before === .7 && after === .2, `${before} → ${after}`)

  // pointer input: click the toggle's first control, its data value flips
  const hit = await evaluate<{ x: number; y: number; key: string; v: number }>(`(() => {
    const el = document.getElementById('toggle'), c = el.resolvedPreset.controls[0], g = el.resolvedPreset.grid
    const r = el.shadowRoot.querySelector('.body').getBoundingClientRect(), [col, row, w, h] = c.box
    return { x: r.left + (col + w / 2) / g.cols * r.width, y: r.top + (row + h / 2) / g.rows * r.height, key: c.key, v: el.data[c.key] ?? 0 }
  })()`)
  for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await cdp('Input.dispatchMouseEvent', { type, x: hit.x, y: hit.y, button: 'left', clickCount: 1 })
  await sleep(300)
  const flipped = await evaluate<number>(`document.getElementById('toggle').data[${JSON.stringify(hit.key)}]`)
  check('pointer click edits a control', flipped !== hit.v, `${hit.key}: ${hit.v} → ${flipped}`)

  // reduced motion: reload under the media emulation → still frames, so the animated weather card drops to SVG
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await cdp('Page.reload')
  await sleep(1500)
  const reduced = await evaluate<Probe[]>(PROBE)
  const timer = reduced.find(c => c.id === 'weather')
  check('reduced motion: animated card renders a still SVG frame', timer?.mode === 'svg' && timer.lit > 0, `${timer?.mode}, ${timer?.lit} lit`)
  const errs = logs.filter(l => !/no-such-card|unknown card/.test(l))
  check('no console errors / exceptions', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) { console.error(e); failures++ }
ws.close(); proc.kill(); server.closeAllConnections(); server.close()
await sleep(300)
try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold the profile */ }
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1) }
console.log(`\nelement demo checks passed; screenshot ${join(snaps, 'element-demo.png')}`)
process.exit(0)
