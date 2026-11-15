/**
 * Break the site's own UI with worst-case data (not the card drawings): headless Chrome over CDP (scripts/lib/cdp.ts),
 * at 1280, 390 and 320 wide, dark and light. Each case puts its data in where the real data comes in, never through a
 * demo switch a visitor could see:
 *  - `rows`: ALL's card rows (name · board, then OPEN, LINK, MORE), every real row, then the first six rows' text
 *    swapped for a long name, an unbreakable one, one letter, Japanese, Arabic and emoji (DOM text, in the probe only);
 *  - `widget`: a card page (the real card with the longest name), its like count from a mocked API (0 to 1,234,567),
 *    then a long credit, facts and id swapped in; the toast a refused clipboard leaves (the whole URL); MORE;
 *  - `palette`: ⌘K with a pasted URL, a query with no match, a Japanese one and one letter (every result);
 *  - `toast`: the time machine's note (the T key), the longest note the site writes;
 *  - `theme`: the THEME popover (desktop), TOOLS › THEME (phones); `boards`: the phone boards sheet;
 *  - `editor`: MAKE · COMPOSE with frames and layers named long, unbreakable, one letter, Arabic and emoji (a saved
 *    document in localStorage, the editor's own boundary), then the two-tab note (a `storage` event).
 * Checks, each with an id: nothing spills past its box or the screen (an ancestor that clips or scrolls is fine), the
 * page never scrolls sideways, a card row keeps its height and its icons, and a row's name never runs under them.
 * `KNOWN` lists breaks that only made-up data causes (DOM-text cases of authored strings): they print, never fail.
 * PNGs go to `.snapshots/break-ui/<case>@<width>-<scheme>.png` (the probes workflow's `probe-captures-<shard>`).
 *
 *   npx vite build && npx tsx scripts/site/break-ui.ts [baseUrl] [--only rows,widget,palette,toast,theme,boards,editor]
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { addFrame, addLayer, blankCard, EDITOR_KEY, EDITOR_VERSION, type EditorDoc } from '../../src/components/editor/doc'
import { textLayer } from '../../src/components/studio/doc'
import { findChrome, launch, sleep, type Page } from '../lib/cdp'
import { knownChecker } from '../lib/check'

/** Breaks only made-up data reaches: card names, board labels, credits and facts are written in the repo. */
const KNOWN: readonly string[] = []

const args = process.argv.slice(2)
const base = (args.find(a => /^https?:/.test(a)) ?? 'http://localhost:4317/').replace(/\/?$/, '/')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : undefined
const runs = (c: string) => !only || only.includes(c)
if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const OUT = join('.snapshots', 'break-ui')
mkdirSync(OUT, { recursive: true })
const { check, done } = knownChecker(KNOWN, 'break-ui')

/** The worst cases: plausible names, each a different kind of trouble. */
const NAMES = [
  ['ANALOGUE WORLD CLOCK WITH SUNRISE, SUNSET AND MOON PHASE', 'INSTRUMENT PANELS & GAUGES'],
  ['SQ_AMMANN_BEENKER_OCTAGONAL_SUBSTITUTION_V2', 'NORTHWIND_INDUSTRIES'],
  ['Q', 'UI'],
  ['時計とカレンダーと天気の表示', 'ダッシュボード'],
  ['ساعة عالمية مع شروق الشمس وغروبها', 'لوحة القياس'],
  ['🎲 DICE 👨‍👩‍👧‍👦 PARTY 🎉', 'PLAY 🎮'],
] as const
const LONG_URL = 'https://matrix.reactopia.me/widget/aperiodic-ammann-beenker-octagonal/?theme=light_cobalt&utm_source=newsletter'

