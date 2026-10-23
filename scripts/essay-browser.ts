/**
 * The launch essay (P6-F, `essay.html`) in headless Chrome over CDP (Node's built-in WebSocket, no deps):
 * loads at 1280 and 375 px without console errors, figures mount only when scrolled near, every figure
 * draws and responds to its input, reduced motion shows stills, no horizontal overflow on phones.
 * Needs the dev server (`pnpm dev --port 5200`), then `npx tsx scripts/essay-browser.ts [baseUrl]`.
 * Screenshots go to `.snapshots/essay/`. Chrome path: $CHROME, else the usual install paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5200/'
const out = join('.snapshots', 'essay')
mkdirSync(out, { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-essay-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
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
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(`console.${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const shot = async (name: string) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64')) }
const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }

/** Lit canvas pixels + SVG dots inside a figure, and a cheap signature (to tell frames apart). */
const SIG = `window.__sig = sel => { const f = document.querySelector(sel); if (!f) return { n: -1, sig: 0 }; let n = 0, sig = 0;
  for (const c of f.querySelectorAll('canvas')) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 8) if (d[i] + d[i+1] + d[i+2] > 60) { n++; sig = (sig * 31 + i + d[i] + d[i+2] * 7) % 1000003 } }
  for (const s of f.querySelectorAll('.dot-svg')) { const h = s.innerHTML; n += (h.match(/<path|<circle|<rect/g) || []).length; for (let i = 0; i < h.length; i += 5) sig = (sig * 31 + h.charCodeAt(i)) % 1000003 }
  return { n, sig } }`
