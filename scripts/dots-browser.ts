/**
 * MAKE · CODE (P6-C, now the editor's code tool, docs/EDITOR-PLAN.md) in headless Chrome over CDP (Node's
 * built-in WebSocket, no deps): open ?make=code, type a program into the selected code layer, hit an error,
 * scrub the timeline, copy the share link, reload from it (imported once as a frame), data sliders, and broken links.
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
const go = async (url: string) => { await cdp('Page.navigate', { url }); return waitFor(`!!document.querySelector('.ed-insp .dw-code textarea')`, 30000) }
/** Lit pixels of the selected frame's canvas, and a cheap signature of them (to tell frames apart). */
const lit = () => js(`(() => { const id = window.__editor?.sel; const c = id && document.querySelector('.ed-frame[data-frame="' + id + '"]'); if (!c) return { n: -1, sig: 0 }; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sig = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) { n++; sig = (sig * 31 + i) % 1000003 } return { n, sig } })()`) as Promise<{ n: number; sig: number }>
const text = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`) as Promise<string>
/** Real typing path: focus the editor, select all, insert text (fires the same input events as a keyboard). */
const type = async (s: string) => { await js(`(() => { const a = document.querySelector('.ed-insp .dw-code textarea'); a.focus(); a.select() })()`); await cdp('Input.insertText', { text: s }); await sleep(500) }
const setRange = (sel: string, v: number) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, ${v}); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const clickText = (sel: string, label: string) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`)
const tab = (label: string) => clickText('.ed-right [role=tab]', label)
const frames = () => js(`document.querySelectorAll('.ed-frame').length`) as Promise<number>

const PROGRAM = `// blobs: three metaballs orbiting the centre
let a = .08 / length(u - .5 - .22 * cos(t), v - .5 - .22 * sin(t * 1.3));
let b = .07 / length(u - .5 - .2 * cos(t * .7 + 2), v - .5 - .25 * sin(t + 1));
let c = .06 / length(u - .5 + .18 * sin(t * 1.1), v - .5 + .2 * cos(t * .8));
smoothstep(.9, 1.6, a + b + c)`

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(base).origin }).catch(() => null)

  const opened = await go(`${base}?make=code&pro=1`)
  check('MAKE · CODE opens the editor with a code layer selected', opened, opened ? '' : `${logs.join(' | ')} ${(await js('document.body.innerText').catch(() => '')).slice(0, 300)}`)
  if (!opened) { await shot('00-failed'); throw new Error('editor did not open') }
  await sleep(1200)
  const first = await lit()
  check('the selected code frame (ripple) draws', first.n > 500, `${first.n} lit px`)
  await shot('01-open')

  await type(PROGRAM)
  await sleep(500)
  const typed = await lit(), status = await text('.ed-insp .dw-status')
  check('a typed program compiles and draws', typed.n > 500 && typed.sig !== first.sig && /OK/.test(status), `${typed.n} lit px; ${status}`)
  check('the character counter follows the source', status.includes(`${PROGRAM.length}/4096`), status)
  await shot('02-typed')

  await type(PROGRAM.replace('a + b + c)', 'a + b + c'))
  const err = await text('.dw-error')
  check('a syntax error shows line:col and marks it', /^\d+:\d+/.test(err) && await js(`!!document.querySelector('.dw-mirror mark') && !!document.querySelector('.dw-gutter-err')`), err)
  const kept = await lit()
  check('the frame keeps the last good program while the source is broken', kept.n > 500, `${kept.n} lit px`)
  await shot('03-error')
  await type(PROGRAM)

  // scrub: the ANIMATE tab previews the frame's timeline at t
  await tab('ANIMATE'); await sleep(300)
  await setRange('.ed-transport input', 0.5); await sleep(400); const at05 = await lit()
  await setRange('.ed-transport input', 2.5); await sleep(400); const at25 = await lit()
  const tOut = await text('.ed-t')
  check('scrubbing t redraws a different frame', at05.sig !== at25.sig && tOut.includes('2.50'), `${tOut}, sig ${at05.sig} → ${at25.sig}`)
  await sleep(400); const held = await lit()
  check('paused holds the scrubbed frame', held.sig === at25.sig)
  await shot('04-scrub')

  // copy link → reload from it: imported as a frame, and only once
  await tab('CODE'); await sleep(600)
  await clickText('.ed-insp button', 'COPY LINK'); await sleep(500)
  const url = await js(`window.__editorLink ?? ''`) as string
  check('COPY LINK makes a ?make=code&p=… link', /\?make=code&p=[bz][A-Za-z0-9_-]+$/.test(url) && (await text('.ed-share')).includes('COPIED'), `${url.length} chars`)
  check('the link is compact (deflated)', /&p=z/.test(url) && url.length < 400, url.slice(url.indexOf('&p=')).slice(0, 48) + '…')
  check('reloading from the link opens the same program', await go(url) && await waitFor(`document.querySelector('.ed-insp .dw-code textarea').value === ${JSON.stringify(PROGRAM)}`))
  await sleep(1000)
  const reloaded = await lit(), n1 = await frames()
  check('…and draws it', reloaded.n > 500, `${reloaded.n} lit px`)
  await go(url); await sleep(1500)
  check('opening the same link again re-selects its frame instead of adding a copy', await frames() === n1, `${n1} → ${await frames()}`)
  await shot('05-reloaded')

  // data sliders: insert the rain example (reads data.density) from ASSETS
  await clickText('.ed-left [role=tab]', 'ASSETS'); await sleep(400)
  await clickText('.ed-agroup[aria-label="Programs"] .ed-asset', 'rain'); await sleep(1200)
  const sliders = await js(`[...document.querySelectorAll('.ed-insp .ed-slider > span')].map(s => s.firstChild.textContent)`) as string[]
  check('data.* sliders are generated for referenced keys', sliders.join() === 'data.density', sliders.join())
  const r0 = await lit(); await setRange('.ed-insp .ed-slider input', 1); await sleep(600); const r1 = await lit()
  check('moving a data slider changes the frame', r1.n !== r0.n, `${r0.n} → ${r1.n} lit px`)
  await shot('07-data-slider')

  // broken links: corrupt bytes, and a well-formed link to an invalid program — error shown, nothing drawn
  await cdp('Page.navigate', { url: `${base}?tab=dots&p=zNotARealLink` })
  check('a corrupt link shows an error banner', await waitFor(`/Could not open/.test(document.querySelector('.ed-banner')?.textContent ?? '')`, 30000), await text('.ed-banner'))
  const bad = await encodeShare({ src: 'let x = u * ;\nx', grid: 'square', lattice: 2, tone: 'auto' })
  await go(`${base}?tab=dots&p=${bad}`); await waitFor(`!!document.querySelector('.dw-error')`); await sleep(900)
  const badLit = await lit()
  check('an invalid shared program shows its IR error and is not run', /^1:\d+/.test(await text('.dw-error')) && badLit.n === 0, `${await text('.dw-error')}; ${badLit.n} lit px`)
  await shot('08-bad-link')

  check('no uncaught errors in the page', logs.length === 0, logs.slice(0, 3).join(' | '))
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `\n${failures} browser check(s) failed` : '\nAll CODE (editor) browser checks passed')
process.exit(failures ? 1 : 0)
