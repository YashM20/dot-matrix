/**
 * Layout probe (docs/LAYOUT-THEME-PLAN.md §6, phases T2 and T3; docs/POLISH-PLAN.md §2 P0) in headless Chrome over CDP
 * (scripts/lib/cdp.ts), at 1920 / 1440 / 1280 / 1024 / 768 / 390 / 320 px (390 and 320: phone emulation, touch).
 * Pages: the home board, a standard board (components), a hero board (lock), a dense board (deerflow12), ABOUT, MAKE,
 * a widget page, the essay, privacy and terms. Checks, each with an id (`<check>:<page>@<width>`):
 *  - `edge`: one left edge (±1 px): the top bar, intro, picker, board title, grid, footer (and ABOUT's bands, the
 *    widget page's top row and card, the editor's first tool) all start on the frame's content edge;
 *  - `overflow`: no horizontal overflow (scrollWidth ≤ viewport); `overflow-sb`: the same in a second Chrome that
 *    shows real scrollbars (1920 to 768), where a `100vw` width overflows by the scrollbar's width;
 *  - `fold`: cards above the fold: at least one whole card on the home board at every width (T2); at 1440, ≥ 3 on
 *    standard boards, ≥ 4 on dense ones, ≥ 2 on hero ones (one full row at LARGE; density from the grid's data-density);
 *  - `square`, `tall`: every card square (±1 px) and ≤ 62svh tall;
 *  - `cols`, `cols-grow`: columns at the default CARD SIZE (LARGE): home and components 3 / 3 / 3 / 3 / 2 / 1 / 1
 *    from 1920 to 320, deerflow12 (dense) 4 / 4 / 4 / 4 / 3 / 1 / 1, lock (hero) 3 / 3 / 3 / 2 / 2 / 1 / 1, and no
 *    board gains a column as the width shrinks;
 *  - `size-*`: CARD SIZE: html[data-cards] l / m / s on components, deerflow12 and lock at 1440, 1280 and 390 gives
 *    the columns of `SIZE_COLS` (MEDIUM 4, COMPACT 5 at 1440 on a standard board; COMPACT 2 on a phone), with the
 *    cards square, unstretched and the last row placed right;
 *  - `stretch`, `orphan` (T3): the last row's cards are as wide as the first row's (never stretched); with separated
 *    cards a last row less than half full is centred (±2 px), a fuller one starts on the first column; ruled cells
 *    stay on the columns;
 *  - `phone-head`, `strip-overlap` (T3, phones): the intro and the picker together ≤ 120 px tall; no two buttons of
 *    the group strip overlap, at either end of its scroll (the old sticky ALL pill covered the first group);
 *  - `gaps`: section gaps only from the token set: each vertical gap between the page's blocks is --gap-group,
 *    --gap-action or --gap-section (as computed at that width), ±1 px;
 *  - `type` (T6): under 10% of the chrome characters (outside cards; hidden, screen-reader-only and aria-hidden text
 *    skipped) set under 12 px;
 *  - `sticky` (1440 and 768; home, ABOUT, the essay, privacy, the widget page): after scrolling to the middle or the
 *    bottom and then up 160 px with the wheel, the header's top is in [0, 1] (scripts/lib/site-probe.ts);
 *  - `covered`: at the bottom of the page no footer link is under a fixed or sticky layer;
 *  - `footer-wrap`: no footer link alone on a line, or split over two;
 *  - `no-app-scroll` (MAKE and the widget page, desktop): the page doesn't scroll (scrollHeight ≤ innerHeight).
 * `KNOWN` lists today's failures: they print as known and don't fail the run (scripts/lib/check.ts `knownChecker`).
 *
 * Needs a server: `npx vite build && npx vite preview --port 4318` (or `pnpm dev`), then
 * `npx tsx scripts/site/layout.ts [baseUrl] [--shots <dir>] [--grid ruled|cards] [--pages a,b] [--widths 1440,320]`.
 * `--grid` sets html[data-grid] first (the two card grid styles of decision 10); `--pages` and `--widths` run a subset.
 * Chrome: $CHROME or the usual paths.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, sleep } from '../lib/cdp'
import { knownChecker } from '../lib/check'
import { coveredFooterLinks, FOOTER_WRAP, headerTopAfterScroll, scrollTo } from '../lib/site-probe'

/**
 * Today's failures (docs/POLISH-PLAN.md §2). Each P1–P3 task deletes its ids when its fix lands, which makes the
 * check a gate. Seeded from a run against `pnpm dev`.
 */
