/**
 * Layout probe (docs/LAYOUT-THEME-PLAN.md §6, phases T2 and T3) in headless Chrome over CDP (Node's built-in
 * WebSocket, no deps), at 1920 / 1440 / 1280 / 1024 / 768 / 390 px (390: phone emulation, touch). Pages: the home
 * board, a standard board (components), a hero board (lock), a dense board (deerflow12), ABOUT, MAKE and a widget
 * page. Pass criteria:
 *  - one left edge (±1 px): the top bar, intro, picker, board title, grid, footer (and ABOUT's bands, the widget
 *    page's top row and card, the editor's first tool) all start on the frame's content edge;
 *  - no horizontal overflow (scrollWidth ≤ viewport);
 *  - cards above the fold: at least one whole card on the home board at every width (T2); at 1440, ≥ 6 on standard
 *    and dense boards, ≥ 2 on hero boards (T3; the density is read from the grid's data-density);
 *  - every card square (±1 px) and ≤ 62svh tall;
 *  - columns (T3): components steps 5 → 4 → 3 → 2 → 1 (5 at 1920 and 1440, 4 at 1280, 3 at 1024, 2 at 768,
 *    1 at 390), and no board gains a column as the width shrinks;
 *  - orphans (T3): the last row's cards are as wide as the first row's (never stretched); with separated cards a
 *    last row less than half full is centred (±2 px), a fuller one starts on the first column; ruled cells stay
 *    on the columns;
 *  - phone header (T3, 390): the intro and the picker together ≤ 120 px tall; no two buttons of the group strip
 *    overlap, at either end of its scroll (the old sticky ALL pill covered the first group);
 *  - section gaps only from the token set: each vertical gap between the page's blocks is --gap-group, --gap-action
 *    or --gap-section (as computed at that width), ±1 px;
 *  - type (T6): under 10% of the chrome characters (outside cards; hidden, screen-reader-only and aria-hidden text
 *    skipped) set under 12 px, on every page at every width.
 *
 * Needs a server for dist/: `npx vite build && npx vite preview --port 4318`, then
 * `npx tsx scripts/site/layout.ts [baseUrl] [--shots <dir>] [--grid ruled|cards]`. `--grid` sets
 * html[data-grid] first (the two card grid styles of decision 10). Chrome: $CHROME or the usual paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const base = (args.find(a => /^https?:/.test(a)) ?? 'http://localhost:4318/').replace(/\/?$/, '/')
const shotDir = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : undefined
if (shotDir) mkdirSync(shotDir, { recursive: true })
const gridStyle = args.includes('--grid') ? args[args.indexOf('--grid') + 1] : undefined
const WIDTHS: [number, number, boolean][] = [[1920, 1080, false], [1440, 900, false], [1280, 800, false], [1024, 768, false], [768, 1024, false], [390, 844, true]]
/** T3: the components board's columns per width (5 → 4 → 3 → 2 → 1). */
const COMPONENT_COLS: Record<number, number> = { 1920: 5, 1440: 5, 1280: 4, 1024: 3, 768: 2, 390: 1 }
/** T3: whole cards above the fold at 1440, per density. */
const FOLD_1440: Record<string, number> = { hero: 2, standard: 6, dense: 6 }
const PAGES = [
  { name: 'home', path: '', kind: 'board', hero: true },
  { name: 'components', path: 'components/', kind: 'board' },
  { name: 'lock', path: 'lock/', kind: 'board' },
  { name: 'deerflow12', path: 'deerflow12/', kind: 'board' },
  { name: 'about', path: '?about', kind: 'about' },
  { name: 'make', path: '?make=tune', kind: 'make' },
  { name: 'widget', path: 'widget/timer/', kind: 'widget' },
] as const
const READY: Record<string, string> = {
  board: `!!document.querySelector('.board-grid canvas, .board-grid svg') && !!document.querySelector('.live-band canvas, .live-band svg')`,
  about: `!!document.querySelector('.log-view') && !!document.querySelector('.live-band canvas, .live-band svg')`,
  make: `!!document.querySelector('.ed-top')`,
  widget: `!!document.querySelector('.wp-stage canvas, .wp-stage svg')`,
}

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-layout-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>()
ws.addEventListener('message', e => { const m = JSON.parse(String(e.data)); if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) } })
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
const waitFor = async (expr: string, ms = 20000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }

