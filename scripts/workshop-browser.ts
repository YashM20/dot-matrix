/**
 * The workshop board's touch policy in headless Chrome (docs/living-matter/M-materials.md §2.4, M3.12), against
 * `vite preview` of `dist/` on port 4391 (build first). Scroll first (docs/UX-PLAN.md §10):
 *  - touch 375×812, `/workshop/?probe=1`: a vertical swipe on each of the four cards never changes data; two frost
 *    flakes and three kintsugi breaks hash the same in Chrome as in Node; a swipe leaves the kintsugi plate pristine
 *    and a tap breaks it.
 * Skips with a notice when no Chrome is found; exits non-zero on any ✗. Closes Chrome and the preview server.
 * (It was the materials board's probe until that board was removed, #378.)
 *   npx tsx scripts/workshop-browser.ts
 */
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'
import { flakeHash } from '../src/widgets/boards/workshop-frost'
import { breakHash } from '../src/widgets/boards/workshop-kintsugi'

const PORT = 4391, W = 375, H = 812
if (!findChrome()) { console.log('workshop-browser: no Chrome found (set $CHROME): skipped'); process.exit(0) }

let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} workshop-browser: ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const server = await serveDist(PORT)
let page: Page | null = null

const card = (id: string) => `document.querySelector('[data-card-id="${id}"]')`
/** Client point of card cell (cx, cy) on the card's dot surface. */
async function at(p: Page, id: string, cx: number, cy: number): Promise<[number, number]> {
  return p.js<[number, number]>(`(() => { const s = ${card(id)}.querySelector('canvas, svg').getBoundingClientRect(); return [s.left + (${cx} + .5) / 144 * s.width, s.top + (${cy} + .5) / 144 * s.height] })()`)
}
/** Every workshop card's control values (a11y inputs and switches), as one string. */
const dataOf = (p: Page) => p.js<string>(`[...document.querySelectorAll('[data-card-id^="mat-"]')].map(c => c.dataset.cardId + ':' + [...c.querySelectorAll('[aria-valuenow], [aria-checked]')].map(e => e.getAttribute('aria-valuenow') ?? e.getAttribute('aria-checked')).join(',')).join('|')`)
/**
 * The page's pointer and scroll events, newest last (`evlog()` reads them for a failed check). A swipe ends in a fling
 * that keeps scrolling, and the card drops a finger that lands within 120 ms of a scroll (it stops the fling).
 */