const KNOWN: readonly string[] = [
  // S2, N3 (P1-B, P1-C): the essay's site nav sits inside the post's hero, so it scrolls away with it; the widget
  // page has no header
  'sticky:essay@1440:mid', 'sticky:essay@1440:bottom', 'sticky:essay@768:mid', 'sticky:essay@768:bottom',
  'sticky:widget@1440:mid', 'sticky:widget@1440:bottom', 'sticky:widget@768:mid', 'sticky:widget@768:bottom',
  // S3 (P1-B): MAKE scrolls to show the footer under the editor
  'no-app-scroll:make@1920', 'no-app-scroll:make@1440', 'no-app-scroll:make@1280', 'no-app-scroll:make@1024', 'no-app-scroll:make@768',
]

const args = process.argv.slice(2)
const base = (args.find(a => /^https?:/.test(a)) ?? 'http://localhost:4318/').replace(/\/?$/, '/')
const opt = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const shotDir = opt('--shots')
if (shotDir) mkdirSync(shotDir, { recursive: true })
const gridStyle = opt('--grid')
const onlyPages = opt('--pages')?.split(','), onlyWidths = opt('--widths')?.split(',').map(Number)
const ALL_WIDTHS: [number, number, boolean][] = [[1920, 1080, false], [1440, 900, false], [1280, 800, false], [1024, 768, false], [768, 1024, false], [390, 844, true], [320, 568, true]]
const WIDTHS = ALL_WIDTHS.filter(([w]) => !onlyWidths || onlyWidths.includes(w))
/**
 * Columns per width at the default CARD SIZE, LARGE (no data-cards): a standard board 3 → 2 → 1, a dense one
 * 4 → 3 → 1, a hero one 3 → 2 → 1 (its card-min, not the cap). The home board is standard.
 */
const COLS: Record<string, Record<number, number>> = {
  home: { 1920: 3, 1440: 3, 1280: 3, 1024: 3, 768: 2, 390: 1, 320: 1 },
  components: { 1920: 3, 1440: 3, 1280: 3, 1024: 3, 768: 2, 390: 1, 320: 1 },
  deerflow12: { 1920: 4, 1440: 4, 1280: 4, 1024: 4, 768: 3, 390: 1, 320: 1 },
  lock: { 1920: 3, 1440: 3, 1280: 3, 1024: 2, 768: 2, 390: 1, 320: 1 },
}
/**
 * CARD SIZE (html[data-cards]): columns per size, width and board. MEDIUM caps at 4 (dense 5), COMPACT is T3's
 * uncapped auto-fill (5 → 4 → 3 → 2) with 2 on a phone. Hero boards fit 3 at most, so only the phone changes.
 */
