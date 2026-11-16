/**
 * The workshop board's touch policy in headless Chrome (docs/living-matter/M-materials.md §2.4, M3.12), against
 * `vite preview` of `dist/` on port 4391 (build first). Scroll first (docs/UX-PLAN.md §10):
 *  - touch 375×812, `/workshop/?probe=1`: `mat-sand`, `mat-mercury`, `mat-thread`: a vertical swipe scrolls
 *    ≥ 150 px with the world pristine; a tap acts (a stone, a bead, a flick); a 300 ms hold engages and a drag then
 *    carves, stirs or pulls without the page scrolling; a horizontal drag is claimed at once. Every other workshop
 *    card: a vertical swipe never changes data.
 *  - the same page (XM, docs/living-matter/X-advanced.md #10, #11): the Lichtenberg plate's and the erosion stone's
 *    pristine runs hash the same in Chrome as in Node (two figures, the stone at 09:41 and 23:59, two flakes); a tap on the plate
 *    grounds it (a live figure); a vertical swipe on it leaves it pristine. The kintsugi plate and the mud hash the same
 *    too, and a tap breaks the plate.
 * Skips with a notice when no Chrome is found; exits non-zero on any ✗. Closes Chrome and the preview server.
 * (It was the materials board's probe until that board was removed, #378.)
 *   npx tsx scripts/workshop-browser.ts
 */
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'
import { figureHash } from '../src/widgets/boards/workshop-plate'
import { stoneHash } from '../src/widgets/boards/workshop-stone'
import { flakeHash } from '../src/widgets/boards/workshop-frost'
import { breakHash } from '../src/widgets/boards/workshop-kintsugi'
import { mudHash } from '../src/widgets/boards/workshop-mud'

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
/** Records each change of a workshop world's mode, with the frame count, for `ms` (read with `modes()`). */
const watchModes = (p: Page, id: string, ms = 1500) => p.js(`(() => { const l = window.__modes = []; let last = ''; const end = performance.now() + ${ms}
  const f = () => { const m = String(globalThis.__workshop?.mode('${id}')); if (m !== last) { l.push(m + ' f' + window.__frames); last = m } if (performance.now() < end) requestAnimationFrame(f) }; f() })()`)
const modes = (p: Page) => p.js<string>(`'modes ' + (window.__modes ?? []).join(' > ')`)
/** The card in the middle of the view, once the page has stopped scrolling (a fling from the last swipe included). */
const center = async (p: Page, id: string) => {
  await p.js(EVLOG)
  await p.js(`${card(id)}.scrollIntoView({ block: 'center' })`)
  await sleep(400)
  await p.waitFor(`performance.now() - (window.__lastScroll ?? 0) > 250`, 4000)
  await p.js(`${card(id)}.scrollIntoView({ block: 'center' })`)
  await sleep(200)
}
/**
 * Whether a held finger engaged the card, polled for up to 3 s while it stays down: on a busy runner the 300 ms hold
 * timer and the commit that marks the card run late.
 */
const engagedOf = (p: Page, id: string) => p.waitFor(`!!document.querySelector('[data-card-id="${id}"].dot-card--engaged, [data-card-id="${id}"] .dot-card--engaged')`, 3000)
/** The page's frame rate over 2 s, printed: a tap or a short drag on a live card needs a few of its frames. */
const fps = async (p: Page, where: string) => console.log(`  ${where}: ${(await p.js<number>(`new Promise(done => { let n = 0; const t0 = performance.now()
  const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else done(n / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(f) })`)).toFixed(1)} frames/s, WebGL2 ${await p.js<boolean>(`!!document.createElement('canvas').getContext('webgl2')`) ? 'on' : 'off'}`)
const touchPt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 2, radiusY: 2, force: 1 }]

