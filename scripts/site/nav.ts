/**
 * Navigation probe (docs/POLISH-PLAN.md §2 P0) in headless Chrome over CDP (scripts/lib/cdp.ts), with real input:
 * Chrome skips history entries pushed without a user gesture, so views are changed with real key presses and taps,
 * and Back / Forward are the browser's own (`Page.navigateToHistoryEntry`). Checks, each with an id:
 *  - `route:<url>` / `reload:<url>`: each URL of the route table opens the expected view at the canonical URL, and a
 *    reload of that URL gives the same view at the same URL;
 *  - `history:<step>` and `scroll:<step>` (1440): `/lock/` → ABOUT → MAKE by keyboard, then Back, Back, Forward:
 *    each step shows the right view and puts the scroll back where it was left (±40 px);
 *  - `sheet-back:<sheet>` / `sheet-url:<sheet>` (390, touch): Back with the boards sheet, the TOOLS sheet or the
 *    palette open closes it and keeps the view's URL;
 *  - `tab-order:<page>@<width>` (1440 and 390): before the footer, no Tab stop lands more than one viewport above
 *    the one before it (stops in pinned bars are skipped).
 * `KNOWN` lists today's failures: they print as known and don't fail the run (scripts/lib/check.ts `knownChecker`).
 *
 * Needs a server: `npx vite build && npx vite preview --port 4319` (or `pnpm dev`), then
 * `npx tsx scripts/site/nav.ts [baseUrl] [--only routes,history,sheets,tabs]`. Chrome: $CHROME or the usual paths.
 */
import { readFileSync } from 'node:fs'
import { boardIds } from '../../src/widgets/manifest'
import { findChrome, launch, sleep, type Page } from '../lib/cdp'
import { knownChecker } from '../lib/check'
import { tabWalk } from '../lib/site-probe'

/**
 * Today's failures (docs/POLISH-PLAN.md §2). Each P1–P3 task deletes its ids when its fix lands, which makes the
 * check a gate. Seeded from a run against `pnpm dev`.
 */
const KNOWN: readonly string[] = [
  // N5 (P1-A): Forward to ABOUT lands near the top, not where it was left (Back restores both)
  'scroll:forward-about',
  // N4 (P1-A): Back with a sheet open leaves the view and keeps the sheet open
  'sheet-back:boards', 'sheet-url:boards', 'sheet-back:tools', 'sheet-url:tools', 'sheet-back:palette', 'sheet-url:palette',
]

const args = process.argv.slice(2)
const base = (args.find(a => /^https?:/.test(a)) ?? 'http://localhost:4319/').replace(/\/?$/, '/')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : undefined
const runs = (part: string) => !only || only.includes(part)
const HOME = boardIds[0], ESSAY = '/blog/dot-matrix-essay/'
const uid = (JSON.parse(readFileSync('src/widgets/ids.json', 'utf8')) as Record<string, string>).timer

/**
 * What the page shows, or '' while it loads: `EXPLORE:<board>`, `MAKE`, `ABOUT`, `widget:<slug>`, `widget-missing`,
 * `post` (a blog post: the URL says which), `privacy`, `terms`, `lab`, `crashed` (the root error boundary).
 */
const VIEW = `(() => {
  const shell = document.querySelector('.shell')
  if (shell) {
    if (document.querySelector('.view-loading')) return ''
    if (shell.classList.contains('shell--widget')) return document.querySelector('.wp-missing') ? 'widget-missing' : document.querySelector('.wp-ids code')?.textContent.trim().replace(/^/, 'widget:') ?? ''
    const v = shell.dataset.view
    if (v === 'EXPLORE') { const b = document.querySelector('.board-picker [data-board].selected'); return b && document.querySelector('.board-grid .dot-card') ? 'EXPLORE:' + b.dataset.board : '' }
    if (v === 'MAKE') return document.querySelector('.ed-top, .ed-root') ? 'MAKE' : ''
    if (v === 'ABOUT') return document.querySelector('.log-view') ? 'ABOUT' : ''
    return ''
  }
  if (document.querySelector('.legal > main')) return /terms/i.test(document.title) ? 'terms' : 'privacy'
  if (document.querySelector('.essay.post > main .hero')) return 'post'
  if (document.querySelector('.essay.lab > main')) return 'lab'
  if (document.querySelector('.root-crash')) return 'crashed'
  return ''
})()`
const here = (p: Page) => p.js<string>('location.pathname + location.search')
/** Waits for a view, then lets it settle (a first render may still rewrite the URL). */
const settle = async (p: Page, ms = 30000) => { await p.waitFor(`(${VIEW}) !== ''`, ms); await sleep(800); return p.js<string>(VIEW) }