// the likes API, mocked in the page (scripts/likes-browser.ts): every card has `?lkn=` likes (BotID's challenge stubbed)
const MOCK = `(() => {
  const n = Number(new URLSearchParams(location.search).get('lkn') ?? sessionStorage.getItem('lkn') ?? 1234567)
  sessionStorage.setItem('lkn', String(n))
  window.V_C = [{ b: 1, v: 'probe', e: '', d: 0 }]
  const real = window.fetch.bind(window)
  const reply = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.startsWith('/api/')) return real(input, init)
    if (url.pathname === '/api/likes/widgets') return reply({ w: new Proxy({}, { get: () => n }) })
    return reply({ n, ok: true })
  }
})()`

// in-page helpers (one IIFE per page): what spills past a box, a card row's own checks, a page that scrolls sideways
const LIB = `(() => {
  const label = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '')
  const shown = el => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') return false } return true }
  // clipped: an ancestor inside the box (not the box) cuts it off or scrolls it (a truncation, not a spill)
  const clipped = (el, root) => { for (let e = el.parentElement; e && e !== root; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible') return true; return false }
  const textRect = t => { const g = document.createRange(); g.selectNodeContents(t); return g.getBoundingClientRect() }
  window.__spill = (root, name) => {
    if (!root) return [name + ' missing']
    const R = root.getBoundingClientRect(), lo = Math.max(R.left, 0) - 1, hi = Math.min(R.right, innerWidth) + 1, out = []
    const test = (r, what) => { if (r.width && (r.right > hi || r.left < lo)) out.push(what + ' ' + Math.round(r.right > hi ? r.right - hi : lo - r.left) + ' px past the ' + (r.right > hi ? 'right' : 'left')) }
    for (const el of root.querySelectorAll('*')) if (!clipped(el, root) && shown(el) && !el.closest('.sr-only')) test(el.getBoundingClientRect(), label(el))
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    for (let t; (t = walk.nextNode());) {
      const el = t.parentElement
      if (!t.textContent.trim() || !el || clipped(t, root) || !shown(el) || el.closest('.sr-only')) continue
      test(textRect(t), 'text "' + t.textContent.trim().slice(0, 18) + '" in ' + label(el))
    }
    return [...new Set(out)].slice(0, 6)
  }
  window.__wide = () => { const se = document.scrollingElement; return se.scrollWidth > innerWidth + 1 ? 'page is ' + se.scrollWidth + ' px wide at ' + innerWidth : '' }
  // a card row: its line's height, its three icons inside the slot at full size, its text never under OPEN
  window.__row = row => {
    const slot = row.parentElement.getBoundingClientRect(), r = row.getBoundingClientRect(), out = []
    const want = matchMedia('(hover: none), (pointer: coarse)').matches ? 28 : 16
    if (Math.abs(r.height - want) > 1) out.push('row is ' + Math.round(r.height) + ' px tall, not ' + want)
    for (const b of row.querySelectorAll(':scope > a, :scope > button')) { const q = b.getBoundingClientRect(); if (q.right > slot.right + 1 || q.width < 16) out.push(label(b) + ' ends at ' + Math.round(q.right - slot.left) + ' of ' + Math.round(slot.width) + ' px, ' + Math.round(q.width) + ' wide') }
    const open = row.querySelector('.dot-card-row-open')?.getBoundingClientRect()
    const texts = [row.querySelector('.dot-card-row-name')?.firstChild, row.querySelector('.dot-card-row-meta a')?.lastChild].filter(Boolean)
    for (const t of texts) {
      if (!open || !shown(t.parentElement)) continue
      let right = textRect(t).right
      for (let e = t.parentElement; e && e !== row; e = e.parentElement) if (getComputedStyle(e).overflowX !== 'visible') right = Math.min(right, e.getBoundingClientRect().right)
      if (right > open.left + 1) out.push('"' + t.textContent.trim().slice(0, 16) + '" runs ' + Math.round(right - open.left) + ' px under OPEN')
    }
    return out
  }
  return 1
})()`