const SIZE_COLS: Record<'l' | 'm' | 's', Record<number, Record<string, number>>> = {
  l: { 1440: { components: 3, deerflow12: 4, lock: 3 }, 1280: { components: 3, deerflow12: 4 }, 390: { components: 1, deerflow12: 1, lock: 1 } },
  m: { 1440: { components: 4, deerflow12: 5, lock: 3 }, 1280: { components: 4, deerflow12: 5 }, 390: { components: 1, deerflow12: 1, lock: 1 } },
  s: { 1440: { components: 5, deerflow12: 6, lock: 3 }, 1280: { components: 4, deerflow12: 5 }, 390: { components: 2, deerflow12: 2, lock: 2 } },
}
/** Whole cards above the fold at 1440, per density: LARGE gives each card ~440 px, so one full row (T3 wanted 6 at 240 px). */
const FOLD_1440: Record<string, number> = { hero: 2, standard: 3, dense: 4 }
const ALL_PAGES = [
  { name: 'home', path: '', kind: 'board', hero: true },
  { name: 'components', path: 'components/', kind: 'board' },
  { name: 'lock', path: 'lock/', kind: 'board' },
  { name: 'deerflow12', path: 'deerflow12/', kind: 'board' },
  { name: 'about', path: 'about/', kind: 'about' },
  { name: 'make', path: '?make=tune', kind: 'make' },
  { name: 'widget', path: 'widget/timer/', kind: 'widget' },
  { name: 'essay', path: 'blog/dot-matrix-essay/', kind: 'essay' },
  { name: 'privacy', path: 'privacy', kind: 'legal' },
  { name: 'terms', path: 'terms', kind: 'legal' },
] as const
const PAGES = ALL_PAGES.filter(p => !onlyPages || onlyPages.includes(p.name))
/** Where the `sticky` check runs (docs/POLISH-PLAN.md §2 P0). */
const STICKY_PAGES = ['home', 'about', 'essay', 'privacy', 'widget'], STICKY_WIDTHS = [1440, 768]
const READY: Record<string, string> = {
  board: `!!document.querySelector('.board-grid canvas, .board-grid svg') && !!document.querySelector('.live-band canvas, .live-band svg')`,
  about: `!!document.querySelector('.log-view') && !!document.querySelector('.live-band canvas, .live-band svg')`,
  make: `!!document.querySelector('.ed-top')`,
  widget: `!!document.querySelector('.wp-stage canvas, .wp-stage svg')`,
  essay: `!!document.querySelector('.hero .dot-title') && !!document.querySelector('.hero canvas, .hero .dot-svg')`,
  legal: `!!document.querySelector('.legal > main')`,
}

/** How long a page may take to get ready: a dev server on a busy machine can take half a minute for a cold page. */
const READY_MS = 45000

if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const page = await launch(1440, 900)
const { cdp, js, waitFor } = page

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
    : ${JSON.stringify(kind)} === 'widget' ? { top: q('.wp-top > .pill'), card: q('.wp-stagebox'), footer: q('.bottom-row') } : {}
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

