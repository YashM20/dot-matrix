/**
 * (scratch edit for the affected-probes test; not for merge)
 * BROWSE probe (#182) in headless Chrome over CDP (scripts/lib/cdp.ts), as a visitor sees it (MAKE and the lab off):
 *  - the header and the phone tab bar offer BROWSE, and MAKE / LAB stay hidden;
 *  - `/browse/` lists every card, mounts only the cards near the screen, and unmounts the top ones after a scroll to
 *    the bottom; it has its own title and canonical;
 *  - a shared query (`?in=&tag=&q=`) opens filtered, a hostile one is cleaned, typing updates the URL and the
 *    polite count; the filters are labelled and reachable with Tab;
 *  - a card's ⋯ OPEN goes to its page and Back returns to BROWSE; a board link opens the board;
 *  - no horizontal overflow at 390, 768, 1280 and 1920, in the dark and light schemes and a second accent.
 * `--shots <dir>` saves the PR screenshots there.
 *
 * Needs a build: `npx vite build`, then `npx tsx scripts/site/browse-browser.ts [--shots <dir>]` (it serves dist/).
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, serveDist, sleep, type Page } from '../lib/cdp'
import { checker } from '../lib/check'
import { catalog } from '../../src/widgets/catalog'

const { assert, done } = checker('browse')
const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : undefined
if (shots) mkdirSync(shots, { recursive: true })
const ALL = catalog.length

/** The intro note hidden, so the shots show the page itself (MAKE and the lab are off through `launch`'s flags). */
async function quiet(p: Page, base: string) {
  await p.cdp('Page.navigate', { url: `${base}robots.txt` }); await sleep(300)
  await p.js(`localStorage.setItem('dot480:intro', 'off'), 1`)
}
const open = async (p: Page, url: string) => { await p.cdp('Page.navigate', { url }); return p.waitFor(`!!document.querySelector('.browse-count')`, 30000) }
const count = (p: Page) => p.js<string>(`document.querySelector('.browse-count')?.textContent ?? ''`)
const mountedCards = (p: Page) => p.js<number>(`document.querySelectorAll('.browse-item > .dot-card:not(.browse-ghost)').length`)
const shot = async (p: Page, name: string) => { if (shots) await p.shot(join(shots, `${name}.png`)) }