/** Measures the open page; `kind` picks which blocks share the left edge and stack in the rhythm. */
const MEASURE = (kind: string, H: number) => `(() => {
  const vis = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }
  const q = s => [...document.querySelectorAll(s)].find(vis) || null
  const R = el => el.getBoundingClientRect()
  const y0 = window.scrollY
  // the rhythm tokens as computed at this width
  const tok = {}
  for (const n of ['gap-group', 'gap-action', 'gap-section']) { const d = document.createElement('div'); d.style.cssText = 'position:absolute;visibility:hidden;width:0;height:var(--' + n + ')'; document.body.append(d); tok[n] = d.getBoundingClientRect().height; d.remove() }
  // the picker's edge: its first tab, or (a phone strip that scrolls) the strip's content edge
  const strip = q('.board-groups'), scrolls = strip && strip.scrollWidth > strip.clientWidth + 1
  const firstBtn = strip && (scrolls ? { getBoundingClientRect: () => ({ left: R(strip).left + parseFloat(getComputedStyle(strip).paddingLeft) }) } : [...strip.children].find(vis))
  const edges = ${JSON.stringify(kind)} === 'board' ? { topbar: q('.topbar .brand'), intro: q('.intro-line'), picker: firstBtn, title: q('.board-title'), grid: q('.board-grid'), footer: q('.bottom-row') }
    : ${JSON.stringify(kind)} === 'about' ? { topbar: q('.topbar .brand'), about: q('.about-flavour'), keys: q('.about-cols'), log: q('.log-view'), footer: q('.bottom-row') }
    : ${JSON.stringify(kind)} === 'make' ? { topbar: q('.topbar .brand'), tools: q('.ed-top > :first-child') }
    : { top: q('.wp-top > .pill'), card: q('.wp-stage'), footer: q('.bottom-row') }
  const left = {}
  for (const [k, el] of Object.entries(edges)) if (el) left[k] = Math.round(R(el).left * 10) / 10
  // vertical rhythm: each block's top against the lowest bottom above it
  const blocks = ${JSON.stringify(kind)} === 'board'
    ? [['topbar', q('.topbar')], ['hero', q('.home-hero')], ['intro', q('.intro-line')], ['picker', q('.board-picker')], ['header', q('.board-title'), q('.board-blurb')], ['grid', q('.board-grid')], ['next', q('.next-board')], ['footer', q('.bottom')]]
    : ${JSON.stringify(kind)} === 'about' ? [['topbar', q('.topbar')], ['about', q('.about-intro')], ['log', q('.log-view')], ['footer', q('.bottom')]]
    : ${JSON.stringify(kind)} === 'widget' ? [['top', q('.wp-top')], ['main', q('.wp-main')], ['footer', q('.bottom')]] : []
  // a block is one element, or [top element, bottom element] (the board header: title, then blurb)
  const placed = blocks.filter(([, el]) => el && getComputedStyle(el).position !== 'fixed').map(([n, el, end]) => ({ n, top: R(el).top + y0, bottom: R(end || el).bottom + y0, float: getComputedStyle(el).float !== 'none' })).sort((a, b) => a.top - b.top)
  const gaps = []
  for (let i = 1; i < placed.length; i++) {
    const b = placed[i]
    if (b.float) continue // a float stands beside the header: its top is not a step
    const above = placed.slice(0, i).filter(p => !(p.float && p.bottom > b.top + 1) && p.bottom <= b.top + 1)
    if (!above.length) continue
    const from = above.reduce((m, p) => (p.bottom > m.bottom ? p : m))
    gaps.push({ from: from.n, to: b.n, px: Math.round((b.top - from.bottom) * 10) / 10 })
  }
  // cards
  const cards = [...document.querySelectorAll('.board-grid > .dot-card, .board-grid .dot-card')].filter(vis).filter((c, i, a) => !a.slice(0, i).some(p => p.contains(c)))
  const rects = cards.map(c => { const r = R(c); return { x: r.left, y: r.top + y0, w: r.width, h: r.height } })
  const fold = rects.filter(r => r.y >= -1 && r.y + r.h <= ${H} + 1).length
  const tallest = rects.reduce((m, r) => Math.max(m, r.h), 0)
  const rows = [...new Set(rects.map(r => Math.round(r.y)))].sort((a, b) => a - b)
  const firstW = rects[0]?.w ?? 0, last = rects.filter(r => Math.round(r.y) === rows[rows.length - 1])
  const orphanStretched = rows.length > 1 && last.some(r => r.w > firstW + 1)
  const square = rects.reduce((m, r) => Math.max(m, Math.abs(r.w - r.h)), 0)
  // T3: columns (cards in the first row), and where a partial last row sits
  const grid = q('.board-grid'), G = grid ? R(grid) : null
  const cols = rects.filter(r => Math.round(r.y) === rows[0]).length
  const ruled = document.documentElement.dataset.grid === 'ruled'
  let orphan = 'full'
  if (G && rows.length > 1 && last.length < cols) {
    const l = Math.min(...last.map(r => r.x)) - G.left, rt = G.right - Math.max(...last.map(r => r.x + r.w))
    const centre = !ruled && last.length < cols / 2
    const ok = centre ? Math.abs(l - rt) <= 2 : Math.abs(Math.min(...last.map(r => r.x)) - rects[0].x) <= 1
    orphan = (centre ? 'centred ' : 'on the columns ') + last.length + '/' + cols + (ok ? '' : ' (off: ' + Math.round(l) + ' | ' + Math.round(rt) + ')')
    if (!ok) orphan = '✗ ' + orphan
  }
  // T3 phone header: intro top → picker bottom; overlapping buttons in the group strip at either end of its scroll
  const intro = q('.intro-line'), picker = q('.board-picker')
  const head = picker ? Math.round((R(picker).bottom - (intro ? R(intro).top : R(picker).top)) * 10) / 10 : 0
  const overlaps = []
  if (strip) {
    const x0 = strip.scrollLeft
    for (const pos of [0, strip.scrollWidth]) {
      strip.style.scrollSnapType = 'none'; strip.style.scrollBehavior = 'auto'; strip.scrollLeft = pos
      const bs = [...strip.querySelectorAll('button')].filter(vis).map(b => [b.textContent.trim(), R(b)])
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const [an, a] = bs[i], [bn, b] = bs[j]
        if (a.right - 1 > b.left && b.right - 1 > a.left && a.bottom - 1 > b.top && b.bottom - 1 > a.top) overlaps.push(an + ' × ' + bn + ' @' + (pos ? 'end' : 'start'))
      }
    }
    strip.scrollLeft = x0; strip.style.scrollSnapType = ''; strip.style.scrollBehavior = ''
  }
  // chrome text under 12 px (outside cards; hidden and screen-reader-only text skipped)
  let all = 0, small = 0
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement, t = n.textContent.replace(/\\s+/g, '')
    if (!t || !el || el.closest('.dot-card, .sr-only, [aria-hidden="true"], script, style') || !vis(el)) continue
    all += t.length; if (parseFloat(getComputedStyle(el).fontSize) < 12) small += t.length
  }
  const doc = document.documentElement
  return { tok, left, gaps, gridTop: G ? Math.round(G.top) : 0, density: grid?.dataset.density ?? '', cards: rects.length, fold, tallest: Math.round(tallest), square: Math.round(square * 10) / 10, cols, orphan, orphanStretched, head, overlaps, small: all ? small / all : 0, scrollW: Math.max(doc.scrollWidth, document.body.scrollWidth) }
})()`
type M = { tok: Record<string, number>; left: Record<string, number>; gaps: { from: string; to: string; px: number }[]; gridTop: number; density: string; cards: number; fold: number; tallest: number; square: number; cols: number; orphan: string; orphanStretched: boolean; head: number; overlaps: string[]; small: number; scrollW: number }