try {
  // ── workshop (M3.12): sand, mercury, thread on touch; the worlds read through `__workshop` (`?probe=1`) ──
  const workshop = async () => {
    page = await launch(W, H)
    const q = page
    await q.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
    await q.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await q.cdp('Page.navigate', { url: `${server.url}workshop/?probe=1` })
    check('touch: /workshop/ opens with the sand', await q.waitFor(`!!globalThis.__workshop && !!${card('mat-sand')}?.querySelector('canvas, svg')`, 30000))
    await sleep(1500)
    await center(q, 'mat-sand'); await fps(q, 'workshop (touch, the sand in view)')
    const ws = <T,>(expr: string) => q.js<T>(`globalThis.__workshop.${expr}`)
    /** What each card's tap, hold-drag and horizontal drag should change, read from its world. */
    const SPECS: { id: string; tap: [number, number]; tapDid: string; tapName: string; drag: (i: number) => [number, number]; dragDid: string; dragName: string }[] = [
      { id: 'mat-sand', tap: [70, 96], tapDid: 'stones()', tapName: 'drops a stone', drag: i => [30 + 4 * i, 60 + 2 * i], dragDid: 'carved()', dragName: 'carves' },
      { id: 'mat-mercury', tap: [72, 120], tapDid: 'beads()', tapName: 'splits a bead', drag: i => [44 + 3 * i, 124 - 2 * i], dragDid: 'stir()', dragName: 'stirs' },
      { id: 'mat-thread', tap: [72, 118], tapDid: 'swing()', tapName: 'flicks it', drag: i => [72 + i, 128 + i], dragDid: 'paid()', dragName: 'pulls it' },
    ]
    for (const s of SPECS) {
      await center(q, s.id)
      {
        // the finger moves down (the page scrolls up: the last card has no room below it); one retry for a late first move
        const mode0 = await ws<string>(`mode('${s.id}')`)
        let scrolled = 0
        for (let attempt = 0; attempt < 2 && scrolled < 150; attempt++) {
          await center(q, s.id)
          const y0 = await q.js<number>('scrollY'), [x, y] = await at(q, s.id, 72, 30)
          await q.touch(Array.from({ length: 22 }, (_, i) => [[x, y + i * 16]] as [number, number][]))
          await sleep(600)
          scrolled = y0 - await q.js<number>('scrollY')
        }
        const mode = await ws<string>(`mode('${s.id}')`)
        check(`${s.id}: a vertical swipe starting on the card scrolls ≥ 150 px and the world stays pristine`, scrolled >= 150 && mode === 'pristine', `scrolled ${scrolled.toFixed(0)} px, ${mode0} → ${mode}`)
      }
      await center(q, s.id)
      {
        const [x, y] = await at(q, s.id, ...s.tap)
        await watchModes(q, s.id)
        await q.tap(x, y); await sleep(250)
        const did = await ws<number>(s.tapDid)
        const ok = did > (s.id === 'mat-thread' ? 1 : 0)
        check(`${s.id}: a tap ${s.tapName}`, ok, `${s.tapDid} = ${did.toFixed(2)}${ok ? '' : `; ${await evlog(q)}; ${await modes(q)}`}`)
      }
      {
        const [x0, y0] = await at(q, s.id, ...s.drag(0)), s0 = await q.js<number>('scrollY'), before = await ws<number>(s.dragDid)
        await watchModes(q, s.id, 8000)
        await q.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPt(x0, y0) })
        await sleep(450)
        const on = await engagedOf(q, s.id)
        for (let i = 1; i <= 16; i++) { const [x, y] = await at(q, s.id, ...s.drag(i)); await q.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPt(x, y) }); await sleep(30) }
        const during = await ws<number>(s.dragDid)
        await q.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400)
        const s1 = await q.js<number>('scrollY')
        check(`${s.id}: a 300 ms hold engages and a drag then ${s.dragName}; the page never scrolls while engaged`, on && during > before + (s.id === 'mat-thread' ? 2 : 1e-3) && Math.abs(s1 - s0) < 1, `engaged ${on}, ${s.dragDid} ${before.toFixed(2)} → ${during.toFixed(2)}, scroll Δ ${(s1 - s0).toFixed(0)} px`)
      }
      {
        const [x0, y0] = await at(q, s.id, 40, s.id === 'mat-thread' ? 100 : 80), s0 = await q.js<number>('scrollY'), before = await ws<number>(s.id === 'mat-thread' ? 'swing()' : s.dragDid)
        await q.touch(Array.from({ length: 14 }, (_, i) => [[x0 + i * 6, y0]] as [number, number][]))
        // the world takes the drag on its next steps: wait for it to change (a slow runner can take longer than 300 ms)
        const read = `globalThis.__workshop.${s.id === 'mat-thread' ? 'swing()' : s.dragDid}`
        await q.waitFor(`${read} !== ${before}`, 3000)
        const after = await ws<number>(s.id === 'mat-thread' ? 'swing()' : s.dragDid), s1 = await q.js<number>('scrollY')
        const ok = after !== before && Math.abs(s1 - s0) < 1
        check(`${s.id}: a horizontal drag is claimed at once without a hold`, ok, `${before.toFixed(2)} → ${after.toFixed(2)}, scroll Δ ${(s1 - s0).toFixed(0)} px${ok ? '' : `; ${await ws<string>(`state('${s.id}')`)}; since the hold ${await modes(q)}; ${await evlog(q)}`}`)
      }
    }
    {
      let same = true, detail = ''
      for (const id of ['mat-knit', 'mat-denim', 'mat-paper', 'mat-wood', 'mat-leather', 'mat-ice', 'mat-erosion', 'mat-frost', 'mat-mud']) {
        await center(q, id)
        const d0 = await dataOf(q), [x, y] = await at(q, id, 72, 100)
        await q.touch(Array.from({ length: 14 }, (_, i) => [[x, y - i * 14]] as [number, number][]))
        await sleep(500)
        if (await dataOf(q) !== d0) { same = false; detail = id }
      }
      check('every workshop card (touch): a vertical swipe never changes data', same, detail)
    }
    // ── XM: the pristine runs, bit for bit across engines; the plate's tap ──
    {
      const ready = await q.waitFor('!!globalThis.__plate && !!globalThis.__stone && !!globalThis.__frost', 15000)
      const node = [figureHash(0), figureHash(7), stoneHash(581), stoneHash(1439), flakeHash(2), flakeHash(9)]
      const chrome = ready ? await q.js<number[]>('[__plate.hash(0), __plate.hash(7), __stone.hash(581), __stone.hash(1439), __frost.hash(2), __frost.hash(9)]') : []
      check('XM: the Lichtenberg figures, the erosion stone and two snowflakes hash the same in Chrome and Node (pristine runs, bit for bit)', ready && chrome.join() === node.join(), `node ${node.map(h => h.toString(16)).join(' ')}, chrome ${chrome.map(h => h.toString(16)).join(' ')}`)
      await center(q, 'mat-lichtenberg')
      const [x, y] = await at(q, 'mat-lichtenberg', 72, 40)
      await q.touch(Array.from({ length: 14 }, (_, i) => [[x, y + i * 14]] as [number, number][]))
      await sleep(500)
      const swiped = await q.js<string>('__plate.mode()')
      await center(q, 'mat-lichtenberg')
      const [tx, ty] = await at(q, 'mat-lichtenberg', 104, 44)
      await q.tap(tx, ty); await sleep(400)
      const taps = await q.js<number>('__plate.taps()')
      check('mat-lichtenberg: a vertical swipe leaves the plate pristine; a tap grounds it (a live figure burns)', swiped === 'pristine' && taps >= 1, `after the swipe ${swiped}, taps ${taps}${taps >= 1 ? '' : `; ${await evlog(q)}`}`)
    }
    // ── the kintsugi plate and the mud: pristine breaks and cracks bit for bit; the plate's tap ──
    {
      const ready = await q.waitFor('!!globalThis.__kintsugi && !!globalThis.__mud', 15000)
      const node = [breakHash(0, 0), breakHash(0, 2), breakHash(5, 1), mudHash(0), mudHash(3)]
      const chrome = ready ? await q.js<number[]>('[__kintsugi.hash(0, 0), __kintsugi.hash(0, 2), __kintsugi.hash(5, 1), __mud.hash(0), __mud.hash(3)]') : []
      check('kintsugi: three pristine breaks and two mud slabs hash the same in Chrome and Node (bit for bit)', ready && chrome.join() === node.join(), `node ${node.map(h => h.toString(16)).join(' ')}, chrome ${chrome.map(h => h.toString(16)).join(' ')}`)
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