const { check, done } = knownChecker(KNOWN, 'layout')
const colsSeen = new Map<string, number>()
const rows: string[] = []
/** Loads `path` and waits for its `kind` to be ready (fonts and first frames included). */
const open = async (path: string, kind: string) => {
  await cdp('Page.navigate', { url: base + path })
  await sleep(400)
  const ready = await waitFor(READY[kind], READY_MS)
  await js('document.fonts.ready.then(() => 1)'); await sleep(1500)
  return ready
}
try {
  for (const [W, H, mobile] of WIDTHS) {
    await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile })
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 })
    for (const p of PAGES) {
      if (p.kind === 'make' && mobile) continue // the phone editor is full-screen, with its own bar
      const ready = await open(p.path, p.kind)
      if (gridStyle) { await js(`document.documentElement.dataset.grid = ${JSON.stringify(gridStyle)}`); await sleep(300) }
      await scrollTo(page, 'top'); await sleep(200)
      const m = await js(MEASURE(p.kind, H)) as M
      const tag = `${p.name}@${W}`, id = (c: string) => `${c}:${tag}`
      console.log(`\n${tag}`)
      check(id('ready'), ready)
      // the frame's content edge at this width
      const pad = Math.min(40, Math.max(16, W * .03)), edge = (W - Math.min(W, 1440)) / 2 + pad
      const lefts = Object.entries(m.left), off = lefts.filter(([, x]) => Math.abs(x - edge) > 1)
      if (lefts.length) check(id('edge'), !off.length, off.length ? `${edge.toFixed(1)} expected; off: ${off.map(([k, x]) => `${k} ${x}`).join(', ')}` : '')
      check(id('overflow'), m.scrollW <= W + 1, `scrollWidth ${m.scrollW}`)
      const set = Object.values(m.tok), bad = m.gaps.filter(g => !set.some(t => Math.abs(g.px - t) <= 1))
      if (m.gaps.length) check(id('gaps'), !bad.length, bad.length ? `off the token set (${set.map(t => t.toFixed(1)).join(' / ')}): ${bad.map(g => `${g.from}→${g.to} ${g.px}`).join(', ')}` : '')
      check(id('type'), m.small < .1, `${(m.small * 100).toFixed(1)}% of the chrome characters under 12 px, want < 10%`)
      if (p.kind === 'board') {
        check(id('tall'), m.tallest <= .62 * H + 1, `tallest card ${m.tallest}px, 62svh = ${Math.round(.62 * H)}`)
        check(id('stretch'), !m.orphanStretched)
        if ('hero' in p) check(id('fold-one'), m.fold >= 1, `${m.fold} whole card(s) above the fold`)
        // T3
        check(id('square'), m.square <= 1, `|w − h| up to ${m.square}px`)
        if (W === 1440) check(id('fold'), m.fold >= (FOLD_1440[m.density] ?? 6), `${m.fold} whole card(s) above the fold on a ${m.density} board, want ≥ ${FOLD_1440[m.density] ?? 6}`)
        const want = COLS[p.name]?.[W]
        if (want !== undefined) check(id('cols'), m.cols === want, `${m.cols} column(s), want ${want}`)
        const before = colsSeen.get(p.name)
        if (before !== undefined) check(id('cols-grow'), m.cols <= before, `${m.cols} columns; ${before} on the wider screen`)
        colsSeen.set(p.name, m.cols)
        check(id('orphan'), !m.orphan.startsWith('✗'), `last row ${m.orphan.replace(/^✗ /, '')}`)
        if (mobile) check(id('phone-head'), m.head <= 120, `intro + picker ${m.head}px tall, want ≤ 120`)
        if (mobile) check(id('strip-overlap'), !m.overlaps.length, m.overlaps.join(', '))
      }
      console.log(`  edge ${edge.toFixed(1)} · gaps ${m.gaps.map(g => `${g.from}→${g.to} ${g.px}`).join(', ') || '—'}${p.kind === 'board' ? ` · ${m.density}: ${m.cols} col, grid at y ${m.gridTop}, cards ${m.cards}, above the fold ${m.fold}, tallest ${m.tallest}, last row ${m.orphan}, intro + picker ${m.head}px · chrome <12px ${(m.small * 100).toFixed(0)}%` : ` · chrome <12px ${(m.small * 100).toFixed(0)}%`}`)
      rows.push(`| ${p.name} | ${W} | ${off.length ? '✗' : '✓'} | ${m.scrollW > W + 1 ? '✗' : '✓'} | ${bad.length ? '✗' : '✓'} | ${p.kind === 'board' ? m.cols : '—'} | ${p.kind === 'board' ? `${m.fold} / ${m.cards}` : '—'} | ${p.kind === 'board' ? `${m.tallest} / ${Math.round(.62 * H)}` : '—'} | ${p.kind === 'board' ? (m.orphanStretched || m.orphan.startsWith('✗') ? '✗' : '✓') : '—'} | ${p.kind === 'board' ? m.head : '—'} | ${(m.small * 100).toFixed(0)}% |`)
      if (shotDir) await page.shot(join(shotDir, `${p.name}-${W}.png`))
      // P0 chrome checks (docs/POLISH-PLAN.md §2): the footer, then the header after a scroll
      const wraps = await js(FOOTER_WRAP) as string[]
      check(id('footer-wrap'), !wraps.length, wraps.join(', '))
      const covered = await coveredFooterLinks(page)
      check(id('covered'), !covered.length, covered.join(', '))
      if (p.kind === 'make' || (p.kind === 'widget' && !mobile && H >= 560)) {
        const s = await js(`[document.documentElement.scrollHeight, innerHeight]`) as [number, number]
        check(id('no-app-scroll'), s[0] <= s[1] + 1, `scrollHeight ${s[0]}, innerHeight ${s[1]}`)
      }
      if (STICKY_PAGES.includes(p.name) && STICKY_WIDTHS.includes(W)) for (const at of ['mid', 'bottom'] as const) {
        const top = await headerTopAfterScroll(page, at, W, H)
        check(`${id('sticky')}:${at}`, top !== null && top >= -.5 && top <= 1, top === null ? 'no header' : `header top ${top}`)
      }
    }
  }
  // CARD SIZE: each size on the same page (html[data-cards] set live, as the controls do), columns per board and
  // width; the cards stay square, unstretched, and the last row sits right
  if (!onlyPages) {
    console.log('\ncard size')
    for (const [W, H, mobile] of WIDTHS.filter(([w]) => w in SIZE_COLS.l)) {
      await cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile })
      await cdp('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 })
      for (const name of Object.keys(SIZE_COLS.l[W])) {
        await cdp('Page.navigate', { url: base + name + '/' })
        await sleep(400); await waitFor(READY.board, READY_MS); await sleep(800)
        if (gridStyle) await js(`document.documentElement.dataset.grid = ${JSON.stringify(gridStyle)}`)
        const seen: string[] = []
        for (const size of ['l', 'm', 's'] as const) {
          await js(`document.documentElement.dataset.cards = '${size}'; window.scrollTo(0, 0)`); await sleep(300)
          const m = await js(MEASURE('board', H)) as M, want = SIZE_COLS[size][W][name], id = (c: string) => `size-${c}:${name}@${W}:${size}`
          seen.push(`${size} ${m.cols}`)
          check(id('cols'), m.cols === want, `${m.cols} column(s), want ${want}`)
          check(id('square'), m.square <= 1, `|w − h| up to ${m.square}px`)
          check(id('stretch'), !m.orphanStretched)
          check(id('orphan'), !m.orphan.startsWith('✗'), `last row ${m.orphan.replace(/^✗ /, '')}`)
          check(id('overflow'), m.scrollW <= W + 1, `scrollWidth ${m.scrollW}`)
          if (shotDir) await page.shot(join(shotDir, `${name}-${W}-cards-${size}.png`))
        }
        console.log(`  ${name} @${W}: ${seen.join(' · ')}`)
        await js(`delete document.documentElement.dataset.cards`)
      }
    }
  }
} finally {
  await page.close()
}