let failures = 0
const colsSeen = new Map<string, number>()
const rows: string[] = []
const fail = (msg: string) => { failures++; console.log(`  ✗ ${msg}`) }
try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  for (const [W, H, mobile] of WIDTHS) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile })
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 })
    for (const p of PAGES) {
      if (p.kind === 'make' && mobile) continue // the phone editor is full-screen, with its own bar
      await cdp('Page.navigate', { url: base + p.path })
      await sleep(400)
      const ready = await waitFor(READY[p.kind])
      await js('document.fonts.ready.then(() => 1)'); await sleep(1500)
      if (gridStyle) { await js(`document.documentElement.dataset.grid = ${JSON.stringify(gridStyle)}`); await sleep(300) }
      await js('window.scrollTo(0, 0)'); await sleep(200)
      const m = await js(MEASURE(p.kind, H)) as M
      const tag = `${p.name} @${W}`
      console.log(`${tag}`)
      if (!ready) fail(`${tag}: not ready`)
      // the frame's content edge at this width
      const pad = Math.min(40, Math.max(16, W * .03)), edge = (W - Math.min(W, 1440)) / 2 + pad
      const lefts = Object.entries(m.left), off = lefts.filter(([, x]) => Math.abs(x - edge) > 1)
      if (off.length) fail(`${tag}: left edge ${edge.toFixed(1)} expected; off: ${off.map(([k, x]) => `${k} ${x}`).join(', ')}`)
      if (m.scrollW > W + 1) fail(`${tag}: horizontal overflow (scrollWidth ${m.scrollW})`)
      const set = Object.values(m.tok), bad = m.gaps.filter(g => !set.some(t => Math.abs(g.px - t) <= 1))
      if (bad.length) fail(`${tag}: gaps off the token set (${set.map(t => t.toFixed(1)).join(' / ')}): ${bad.map(g => `${g.from}→${g.to} ${g.px}`).join(', ')}`)
      if (m.small >= .1) fail(`${tag}: ${(m.small * 100).toFixed(1)}% of the chrome characters are under 12 px, want < 10%`)
      if (p.kind === 'board') {
        if (m.tallest > .62 * H + 1) fail(`${tag}: card ${m.tallest}px tall > 62svh (${Math.round(.62 * H)})`)
        if (m.orphanStretched) fail(`${tag}: last row stretched`)
        if ('hero' in p && m.fold < 1) fail(`${tag}: no whole card above the fold`)
        // T3
        if (m.square > 1) fail(`${tag}: a card is not square (|w − h| up to ${m.square}px)`)
        if (W === 1440 && m.fold < (FOLD_1440[m.density] ?? 6)) fail(`${tag}: ${m.fold} whole card(s) above the fold on a ${m.density} board, want ≥ ${FOLD_1440[m.density] ?? 6}`)
        if (p.name === 'components' && m.cols !== COMPONENT_COLS[W]) fail(`${tag}: ${m.cols} column(s), want ${COMPONENT_COLS[W]}`)
        const before = colsSeen.get(p.name)
        if (before !== undefined && m.cols > before) fail(`${tag}: ${m.cols} columns, more than the ${before} of the wider screen`)
        colsSeen.set(p.name, m.cols)
        if (m.orphan.startsWith('✗')) fail(`${tag}: last row ${m.orphan.slice(2)}`)
        if (mobile && m.head > 120) fail(`${tag}: intro + picker ${m.head}px tall, want ≤ 120`)
        if (mobile && m.overlaps.length) fail(`${tag}: group strip buttons overlap: ${m.overlaps.join(', ')}`)
      }
      console.log(`  edge ${edge.toFixed(1)} · gaps ${m.gaps.map(g => `${g.from}→${g.to} ${g.px}`).join(', ') || '—'}${p.kind === 'board' ? ` · ${m.density}: ${m.cols} col, grid at y ${m.gridTop}, cards ${m.cards}, above the fold ${m.fold}, tallest ${m.tallest}, last row ${m.orphan}, intro + picker ${m.head}px · chrome <12px ${(m.small * 100).toFixed(0)}%` : ` · chrome <12px ${(m.small * 100).toFixed(0)}%`}`)
      rows.push(`| ${p.name} | ${W} | ${off.length ? '✗' : '✓'} | ${m.scrollW > W + 1 ? '✗' : '✓'} | ${bad.length ? '✗' : '✓'} | ${p.kind === 'board' ? m.cols : '—'} | ${p.kind === 'board' ? `${m.fold} / ${m.cards}` : '—'} | ${p.kind === 'board' ? `${m.tallest} / ${Math.round(.62 * H)}` : '—'} | ${p.kind === 'board' ? (m.orphanStretched || m.orphan.startsWith('✗') ? '✗' : '✓') : '—'} | ${p.kind === 'board' ? m.head : '—'} | ${(m.small * 100).toFixed(0)}% |`)
      if (shotDir) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(shotDir, `${p.name}-${W}.png`), Buffer.from(r.result.data, 'base64')) }
    }
  }
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(`\n${gridStyle ? `grid style: ${gridStyle}\n` : ''}| page | width | one edge | no overflow | gaps in token set | columns | cards above fold | tallest / 62svh | orphan row ok | intro + picker px | chrome < 12 px |\n|---|---|---|---|---|---|---|---|---|---|---|\n` + rows.join('\n'))
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