/** The route table: a URL (relative to the site root), the view it opens and its canonical URL. */
const ROUTES: [string, string, string][] = [
  ['', `EXPLORE:${HOME}`, '/'],
  ['lock/', 'EXPLORE:lock', '/lock/'],
  ['glyph/', 'EXPLORE:lock', '/lock/'],
  ['?board=mosaic', 'EXPLORE:mosaic', '/mosaic/'],
  ['?about', 'ABOUT', '/about/'],
  ['about/', 'ABOUT', '/about/'],
  ['about', 'ABOUT', '/about/'],
  ['?make', 'MAKE', '/?make'],
  ['?make=code', 'MAKE', '/?make=code'],
  ['?tab=gallery', 'EXPLORE:henry', HOME === 'henry' ? '/' : '/henry/'],
  ['?tab=dots', 'MAKE', '/?make=code'],
  ['?tab=log', 'ABOUT', '/about/'],
  ['?tab=essay', 'post', ESSAY],
  ['essay', 'post', ESSAY],
  ['essay/', 'post', ESSAY],
  ['essay.html', 'post', ESSAY],
  ['blog/dot-matrix-essay/', 'post', ESSAY],
  ['privacy', 'privacy', '/privacy'],
  ['terms', 'terms', '/terms'],
  ['widget/timer/', 'widget:timer', '/widget/timer/'],
  [uid, 'widget:timer', '/widget/timer/'],
  ['?card=timer', 'widget:timer', '/widget/timer/'],
  ['nope/', `EXPLORE:${HOME}`, '/'],
  // #148: a `//host` path stays on the site, a bad escape in the hash doesn't blank the page
  ['/lock/', 'EXPLORE:lock', '/lock/'],
  ['/evil.example/', `EXPLORE:${HOME}`, '/'],
  ['blog/dot-matrix-essay/#%E0', 'post', ESSAY],
  ['lab/#%E0', 'lab', '/lab/'],
]

async function routes(p: Page) {
  console.log('\nroutes')
  for (const [path, view, url] of ROUTES) {
    const name = `/${path}`
    await p.cdp('Page.navigate', { url: base + path })
    const v1 = await settle(p), u1 = await here(p)
    check(`route:${name}`, v1 === view && u1 === url, `${v1 || 'nothing'} at ${u1}; want ${view} at ${url}`)
    await p.cdp('Page.reload', { ignoreCache: false })
    await sleep(500)
    const v2 = await settle(p), u2 = await here(p)
    check(`reload:${name}`, v2 === v1 && u2 === u1, `${v2 || 'nothing'} at ${u2} after the reload`)
  }
}

/** Presses Enter on `selector` (focused without scrolling), so the page keeps the scroll position it is left at. */
async function press(p: Page, selector: string) {
  await p.js(`document.querySelector(${JSON.stringify(selector)}).focus({ preventScroll: true })`)
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' })
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
}
/** The browser's Back (-1) or Forward (+1). */
async function step(p: Page, by: -1 | 1) {
  const h = (await p.cdp('Page.getNavigationHistory')).result as { currentIndex: number; entries: { id: number }[] }
  const e = h.entries[h.currentIndex + by]
  if (e) await p.cdp('Page.navigateToHistoryEntry', { entryId: e.id })
  return !!e
}

async function history(p: Page) {
  console.log('\nBack / Forward (1440)')
  await p.cdp('Page.navigate', { url: `${base}lock/` })
  await settle(p); await sleep(1500)
  await p.js('window.scrollTo({ top: 500, behavior: "instant" })'); await sleep(300)
  await press(p, '#tab-ABOUT')
  await settle(p); await sleep(1500)
  await p.js('window.scrollTo({ top: 1500, behavior: "instant" })'); await sleep(300)
  const leftAbout = await p.js<number>('scrollY')
  await press(p, '#tab-MAKE')
  check('history:to-make', await settle(p) === 'MAKE', await here(p))
  const expect = async (name: string, by: -1 | 1, view: string, y: number) => {
    const moved = await step(p, by)
    const v = await settle(p)
    await sleep(1500) // the view's content mounts; a restore may wait for it
    const at = await p.js<number>('Math.round(scrollY)')
    check(`history:${name}`, moved && v === view, `${moved ? v || 'nothing' : 'no history entry'} at ${await here(p)}; want ${view}`)
    check(`scroll:${name}`, Math.abs(at - y) <= 40, `scrollY ${at}, left at ${y}`)
  }
  await expect('back-about', -1, 'ABOUT', leftAbout)
  await expect('back-lock', -1, 'EXPLORE:lock', 500)
  await expect('forward-about', 1, 'ABOUT', leftAbout)
}

