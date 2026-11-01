/**
 * T5 picker probe (docs/LAYOUT-THEME-PLAN.md §5 T5 gate: "touch probe for the sheet; reduced-motion probe"), headless
 * Chrome over CDP (Node's built-in WebSocket, no deps). Serves `dist/` itself on port 4381 (the production CSP and
 * page rewrites from `vercel.json`, like `theme-boot.ts`) and checks:
 *  - desktop (1280 × 800, a mouse): THEME opens on 100 ms of hover intent (not before, focus stays put) and closes
 *    150 ms after the mouse leaves; hovering a swatch or a scheme previews it on the popover only; a click switches
 *    the page through one view transition whose wipe starts at the pressed swatch, persists, and cleans up; the
 *    keyboard opens it on the current scheme, arrows pick, Escape returns focus;
 *  - the share-link opt-in: "Copy deep link" carries `?theme=` only when it is on;
 *  - ⌘K: "Theme: system / light / dark", "Accent: <name>" and "Accent: next" replace the raw theme ids;
 *  - URL params: `?theme=` / `?scheme=` + `?accent=` apply and aren't stored; a pick drops them from the URL;
 *  - reduced motion (the OS setting, and the palette's override): a pick is instant, with no view transition;
 *  - touch (390 × 844, touch emulation): TOOLS › THEME has 44 px targets, no overflow, and taps switch scheme and
 *    accent with the sheet staying open; the header THEME button is hidden;
 *  - CARD SIZE: the popover's labelled radio group (LARGE checked by default, one tab stop), a click reflows the
 *    components board (3 → 4 a row at 1280) without re-mounting a card and stores it, arrows pick, a reload keeps
 *    it, ⌘K "Card size: large" runs; on a phone TOOLS › DISPLAY › COMPACT puts 2 a row.
 * Captures to look at go to `.snapshots/t5/` (the popover previewing, an accent and a scheme wipe held at 20% and 45%, the phone sheet).
 * Needs a build: `npx vite build`, then `npx tsx scripts/site/theme-picker.ts`. Chrome: $CHROME or the usual paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'

const DIST = 'dist', PORT = Number(process.env.PORT) || 4381
if (!existsSync(join(DIST, 'index.html'))) { console.log('no dist/index.html (run npx vite build first): skipped'); process.exit(0) }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[]; rewrites?: { source: string; destination: string }[] }
const CSP = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')!.value
const REWRITES = new Map((vercel.rewrites ?? []).filter(r => !r.source.includes('(')).map(r => [r.source, r.destination]))
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  let file = join(DIST, normalize(decodeURIComponent(REWRITES.get(url) ?? url)).replace(/^([\\/])+/, ''))
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
await new Promise<void>(r => server.listen(PORT, '127.0.0.1', r))
const base = `http://127.0.0.1:${PORT}`

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); server.close(); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-theme-picker-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 150 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>()
const errors: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 50; i++) { if (await js(expr).catch(() => false)) return true; await sleep(50) } return false }
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail && !ok ? ` — ${detail}` : ''}`); if (!ok) failures++ }

// before any page script: record view transitions (and where the wipe starts) and copied text
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  window.__vt = []; window.__copied = []; window.__ev = []
  // boundary events, to explain a popover that closes on its own
  for (const t of ['pointerout', 'pointerover', 'pointerdown', 'focusout']) document.addEventListener(t, e => window.__ev.push([Math.round(performance.now()), t, e.target?.className?.baseVal ?? e.target?.className ?? e.target?.nodeName, document.documentElement.classList.contains('theme-wipe')].join(' ')), true)
  const real = document.startViewTransition && document.startViewTransition.bind(document)
  if (real) document.startViewTransition = cb => {
    const s = document.documentElement.style, e = { x: parseFloat(s.getPropertyValue('--wipe-x')), y: parseFloat(s.getPropertyValue('--wipe-y')), wipe: document.documentElement.classList.contains('theme-wipe'), ran: '' }
    window.__vt.push(e)
    const t = real(cb)
    // 'ran': the pseudo-elements were built and the mask animation ran (not skipped)
    // with window.__hold set, the wipe is paused on its first frame (window.__held), so the probe can step through it
    t.ready.then(() => { const a = document.getAnimations().find(a => a.animationName === 'theme-wipe'); e.ran = a ? 'wipe' : 'no-wipe-animation'; if (a && window.__hold) { a.pause(); window.__held = a } }, err => { e.ran = 'skipped: ' + err.name })
    return t
  }
  if (navigator.clipboard) navigator.clipboard.writeText = t => { window.__copied.push(t); return Promise.resolve() }
})()` })
await cdp('Page.enable'); await cdp('Runtime.enable')

const html = (k: 'scheme' | 'accent') => js(`document.documentElement.dataset.${k}`) as Promise<string>
const centreOf = async (sel: string) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.scrollIntoView({ block: 'nearest' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } })()`) as Promise<{ x: number; y: number; w: number; h: number } | null>
const move = (x: number, y: number) => cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' })
const click = async (x: number, y: number) => { await move(x, y); await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 }); await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 }) }
const tap = async (x: number, y: number) => { await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(30); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }) }
// Enter carries its text, so a focused button activates as with a real key
const key = (k: string, code: string, vk: number, modifiers = 0) => cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, ...(k === 'Enter' ? { text: String.fromCharCode(13) } : {}) }).then(() => cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers }))
const stored = () => js(`localStorage.getItem('dot480:theme')`) as Promise<string | null>
const open = async (path: string, { os = 'dark', reduce = false, phone = false, keep = false } = {}) => {
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: os }, { name: 'prefers-reduced-motion', value: reduce ? 'reduce' : 'no-preference' }] })
  await cdp('Emulation.setDeviceMetricsOverride', phone ? { width: 390, height: 844, deviceScaleFactor: 1, mobile: true } : { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  await cdp('Emulation.setTouchEmulationEnabled', phone ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
  if (!keep) { await cdp('Page.navigate', { url: base + '/' }); await waitFor('document.readyState === "complete"'); await js(`localStorage.removeItem('dot480:theme'); localStorage.removeItem('dot480:share-theme'); localStorage.removeItem('dot480:cards'); localStorage.setItem('dot480:intro', 'off')`) }
  await cdp('Page.navigate', { url: base + path })
  await waitFor('document.readyState === "complete"')
  // the command layer (dock, sheets, ⌘K) mounts once the page is idle
  await waitFor(phone ? '!!document.querySelector(".tabbar")' : '!!document.querySelector(".pal-dock") && !!document.querySelector(".theme-menu-btn")', 10000)
  await move(5, 790)
}
/** A viewport capture to look at: `.snapshots/t5/<name>.png`. */
const shot = async (name: string) => {
  const r = await cdp('Page.captureScreenshot', { format: 'png' })
  if (r.result?.data) { mkdirSync(join('.snapshots', 't5'), { recursive: true }); writeFileSync(join('.snapshots', 't5', `${name}.png`), Buffer.from(r.result.data, 'base64')) }
}
/** Holds the running wipe at 20% and 45% of its time and captures each (`<name>-20.png`, `<name>-45.png`), then lets it finish. */
// (arm it with `window.__hold = true` before the pick)
const holdWipe = async (name: string) => {
  check(`${name}: the wipe was held on its first frame`, await waitFor('!!window.__held', 3000))
  for (const f of [0.2, 0.45]) {
    await js(`(() => { const a = window.__held; if (a) a.currentTime = a.effect.getTiming().duration * ${f} })()`)
    await sleep(120); await shot(`${name}-${Math.round(f * 100)}`)
    const m = await js(`(() => { const c = getComputedStyle(document.documentElement, '::view-transition-new(root)'); return { layers: (c.maskImage.match(/radial-gradient/g) || []).length, wipe: c.getPropertyValue('--wipe'), f: c.getPropertyValue('--wipe-f'), mask: c.maskImage.slice(0, 160), vt: window.__vt.length, last: window.__vt.at(-1), cls: document.documentElement.className, anims: document.getAnimations().map(a => a.animationName + ':' + a.playState) } })()`) as { layers: number; wipe: string; f: string; mask: string }
    check(`${name} at ${f * 100}%: the mask resolves (7 layers, the front part-way)`, m.layers === 7 && +m.wipe > 0 && +m.wipe < 1, JSON.stringify(m))
  }
  await js(`window.__hold = false; window.__held?.play(); window.__held = null`)
}
const vts = () => js('window.__vt.length') as Promise<number>

