/**
 * The materials board's touch policy in headless Chrome (docs/living-matter/M-materials.md §2.4, M1.12), against
 * `vite preview` of `dist/` on port 4391 (build first). Scroll first (docs/UX-PLAN.md §10):
 *  - touch 375×812, `mat-knob`: a vertical swipe starting on the card scrolls ≥ 150 px and leaves v alone; a tap on
 *    the value arc sets v to that angle; a 300 ms hold engages the card and a drag then turns it without scrolling
 *    the page; a horizontal drag is claimed at once;
 *  - touch 375×812, `mat-lens` (M2.9): the same four (a tap moves the lens there; a hold then a drag in any direction
 *    moves it; a horizontal drag is claimed at once);
 *  - touch, every material card: a vertical swipe never changes its data (the a11y controls' values);
 *  - desktop 1280: hovering the knob moves the light (the card's pixels change) without changing v; press-drag turns it.
 *  - touch 375×812, `/workshop/?probe=1` (M3.12): `mat-sand`, `mat-mercury`, `mat-thread`: a vertical swipe scrolls
 *    ≥ 150 px with the world pristine; a tap acts (a stone, a bead, a flick); a 300 ms hold engages and a drag then
 *    carves, stirs or pulls without the page scrolling; a horizontal drag is claimed at once. Every other workshop
 *    card: a vertical swipe never changes data.
 *  - the same page (XM, docs/living-matter/X-advanced.md #10, #11): the Lichtenberg plate's and the erosion stone's
 *    pristine runs hash the same in Chrome as in Node (two figures, the stone at 09:41 and 23:59, two flakes); a tap on the plate
 *    grounds it (a live figure); a vertical swipe on it leaves it pristine.
 * Skips with a notice when no Chrome is found; exits non-zero on any ✗. Closes Chrome and the preview server.
 *   npx tsx scripts/materials-browser.ts
 */
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'
import { figureHash } from '../src/widgets/boards/workshop-plate'
import { stoneHash } from '../src/widgets/boards/workshop-stone'
import { flakeHash } from '../src/widgets/boards/workshop-frost'

const PORT = 4391, W = 375, H = 812
/** The knob's geometry in card cells (src/widgets/boards/materials.ts: KNOB_CARD, KNOB_ARC). */
const KNOB = { x: (48 + .5) * 1.5 - .5, y: (50 + .5) * 1.5 - .5, r: 56, start: 225 * Math.PI / 180, sweep: 270 * Math.PI / 180 }
if (!findChrome()) { console.log('materials-browser: no Chrome found (set $CHROME): skipped'); process.exit(0) }

let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} materials-browser: ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const server = await serveDist(PORT)
let page: Page | null = null

const card = (id: string) => `document.querySelector('[data-card-id="${id}"]')`
/** Client point of card cell (cx, cy) on the card's dot surface. */
async function at(p: Page, id: string, cx: number, cy: number): Promise<[number, number]> {
  return p.js<[number, number]>(`(() => { const s = ${card(id)}.querySelector('canvas, svg').getBoundingClientRect(); return [s.left + (${cx} + .5) / 144 * s.width, s.top + (${cy} + .5) / 144 * s.height] })()`)
}
const arcPoint = (v: number): [number, number] => { const a = KNOB.start + v * KNOB.sweep; return [KNOB.x + KNOB.r * Math.sin(a), KNOB.y - KNOB.r * Math.cos(a)] }
const knobV = (p: Page) => p.js<number>(`+${card('mat-knob')}.querySelector('input[aria-label="Volume"]').getAttribute('aria-valuenow')`)
/** Every material card's control values (a11y inputs and switches), as one string. */
const dataOf = (p: Page) => p.js<string>(`[...document.querySelectorAll('[data-card-id^="mat-"]')].map(c => c.dataset.cardId + ':' + [...c.querySelectorAll('[aria-valuenow], [aria-checked]')].map(e => e.getAttribute('aria-valuenow') ?? e.getAttribute('aria-checked')).join(',')).join('|')`)
const center = async (p: Page, id: string) => { await p.js(`${card(id)}.scrollIntoView({ block: 'center' })`); await sleep(400) }
const engagedOf = (p: Page, id: string) => p.js<boolean>(`!!document.querySelector('[data-card-id="${id}"].dot-card--engaged, [data-card-id="${id}"] .dot-card--engaged') || ${card(id)}.classList.contains('dot-card--engaged')`)
const engaged = (p: Page) => engagedOf(p, 'mat-knob')
/** The lens's centre as its data (lx 0..1 left → right, ly 0..1 bottom → top over card rows 12–143). */
const lensXY = (p: Page) => p.js<[number, number]>(`['X', 'Y'].map(a => +${card('mat-lens')}.querySelector('input[aria-label="Move the lens ' + a + '"]').getAttribute('aria-valuenow'))`)
const lensData = (cx: number, cy: number): [number, number] => [cx / 144, (144 - cy) / 132]
const ready = `!!document.querySelector('[data-card-id="mat-knob"] canvas, [data-card-id="mat-knob"] svg') && !!document.querySelector('[data-card-id="mat-knob"] input[aria-label="Volume"]')`
const touchPt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 2, radiusY: 2, force: 1 }]