const sig = (id: string) => js(`window.__sig('#fig-${id}')`) as Promise<{ n: number; sig: number }>
const mounted = () => js(`[...document.querySelectorAll('[data-fig]')].filter(f => f.dataset.mounted === '1').map(f => f.dataset.fig)`) as Promise<string[]>
const figIds = () => js(`[...document.querySelectorAll('[data-fig]')].map(f => f.dataset.fig)`) as Promise<string[]>
/** Scroll a figure to the middle of the viewport, wait for its chunk and its first frame. */
const reach = async (id: string) => {
  await js(`document.querySelector('#fig-${id}').scrollIntoView({ block: 'center' })`)
  const ok = await waitFor(`document.querySelector('#fig-${id}').dataset.mounted === '1' && !!document.querySelector('#fig-${id} canvas, #fig-${id} .dot-svg')`, 15000)
  await sleep(900)
  return ok
}
const centre = (sel: string) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height] })()`) as Promise<[number, number, number, number]>
const mouse = (type: string, x: number, y: number, buttons = 0) => cdp('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' && !buttons ? 'none' : 'left', buttons, clickCount: type === 'mouseMoved' ? 0 : 1 })
const drag = async (sel: string, path: [number, number][]) => {
  const [cx, cy, w, h] = await centre(sel), at = ([u, v]: [number, number]): [number, number] => [cx + (u - .5) * w, cy + (v - .5) * h]
  const [x0, y0] = at(path[0])
  await mouse('mouseMoved', x0, y0); await mouse('mousePressed', x0, y0, 1)
  for (const p of path.slice(1)) { const [x, y] = at(p); await mouse('mouseMoved', x, y, 1); await sleep(40) }
  const [x1, y1] = at(path[path.length - 1]); await mouse('mouseReleased', x1, y1)
}
const setRange = (sel: string, v: number) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${v}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const clickText = (scope: string, label: string) => js(`[...document.querySelectorAll(${JSON.stringify(`${scope} button`)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`)
const changed = async (id: string, act: () => Promise<unknown>, wait = 700) => {
  const a = await sig(id); await act(); await sleep(wait); const b = await sig(id)
  return { ok: b.n > 0 && b.sig !== a.sig, detail: `${a.n}→${b.n} lit` }
}

async function open(width: number, height: number, mobile: boolean, reduced = false) {
  await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: mobile ? 2 : 1, mobile })
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reduced ? 'reduce' : 'no-preference' }] })
  logs.length = 0
  await cdp('Page.navigate', { url: `${base}essay.html` })
  const ok = await waitFor(`!!document.querySelector('.hero .dot-title') && document.readyState === 'complete'`, 30000)
  await js(SIG)
  await sleep(1500)
  return ok
}

try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable')

  // ── desktop, 1280 ─────────────────────────────────────────────────────────
  const opened = await open(1280, 900, false)
  check('1280: essay.html loads and the dot title draws', opened && await js(`!!document.querySelector('.hero canvas, .hero .dot-svg')`))
  await shot('1280-00-hero')
  const ids = await figIds(), first = await mounted()
  check('1280: figures lazy-mount (only those near the first view are mounted at load)', first.length < ids.length / 3, `${first.length}/${ids.length} mounted at load: ${first.join(', ')}`)
  const transfer = await js(`performance.getEntriesByType('resource').filter(e => e.initiatorType === 'script' || e.name.endsWith('.js') || e.name.includes('.ts') || e.name.includes('.tsx')).length`)
  console.log(`  (dev server: ${transfer} module requests before scrolling)`)

  const act: Record<string, () => Promise<{ ok: boolean; detail: string }>> = {
    resolution: () => changed('resolution', () => setRange('#fig-resolution input[name=dots]', 12)),
    pipeline: () => changed('pipeline', () => drag('#fig-pipeline .stage--drag', [[.3, .3], [.5, .5], [.75, .7]])),
    quantize: () => changed('quantize', () => setRange('#fig-quantize input[name=steps]', 2)),
    lattice: () => changed('lattice', () => clickText('#fig-lattice', 'Lattice')),
    accent: async () => {
      const r = await changed('accent', () => clickText('#fig-accent', 'Add a second accent'))
      const blue = await js(`(() => { let n = 0; for (const c of document.querySelectorAll('#fig-accent canvas')) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i+2] > 180 && d[i] < 90) n++ } for (const s of document.querySelectorAll('#fig-accent .dot-svg')) n += (s.innerHTML.match(/#2F7BFF/gi) || []).length; return n })()`)
      return { ok: r.ok && blue > 0, detail: `${r.detail}; ${blue} blue px/dots` }
    },
    masks: () => changed('masks', () => clickText('#fig-masks', 'radial'), 350),
    departures: async () => { const a = await sig('departures'); await sleep(1500); const b = await sig('departures'); return { ok: a.n > 500 && a.sig !== b.sig, detail: `${a.n} lit, animating` } },
    instrument: () => changed('instrument', () => drag('#fig-instrument .dot-card:first-child .dot-a11y-root', [[.5, .2], [.8, .3], [.85, .55], [.7, .8]])),
    light: () => changed('light', async () => { const [cx, cy, w] = await centre('#fig-light .dot-card:last-child .dot-a11y-root'); await mouse('mouseMoved', cx - w * .3, cy - w * .2); await sleep(200); await mouse('mouseMoved', cx + w * .25, cy + w * .1) }),
    sim: async () => { const a = await sig('sim'); await sleep(1200); const b = await sig('sim'); return { ok: a.n > 500 && a.sig !== b.sig, detail: `${a.n} lit, animating` } },
    flicker: async () => {
      const r = await changed('flicker', () => setRange('#fig-flicker input[name=noise]', .12), 1200)
      return r
    },
    mirror: () => changed('mirror', () => clickText('#fig-mirror', 'Scratch it'), 300),
    ir: async () => {
      const typed = await changed('ir', () => js(`(() => { const a = document.querySelector('#fig-ir textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(a, 'let d = length(u - .5, v - .5); smoothstep(.45, .1, d) * (.5 + .5 * sin(d * 40 - t * 4))'); a.dispatchEvent(new Event('input', { bubbles: true })) })()`), 900)
      await js(`(() => { const a = document.querySelector('#fig-ir textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(a, 'sin(u * '); a.dispatchEvent(new Event('input', { bubbles: true })) })()`)
      await sleep(300)
      const err = await js(`document.querySelector('#fig-ir .ir-status').textContent`) as string, still = await sig('ir')
      const href = await js(`document.querySelector('#fig-ir a.ctl-link').getAttribute('href')`) as string
      return { ok: typed.ok && /^ERROR/.test(err) && still.n > 0 && /tab=dots&p=/.test(href), detail: `${typed.detail}; "${err.slice(0, 40)}"; link ${href.slice(0, 40)}…` }
    },
    surfaces: async () => { const a = await sig('surfaces'); await sleep(1500); const b = await sig('surfaces'); return { ok: a.n > 500 && a.sig !== b.sig, detail: `${a.n} lit, animating` } },
    agents: () => changed('agents', () => clickText('#fig-agents', 'Awaiting'), 900),
  }
  for (const id of ids) {
    const ok = await reach(id)
    const first = await sig(id)
    check(`1280: ${id} mounts on scroll and draws`, ok && first.n > 0, `${first.n} lit`)
    if (act[id]) { const r = await act[id](); check(`1280: ${id} responds to input`, r.ok, r.detail) }
    await sleep(300)
    await shot(`1280-${String(ids.indexOf(id) + 1).padStart(2, '0')}-${id}`)
  }
  check('1280: no console errors or exceptions', logs.length === 0, logs.slice(0, 5).join(' | '))

  // ── phone, 375 ────────────────────────────────────────────────────────────
  await open(375, 812, true)
  await shot('375-00-hero')
  for (const id of ids) {
    const ok = await reach(id), s = await sig(id)
    if (!ok || s.n <= 0) check(`375: ${id} mounts and draws`, false, `${s.n} lit`)
    if (['pipeline', 'accent', 'surfaces', 'ir', 'agents', 'flicker'].includes(id)) await shot(`375-${id}`)
  }
  check('375: every figure mounts and draws', true)
  const overflow = await js(`document.documentElement.scrollWidth - window.innerWidth`)
  check('375: no horizontal overflow', overflow <= 0, `${overflow}px`)
  check('375: no console errors or exceptions', logs.length === 0, logs.slice(0, 5).join(' | '))

  // ── reduced motion: figures show stills ───────────────────────────────────
  await open(1280, 900, false, true)
  const stills: string[] = []
  for (const id of ['departures', 'sim', 'surfaces']) {
    await reach(id)
    const a = await sig(id); await sleep(1200); const b = await sig(id)
    if (!(a.n > 0 && a.sig === b.sig)) stills.push(`${id} ${a.n} lit ${a.sig === b.sig ? 'still' : 'moving'}`)
  }
  check('reduced motion: animated figures draw a still frame', stills.length === 0, stills.join('; '))
  await shot('1280-reduced-sim')
  check('reduced motion: no console errors', logs.length === 0, logs.slice(0, 5).join(' | '))
} catch (e) {
  check('run', false, String(e))
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* locked */ }
}
console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
