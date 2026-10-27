/**
 * MAKE · COMPOSE (P6-D, now the editor, docs/EDITOR-PLAN.md) in headless Chrome over CDP (Node's built-in
 * WebSocket, no deps): drag out a frame, build it from scratch (2 code layers + text), add a state, scrub
 * the timeline, export an APNG, undo / redo, insert a preset as a reference frame, make it editable (card
 * spec v1), and insert a CODE example. Needs the dev server: `pnpm dev --port 5199`, then `npx tsx scripts/studio-browser.ts [baseUrl]`.
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
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1680,1050', 'about:blank'], { stdio: 'ignore' })
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
/** Lit pixels of the selected frame's canvas + a cheap signature. */
const lit = () => js(`(() => { const id = window.__editor?.sel; const c = id && document.querySelector('.ed-frame[data-frame="' + id + '"]'); if (!c) return { n: -1, sig: 0 }; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sig = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) { n++; sig = (sig * 31 + i) % 1000003 } return { n, sig } })()`) as Promise<{ n: number; sig: number }>
const text = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`) as Promise<string>
const clickText = (sel: string, label: string) => js(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)})).click()`)
const setValue = (sel: string, v: string | number, event = 'input') => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })) })()`)
/** Set the input/select of the inspector field whose label is `label`. */
const setLabeled = (label: string, v: string | number, event = 'input') => js(`(() => { const l = [...document.querySelectorAll('.ed-insp .ed-field')].find(x => x.querySelector('span')?.textContent.trim() === ${JSON.stringify(label)}); const el = l.querySelector('input, select'); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(String(v))}); el.dispatchEvent(new Event(${JSON.stringify(event)}, { bubbles: true })) })()`)
const typeIR = async (src: string) => { await js(`(() => { const a = document.querySelector('.ed-insp .dw-code textarea'); a.focus(); a.select() })()`); await cdp('Input.insertText', { text: src }); await sleep(400); await js(`document.activeElement?.blur()`) }
const tab = (label: string) => clickText('.ed-right [role=tab]', label)
const key = async (k: string, code: string, vk: number, modifiers = 0) => { await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk }); await sleep(150) }
const mouse = (type: string, x: number, y: number, buttons = 1) => cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1 })
const drag = async (x0: number, y0: number, x1: number, y1: number) => { await mouse('mouseMoved', x0, y0, 0); await mouse('mousePressed', x0, y0); for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / 12, y0 + (y1 - y0) * i / 12); await sleep(16) } await mouse('mouseReleased', x1, y1) }
const layerRows = () => js(`[...document.querySelectorAll('.ed-tree-frame.within .ed-row--layer .ed-row-name')].map(b => b.textContent)`) as Promise<string[]>
const rectOf = (sel: string) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })()`) as Promise<{ x: number; y: number; w: number; h: number }>

