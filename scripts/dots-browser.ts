/**
 * DOTS tab (P6-C) in headless Chrome over CDP (Node's built-in WebSocket, no deps): open the tab, type
 * a program, hit an error, scrub, copy the link, reload from it, remix, and open broken links.
 * Needs the dev server: `pnpm dev --port 5198`, then `npx tsx scripts/dots-browser.ts [baseUrl]`.
 * Screenshots go to `.snapshots/p6c/`. Chrome path: $CHROME, else the usual install paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { encodeShare } from '../src/lib/share'

const base = process.argv[2] ?? 'http://localhost:5198/'
const out = join('.snapshots', 'p6c')
mkdirSync(out, { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-p6c-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1440,1100', 'about:blank'], { stdio: 'ignore' })
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
const js = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const shot = async (name: string) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64')) }
const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
const go = async (url: string) => { await cdp('Page.navigate', { url }); return waitFor(`!!document.querySelector('.dw-code textarea')`, 30000) }
/** Lit pixels in the preview canvas, and a cheap signature of them (to tell frames apart). */
const lit = () => js(`(() => { const c = document.querySelector('.dw-stage canvas'); if (!c) return { n: -1, sig: 0 }; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sig = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 60) { n++; sig = (sig * 31 + i) % 1000003 } return { n, sig } })()`) as Promise<{ n: number; sig: number }>
const text = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`) as Promise<string>
/** Real typing path: focus the editor, select all, insert text (fires the same input events as a keyboard). */
const type = async (s: string) => { await js(`(() => { const a = document.querySelector('.dw-code textarea'); a.focus(); a.select() })()`); await cdp('Input.insertText', { text: s }); await sleep(400) }
const setRange = (sel: string, v: number) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${v}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const click = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)}).click()`)
const clickText = (sel: string, label: string) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`)

const PROGRAM = `// blobs: three metaballs orbiting the centre
let a = .08 / length(u - .5 - .22 * cos(t), v - .5 - .22 * sin(t * 1.3));
let b = .07 / length(u - .5 - .2 * cos(t * .7 + 2), v - .5 - .25 * sin(t + 1));
let c = .06 / length(u - .5 + .18 * sin(t * 1.1), v - .5 + .2 * cos(t * .8));
smoothstep(.9, 1.6, a + b + c)`

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(base).origin }).catch(() => null)

  // Pro mode opens every "More" fold (UX U4): `pro=1` for this load, localStorage for the reloads below
  const opened = await go(`${base}?tab=dots&pro=1`)
  check('DOTS tab opens from ?tab=dots', opened, opened ? '' : `${logs.join(' | ')} ${(await js('document.body.innerText').catch(() => '')).slice(0, 300)}`)
  if (!opened) { await shot('00-failed'); throw new Error('tab did not open') }
  await js(`localStorage.setItem('dot480:pro', 'on')`)
  await sleep(900)
  const first = await lit()
  check('the first example (ripple) draws on the preview canvas', first.n > 500, `${first.n} lit px`)
  await shot('01-open')

  await type(PROGRAM)
  await sleep(500)
  const typed = await lit(), status = await text('.dw-status')
  check('a typed program compiles and draws', typed.n > 500 && typed.sig !== first.sig && /NODES/.test(status), `${typed.n} lit px; ${status}`)
  check('the character counter follows the source', status.includes(`${PROGRAM.length}/4096`), status)
  await shot('02-typed')

  await type(PROGRAM.replace('a + b + c)', 'a + b + c'))
  const err = await text('.dw-error')
  check('a syntax error shows line:col and marks it', /^\d+:\d+/.test(err) && await js(`!!document.querySelector('.dw-mirror mark') && !!document.querySelector('.dw-gutter-err')`), err)
  const kept = await lit()
  check('the preview keeps the last good program while the source is broken', kept.n > 500, `${kept.n} lit px`)
  await shot('03-error')
  await type(PROGRAM)

  // scrub: pause, then drag t to two places — the frame follows t
  await click('.dw-play')
  await setRange('.dw-time input', 0.5); await sleep(350); const at05 = await lit()
  await setRange('.dw-time input', 2.5); await sleep(350); const at25 = await lit()
  const tOut = await text('.dw-time output')
  check('scrubbing t (paused) redraws a different frame', at05.sig !== at25.sig && tOut.includes('2.50'), `${tOut}, sig ${at05.sig} → ${at25.sig}`)
  await sleep(400); const held = await lit()
  check('paused holds the scrubbed frame', held.sig === at25.sig)
  await shot('04-scrub')

  // copy link → reload from it
  await clickText('.dw-share button', 'COPY LINK'); await sleep(400)
  const clip = await js(`navigator.clipboard.readText().catch(() => '')`) as string
  const url = clip || await js('location.href') as string
  check('COPY LINK puts a ?tab=dots&p=… link on the clipboard', /\?tab=dots&p=[bz][A-Za-z0-9_-]+$/.test(url) && (await text('.dw-share')).includes('COPIED'), `${url.length} chars${clip ? '' : ' (clipboard unavailable: read location)'}`)
  check('the link is compact (deflated)', /&p=z/.test(url) && url.length < 400, url.slice(url.indexOf('&p=')).slice(0, 48) + '…')
  check('the program was saved to the gallery', await js(`[...document.querySelectorAll('.dw-list button')].some(b => b.textContent.startsWith('blobs'))`))
  check('reloading from the link opens the same program', await go(url) && await waitFor(`document.querySelector('.dw-code textarea').value === ${JSON.stringify(PROGRAM)}`))
  await sleep(800)
  const reloaded = await lit()
  check('…and draws it', reloaded.n > 500, `${reloaded.n} lit px`)
  await shot('05-reloaded')

  // remix: edit the opened program → it names its parent; RUN adds a child node to the graph
  const parentId = (await text('.dw-panel h2 small')).match(/#([0-9a-f]{8})/)?.[1]
  await type(PROGRAM.replace('.9, 1.6', '.7, 1.1').replace('blobs', 'blobs remix'))
  const head = await text('.dw-panel h2 small')
  check('an edit is a remix of the opened program', !!parentId && head.includes(`REMIX OF ${parentId}`), head)
  const before = await js(`document.querySelectorAll('.dw-list li').length`) as number
  await clickText('.dw-share button', 'RUN'); await sleep(500)
  const after = await js(`document.querySelectorAll('.dw-list li').length`) as number
  const stored = await js(`JSON.parse(localStorage.getItem('dot480.dots.gallery') || '[]')`) as { src: string; parent?: string }[]
  check('RUN stores the remix with its parent hash', after === before + 1 && stored.some(e => e.src.includes('blobs remix') && e.parent === parentId), `${before} → ${after} entries`)
  await js(`document.querySelector('.dw-gallery').scrollIntoView()`); await sleep(400)
  await shot('06-remix-graph')

  // data sliders: rain reads data.density
  await js('scrollTo(0, 0)')
  await clickText('.dw-list button', 'rain'); await sleep(600)
  const sliders = await js(`[...document.querySelectorAll('.dw-slider span')].map(s => s.textContent)`) as string[]
  check('data.* sliders are generated for referenced keys', sliders.join() === 'data.density', sliders.join())
  await click('.dw-play')
  const r0 = await lit(); await setRange('.dw-slider input', 1); await sleep(350); const r1 = await lit()
  check('moving a data slider changes the frame', r1.n > r0.n, `${r0.n} → ${r1.n} lit px`)
  await shot('07-data-slider')

  // broken links: corrupt bytes, and a well-formed link to an invalid program — error shown, nothing drawn
  check('a corrupt link shows an error banner', await go(`${base}?tab=dots&p=zNotARealLink`) && await waitFor(`/Could not open/.test(document.querySelector('.dw-banner')?.textContent ?? '')`), await text('.dw-banner'))
  const bad = await encodeShare({ src: 'let x = u * ;\nx', grid: 'square', lattice: 2, tone: 'auto' })
  await go(`${base}?tab=dots&p=${bad}`); await waitFor(`!!document.querySelector('.dw-error')`); await sleep(600)
  const badLit = await lit()
  check('an invalid shared program shows its IR error and is not run', /^1:\d+/.test(await text('.dw-error')) && badLit.n === 0, `${await text('.dw-error')}; ${badLit.n} lit px`)
  await shot('08-bad-link')

  check('no uncaught errors in the page', logs.length === 0, logs.slice(0, 3).join(' | '))
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `\n${failures} browser check(s) failed` : '\nAll DOTS browser checks passed')
process.exit(failures ? 1 : 0)