try {
  // ── touch ───────────────────────────────────────────────────────────────────────────────────────
  page = await launch(W, H)
  const p = page
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
  await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await p.cdp('Page.navigate', { url: `${server.url}materials/` })
  check('touch: the board opens with the knob', await p.waitFor(ready, 30000))
  await sleep(1500)

  await center(p, 'mat-knob')
  {
    const v0 = await knobV(p), y0 = await p.js<number>('scrollY'), [x, y] = await at(p, 'mat-knob', KNOB.x, KNOB.y + 30)
    await p.touch(Array.from({ length: 22 }, (_, i) => [[x, y - i * 16]] as [number, number][]))
    await sleep(600)
    const y1 = await p.js<number>('scrollY'), v1 = await knobV(p)
    check('mat-knob: a vertical swipe starting on the card scrolls ≥ 150 px and the data is unchanged', y1 - y0 >= 150 && v1 === v0, `scrolled ${(y1 - y0).toFixed(0)} px, v ${v0} → ${v1}`)
  }
  await center(p, 'mat-knob')
  {
    const [x, y] = await at(p, 'mat-knob', ...arcPoint(.25))
    await p.tap(x, y); await sleep(700)
    const v = await knobV(p)
    check('mat-knob: a tap on the arc sets v to its angle', Math.abs(v - .25) <= .03, `v ${v}`)
  }
  {
    const [x0, y0] = await at(p, 'mat-knob', ...arcPoint(.25)), s0 = await p.js<number>('scrollY')
    await p.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPt(x0, y0) })
    await sleep(450)
    const on = await engaged(p)
    for (let i = 1; i <= 20; i++) { const [cx, cy] = arcPoint(.25 + .4 * i / 20), [x, y] = await at(p, 'mat-knob', cx, cy); await p.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPt(x, y) }); await sleep(20) }
    await p.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(600)
    const v = await knobV(p), s1 = await p.js<number>('scrollY')
    check('mat-knob: a 300 ms hold engages and a drag then turns it; the page never scrolls while engaged', on && Math.abs(v - .65) <= .05 && Math.abs(s1 - s0) < 1, `engaged ${on}, v ${v}, scroll Δ ${(s1 - s0).toFixed(0)} px`)
  }
  {
    const [x0, y0] = await at(p, 'mat-knob', ...arcPoint(.5)), s0 = await p.js<number>('scrollY'), v0 = await knobV(p)
    await p.touch(Array.from({ length: 12 }, (_, i) => [[x0 + i * 4, y0]] as [number, number][]))
    await sleep(600)
    const v = await knobV(p), s1 = await p.js<number>('scrollY')
    check('mat-knob: a horizontal drag is claimed at once without a hold', v > .5 && v !== v0 && Math.abs(s1 - s0) < 1, `v ${v0} → ${v}, scroll Δ ${(s1 - s0).toFixed(0)} px`)
  }
  // ── mat-lens (M2.9) ──
  await center(p, 'mat-lens')
  {
    const d0 = await lensXY(p), y0 = await p.js<number>('scrollY'), [x, y] = await at(p, 'mat-lens', 40, 120)
    await p.touch(Array.from({ length: 22 }, (_, i) => [[x, y - i * 16]] as [number, number][]))
    await sleep(600)
    const y1 = await p.js<number>('scrollY'), d1 = await lensXY(p)
    check('mat-lens: a vertical swipe starting on the card scrolls ≥ 150 px and the data is unchanged', y1 - y0 >= 150 && d1.join() === d0.join(), `scrolled ${(y1 - y0).toFixed(0)} px, lens ${d0} → ${d1}`)
  }
  await center(p, 'mat-lens')
  {
    const [x, y] = await at(p, 'mat-lens', 44, 96)
    await p.tap(x, y); await sleep(700)
    const d = await lensXY(p), want = lensData(44, 96)
    check('mat-lens: a tap moves the lens there', Math.abs(d[0] - want[0]) <= .03 && Math.abs(d[1] - want[1]) <= .03, `lens ${d.map(v => v.toFixed(3))}, want ${want.map(v => v.toFixed(3))}`)
  }
  {
    const [x0, y0] = await at(p, 'mat-lens', 44, 96), s0 = await p.js<number>('scrollY')
    await p.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPt(x0, y0) })
    await sleep(450)
    const on = await engagedOf(p, 'mat-lens')
    // straight up, the direction a scroll would take
    for (let i = 1; i <= 20; i++) { const [x, y] = await at(p, 'mat-lens', 44 + i, 96 - 2 * i); await p.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPt(x, y) }); await sleep(20) }
    await p.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(600)
    const d = await lensXY(p), s1 = await p.js<number>('scrollY'), want = lensData(64, 56)
    check('mat-lens: a 300 ms hold engages and a drag in any direction then moves it; the page never scrolls while engaged', on && Math.abs(d[0] - want[0]) <= .04 && Math.abs(d[1] - want[1]) <= .04 && Math.abs(s1 - s0) < 1, `engaged ${on}, lens ${d.map(v => v.toFixed(3))}, want ${want.map(v => v.toFixed(3))}, scroll Δ ${(s1 - s0).toFixed(0)} px`)
  }
  {
    const [x0, y0] = await at(p, 'mat-lens', 60, 80), s0 = await p.js<number>('scrollY'), d0 = await lensXY(p)
    await p.touch(Array.from({ length: 12 }, (_, i) => [[x0 + i * 4, y0]] as [number, number][]))
    await sleep(600)
    const d = await lensXY(p), s1 = await p.js<number>('scrollY')
    check('mat-lens: a horizontal drag is claimed at once without a hold', d[0] !== d0[0] && Math.abs(s1 - s0) < 1, `lx ${d0[0].toFixed(3)} → ${d[0].toFixed(3)}, scroll Δ ${(s1 - s0).toFixed(0)} px`)
  }
  {
    let same = true, detail = ''
    for (const id of ['mat-loom', 'mat-knob', 'mat-grille', 'mat-marble', 'mat-terrazzo', 'mat-lens', 'mat-pool', 'mat-window', 'mat-patch', 'mat-rust', 'mat-candle']) {
      await center(p, id)
      const d0 = await dataOf(p), [x, y] = await at(p, id, 72, 100)
      await p.touch(Array.from({ length: 14 }, (_, i) => [[x, y - i * 14]] as [number, number][]))
      await sleep(500)
      if (await dataOf(p) !== d0) { same = false; detail = id }
    }
    check('every card (touch): a vertical swipe never changes data', same, detail)
  }
  check('touch: no console errors', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
  await p.close(); page = null

  // ── workshop (M3.12): sand, mercury, thread on touch; the worlds read through `__workshop` (`?probe=1`) ──
  page = await launch(W, H)
  const q = page
  await q.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
  await q.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await q.cdp('Page.navigate', { url: `${server.url}workshop/?probe=1` })
  check('touch: /workshop/ opens with the sand', await q.waitFor(`!!globalThis.__workshop && !!${card('mat-sand')}?.querySelector('canvas, svg')`, 30000))
  await sleep(1500)
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
      await q.tap(x, y); await sleep(250)
      const did = await ws<number>(s.tapDid)
      check(`${s.id}: a tap ${s.tapName}`, did > (s.id === 'mat-thread' ? 1 : 0), `${s.tapDid} = ${did.toFixed(2)}`)
    }
    {
      const [x0, y0] = await at(q, s.id, ...s.drag(0)), s0 = await q.js<number>('scrollY'), before = await ws<number>(s.dragDid)
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
      await sleep(300)
      const after = await ws<number>(s.id === 'mat-thread' ? 'swing()' : s.dragDid), s1 = await q.js<number>('scrollY')
      check(`${s.id}: a horizontal drag is claimed at once without a hold`, after !== before && Math.abs(s1 - s0) < 1, `${before.toFixed(2)} → ${after.toFixed(2)}, scroll Δ ${(s1 - s0).toFixed(0)} px`)
    }
  }
  {
    let same = true, detail = ''
    for (const id of ['mat-knit', 'mat-denim', 'mat-paper', 'mat-wood', 'mat-leather', 'mat-ice', 'mat-erosion', 'mat-frost']) {
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
    check('mat-lichtenberg: a vertical swipe leaves the plate pristine; a tap grounds it (a live figure burns)', swiped === 'pristine' && taps >= 1, `after the swipe ${swiped}, taps ${taps}`)
  }
  check('workshop touch: no console errors', q.logs.length === 0, q.logs.slice(0, 3).join(' | '))
  await q.close(); page = null

  // ── desktop ─────────────────────────────────────────────────────────────────────────────────────
  page = await launch(1280, 900)
  const d = page
  await d.cdp('Page.navigate', { url: `${server.url}materials/` })
  check('desktop: the board opens with the knob', await d.waitFor(ready, 30000))
  await sleep(1500)
  await center(d, 'mat-knob')
  {
    const clip = await d.js<{ x: number; y: number; width: number; height: number }>(`(() => { const r = ${card('mat-knob')}.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height } })()`)
    const shot = async () => (await d.cdp('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 } })).result.data as string
    const v0 = await knobV(d), before = await shot()
    const [hx, hy] = await at(d, 'mat-knob', KNOB.x - 30, KNOB.y - 30)
    await d.mouse('mouseMoved', hx, hy, 0); await sleep(800)
    const after = await shot(), v1 = await knobV(d)
    check('desktop: hover moves the light (the card\'s lit dots change) without changing data', before !== after && v1 === v0, `v ${v0} → ${v1}`)
    const [ax, ay] = await at(d, 'mat-knob', ...arcPoint(.2)), [bx, by] = await at(d, 'mat-knob', ...arcPoint(.8))
    await d.mouse('mouseMoved', ax, ay, 0); await d.mouse('mousePressed', ax, ay)
    for (let i = 1; i <= 16; i++) { const [cx, cy] = arcPoint(.2 + .6 * i / 16), [x, y] = await at(d, 'mat-knob', cx, cy); await d.mouse('mouseMoved', x, y); await sleep(16) }
    await d.mouse('mouseReleased', bx, by); await sleep(600)
    const v2 = await knobV(d)
    check('desktop: press-drag acts (turns the knob along the arc)', Math.abs(v2 - .8) <= .05, `v ${v2}`)
  }
  check('desktop: no console errors', d.logs.length === 0, d.logs.slice(0, 3).join(' | '))
} finally {
  if (page) await page.close()
  server.stop()
}
console.log(failures ? `materials-browser: ${failures} check(s) failed` : 'materials-browser: all checks passed')
process.exit(failures ? 1 : 0)