try {
  // ── desktop: hover intent, live preview, a pick and its wipe ──
  await open('/')
  const btn = (await centreOf('.theme-menu-btn'))!
  check('THEME sits right after DISPLAY ▾ in the header', await js(`document.querySelector('.skin-switch')?.nextElementSibling?.classList.contains('theme-switch')`) === true)
  // timed in the page (a busy machine stretches the round trips): when the mouse arrived, when the popover appeared
  await js(`new MutationObserver((_, o) => { if (document.querySelector('.theme-pop')) { window.__popAt = performance.now(); o.disconnect() } }).observe(document.body, { childList: true, subtree: true }); window.__t0 = performance.now()`)
  await move(btn.x, btn.y)
  check('hover intent: open, after ≥ 100 ms of rest', await waitFor('!!document.querySelector(".theme-pop")', 3000) && await js('window.__popAt - window.__t0 >= 99') === true, String(await js('window.__popAt - window.__t0')))
  check('hover-opened: focus stays outside the popover', await js('!document.querySelector(".theme-pop").contains(document.activeElement)') === true)
  const cobalt = (await centreOf('.theme-pop [data-accent="cobalt"][role=option]'))!
  await move(btn.x, cobalt.y - 30); await move(cobalt.x, cobalt.y); await sleep(60)
  const pv = await js(`(() => { const p = document.querySelector('.theme-pop'); return { pop: p.dataset.accent, page: document.documentElement.dataset.accent, red: getComputedStyle(p).getPropertyValue('--red').trim(), pageRed: getComputedStyle(document.documentElement).getPropertyValue('--red').trim() } })()`) as { pop: string; page: string; red: string; pageRed: string }
  await shot('popover-preview')
  check('live preview: hovering cobalt re-tints the popover only', pv.pop === 'cobalt' && pv.page === 'signal' && pv.red !== pv.pageRed, JSON.stringify(pv))
  const light = (await centreOf('.theme-pop .theme-seg [role=radio]:nth-child(2)'))!
  await move(light.x, light.y); await sleep(60)
  check('live preview: hovering LIGHT shows the popover on paper', await js(`document.querySelector('.theme-pop').dataset.scheme`) === 'light' && await html('scheme') === 'dark')
  await move(cobalt.x, cobalt.y); await sleep(30)
  const before = await vts()
  await js('window.__hold = true')
  await click(cobalt.x, cobalt.y)
  // the wipe held at 25% and 55% (its animation paused), to look at (.snapshots/t5/wipe-*.png)
  await waitFor(`document.getAnimations().some(a => a.animationName === 'theme-wipe')`, 2000)
  await holdWipe('wipe-accent')
  await sleep(150)
  check('the popover stays open through the wipe (the mouse did not move)', await js('!!document.querySelector(".theme-pop")') === true, String(await js('window.__ev.slice(-12).join(" | ")')))
  check('a click on cobalt switches the page', await waitFor(`document.documentElement.dataset.accent === 'cobalt'`, 3000))
  const vt = await js('window.__vt.at(-1)') as { x: number; y: number; wipe: boolean } | undefined
  await waitFor('!!window.__vt.at(-1)?.ran', 2000)
  check('the transition runs the theme-wipe mask animation (not skipped)', await js('window.__vt.at(-1)?.ran') === 'wipe', String(await js('window.__vt.at(-1)?.ran')))
  check('one view transition, its wipe starting at the pressed swatch', (await vts()) === before + 1 && !!vt?.wipe && Math.abs(vt.x - cobalt.x) <= 2 && Math.abs(vt.y - cobalt.y) <= 2, JSON.stringify({ vt, cobalt }))
  check('the pick is stored', (await stored())?.includes('"cobalt"') === true, String(await stored()))
  check('the wipe cleans up (class and origin vars gone)', await waitFor(`!document.documentElement.classList.contains('theme-wipe') && !document.documentElement.style.getPropertyValue('--wipe-x')`, 4000))
  await move(btn.x + 400, 600)
  check('hover-opened popover closes once the mouse leaves', await waitFor('!document.querySelector(".theme-pop")', 2000))

  // ── keyboard ──
  await js(`document.querySelector('.theme-menu-btn').focus()`)
  await key('Enter', 'Enter', 13)
  check('Enter opens it with focus on the current scheme', await waitFor(`document.activeElement?.matches('.theme-pop [role=radio][aria-checked=true]')`, 3000))
  await js('window.__hold = true')
  await key('ArrowRight', 'ArrowRight', 39)
  await holdWipe('wipe-scheme')
  check('ArrowRight picks the next scheme (system → light)', await waitFor(`document.documentElement.dataset.scheme === 'light'`, 3000) && (await stored())?.includes('"light"') === true)
  await js('new Promise(r => setTimeout(r, 900))')
  await key('Escape', 'Escape', 27)
  check('Escape closes and returns focus to THEME', await waitFor(`!document.querySelector('.theme-pop') && document.activeElement?.classList.contains('theme-menu-btn')`, 2000))

  // ── share-link opt-in, through ⌘K "Copy deep link" ──
  const copyLink = async () => {
    await key('k', 'KeyK', 75, 2)
    await waitFor('!!document.querySelector(".pal input")', 4000)
    await cdp('Input.insertText', { text: 'copy deep link to this view' }); await sleep(150)
    await key('Enter', 'Enter', 13); await sleep(200)
    return js('window.__copied.at(-1)') as Promise<string | undefined>
  }
  const plain = await copyLink()
  check('share opt-in off: a copied link has no theme', !!plain && !plain.includes('theme='), String(plain))
  await click(btn.x, btn.y)
  await waitFor('!!document.querySelector(".theme-share")', 3000)
  await js(`document.querySelector('.theme-share').click()`)
  check('the opt-in is a switch and is stored', await js(`document.querySelector('.theme-share').getAttribute('aria-checked') === 'true' && localStorage.getItem('dot480:share-theme') === '1'`) === true)
  await key('Escape', 'Escape', 27)
  const themed = await copyLink()
  check('share opt-in on: the link carries ?theme=light_cobalt', !!themed && new URL(themed).searchParams.get('theme') === 'light_cobalt', String(themed))

  // ── ⌘K commands ──
  await key('k', 'KeyK', 75, 2)
  await waitFor('!!document.querySelector(".pal input")', 4000)
  await cdp('Input.insertText', { text: 'theme' }); await sleep(200)
  const rows = await js(`[...document.querySelectorAll('.pal-item')].map(e => e.textContent)`) as string[]
  check('⌘K lists "Theme: system / light / dark", not the raw theme ids', ['Theme: system', 'Theme: light', 'Theme: dark'].every(t => rows.some(r => r.includes(t))) && !rows.some(r => /(dark|light)_(signal|amber|phosphor|cyan|cobalt|vite|magenta)/.test(r)), rows.slice(0, 12).join(' | '))
  await key('Escape', 'Escape', 27); await sleep(100)
  await key('k', 'KeyK', 75, 2)
  await waitFor('!!document.querySelector(".pal input")', 4000)
  await cdp('Input.insertText', { text: 'accent magenta' }); await sleep(200)
  check('⌘K "accent magenta" ranks "Accent: magenta" first', (await js(`document.querySelector('.pal-item')?.textContent`) as string)?.includes('Accent: magenta'))
  await key('Enter', 'Enter', 13)
  check('…and runs it', await waitFor(`document.documentElement.dataset.accent === 'magenta'`, 3000))
  await sleep(900)
  await key('k', 'KeyK', 75, 2)
  await waitFor('!!document.querySelector(".pal input")', 4000)
  await cdp('Input.insertText', { text: 'accent next' }); await sleep(200)
  await key('Enter', 'Enter', 13)
  check('⌘K "Accent: next" cycles (magenta → signal)', await waitFor(`document.documentElement.dataset.accent === 'signal'`, 3000))

  // ── URL params ──
  await open('/?theme=light_vite')
  check('?theme=light_vite applies and is not stored', await html('scheme') === 'light' && await html('accent') === 'vite' && await stored() === null)
  await open('/?scheme=dark&accent=cyan', { os: 'light' })
  check('?scheme=dark&accent=cyan applies', await html('scheme') === 'dark' && await html('accent') === 'cyan')
  await click(btn.x, btn.y)
  await waitFor('!!document.querySelector(".theme-pop [data-accent=amber]")', 3000)
  const amber = (await centreOf('.theme-pop [data-accent="amber"][role=option]'))!
  await click(amber.x, amber.y)
  await waitFor(`document.documentElement.dataset.accent === 'amber'`, 3000)
  check('a pick drops the theme params from the URL and stores what was shown', await js(`!/[?&](theme|scheme|accent)=/.test(location.search)`) === true && await stored() === '{"scheme":"dark","accent":"amber"}', `${await js('location.search')} ${await stored()}`)

  // ── reduced motion: instant, no transition ──
  await open('/', { reduce: true })
  await click(btn.x, btn.y)
  await waitFor('!!document.querySelector(".theme-pop [data-accent=phosphor]")', 3000)
  const instant = await js(`(() => { const n = window.__vt.length; document.querySelector('.theme-pop [data-accent=phosphor]').click(); return { now: document.documentElement.dataset.accent, vt: window.__vt.length - n, wipe: document.documentElement.classList.contains('theme-wipe') } })()`) as { now: string; vt: number; wipe: boolean }
  check('reduced motion (OS): the switch is instant, with no view transition', instant.now === 'phosphor' && instant.vt === 0 && !instant.wipe, JSON.stringify(instant))
  const seg = await js(`(() => { const n = window.__vt.length; document.querySelector('.theme-pop .theme-seg [role=radio]:nth-child(2)').click(); return { now: document.documentElement.dataset.scheme, vt: window.__vt.length - n } })()`) as { now: string; vt: number }
  check('reduced motion (OS): a scheme pick is instant too', seg.now === 'light' && seg.vt === 0, JSON.stringify(seg))
  await open('/')
  await key('k', 'KeyK', 75, 2)
  await waitFor('!!document.querySelector(".pal input")', 4000)
  await cdp('Input.insertText', { text: 'reduced motion: on' }); await sleep(200)
  await key('Enter', 'Enter', 13); await sleep(200)
  await click(btn.x, btn.y)
  await waitFor('!!document.querySelector(".theme-pop [data-accent=vite]")', 3000)
  const over = await js(`(() => { const n = window.__vt.length; document.querySelector('.theme-pop [data-accent=vite]').click(); return { now: document.documentElement.dataset.accent, vt: window.__vt.length - n } })()`) as { now: string; vt: number }
  check('reduced motion (the ⌘K override): instant, no view transition', over.now === 'vite' && over.vt === 0, JSON.stringify(over))

  // ── T6: the custom hue ──
  await open('/')
  await click(btn.x, btn.y)
  await waitFor('!!document.querySelector(".theme-pop .theme-custom")', 3000)
  check('the custom swatch is the 8th option, a rim before any hue is set', await js(`(() => { const o = [...document.querySelectorAll('.theme-pop [role=option]')]; return o.length === 8 && o[7].classList.contains('theme-custom') && !!o[7].querySelector('.theme-disc--ring') })()`) === true)
  const cu = (await centreOf('.theme-pop .theme-custom'))!
  await click(cu.x, cu.y)
  check('a click picks custom at the current accent\'s hue (signal, 29°) and opens the hue slider', await waitFor(`document.documentElement.dataset.accent === 'custom' && !!document.getElementById('theme-custom') && !!document.querySelector('.theme-pop .theme-hue input')`, 6000) && await js(`document.querySelector('.theme-pop .theme-hue input').value`) === '29', String(await stored())?.slice(0, 80))
  const track = await js(`document.querySelectorAll('.theme-pop .theme-hue-track circle').length`)
  check('the slider track is 36 dots in their own generated colours', track === 36, String(track))
  const red0 = await js(`getComputedStyle(document.documentElement).getPropertyValue('--red').trim()`)
  // the range is a native control: set it as the browser would on a drag, then let the rAF apply it
  await js(`(() => { const i = document.querySelector('.theme-pop .theme-hue input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '212'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  check('moving the slider re-generates the theme (the page --red changes, hue 212 is stored with its CSS)', await waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--red').trim() !== ${JSON.stringify(red0)} && (localStorage.getItem('dot480:theme') || '').includes('"hue":212')`, 4000))
  const s1 = JSON.parse((await stored())!) as { accent: string; css: string }
  check('the stored custom theme scopes both schemes', s1.accent === 'custom' && s1.css.includes('[data-scheme="dark"][data-accent="custom"]') && s1.css.includes('[data-scheme="light"][data-accent="custom"]'))
  await open('/', { keep: true })
  check('a reload boots the custom hue before first paint (the boot script writes its style)', await html('accent') === 'custom' && await js(`!!document.getElementById('theme-custom')`) === true)
  await click(btn.x, btn.y)
  await waitFor('!!document.querySelector(".theme-pop [data-accent=cobalt][role=option]")', 3000)
  await js(`document.querySelector('.theme-pop [data-accent=cobalt][role=option]').click()`)
  check('a preset pick leaves custom, and the stored hue stays for the custom swatch', await waitFor(`document.documentElement.dataset.accent === 'cobalt'`, 3000) && (await stored())?.includes('"hue":212') === true)
  await key('Escape', 'Escape', 27)

  // ── CARD SIZE (src/site/cards.ts): a radio group under the theme; a pick reflows the grid, persists, survives a reload ──
  const firstRow = `(() => { const ys = [...document.querySelectorAll('.board-grid > .dot-card')].map(c => Math.round(c.getBoundingClientRect().top)); return ys.filter(y => y === ys[0]).length })()`
  const cardsSel = '.theme-pop .theme-cards [role=radiogroup]'
  await open('/components/')
  await waitFor('!!document.querySelector(".board-grid canvas, .board-grid svg")', 10000)
  check('card size: LARGE by default (data-cards="l", 3 cards in the first row at 1280)', await js(`document.documentElement.dataset.cards`) === 'l' && await js(firstRow) === 3, String(await js(firstRow)))
  await click(btn.x, btn.y)
  await waitFor(`!!document.querySelector(${JSON.stringify(cardsSel)})`, 3000)
  const group = await js(`(() => { const g = document.querySelector(${JSON.stringify(cardsSel)}); const r = [...g.querySelectorAll('[role=radio]')]; return { label: g.getAttribute('aria-label'), names: r.map(b => b.getAttribute('aria-label')), checked: r.map(b => b.getAttribute('aria-checked')), tab: r.map(b => b.tabIndex) } })()`) as { label: string; names: string[]; checked: string[]; tab: number[] }
  check('card size: a labelled radio group of three named radios, LARGE checked and the only tab stop', group.label === 'Card size' && group.names.length === 3 && group.names.every(n => /^(large|medium|compact): /.test(n)) && group.checked.join() === 'true,false,false' && group.tab.join() === '0,-1,-1', JSON.stringify(group))
  const compact = (await centreOf(`${cardsSel} [role=radio]:nth-child(3)`))!
  await js(`window.__card0 = document.querySelector('.board-grid > .dot-card canvas, .board-grid > .dot-card svg')`)
  await click(compact.x, compact.y)
  check('card size: a click on COMPACT sets data-cards="s", stores it and reflows to 4 a row at 1280', await waitFor(`document.documentElement.dataset.cards === 's' && localStorage.getItem('dot480:cards') === 's' && ${firstRow} === 4`, 3000), String(await js(firstRow)))
  check('card size: nothing re-mounts (the first card keeps its drawing surface)', await js(`!!window.__card0 && window.__card0.isConnected && document.querySelector('.board-grid > .dot-card canvas, .board-grid > .dot-card svg') === window.__card0`) === true)
  check('card size: the popover stays open', await js('!!document.querySelector(".theme-pop")') === true)
  await js(`document.querySelector('${cardsSel} [aria-checked=true]').focus()`)
  await key('ArrowLeft', 'ArrowLeft', 37)
  check('card size: ArrowLeft picks MEDIUM and moves focus with it', await waitFor(`document.documentElement.dataset.cards === 'm' && document.activeElement?.getAttribute('aria-checked') === 'true' && /^medium/.test(document.activeElement.getAttribute('aria-label'))`, 2000))
  await key('Escape', 'Escape', 27)
  await open('/components/', { keep: true })
  await waitFor('!!document.querySelector(".board-grid canvas, .board-grid svg")', 10000)
  check('card size: a reload keeps MEDIUM (4 a row at 1280)', await js(`document.documentElement.dataset.cards`) === 'm' && await js(firstRow) === 4, String(await js(firstRow)))
  await key('k', 'KeyK', 75, 2)
  await waitFor('!!document.querySelector(".pal input")', 4000)
  await cdp('Input.insertText', { text: 'card size large' }); await sleep(200)
  check('⌘K "card size large" ranks "Card size: large" first', (await js(`document.querySelector('.pal-item')?.textContent`) as string)?.includes('Card size: large'))
  await key('Enter', 'Enter', 13)
  check('…and runs it (3 a row, stored)', await waitFor(`document.documentElement.dataset.cards === 'l' && localStorage.getItem('dot480:cards') === 'l' && ${firstRow} === 3`, 3000))

  // ── touch: TOOLS › THEME ──
  await open('/', { phone: true })
  check('phone: the header THEME button is hidden', await js(`getComputedStyle(document.querySelector('.theme-switch')).display === 'none'`) === true)
  const tools = (await centreOf('.tabbar button[aria-haspopup]'))!
  await tap(tools.x, tools.y)
  check('TOOLS opens a sheet with a THEME section', await waitFor('!!document.querySelector(".tools-sheet[open] .theme-ctl")', 6000))
  await sleep(700) // the sheet scrolls to its open stop
  await shot('sheet')
  const sizes = await js(`[...document.querySelectorAll('.tools-sheet .theme-ctl :is([role=radio], [role=option], .theme-share)')].map(e => { const r = e.getBoundingClientRect(); return [e.getAttribute('aria-label') || e.textContent, Math.round(r.width), Math.round(r.height)] })`) as [string, number, number][]
  const small = sizes.filter(([, w, h]) => w < 44 || h < 44)
  // 3 schemes, 8 swatches, the share switch, and DISPLAY's 3 card sizes
  check(`touch targets ≥ 44 px (${sizes.length} controls)`, sizes.length === 15 && !small.length, JSON.stringify(small))
  check('the sheet has no horizontal overflow', await js(`(() => { const p = document.querySelector('.tools-sheet .sheet-body'); return p.scrollWidth <= p.clientWidth + 1 })()`) === true)
  check('phone: one card a row at LARGE', await js(firstRow) === 1, String(await js(firstRow)))
  const pc = (await centreOf('.tools-sheet .theme-cards [role=radio]:nth-child(3)'))!
  await tap(pc.x, pc.y)
  check('phone: TOOLS › DISPLAY › COMPACT puts 2 cards a row, stored, the sheet still open', await waitFor(`document.documentElement.dataset.cards === 's' && localStorage.getItem('dot480:cards') === 's' && ${firstRow} === 2 && !!document.querySelector('.tools-sheet[open]')`, 3000), String(await js(firstRow)))
  const pl = (await centreOf('.tools-sheet .theme-cards [role=radio]:nth-child(1)'))!
  await tap(pl.x, pl.y)
  check('phone: LARGE goes back to one a row', await waitFor(`document.documentElement.dataset.cards === 'l' && ${firstRow} === 1`, 3000))
  const n0 = await vts()
  const ph = (await centreOf('.tools-sheet [data-accent="phosphor"][role=option]'))!
  await tap(ph.x, ph.y)
  check('a tap on a swatch switches the accent', await waitFor(`document.documentElement.dataset.accent === 'phosphor'`, 3000))
  const tvt = await js('window.__vt.at(-1)') as { x: number; y: number } | undefined
  check('…with the wipe from the tapped swatch', (await vts()) === n0 + 1 && !!tvt && Math.abs(tvt.x - ph.x) <= 2 && Math.abs(tvt.y - ph.y) <= 2, JSON.stringify({ tvt, ph }))
  check('…and the sheet stays open', await js('!!document.querySelector(".tools-sheet[open]")') === true)
  await sleep(900)
  const lt = (await centreOf('.tools-sheet .theme-seg [role=radio]:nth-child(2)'))!
  await tap(lt.x, lt.y)
  check('a tap on LIGHT switches the scheme', await waitFor(`document.documentElement.dataset.scheme === 'light'`, 3000))
  await sleep(900)
  const tc = (await centreOf('.tools-sheet .theme-custom'))!
  await tap(tc.x, tc.y)
  check('phone: a tap on custom opens the hue slider in the sheet (44 px tall)', await waitFor(`document.documentElement.dataset.accent === 'custom' && !!document.querySelector('.tools-sheet .theme-hue input')`, 6000) && await js(`document.querySelector('.tools-sheet .theme-hue').getBoundingClientRect().height >= 44`) === true)
  await shot('sheet-custom')
  check('no page errors', errors.length === 0, errors.join(' | '))
} finally {
  ws.close(); proc.kill(); server.close()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