const p: Page = await launch(1280, 800, { flags: { likes: true, xray: true } })
await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: MOCK })
let W = 1280, scheme = 'dark'
const phone = () => W < 600
/** Opens `path` at width `w` in `s` (a phone below 600: touch, its own height), with the command layer mounted. */
async function open(path: string, w = W, s = scheme, ready = '!!document.querySelector(".shell")') {
  W = w; scheme = s
  await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: s }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: phone() ? 760 : 800, deviceScaleFactor: phone() ? 2 : 1, mobile: phone() })
  await p.cdp('Emulation.setTouchEmulationEnabled', phone() ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
  await p.cdp('Page.navigate', { url: base + path.replace(/^\//, '') })
  await p.waitFor('document.readyState === "complete"', 30000)
  await p.js(`localStorage.setItem('dot480:intro', 'off'); ${LIB}`)
  const ok = await p.waitFor(ready, 30000)
  check(`${path.split('?')[0]}:loads@${W}`, ok)
  await p.waitFor(phone() ? '!!document.querySelector(".tabbar")' : '!!document.querySelector(".pal-dock:not(.dock-ghost)")', 15000)
  await sleep(500)
  return ok
}
const tag = (c: string) => `${c}@${W}${scheme === 'light' ? '-light' : ''}`
const shot = (c: string) => p.shot(join(OUT, `${tag(c)}.png`))
const spill = async (id: string, sel: string) => { const s = await p.js<string[]>(`__spill(document.querySelector(${JSON.stringify(sel)}), ${JSON.stringify(sel)})`); check(`${id}:spill@${W}`, !s.length, s.join('; ')) }
const wide = async (id: string) => { const s = await p.js<string>('__wide()'); check(`${id}:page-wide@${W}`, !s, s) }
const click = (sel: string, text?: string) => p.js<boolean>(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => ${text ? `e.textContent.includes(${JSON.stringify(text)})` : 'true'}); if (!e) return false; e.click(); return true })()`)
const key = (k: string, code: string, vk: number, mod = 0) => p.key(k, code, vk, mod)

async function rows() {
  await open('/', W, scheme, '!!document.querySelector(".browse-grid .dot-card-row")')
  const real = await p.js<string[]>(`[...document.querySelectorAll('.browse-grid .dot-card-row')].flatMap(r => __row(r).map(s => r.querySelector('.dot-card-row-name')?.textContent + ': ' + s)).slice(0, 6)`)
  check(`rows:real@${W}`, !real.length, real.join('; '))
  await wide('rows')
  if (scheme === 'dark') await p.js(`(() => { const rows = [...document.querySelectorAll('.browse-grid .dot-card-row')].slice(0, 6), names = ${JSON.stringify(NAMES)}
    rows.forEach((r, i) => { r.querySelector('.dot-card-row-name').textContent = names[i][0]; const a = r.querySelector('.browse-board'); a.lastChild.textContent = names[i][1] }); return 1 })()`)
  const worst = await p.js<string[]>(`[...document.querySelectorAll('.browse-grid .dot-card-row')].slice(0, 6).flatMap((r, i) => __row(r).map(s => 'row ' + (i + 1) + ': ' + s))`)
  if (scheme === 'dark') check(`rows:worst@${W}`, !worst.length, worst.join('; '))
  await shot('rows')
}

async function widget() {
  // the real card with the longest name (from ALL's rows), so the title, the eyebrow and the pills see real data
  await open('/', W, scheme, '!!document.querySelector(".browse-grid .dot-card-row")')
  const slug = await p.js<string>(`[...document.querySelectorAll('.browse-item')].sort((a, b) => b.querySelector('.dot-card-row-name').textContent.length - a.querySelector('.dot-card-row-name').textContent.length)[0].dataset.slot`)
  await open(`/widget/${slug}/?lkn=1234567`, W, scheme, '!!document.querySelector(".wp-rail .lk-btn")')
  await spill('widget-real', '.wp-rail'); await spill('widget-top', '.wp-top'); await wide('widget-real')
  if (scheme === 'dark') {
    await p.js(`(() => {
      document.querySelector('.wp-eyebrow').textContent = ${JSON.stringify(NAMES[0][1] + ' · 07')}
      const credit = document.querySelector('.wp-credit') ?? document.querySelector('.wp-blurb').insertAdjacentElement('afterend', Object.assign(document.createElement('p'), { className: 'wp-credit' }))
      credit.innerHTML = 'by Aleksandra Wiśniewska-Kowalczyk, @bartholomew_fitzgerald_northwind · <a class="wp-link" href="#">${LONG_URL}</a> · ported from the 2019 firmware'
      for (const dt of document.querySelectorAll('.wp-facts dt')) { const dd = dt.nextElementSibling
        if (dt.textContent === 'Layers') dd.textContent = '9 · background_gradient_copy_final, ring, ساعة, 時計の針, 🎲, Q, ticks, glow, label'
        if (dt.textContent === 'Tags') dd.textContent = 'clock · サンライズ · northwind-industries-holdings-dashboard · 🌙'
        if (dt.textContent === 'Id') dd.querySelector('code').textContent = 'sq_ammann_beenker_octagonal_substitution_v2' }
      document.querySelector('.fig-cap').lastChild.textContent = 'sq_ammann_beenker_octagonal_substitution_v2 · 216 × 108 dots · 4 px · WEBGL'
      return 1 })()`)
    await spill('widget-worst', '.wp-rail'); await spill('widget-cap', '.wp-stage'); await wide('widget-worst')
  }
  await shot('widget')
  // the clipboard refuses: LINK toasts the whole URL
  await p.js(`navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); navigator.clipboard.write = () => Promise.reject(new Error('denied')); 1`)
  await click('.wp-copy .pill-btn', 'LINK')
  await p.waitFor('!!document.querySelector(".pal-toast span")', 3000)
  await spill('toast-url', '.pal-toast span'); await shot('toast-url')
  await p.waitFor('!document.querySelector(".pal-toast span")', 4000)
  if (await click('.wp-more-btn')) { await sleep(300); await spill('widget-more', '.wp-more'); await shot('widget-more'); await key('Escape', 'Escape', 27) }
}

async function likes() {
  for (const n of [0, 1, 999, 12345, 1234567]) {
    await open(`/widget/timer/?lkn=${n}`, W, scheme, '!!document.querySelector(".wp-rail .lk-btn")')
    const shown = await p.js<string>(`document.querySelector('.lk-count')?.textContent ?? ''`)
    check(`likes:${n}@${W}`, shown === (n ? n.toLocaleString('en') : ''), `shows "${shown}"`)
    await spill(`likes-${n}`, '.wp-rail .lk')
    await shot(`likes-${n}`)
  }
}

async function palette() {
  await open('/', W, scheme, '!!document.querySelector(".browse-grid .dot-card-row")')
  for (const [c, q] of [['palette-url', LONG_URL], ['palette-none', 'zzqx'], ['palette-ja', '時計'], ['palette-many', 'e']] as const) {
    if (!(await p.js<boolean>('!!document.querySelector(".pal-input")'))) { await key('k', 'KeyK', 75, 2); await p.waitFor('!!document.querySelector(".pal-input")', 5000) }
    await p.js(`(() => { const i = document.querySelector('.pal-input'); i.focus(); i.select(); return 1 })()`)
    await p.cdp('Input.insertText', { text: q }); await sleep(400)
    await spill(c, '.pal'); await shot(c)
  }
  await key('Escape', 'Escape', 27)
}

async function toastTime() {
  await open('/henry/', W, scheme, '!!document.querySelector(".board-grid .dot-card")')
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84, text: 't' })
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 't', code: 'KeyT', windowsVirtualKeyCode: 84 })
  if (phone()) { await click('.tabbar button', 'TOOLS'); await sleep(400); await click('.tools-sheet button', 'TIME'); await sleep(300) }
  await p.waitFor('!!document.querySelector(".pal-toast span")', 3000)
  await spill('toast-time', '.pal-toast span'); await shot('toast-time')
}

async function theme() {
  await open('/henry/', W, scheme, '!!document.querySelector(".board-grid .dot-card")')
  if (phone()) { await click('.tabbar button', 'TOOLS'); await p.waitFor('!!document.querySelector(".tools-sheet .theme-swatches")', 5000); await sleep(400); await spill('theme', '.sheet-panel') }
  else { await click('.theme-menu-btn'); await p.waitFor('!!document.querySelector(".theme-pop")', 5000); await sleep(300); await spill('theme', '.theme-pop') }
  await wide('theme'); await shot('theme')
}

async function boards() {
  await open('/henry/', W, scheme, '!!document.querySelector(".board-grid .dot-card")')
  await spill('topbar', '.topbar')
  await click('.topbar-place'); await p.waitFor('!!document.querySelector(".board-sheet")', 5000); await sleep(400)
  await spill('boards', '.board-sheet'); await wide('boards'); await shot('boards')
}

/** A saved MAKE document: frames and layers named the way people name things (64 is the rename field's limit). */
function editorDoc(): string {
  const names = [['Aleksandra’s weekly dashboard for the north office (final v2)', 'background_gradient_copy_copy_final_FINAL_v12_do_not_touch'], ['ساعة عالمية مع شروق الشمس', 'Q'], ['時計とカレンダーの表示', '🎲 dice 👨‍👩‍👧‍👦 party']] as const
  let d: EditorDoc = { kind: 'dot480.editor', v: EDITOR_VERSION, name: 'worst', frames: [] }
  names.forEach(([frame, layer], i) => {
    d = addFrame(d, blankCard({ cols: 80, rows: 80, pitch: 4 }, frame), { at: { x: i * 400, y: 0 } }).doc
    const f = d.frames[d.frames.length - 1]
    f.card.name = frame
    d = addLayer(d, f.id, textLayer('HI', { name: layer, params: { col: 6, row: 30 } }))
    d = addLayer(d, f.id, textLayer('A', { name: 'ساعة 16×16 نص', params: { col: 6, row: 50 } }))
  })
  return JSON.stringify(d)
}

async function editor() {
  // saved from a page that isn't MAKE, so no editor's own autosave can write over it
  await open('/henry/', W, scheme, '!!document.querySelector(".board-grid .dot-card")')
  await p.js(`localStorage.setItem(${JSON.stringify(EDITOR_KEY)}, ${JSON.stringify(editorDoc())}); 1`)
  await open('/?make=compose&pro=1', W, scheme, 'document.querySelectorAll(".ed-frame").length === 3')
  await sleep(800)
  if (!phone()) { await spill('editor-tree', '.ed-tree'); await p.js(`document.querySelector('.ed-tree')?.scrollIntoView(); 1`) }
  await wide('editor'); await shot('editor')
  // another tab saved: the note with RELOAD and KEEP MINE
  await p.js(`window.dispatchEvent(new StorageEvent('storage', { key: ${JSON.stringify(EDITOR_KEY)}, newValue: '{"kind":"dot480.editor","v":${EDITOR_VERSION},"name":"other","frames":[]}' })); 1`)
  await p.waitFor('!!document.querySelector(".ed-other button")', 3000)
  await spill('two-tab', '.ed-other'); await shot('two-tab')
}

try {
  for (const w of [1280, 390, 320]) {
    W = w; scheme = 'dark'
    if (runs('rows')) await rows()
    if (runs('widget')) await widget()
    if (runs('palette')) await palette()
    if (runs('toast')) await toastTime()
    if (runs('theme')) await theme()
    if (runs('boards') && w < 600) await boards()
    if (runs('editor')) await editor()
  }
  if (runs('likes')) { W = 320; await likes() }
  // light: the same states at 390 (the colours change, the layout doesn't)
  W = 390; scheme = 'light'
  if (runs('rows')) await rows()
  if (runs('widget')) await widget()
  if (runs('palette')) await palette()
  if (runs('toast')) await toastTime()
  if (runs('boards')) await boards()
  if (p.logs.length) console.log(`page errors:\n  ${p.logs.slice(0, 8).join('\n  ')}`)
} finally {
  await p.close()
}
done()