const EVLOG = `(() => { if (window.__evlog) return; const l = window.__evlog = [], at = () => Math.round(performance.now()) + ' f' + window.__frames
  window.__frames = 0; const tick = () => { window.__frames++; requestAnimationFrame(tick) }; requestAnimationFrame(tick)
  const where = e => e.target?.closest?.('[data-card-id]')?.dataset.cardId ?? e.target?.nodeName
  for (const t of ['pointerdown', 'pointerup', 'pointercancel']) addEventListener(t, e => l.push(t.slice(7) + ' ' + at() + ' ' + where(e)), { capture: true })
  const what = e => e.target?.nodeName + '.' + String(e.target?.className?.baseVal ?? e.target?.className ?? '').split(' ')[0]
  for (const t of ['gotpointercapture', 'lostpointercapture', 'click']) addEventListener(t, e => l.push(t.replace('pointercapture', 'cap') + ' ' + at() + ' ' + what(e)), { capture: true })
  addEventListener('scroll', () => { window.__lastScroll = performance.now(); const e = l.at(-1); if (e?.[0] === 'scroll') e[2] = at(); else l.push(['scroll', at(), at()]) }, { capture: true, passive: true })
})()`
const evlog = (p: Page) => p.js<string>(`'now ' + Math.round(performance.now()) + ' f' + window.__frames + ': ' + (window.__evlog ?? []).slice(-10).map(e => Array.isArray(e) ? 'scroll ' + e[1] + '..' + e[2] : e).join(', ')`)
/** The card in the middle of the view, once the page has stopped scrolling (a fling from the last swipe included). */
const center = async (p: Page, id: string) => {
  await p.js(EVLOG)
  await p.js(`${card(id)}.scrollIntoView({ block: 'center' })`)
  await sleep(400)
  await p.waitFor(`performance.now() - (window.__lastScroll ?? 0) > 250`, 4000)
  await p.js(`${card(id)}.scrollIntoView({ block: 'center' })`)
  await sleep(200)
}
/** The page's frame rate over 2 s, printed: a tap or a short drag on a live card needs a few of its frames. */
const fps = async (p: Page, where: string) => console.log(`  ${where}: ${(await p.js<number>(`new Promise(done => { let n = 0; const t0 = performance.now()
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else done(n / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(f) })`)).toFixed(1)} frames/s, WebGL2 ${await p.js<boolean>(`!!document.createElement('canvas').getContext('webgl2')`) ? 'on' : 'off'}`)

try {
  // ── workshop: a swipe on every card; the frost and kintsugi runs through their probe globals (`?probe=1`) ──
  const workshop = async () => {
    page = await launch(W, H)
    const q = page
    await q.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
    await q.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await q.cdp('Page.navigate', { url: `${server.url}workshop/?probe=1` })
    check('touch: /workshop/ opens with the frost', await q.waitFor(`!!${card('mat-frost')}?.querySelector('canvas, svg')`, 30000))
    await sleep(1500)
    await center(q, 'mat-frost'); await fps(q, 'workshop (touch, the frost in view)')
    {
      let same = true, detail = ''
      for (const id of ['mat-frost', 'mat-ice', 'mat-kintsugi', 'mat-fold']) {
        await center(q, id)
        const d0 = await dataOf(q), [x, y] = await at(q, id, 72, 100)
        await q.touch(Array.from({ length: 14 }, (_, i) => [[x, y - i * 14]] as [number, number][]))
        await sleep(500)
        if (await dataOf(q) !== d0) { same = false; detail = id }
      }
      check('every workshop card (touch): a vertical swipe never changes data', same, detail)
    }
    // ── the frost window: two pristine flakes, bit for bit across engines ──
    {
      const ready = await q.waitFor('!!globalThis.__frost', 15000)
      const node = [flakeHash(2), flakeHash(9)]
      const chrome = ready ? await q.js<number[]>('[__frost.hash(2), __frost.hash(9)]') : []
      check('frost: two snowflakes hash the same in Chrome and Node (pristine runs, bit for bit)', ready && chrome.join() === node.join(), `node ${node.map(h => h.toString(16)).join(' ')}, chrome ${chrome.map(h => h.toString(16)).join(' ')}`)
    }
    // ── the kintsugi plate: pristine breaks bit for bit; the plate's tap ──
    {
      const ready = await q.waitFor('!!globalThis.__kintsugi', 15000)
      const node = [breakHash(0, 0), breakHash(0, 2), breakHash(5, 1)]
      const chrome = ready ? await q.js<number[]>('[__kintsugi.hash(0, 0), __kintsugi.hash(0, 2), __kintsugi.hash(5, 1)]') : []
      check('kintsugi: three pristine breaks hash the same in Chrome and Node (bit for bit)', ready && chrome.join() === node.join(), `node ${node.map(h => h.toString(16)).join(' ')}, chrome ${chrome.map(h => h.toString(16)).join(' ')}`)
      await center(q, 'mat-kintsugi')
      const [x, y] = await at(q, 'mat-kintsugi', 72, 30)
      await q.touch(Array.from({ length: 14 }, (_, i) => [[x, y + i * 14]] as [number, number][]))
      await sleep(500)
      const swiped = await q.js<string>('__kintsugi.mode()')
      await center(q, 'mat-kintsugi')
      const [tx, ty] = await at(q, 'mat-kintsugi', 90, 60)
      await q.tap(tx, ty); await sleep(400)
      const taps = await q.js<number>('__kintsugi.taps()')
      check('mat-kintsugi: a vertical swipe leaves the plate pristine; a tap breaks it (a live break)', swiped === 'pristine' && taps >= 1, `after the swipe ${swiped}, taps ${taps}${taps >= 1 ? '' : `; ${await evlog(q)}`}`)
    }
    check('workshop touch: no console errors', q.logs.length === 0, q.logs.slice(0, 3).join(' | '))
    await q.close(); page = null
  }
  await workshop()
} finally {
  if (page) await page.close()
  server.stop()
}
console.log(failures ? `workshop-browser: ${failures} check(s) failed` : 'workshop-browser: all checks passed')
process.exit(failures ? 1 : 0)