const { url: base, stop } = await serveDist(4327)
const p = await launch(1280, 900, { flags: { make: false, lab: false }, testHooks: false })
try {
  await quiet(p, base)
  assert('browse: /browse/ opens the view', await open(p, `${base}browse/`))
  await p.waitFor(`document.querySelectorAll('.browse-item > .dot-card:not(.browse-ghost)').length > 2`, 20000); await sleep(1500)
  const head = await p.js<{ tabs: string[]; title: string; canonical: string; lab: boolean }>(`({ tabs: [...document.querySelectorAll('.view-tabs [role=tab]')].map(t => t.textContent), title: document.title,
    canonical: document.querySelector('link[rel=canonical]')?.href ?? '', lab: !!document.querySelector('.topbar a[href="/lab/"]') })`)
  assert('browse: the header has a BROWSE tab, selected here, and no MAKE or LAB', head.tabs.includes('BROWSE') && !head.tabs.includes('MAKE') && !head.lab
    && await p.js<boolean>(`document.querySelector('#tab-BROWSE')?.getAttribute('aria-selected') === 'true'`), head.tabs.join(' '))
  assert('browse: its own title and canonical', /^Browse every card/.test(head.title) && head.canonical.endsWith('/browse/'), `${head.title} | ${head.canonical}`)
  assert(`browse: lists all ${ALL} cards`, await p.js<number>(`document.querySelectorAll('.browse-item').length`) === ALL && (await count(p)) === `${ALL} cards`, await count(p))
  const near = await mountedCards(p)
  assert('browse: only the cards near the screen are mounted', near > 0 && near <= 24, `${near} mounted of ${ALL}`)
  await shot(p, 'browse-1280')
  await p.js(`document.querySelector('.topbar').scrollIntoView(), 1`); await shot(p, 'header-1280')
  // a scroll to the bottom: the top cards leave, the bottom ones come, the total stays bounded
  const t0 = Date.now()
  for (let y = 0; y < 80 && await p.js<boolean>('innerHeight + scrollY < document.documentElement.scrollHeight - 4'); y++) { await p.js(`window.scrollBy(0, innerHeight * 1.2), 1`); await sleep(60) }
  await sleep(1500)
  const after = await p.js<{ first: boolean; last: boolean; n: number }>(`(() => { const s = [...document.querySelectorAll('.browse-item')]; const card = li => !!li.querySelector('.dot-card:not(.browse-ghost)'); return { first: card(s[0]), last: card(s.at(-1)), n: s.filter(card).length } })()`)
  assert('browse: after scrolling to the bottom the first card is unmounted, the last one mounted, and the count stays small', !after.first && after.last && after.n <= 30, `${JSON.stringify(after)} in ${Date.now() - t0} ms`)
  assert('browse: no page errors so far', !p.logs.length, p.logs.slice(0, 3).join(' | '))

  // a shared, filtered link
  const watch = catalog.filter(r => r[2] === 'watch').length
  await open(p, `${base}browse/?in=watch&q=`); await sleep(800)
  assert('browse: ?in= opens filtered to one board', (await count(p)) === `${watch} of ${ALL} cards` && await p.js<string>(`document.querySelectorAll('.browse-field select')[0].value`) === 'watch', await count(p))
  await open(p, `${base}browse/?tag=clock&in=watch`); await p.waitFor(`document.querySelectorAll('.browse-item > .dot-card:not(.browse-ghost)').length > 0`, 15000); await sleep(1500)
  await shot(p, 'browse-filtered-1280')
  p.logs.length = 0
  await open(p, `${base}browse/?in=%3Cimg%20src%3Dx%3E&tag=%22%3E&q=%E0%A4%A%00ring`); await sleep(800)
  const hostile = await p.js<{ board: string; tag: string; q: string; url: string }>(`({ board: document.querySelectorAll('.browse-field select')[0].value, tag: document.querySelectorAll('.browse-field select')[1].value, q: document.querySelector('.browse-field input').value, url: location.pathname + location.search })`)
  assert('browse: a hostile query is cleaned (unknown board and tag dropped, control characters gone) without errors', !hostile.board && !hostile.tag && ![...hostile.q].some(c => c < ' ' || c === '<') && !/%3C|in=/.test(hostile.url) && !p.logs.length, JSON.stringify(hostile))

  // typing: the URL and the polite count follow
  await open(p, `${base}browse/`)
  await p.js(`document.querySelector('.browse-field input').focus(), 1`)
  await p.cdp('Input.insertText', { text: 'ring' }); await sleep(700)
  const typed = await p.js<{ url: string; live: string | null; role: string | null; n: string }>(`({ url: location.search, role: document.querySelector('.browse-count').getAttribute('role'), live: document.querySelector('.browse-count').getAttribute('aria-live'), n: document.querySelector('.browse-count').textContent })`)
  assert('browse: search writes ?q= and the count is a polite status', /q=ring/.test(typed.url) && typed.role === 'status' && / of /.test(typed.n), JSON.stringify(typed))
  const labels = await p.js<string[]>(`[...document.querySelectorAll('.browse-tools input, .browse-tools select')].map(e => e.labels?.[0]?.querySelector('span')?.textContent ?? '')`)
  assert('browse: search, board and tag are labelled', labels.join(',') === 'SEARCH,BOARD,TAG', labels.join(','))
  await p.key('Tab', 'Tab', 9); const f1 = await p.js<string>(`document.activeElement.closest('label')?.textContent.slice(0, 5) ?? document.activeElement.tagName`)
  await p.key('Tab', 'Tab', 9); const f2 = await p.js<string>(`document.activeElement.closest('label')?.textContent.slice(0, 3) ?? document.activeElement.tagName`)
  assert('browse: Tab goes from the search to BOARD, then TAG', f1 === 'BOARD' && f2 === 'TAG', `${f1}, ${f2}`)

  // card actions: ⋯ → open its page, Back → BROWSE again; a board link opens the board
  await open(p, `${base}browse/?in=watch`); await p.waitFor(`!!document.querySelector('.browse-item .dot-card-more')`, 15000); await sleep(600)
  const slug = await p.js<string>(`document.querySelector('.browse-item').dataset.slot`)
  await p.js(`document.querySelector('.browse-item .dot-card-more').click(), 1`); await sleep(200)
  await p.js(`[...document.querySelectorAll('.dot-card-menu [role=menuitem]')].find(b => /open/i.test(b.textContent)).click(), 1`)
  const opened = await p.waitFor(`location.pathname === '/widget/${slug}/' && !!document.querySelector('.wp')`, 15000)
  assert('browse: a card\'s ⋯ OPEN goes to its page, without the filters in its URL', opened && await p.js<string>('location.search') === '', await p.js<string>('location.href'))
  await p.js('history.back(), 1')
  assert('browse: Back returns to BROWSE with the filter', await p.waitFor(`location.pathname === '/browse/' && /in=watch/.test(location.search) && !!document.querySelector('.browse-count')`, 15000))
  await sleep(500)
  await p.js(`document.querySelector('.browse-board').click(), 1`)
  assert('browse: a board link opens that board', await p.waitFor(`location.pathname === '/watch/' && !!document.querySelector('.board-grid .dot-card')`, 15000), await p.js<string>('location.href'))

  // every width, two schemes and a second accent: nothing overflows sideways
  const over: string[] = []
  for (const theme of ['dark_signal', 'light_signal', 'dark_amber']) for (const [w, h] of [[390, 844], [768, 1024], [1280, 900], [1920, 1080]]) {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 })
    await open(p, `${base}browse/?theme=${theme}&tag=ring`); await sleep(900)
    if (await p.js<boolean>('document.documentElement.scrollWidth > innerWidth + 1')) over.push(`${theme}@${w}`)
    if (theme === 'dark_signal') {
      const widths = await p.js<number[]>(`[...document.querySelectorAll('.browse-field input, .browse-field select')].map(e => Math.round(e.getBoundingClientRect().width))`)
      assert(`browse: search, board and tag fields are usable at ${w} (≥ 100 px wide)`, widths.length === 3 && widths.every(x => x >= 100), widths.join(', '))
    }
    if (theme === 'dark_signal' && w === 390) {
      const bar = await p.js<string[]>(`[...document.querySelectorAll('.tabbar button')].map(b => b.textContent.trim())`)
      assert('browse: the phone tab bar offers BROWSE and no MAKE', bar.includes('BROWSE') && !bar.includes('MAKE'), bar.join(' '))
      await p.js('window.scrollTo(0, 0), 1'); await sleep(600); await shot(p, 'browse-390')
    }
    if (theme === 'light_signal' && w === 1280) await shot(p, 'browse-light-1280')
  }
  assert('browse: no horizontal overflow at 390, 768, 1280 and 1920 in dark, light and a second accent', !over.length, over.join(', '))
  assert('browse: no page errors', !p.logs.length, p.logs.slice(0, 3).join(' | '))
} finally {
  await p.close(); stop()
}
done('browse ok')