const A = `// field a: drifting stripes, level lifts them
.5 + .5 * sin(u * 18 + v * 6 - t * 3) * (.4 + data.level)`
const B = `// field b: a soft disc that breathes
smoothstep(.42, .1, length(u - .5, v - .55)) * (.6 + .4 * sin(t * 2))`

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1680, height: 1050, deviceScaleFactor: 1, mobile: false })
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: out }).catch(() => cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: out }))
  // `pro=1` opens every "More" fold (UX U4)
  await cdp('Page.navigate', { url: `${base}?make=compose&pro=1` })
  let opened = await waitFor(`!!document.querySelector('.ed-frame')`, 120000)
  await js(`localStorage.removeItem('dot480.editor.v1')`); await cdp('Page.reload')
  opened = opened && await waitFor(`!!document.querySelector('.ed-frame')`, 60000)
  check('MAKE · COMPOSE opens the editor from ?make=compose', opened, opened ? '' : logs.join(' | '))
  if (!opened) { await shot('00-failed'); throw new Error('editor did not open') }
  await sleep(1500)
  await js(`document.querySelector('.ed-flabel').click()`); await sleep(400)
  check('the seed frames draw (level-03 selected)', (await lit()).n > 500, `${(await lit()).n} lit px`)
  await shot('01-seed')

  // ── build from scratch: frame tool → 2 code layers (the second multiplied over the first) + a text layer
  const vp = await rectOf('.ed-viewport'), lastFrame = await rectOf('.ed-frame:last-of-type')
  await key('f', 'KeyF', 70)
  const x0 = lastFrame.x, y0 = Math.min(vp.y + vp.h - 360, lastFrame.y + lastFrame.h + 60)
  await drag(x0, y0, x0 + 324, y0 + 324); await sleep(900)
  check('the frame tool drags out a new empty frame', (await layerRows()).length === 0 && await js(`document.querySelectorAll('.ed-frame').length`) === 4)
  await tab('DESIGN'); await clickText('.ed-insp button', '+ CODE LAYER'); await sleep(400); await typeIR(A)
  await tab('DESIGN'); await setLabeled('TONE', 'mid', 'change'); await sleep(150)
  await key('Escape', 'Escape', 27)
  await tab('CODE'); await clickText('.ed-insp button', '+ CODE LAYER'); await sleep(400); await typeIR(B)
  await tab('DESIGN'); await setLabeled('BLEND', 'multiply', 'change'); await sleep(200)
  await key('Escape', 'Escape', 27)
  const fr = await js(`(() => { const c = document.querySelector('.ed-frame[data-frame="' + window.__editor.sel + '"]').getBoundingClientRect(); return { x: c.x, y: c.y, w: c.width, h: c.height } })()`) as { x: number; y: number; w: number; h: number }
  await key('t', 'KeyT', 84)
  await mouse('mouseMoved', fr.x + 20, fr.y + fr.h * .7, 0); await mouse('mousePressed', fr.x + 20, fr.y + fr.h * .7); await mouse('mouseReleased', fr.x + 20, fr.y + fr.h * .7); await sleep(500)
  await cdp('Input.insertText', { text: 'DOT STUDIO' }); await sleep(200); await js(`document.activeElement?.blur()`)
  await setLabeled('COL', 12); await sleep(100)
  await setLabeled('ROW', 110); await sleep(600)
  const names = await layerRows(), built = await lit()
  check('built 2 code layers + a text layer', names.length === 3 && names.filter(n => n.startsWith('CODE')).length === 2 && names[0].startsWith('TEXT'), names.join(' | '))
  check('the built frame draws through the pipeline', built.n > 500, `${built.n} lit px`)
  check('no IR errors', !(await js(`!!document.querySelector('.ed-err')`)))
  await shot('02-built')

  // ── states: idle + a second state with level 1.2
  await key('Escape', 'Escape', 27)
  await tab('ANIMATE'); await sleep(200)
  await clickText('.ed-chips button', '+ STATE'); await sleep(200)
  await setLabeled('DATA.level', 1.2); await sleep(200)
  check('a state was added', await js(`document.querySelectorAll('.ed-chips [role=radio]').length`) === 2)

  // ── scrub: enter (partial), hold (full), change, exit (partial)
  const at = async (t: number) => { await setValue('.ed-transport input', t); await sleep(300); return lit() }
  const enter = await at(.03), hold = await at(.9), change = await at(1.35), after = await at(2.2), exit = await at(2.99)
  check('scrub: the enter track reveals part of the frame', enter.n < hold.n * .9 && enter.n > 0, `enter ${enter.n} vs hold ${hold.n}`)
  check('scrub: the change track moves the frame to the second state', change.sig !== hold.sig && after.sig !== hold.sig, `change ${change.n}, after ${after.n}`)
  check('scrub: the exit track hides part of the frame', exit.n < after.n * .9, `exit ${exit.n} vs ${after.n}`)
  check('the timeline readout follows t', (await text('.ed-t')).includes('2.99'))
  await at(1.4); await shot('03-scrub-change')
  await js(`window.__editor.maxMs = 0`)
  for (let i = 0; i < 20; i++) await at(.5 + i * .1)
  const maxMs = await js(`window.__editor.maxMs`) as number
  check('scrub frames ≤ 24 ms on the 144² frame (sample + draw at canvas resolution)', maxMs <= 24, `slowest ${maxMs.toFixed(2)} ms`)

  // ── APNG export of the timeline
  await tab('EXPORT'); await sleep(200)
  await setLabeled('FORMAT', 'apng', 'change'); await setLabeled('FPS', '12', 'change')
  await clickText('.ed-insp button', 'RECORD')
  const recorded = await waitFor(`!!window.__editorClip`, 30000)
  const clip = await js(`window.__editorClip`) as { format: string; size: number; frames: number; durationMs: number } | undefined
  check('APNG export: timeline frames encoded', recorded && clip?.format === 'apng' && clip.frames === 36 && Math.abs(clip.durationMs - 3000) < 1 && clip.size > 1000, JSON.stringify(clip))
  await sleep(1500)
  const file = readdirSync(out).find(f => f.endsWith('.apng') || f.startsWith('frame') && f.endsWith('.png'))
  check('the APNG lands on disk', !!file && statSync(join(out, file)).size > 1000, file ?? 'no file')
  await shot('04-export')

  // ── undo / redo (Ctrl+Z until a layer disappears, then Ctrl+Y)
  const before = (await layerRows()).length
  let undone = before, steps = 0
  await js(`document.activeElement?.blur()`)
  while (undone === before && steps < 14) { await key('z', 'KeyZ', 90, 2); steps++; undone = (await layerRows()).length }
  await key('y', 'KeyY', 89, 2); await sleep(200)
  check('undo walks the build back, Ctrl+Y redoes', undone === before - 1 && (await layerRows()).length === before, `${before} → ${undone} (after ${steps} undo) → ${(await layerRows()).length}`)

  // ── assets: a preset as a reference frame, then MAKE EDITABLE (card spec v1)
  await clickText('.ed-left [role=tab]', 'ASSETS'); await sleep(300)
  await setValue('.ed-search', 'level-03'); await sleep(300) // search opens the folded boards
  await js(`[...document.querySelectorAll('.ed-asset')].find(b => b.querySelector('small')?.textContent === 'level-03').click()`); await sleep(1500)
  await clickText('.ed-left [role=tab]', 'LAYERS'); await sleep(300)
  const ref = await lit(), refRows = await layerRows()
  check('level-03 inserts as a read-only reference frame', refRows.length > 3 && ref.n > 500 && refRows[0].startsWith('REF'), `${refRows.length} layers, ${ref.n} px`)
  await shot('05-reference')
  await tab('DESIGN'); await clickText('.ed-insp button', 'MAKE EDITABLE'); await sleep(1500)
  const spec = await layerRows()
  check('MAKE EDITABLE re-imports it through card spec v1', spec.length > 0 && !spec[0].startsWith('REF') && (await lit()).n > 500, spec.slice(0, 3).join(' | '))
  await shot('06-spec')

  // ── a CODE example as a one-layer frame
  await clickText('.ed-left [role=tab]', 'ASSETS'); await sleep(300)
  await setValue('.ed-search', ''); await sleep(200)
  await clickText('.ed-agroup[aria-label="Programs"] .ed-asset', 'plasma'); await sleep(1200)
  await clickText('.ed-left [role=tab]', 'LAYERS'); await sleep(300)
  check('a CODE example inserts as a one-layer frame', (await layerRows()).length === 1 && (await lit()).n > 500)

  check('no exceptions or console errors', logs.length === 0, logs.slice(0, 3).join(' | '))
} catch (e) {
  check('run', false, String(e)); await shot('99-error').catch(() => null)
} finally {
  ws.close(); proc.kill()
}
if (failures) { console.error(`\n${failures} studio browser check(s) failed`); process.exit(1) }
console.log('\nAll studio (editor) browser checks passed')
