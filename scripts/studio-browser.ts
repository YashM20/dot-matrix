/**
 * STUDIO tab (P6-D) in headless Chrome over CDP (Node's built-in WebSocket, no deps): build a card from
 * scratch (2 IR layers + text), scrub the timeline, fire a state transition, export an APNG, undo, and
 * import presets. Needs the dev server: `pnpm dev --port 5199`, then `npx tsx scripts/studio-browser.ts [baseUrl]`.
 * Screenshots (and the APNG) go to `.snapshots/p6d/`. Chrome path: $CHROME, else the usual install paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5199/'
const out = resolve('.snapshots', 'p6d')
mkdirSync(out, { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-p6d-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1680,1300', 'about:blank'], { stdio: 'ignore' })
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
const shot = async (name: string, selector?: string) => {
  const clip = selector ? await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height, scale: 1 } })()`) : undefined
  const r = await cdp('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip && { clip }) })
  writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64'))
}
const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
/** Lit pixels in the preview canvas + a cheap signature. */
const lit = () => js(`(() => { const c = document.querySelector('.st-canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sig = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) { n++; sig = (sig * 31 + i) % 1000003 } return { n, sig } })()`) as Promise<{ n: number; sig: number }>
const text = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`) as Promise<string>
const clickText = (sel: string, label: string) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`)
const setValue = (sel: string, v: string | number, event = 'input') => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })) })()`)
/** Set the input/select inside the `.st-num` label (under `scope`) whose text starts with `label`. */
const setLabeled = (scope: string, label: string, v: string | number, event = 'input') => js(`(() => { const l = [...document.querySelectorAll(${JSON.stringify(scope + ' .st-num')})].find(x => x.textContent.trim().startsWith(${JSON.stringify(label)})); const el = l.querySelector('input, select'); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })) })()`)
const typeIR = async (src: string) => { await js(`(() => { const a = document.querySelector('.st-right .dw-code textarea'); a.focus(); a.select() })()`); await cdp('Input.insertText', { text: src }); await sleep(300) }
const layerCount = () => js(`document.querySelectorAll('.st-layer').length`) as Promise<number>

const A = `// field a: drifting stripes, level lifts them
.5 + .5 * sin(u * 18 + v * 6 - t * 3) * (.4 + data.level)`
const B = `// field b: a soft disc that breathes
smoothstep(.42, .1, length(u - .5, v - .55)) * (.6 + .4 * sin(t * 2))`

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1300, deviceScaleFactor: 1, mobile: false })
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out }).catch(() => cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: out }))
  // `pro=1` opens every "More" fold (UX U4), so the panels this probe drives and screenshots are visible
  await cdp('Page.navigate', { url: `${base}?tab=studio&pro=1` })
  const opened = await waitFor(`!!document.querySelector('.st-canvas')`, 120000)
  check('STUDIO tab opens from ?tab=studio', opened, opened ? '' : logs.join(' | '))
  if (!opened) { await shot('00-failed'); throw new Error('tab did not open') }
  await sleep(1200)
  check('the starter card draws', (await lit()).n > 500)
  await shot('01-starter')

  // ── build from scratch: NEW → 2 IR layers (the second multiplied over the first) + a text layer
  await clickText('.st-toolbar button', 'NEW'); await sleep(300)
  check('NEW gives an empty card', await layerCount() === 0 && (await lit()).n < 50)
  await clickText('.st-add button', '+ IR'); await sleep(200); await typeIR(A)
  await setLabeled('.st-right', 'TONE', 'mid', 'change')
  await clickText('.st-add button', '+ IR'); await sleep(200); await typeIR(B)
  await setLabeled('.st-right', 'BLEND', 'multiply', 'change'); await sleep(200)
  await clickText('.st-add button', '+ TEXT'); await sleep(200)
  await setLabeled('.st-right', 'TEXT', 'DOT STUDIO'); await sleep(100)
  await setLabeled('.st-right', 'LATTICE', '2', 'change'); await sleep(150) // hero text on a 2× lattice
  await setLabeled('.st-right', 'COL', 12); await sleep(100)
  await setLabeled('.st-right', 'ROW', 110)
  await sleep(500)
  const names = await js(`[...document.querySelectorAll('.st-layer .st-layer-name')].map(b => b.textContent)`) as string[]
  const built = await lit()
  check('built 2 IR layers + a text layer', names.length === 3 && names.filter(n => n.startsWith('IR')).length === 2 && names[0].startsWith('TXT'), names.join(' | '))
  check('the built card draws through the pipeline', built.n > 500, `${built.n} lit px`)
  check('no IR errors', !(await js(`!!document.querySelector('.st-err')`)))
  await shot('02-built')
  await shot('02-built-preview', '.st-stage')

  // ── states: idle + "high" (level 1), one edge
  await clickText('.st-chips button', '+ STATE'); await sleep(200)
  await setLabeled('.st-left', 'DATA.level', 1.2)
  await clickText('.st-left button', '+ EDGE'); await sleep(300)
  check('a state and an edge were added', await js(`document.querySelectorAll('.st-edge-row').length`) === 1 && await js(`document.querySelectorAll('.st-chips button').length`) === 3)

  // ── scrub: enter (partial), hold (full), exit (partial)
  const at = async (t: number) => { await setValue('.st-scrub input', t); await sleep(250); return lit() }
  const enter = await at(.03), hold = await at(.9), change = await at(1.35), after = await at(2.2), exit = await at(2.99)
  check('scrub: the enter track reveals part of the card', enter.n < hold.n * .9 && enter.n > 0, `enter ${enter.n} vs hold ${hold.n}`)
  check('scrub: the change track moves the frame to the second state', change.sig !== hold.sig && after.sig !== hold.sig, `change ${change.n}, after ${after.n}`)
  check('scrub: the exit track hides part of the card', exit.n < after.n * .9, `exit ${exit.n} vs ${after.n}`)
  check('the timeline readout follows t', (await text('.st-t')).includes('2.99'))
  await at(1.4); await shot('03-scrub-change')

  // interaction frame budget: reset, scrub 20 times, read the slowest frame
  await js(`window.__studio.maxMs = 0`)
  for (let i = 0; i < 20; i++) await at(.5 + i * .1)
  const maxMs = await js(`window.__studio.maxMs`) as number
  check('interaction frames ≤ 16 ms on the 144² card', maxMs <= 16, `slowest ${maxMs.toFixed(2)} ms`)

  // ── fire the state transition
  await at(.9)
  await js(`window.__studio.maxMs = 0`)
  await clickText('.st-fire', 'FIRE')
  await sleep(120); const mid = await lit()
  await shot('04-fire-mid', '.st-stage')
  await sleep(900); const end = await lit()
  const now = await text('[aria-label="State machine"] h2 small')
  check('FIRE runs the edge and lands in the target state', /NOW S1/.test(now) && mid.sig !== end.sig, `${now}; mid ${mid.n}, end ${end.n}`)
  check('firing frames ≤ 16 ms', await js(`window.__studio.maxMs`) <= 16, `${(await js(`window.__studio.maxMs`) as number).toFixed(2)} ms`)
  await shot('04-fired')

  // ── APNG export of the timeline
  await setValue('select[aria-label="Clip format"]', 'apng', 'change')
  await setValue('select[aria-label="Frames per second"]', '12', 'change')
  await clickText('.st-side button', 'RECORD')
  const recorded = await waitFor(`!!window.__studioClip`, 30000)
  const clip = await js(`window.__studioClip`) as { format: string; size: number; frames: number; durationMs: number } | undefined
  check('APNG export: timeline frames encoded', recorded && clip?.format === 'apng' && clip.frames === 36 && Math.abs(clip.durationMs - 3000) < 1 && clip.size > 1000, JSON.stringify(clip))
  await sleep(1500)
  const file = readdirSync(out).find(f => f.endsWith('.apng') || f.endsWith('.png') && f.startsWith('untitled'))
  check('the APNG lands on disk', !!file && statSync(join(out, file)).size > 1000, file ?? 'no file')

  // ── undo / redo
  const before = await layerCount()
  // undo until a layer disappears (state + edge + scrubs are undo steps too), then redo it with Ctrl+Y
  let undone = before, steps = 0
  while (undone === before && steps < 12) { await clickText('.st-toolbar button', 'UNDO'); steps++; await sleep(120); undone = await layerCount() }
  const key = (type: string) => cdp('Input.dispatchKeyEvent', { type, key: 'y', code: 'KeyY', modifiers: 2, windowsVirtualKeyCode: 89 })
  await js(`document.activeElement?.blur()`); await key('keyDown'); await key('keyUp'); await sleep(250)
  check('undo walks the build back, Ctrl+Y redoes', undone === before - 1 && await layerCount() === before, `${before} → ${undone} (after ${steps} undo) → ${await layerCount()}`)

  // ── import presets: reference stack and spec v1 stack
  await setValue('select[aria-label="Preset to import"]', 'level-03', 'change')
  await clickText('.st-toolbar button', 'IMPORT REF'); await sleep(1200)
  const ref = await lit(), refLayers = await layerCount()
  check('level-03 imports as a read-only reference stack', refLayers > 3 && ref.n > 500 && (await text('.st-layer .st-layer-name')).startsWith('REF'), `${refLayers} layers, ${ref.n} px`)
  await sleep(1500)
  const score = await text('.st-side [aria-label="Scorecard"] h2')
  check('the scorecard scores the card', /\d\/\d GATES/.test(score), score)
  check('the bar sheet draws (candidate + 3 references × 4 views)', await js(`document.querySelector('.st-bar canvas').width`) > 1000)
  await shot('05-reference')
  await shot('05-bar-sheet', '.st-bar')
  await setValue('select[aria-label="Preset to import"]', 'afterlight', 'change')
  await clickText('.st-toolbar button', 'AS SPEC'); await sleep(1200)
  check('afterlight imports through card spec v1', await layerCount() > 0 && (await lit()).n > 500, await text('.st-note'))
  await shot('06-spec')
  await shot('06-devices', '[aria-label="Devices"]')

  // ── DOTS import
  await setValue('.st-dots-in', 'plasma'); await clickText('.st-toolbar button', 'IMPORT DOTS'); await sleep(800)
  check('a DOTS example imports as a one-layer card', await layerCount() === 1 && (await lit()).n > 500, await text('.st-note'))

  check('no exceptions or console errors', logs.length === 0, logs.slice(0, 3).join(' | '))
} catch (e) {
  check('run', false, String(e)); await shot('99-error').catch(() => null)
} finally {
  ws.close(); proc.kill()
}
if (failures) { console.error(`\n${failures} studio browser check(s) failed`); process.exit(1) }
console.log('\nAll studio browser checks passed')
