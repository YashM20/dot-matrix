/**
 * C10 (the explorable layer) in headless Chrome over CDP (Node's built-in WebSocket, no deps):
 * X-ray on three boards (hover tooltip, inspector, solo/mute, pixels unchanged once off), per-card X,
 * the time machine (T, scrub, Space), the ⌘K palette (search + open), the dot shell (help, ls, xray,
 * t, open), remix in DOTS and the Konami boss. Screenshots in `.snapshots/c10/`.
 *   pnpm dev --port 5201, then `npx tsx scripts/c10-browser.ts [baseUrl]`
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5201/'
const out = join('.snapshots', 'c10')
mkdirSync(out, { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-c10-'))
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
/** `C10_ONLY=time,shell` runs just those sections. */
const only = process.env.C10_ONLY?.split(',')
const run = (name: string) => !only || only.includes(name)
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const shot = async (name: string) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64')) }
const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
const count = (sel: string) => js(`document.querySelectorAll(${JSON.stringify(sel)}).length`) as Promise<number>
const text = (sel: string) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`) as Promise<string>
const KEYS: Record<string, { code: string; vk: number }> = { ' ': { code: 'Space', vk: 32 }, Enter: { code: 'Enter', vk: 13 }, Escape: { code: 'Escape', vk: 27 }, '`': { code: 'Backquote', vk: 192 }, ArrowUp: { code: 'ArrowUp', vk: 38 }, ArrowDown: { code: 'ArrowDown', vk: 40 }, ArrowLeft: { code: 'ArrowLeft', vk: 37 }, ArrowRight: { code: 'ArrowRight', vk: 39 } }
/** A real key press (keyDown + keyUp). `mods`: 2 ctrl, 8 shift. */
async function key(k: string, mods = 0, holdMs = 0) {
  const known = KEYS[k], ch = k.length === 1 ? k : ''
  const desc = { key: mods & 8 && ch ? ch.toUpperCase() : k, code: known?.code ?? `Key${k.toUpperCase()}`, windowsVirtualKeyCode: known?.vk ?? k.toUpperCase().charCodeAt(0), modifiers: mods }
  await cdp('Input.dispatchKeyEvent', { type: ch && !(mods & 2) ? 'keyDown' : 'rawKeyDown', ...desc, ...(ch && !(mods & 2) ? { text: desc.key } : {}) })
  if (holdMs) await sleep(holdMs)
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...desc })
  await sleep(120)
}
const typeText = async (s: string) => { await cdp('Input.insertText', { text: s }); await sleep(150) }
const move = (x: number, y: number) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
/** Centre (or a fraction inside) of the n-th card's dot surface (the canvas / svg inside the C7 skin wrapper, which is `display: contents` under OLED), in page px (after scrolling it into view). */
const cardPoint = (sel: string, fx = .5, fy = .5) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.scrollIntoView({ block: 'center' }); const b = el.querySelector('.dot-card-body .skin-surface > :first-child').getBoundingClientRect(); return { x: b.left + b.width * ${fx}, y: b.top + b.height * ${fy} } })()`) as Promise<{ x: number; y: number }>
/** Signature of a card's drawn pixels (canvas) or markup (svg). The first readback of a GPU canvas can differ in low bits: read twice. */
const cardSig = (sel: string) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); const c = el.querySelector('.dot-card-body canvas:not(.xr-grid)'); if (!c) return 'svg:' + (el.querySelector('.dot-svg')?.innerHTML.length ?? -1); const g = c.getContext('2d'); g.getImageData(0, 0, 1, 1); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0, s = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 60) { n++; s = (s * 31 + i + d[i]) % 1000003 } return n + ':' + s })()`) as Promise<string>
const open = async (query: string) => { await cdp('Page.navigate', { url: `${base}${query}` }); return waitFor(`document.querySelectorAll('[data-xr-key]').length > 0`, 30000) }

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false })
  await cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(base).origin }).catch(() => null)

  // ── X-ray on three boards
  if (run('xray')) {
  for (const [i, board, card] of [[1, 'henry', 'settings'], [2, 'levels', 'lv-queen'], [3, 'components', '']] as const) {
    const ok = await open(`?board=${board}`)
    check(`${board}: board opens`, ok, ok ? '' : logs.join(' | '))
    await sleep(1600)
    const cards = await count('.board-view [data-xr-key]')
    const target = card ? `.board-view [data-card-id="${card}"]` : '.board-view [data-xr-key]'
    const before = await cardSig(target)
    await key('x', 8)
    await waitFor(`document.querySelectorAll('.xr-overlay').length >= ${cards}`, 4000)
    check(`${board}: ⇧X x-rays every card`, (await count('.xr-overlay')) === cards, `${await count('.xr-overlay')}/${cards}`)
    // hover a lit dot: walk a few points until the tooltip names a layer
    let tip = ''
    // aim at a lit dot first (the brightest pixel row nearest the middle of the card's canvas), then wander
    const lp = await js(`(() => { const el = document.querySelector(${JSON.stringify(target)}); el.scrollIntoView({ block: 'center' }); const c = el.querySelector('.dot-card-body canvas:not(.xr-grid)'); if (!c) return null; const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let best = null, bd = 1e9; for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) { const i = (y * c.width + x) * 4; if (d[i] + d[i+1] + d[i+2] > 400) { const dd = Math.hypot(x - c.width / 2, y - c.height / 2); if (dd < bd) { bd = dd; best = [x / c.width, y / c.height] } } } if (!best) return null; const b = c.getBoundingClientRect(); return { x: b.left + best[0] * b.width, y: b.top + best[1] * b.height } })()`) as { x: number; y: number } | null
    if (lp) { await move(lp.x, lp.y); await sleep(300); tip = await text(`${target} .xr-tip`) }
    if (!/layer \d/.test(tip)) for (const [fx, fy] of [[.5, .5], [.3, .3], [.5, .2], [.2, .7], [.7, .6], [.1, .05], [.4, .8], [.08, .04], [.15, .05], [.25, .05], [.12, .3], [.12, .5], [.6, .3]]) {
      const p = await cardPoint(target, fx, fy)
      await move(p.x, p.y); await sleep(250)
      tip = await text(`${target} .xr-tip`)
      if (/layer \d/.test(tip)) break
    }
    check(`${board}: hover explains the dot (value → size step, tone, layer)`, /value .*(step|unquantized).*tone .* layer \d/.test(tip), tip.slice(0, 120))
    const hud = await text(`${target} .xr-hud`)
    check(`${board}: HUD shows renderer, fps, dots`, /(SVG|CANVAS|WEBGL)/.test(hud) && /DOTS/.test(hud) && !/^.*\b0 DOTS/.test(hud), hud)
    // U2: the inspector opens on SUMMARY (plain words); LAYERS is one tab behind it
    await waitFor(`!!document.querySelector('.xr-panel .xr-summary')`, 3000)
    check(`${board}: inspector opens on SUMMARY (dots, glossary words)`, /\d dots? on a/.test(await text('.xr-panel .xr-summary')) && (await count('.xr-panel .xr-summary .xr-term')) >= 5)
    await js(`[...document.querySelectorAll('.xr-tabs button')].find(b => b.textContent === 'LAYERS').click()`)
    await waitFor(`!!document.querySelector('.xr-panel .xr-layers li')`, 3000)
    const panel = await text('.xr-panel')
    check(`${board}: inspector lists layers + runtime`, /RENDERER/.test(panel) && (await count('.xr-panel .xr-layers li')) > 0, `${await count('.xr-panel .xr-layers li')} layers${/RENDERER/.test(panel) ? '' : '; no RENDERER in: ' + panel.slice(0, 120)}`)
    await shot(`0${i}-xray-${board}`)
    if (board === 'henry') {
      // solo / mute change the card; un-muting brings the exact frame back
      const muteSig0 = await cardSig(target)
      await js(`document.querySelector('.xr-panel .xr-layers li:last-child button[aria-label^="Solo"]').click()`); await sleep(700)
      const soloSig = await cardSig(target)
      check('solo a layer changes the card', soloSig !== muteSig0, `${muteSig0} → ${soloSig}`)
      await js(`document.querySelector('.xr-panel .xr-layers li:last-child button[aria-label^="Solo"]').click()`); await sleep(900)
      for (const tab of ['DATA', 'DESCRIBE', 'SPEC']) {
        await js(`[...document.querySelectorAll('.xr-tabs button')].find(b => b.textContent === '${tab}').click()`); await sleep(tab === 'SPEC' ? 900 : 200)
        const body = await text('.xr-tabpanel')
        check(`inspector ${tab.toLowerCase()} tab has content`, body.length > 20, body.slice(0, 80).replace(/\s+/g, ' '))
      }
      await shot('01b-xray-spec')
    }
    await key('x', 8)
    await waitFor(`document.querySelectorAll('.xr-overlay').length === 0`, 3000)
    await sleep(900)
    const after = await cardSig(target)
    check(`${board}: x-ray off leaves no overlay${board === 'henry' ? ' and the same pixels' : ''}`, (await count('.xr-overlay')) === 0 && (board !== 'henry' || after === before), board === 'henry' ? `${before} vs ${after}` : '')
  }

  }
  // ── per-card X while hovering
  if (run('card')) {
  await open('?board=metro'); await sleep(1500)
  const p = await cardPoint('.board-view [data-xr-key]:nth-child(2)')
  await move(p.x, p.y); await sleep(150)
  await key('x')
  check('X on a hovered card x-rays only that card', (await count('.xr-overlay')) === 1 && (await count('.board-view [data-xr-key]:nth-child(2) .xr-overlay')) === 1)
  await key('x')
  check('X again turns it off', (await count('.xr-overlay')) === 0)

  }
  // ── time machine
  if (run('time')) {
  // main-thread sampling: a seek redraws in the same animation frame (a loaded worker can answer seconds late)
  await open('?board=levels&worker=0'); await sleep(1500)
  await key('t', 0, 200)
  check('T freezes the clock and shows the time machine', await waitFor(`!!document.querySelector('.xr-time')`, 2000))
  await js(`(() => { const el = document.querySelector('.xr-time input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 5); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  // the seeked frame can land a few hundred ms late on a loaded machine (worker round trip): wait until it settles
  const settled = async (sel: string) => { let prev = await cardSig(sel); for (let i = 0; i < 15; i++) { await sleep(300); const s = await cardSig(sel); if (s === prev) return s; prev = s } return prev }
  const sigA = await settled('.board-view [data-card-id="lv-corridor"]')
  await sleep(1000)
  const sigB = await cardSig('.board-view [data-card-id="lv-corridor"]')
  const tShown = await text('.xr-time-t')
  check('scrubbing sets board time and the frame holds still', /T = 5\.00s/.test(tShown) && sigA === sigB, `${tShown}; frame ${sigA === sigB ? 'still' : 'moving'} ${sigA} ${sigB}`)
  await js(`(() => { const el = document.querySelector('.xr-time input[type=range]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, 9.5); el.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  const sigC = await settled('.board-view [data-card-id="lv-corridor"]')
  check('scrubbing to another t redraws animated cards', sigC !== sigB, `${sigB} → ${sigC}`)
  await shot('04-time-machine')
  await js(`document.activeElement?.blur()`)
  await key(' ')
  check('Space resumes', !(await js(`!!document.querySelector('.xr-time')`)))

  }
  // ── ⌘K palette
  if (run('palette')) {
  await key('k', 2)
  check('Ctrl-K opens the palette, focus in the combobox', await waitFor(`document.activeElement?.getAttribute('role') === 'combobox'`, 2000))
  await typeText('queen')
  // cards join the search once the lazy board chunks load
  await waitFor(`(document.querySelector('.pal-item--sel')?.textContent ?? '').includes('lv-queen')`, 8000)
  const first = await text('.pal-item--sel'), aria = await js(`(() => { const i = document.activeElement; return i.getAttribute('aria-activedescendant') === document.querySelector('[role=option][aria-selected=true]')?.id && i.getAttribute('aria-expanded') === 'true' && !!document.getElementById(i.getAttribute('aria-controls')) })()`)
  check('palette fuzzy-finds a card; ARIA combobox wiring holds', /lv-queen/.test(first) && aria, first)
  await shot('05-palette')
  await open('?board=henry'); await sleep(1200)
  // a fresh page: wait for the palette input to take focus before typing (the layer and its panels load lazily)
  await key('k', 2); await waitFor(`document.activeElement?.getAttribute('role') === 'combobox'`, 4000); await typeText('levels')
  await key('ArrowDown'); await key('ArrowUp')
  const pick = `${await text('.pal-item--sel')} (query "${await js(`document.querySelector('.pal input')?.value ?? ''`)}")`
  await key('Enter')
  const opened = await waitFor(`document.querySelector('.board-tabs .selected')?.textContent === 'LEVELS'`, 4000)
  check('palette search + Enter opens a board', opened && (await count('.pal')) === 0, pick)
  await key('k', 2); await waitFor(`document.activeElement?.getAttribute('role') === 'combobox'`, 4000); await typeText('xray every')
  await key('Enter'); await sleep(600)
  check('palette action toggles x-ray', (await count('.xr-overlay')) > 0)
  await key('x', 8); await sleep(300)

  }
  // ── dot shell
  if (run('shell')) {
  await key('`')
  check('` opens the dot shell', await waitFor(`!!document.querySelector('.pal-shell') && document.activeElement?.classList.contains('pal-shell-input')`, 2000))
  for (const c of ['help', 'ls', 'ls levels']) { await typeText(c); await key('Enter') }
  await sleep(500)
  await shot('06-shell')
  const live = await text('.pal-shell [aria-live]')
  check('shell prints ls output', /\d+ boards|lv-|LEVEL/i.test(live), live.slice(0, 100))
  await typeText('xray'); await key('Enter'); await sleep(500)
  check('shell xray turns x-ray on', (await count('.xr-overlay')) > 0)
  await typeText('xray off'); await key('Enter')
  await typeText('t 3'); await key('Enter'); await sleep(400)
  check('shell t 3 freezes at t = 3', /T = 3\.00s/.test(await text('.xr-time-t')), await text('.xr-time-t'))
  await typeText('fps'); await key('Enter'); await sleep(1200)
  check('shell fps measures', /page \d+ fps/.test(await text('.pal-shell [aria-live]')), await text('.pal-shell [aria-live]'))
  await typeText('open metro'); await key('Enter')
  check('shell open <board> switches board (and resumes the clock)', await waitFor(`document.querySelector('.board-tabs .selected')?.textContent === 'METRO' && !document.querySelector('.xr-time')`, 4000))
  await shot('06b-shell-open')
  await key('Escape')
  check('Esc closes the shell', (await count('.pal-shell')) === 0)

  }
  // ── remix in DOTS
  if (run('remix')) {
  await open('?board=ir'); await sleep(1500)
  await key('x', 8); await sleep(300)
  const ip = await cardPoint('.board-view [data-xr-key]')
  await move(ip.x, ip.y); await sleep(400)
  await js(`[...document.querySelectorAll('.xr-panel button')].find(b => b.textContent === 'OPEN IN CODE').click()`)
  const dots = await waitFor(`!!document.querySelector('.dw-code textarea') && document.querySelector('.dw-code textarea').value.length > 10`, 15000)
  const src = await js(`document.querySelector('.dw-code textarea')?.value ?? ''`) as string
  check('remix an IR card opens DOTS with its program', dots && !/remix of/.test(src), src.slice(0, 60).replace(/\n/g, ' '))
  await shot('07-remix-ir')
  await open('?board=henry'); await sleep(1500)
  await key('x', 8); await sleep(300)
  const hp = await cardPoint('.board-view [data-xr-key]')
  await move(hp.x, hp.y); await sleep(400)
  await js(`[...document.querySelectorAll('.xr-panel button')].find(b => b.textContent === 'OPEN IN CODE').click()`)
  await waitFor(`(document.querySelector('.dw-code textarea')?.value ?? '').includes('remix of')`, 8000)
  const stub = await js(`document.querySelector('.dw-code textarea')?.value ?? ''`) as string
  const stubErr = await text('.dw-status')
  check('remix a non-IR card opens a describe() stub that runs', /remix of/.test(stub) && !/error/i.test(stubErr), stubErr.slice(0, 80))
  await shot('07b-remix-stub')
  await open('?board=levels'); await sleep(1500)
  await key('x', 8); await sleep(300)
  const sp = await cardPoint('.board-view [data-card-id="lv-queen"]')
  await move(sp.x, sp.y); await sleep(400)
  await js(`[...document.querySelectorAll('.xr-panel button')].find(b => b.textContent === 'OPEN IN COMPOSE').click()`)
  const studio = await waitFor(`!!document.querySelector('.ed-root') && [...document.querySelectorAll('.ed-tree-frame.within .ed-row-name')].some(b => b.textContent.includes('lv-queen'))`, 15000)
  check('Open in compose adds the card to the editor as a frame (a layer stack)', studio)
  await sleep(800)
  await shot('07c-remix-studio')

  }
  // ── Konami
  if (run('konami')) {
  await open('?board=metro'); await sleep(1200)
  for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await key(k)
  check('Konami code opens the boss card', await waitFor(`!!document.querySelector('.pal-boss [data-card-id="lv-queen"]')`, 3000))
  await sleep(1400)
  await shot('08-boss')
  await key('Escape')
  check('Esc flees the boss', (await count('.pal-boss')) === 0)

  }
  const errs = logs.filter(l => !/favicon|ERR_|net::|403|font/i.test(l))
  check('no console errors or exceptions', !errs.length, errs.slice(0, 3).join(' | '))
} catch (e) {
  failures++
  console.log('✗ run aborted:', (e as Error).message)
  await shot('99-aborted').catch(() => null)
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* chrome may still hold it */ }
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall C10 browser checks pass')
process.exit(failures ? 1 : 0)