/** Taps the centre of the first visible element matching `selector` (or the tab bar button with that label). */
async function tap(p: Page, selector: string) {
  const c = await p.js<[number, number] | null>(`(() => {
    const els = ${selector.startsWith('tabbar:') ? `[...document.querySelectorAll('.tabbar button')].filter(b => b.textContent.trim() === ${JSON.stringify(selector.slice(7))})` : `[...document.querySelectorAll(${JSON.stringify(selector)})]`}
    const el = els.find(e => e.getBoundingClientRect().height > 0)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]
  })()`)
  if (c) await p.tap(c[0], c[1])
  return !!c
}

async function sheets(p: Page) {
  console.log('\nBack with a sheet open (390, touch)')
  // each: where it starts, the tab-bar view to move to first (a history entry to go back to), the opener, the open sheet
  const cases = [
    { name: 'boards', from: '?about', to: 'EXPLORE', opener: '.topbar-place', open: 'dialog.board-sheet[open]' },
    { name: 'tools', from: '', to: 'ABOUT', opener: 'tabbar:TOOLS', open: 'dialog.tools-sheet[open]' },
    { name: 'palette', from: '', to: 'ABOUT', opener: '.topbar-search', open: '.pal' },
  ]
  for (const c of cases) {
    await p.cdp('Page.navigate', { url: base + c.from })
    await settle(p); await sleep(1500)
    await tap(p, `tabbar:${c.to}`)
    await settle(p); await sleep(1200)
    const url = await here(p)
    const opened = await tap(p, c.opener) && await p.waitFor(`!!document.querySelector(${JSON.stringify(c.open)})`, 20000)
    if (!opened) { check(`sheet-back:${c.name}`, false, `the ${c.name} sheet did not open`); continue }
    await sleep(800)
    await step(p, -1)
    await sleep(1500)
    const still = await p.js<boolean>(`!!document.querySelector(${JSON.stringify(c.open)})`), after = await here(p)
    check(`sheet-back:${c.name}`, !still, still ? 'still open after Back' : 'closed')
    check(`sheet-url:${c.name}`, after === url, `${after}, was ${url}`)
  }
}

async function tabs(p: Page, W: number, H: number) {
  for (const [name, path] of [['home', ''], ['about', 'about/'], ['essay', ESSAY.slice(1)]]) {
    await p.cdp('Page.navigate', { url: base + path })
    await settle(p); await sleep(1500)
    // the home's hero card mounts once the page is idle, and it is part of the Tab order
    if (name === 'home') await p.waitFor(`!!document.querySelector('.home-hero button')`, 10000)
    await p.js('window.scrollTo({ top: 0, behavior: "instant" })')
    const stops = (await tabWalk(p, 120, true)).filter(s => !s.pinned)
    const jumps: string[] = []
    for (let i = 1; i < stops.length && !stops[i - 1].footer; i++) {
      const back = stops[i - 1].y - stops[i].y
      if (back > H) jumps.push(`#${stops[i - 1].n} ${stops[i - 1].label} (y ${stops[i - 1].y}) → #${stops[i].n} ${stops[i].label} (y ${stops[i].y})`)
    }
    check(`tab-order:${name}@${W}`, stops.length > 0 && !jumps.length, `${stops.length} stops${stops.at(-1)?.footer ? ' to the footer' : ''}${jumps.length ? `; back up more than a viewport: ${jumps.slice(0, 3).join(' | ')}` : ''}`)
  }
}

if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const { check, done } = knownChecker(KNOWN, 'nav')
// desktop first: touch emulation leaves `pointer: coarse` behind
const desk = await launch(1440, 900)
try {
  await desk.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  if (runs('routes')) await routes(desk)
  if (runs('history')) await history(desk)
  if (runs('tabs')) { console.log('\nTab order (1440)'); await tabs(desk, 1440, 900) }
} finally {
  await desk.close()
}
if (runs('sheets') || runs('tabs')) {
  const phone = await launch(390, 844)
  try {
    await phone.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
    await phone.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    if (runs('sheets')) await sheets(phone)
    if (runs('tabs')) { console.log('\nTab order (390)'); await tabs(phone, 390, 844) }
  } finally {
    await phone.close()
  }
}
done()
process.exit(0)