// `overflow-sb`: a second Chrome with real scrollbars, desktop widths only (phones use overlay scrollbars)
const bars = await launch(1440, 900, { scrollbars: true })
try {
  console.log('\nreal scrollbars')
  let widest = 0
  for (const [W, H] of WIDTHS.filter(([, , mobile]) => !mobile)) {
    await bars.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
    for (const p of PAGES) {
      await bars.cdp('Page.navigate', { url: base + p.path })
      await sleep(400); await bars.waitFor(READY[p.kind], READY_MS); await sleep(1200)
      const s = await bars.js(`(() => { const d = document.documentElement; return { sbw: innerWidth - d.clientWidth, over: Math.max(d.scrollWidth, document.body.scrollWidth) - d.clientWidth } })()`) as { sbw: number; over: number }
      widest = Math.max(widest, s.sbw)
      check(`overflow-sb:${p.name}@${W}`, s.over <= 0, `${s.over > 0 ? `${s.over}px wider than the page` : 'fits'}, scrollbar ${s.sbw}px`)
    }
  }
  // a run where no page shows a scrollbar can't catch a `100vw` overflow
  if (WIDTHS.some(([, , mobile]) => !mobile)) check('overflow-sb:scrollbars-shown', widest > 0, `widest scrollbar ${widest}px`)
} finally {
  await bars.close()
}
console.log(`\n${gridStyle ? `grid style: ${gridStyle}\n` : ''}| page | width | one edge | no overflow | gaps in token set | columns | cards above fold | tallest / 62svh | orphan row ok | intro + picker px | chrome < 12 px |\n|---|---|---|---|---|---|---|---|---|---|---|\n` + rows.join('\n'))
done()
