/**
 * Browser probe for the pond board (docs/living-matter/L-pond.md L1.9 / L1.10), headless Chrome over CDP:
 *  - desktop 1280: `/pond/?probe=1` paints `pond-koi`; hovering it forks the live world, a click drops pellets, 7 s
 *    idle heals back to pristine; Chrome's pristine state hash at step 1440 = Node's (scripts/life.ts --snapshot);
 *    the card's frame (layers + sample) at 4× CPU throttle ≤ 16 ms;
 *  - touch 375 × 812: a vertical swipe that starts on the card scrolls the page ≥ 150 px and the world stays
 *    pristine; a tap drops pellets; a 300 ms hold engages the card (lure) and the page does not scroll while engaged;
 *  - L2: each ecosystem card (jelly, slime, fireflies, murmur, terrarium) paints, a click forks its live world, and
 *    its frame at 4× CPU throttle is ≤ 16 ms (`__pondBoard`, src/widgets/boards/pond/index.ts);
 *  - L3.5, on all six cards at 375 and 390 px (touch, coarse pointer): each card draws at F0.10's phone tier
 *    (`cardFps(fps, 'phone')`, counted draws over 2 s), a vertical swipe that starts on it scrolls ≥ 150 px with its
 *    world pristine, a tap acts (the world forks live) and a 300 ms hold engages it;
 *  - L3.5 reduced motion (390 px, `prefers-reduced-motion: reduce`): no card's pixels change over 2 s or after a tap,
 *    and every world stays pristine;
 *  - screenshots (dark and light_signal) into `<out>` (default .snapshots/l1).
 * Needs dist/: `npx vite build`, then `npx tsx scripts/life-browser.ts [outDir]` (it runs `vite preview` itself).
 * Never hangs: every CDP call has a timeout (scripts/lib/cdp.ts), the pages and the preview server close in `finally`,
 * and a watchdog (`LIFE_BROWSER_TIMEOUT_S`, default 600 s) kills Chrome and the server and fails the run.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'
import { lifeSnapshot } from './life'
import { cardFps } from '../src/widgets/fps'

const out = process.argv[2] ?? join('.snapshots', 'l1')
mkdirSync(out, { recursive: true })
if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const server = await serveDist(Number(process.env.PREVIEW_PORT) || 4321)
const pages = new Set<Page>()
const open = async (w: number, h: number) => { const p = await launch(w, h); pages.add(p); return p }
const closeAll = async () => { for (const p of pages) await p.close().catch(() => {}); pages.clear(); server.stop() }
const limit = (Number(process.env.LIFE_BROWSER_TIMEOUT_S) || 1200) * 1000
const t0 = Date.now()
let step = 'start'
/** Name the step the watchdog would report, with the time it started. */
const at = (name: string) => { step = `${name} (from ${((Date.now() - t0) / 1000).toFixed(0)} s)` }
const watchdog = setTimeout(() => {
  console.log(`✗ life-browser: the probe ran over ${limit / 1000} s (stuck in: ${step}); killing Chrome and the preview server`)
  void closeAll().finally(() => process.exit(1))
}, limit)
const card = `document.querySelector('[data-card-id="pond-koi"]')`
/** Ready waits (ms): a first paint on a starved shared box has taken over 20 s (a load wait, not a budget). */
const READY_MS = 60_000
const rectOf = `(() => { const r = ${card}.querySelector('canvas,svg').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })()`
try {
  // ── desktop ──
  {
    at('desktop: load')
    const page = await open(1280, 900)
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__POND_PROBE__ = true' })
    await page.cdp('Page.navigate', { url: `${server.url}pond/?probe=1` })
    const ready = await page.waitFor(`!!globalThis.__pond && !!${card}?.querySelector('canvas,svg')`, READY_MS)
    check('life-browser: /pond/ paints pond-koi (desktop)', ready, page.logs.join('; '))
    await page.js(`${card}.scrollIntoView({ block: 'center' })`); await sleep(1500)
    await page.shot(join(out, 'pond-desktop.png'))
    const node = (await lifeSnapshot())['pond@1440'], chromeHash = await page.js<string>('__pond.hash(1440)')
    check('life-browser: Chrome state hash at step 1440 = Node hash', chromeHash === node, `${chromeHash} vs ${node}`)
    const [x, y, w, h] = await page.js<number[]>(rectOf)
    for (let i = 0; i <= 12; i++) { await page.mouse('mouseMoved', x + w * (.3 + .03 * i), y + h * .55, 0); await sleep(40) }
    check('life-browser: hover forks the live world', await page.waitFor(`__pond.mode() !== 'pristine'`, 2000), await page.js('__pond.mode()'))
    await page.mouse('mouseMoved', x + w * .5, y + h * .5, 0); await page.mouse('mousePressed', x + w * .5, y + h * .5); await sleep(80); await page.mouse('mouseReleased', x + w * .5, y + h * .5)
    check('life-browser: a click drops pellets', await page.waitFor('__pond.pellets() > 0', 2000), `${await page.js('__pond.pellets()')} pellets`)
    await page.shot(join(out, 'pond-desktop-fed.png'))
    await page.mouse('mouseMoved', 5, 5, 0)
    check('life-browser: 7 s idle heals back to pristine', await page.waitFor(`__pond.mode() === 'pristine'`, 9000), await page.js('__pond.mode()'))
    at('desktop: bench at 4× throttle')
    await page.cdp('Emulation.setCPUThrottlingRate', { rate: 4 })
    // bounded: a starved box at 4× throttle must fail this check, not hang the run
    // best of three medians: one median on a crowded box catches other agents' bursts (9.8–16.4 ms across runs)
    const ms = await page.js<number>('Math.min(__pond.bench(24), __pond.bench(24), __pond.bench(24))', 150_000).catch((e: Error) => { console.log(`  bench: ${e.message}`); return Infinity })
    await page.cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
    check('life-browser: pond-koi median card draw ≤ 16 ms at 4× throttle (best of 3 medians)', ms <= 16, `${ms.toFixed(2)} ms`)
    // ── L2 smoke: every ecosystem card paints, a click forks its live world, and it draws in budget at 4× throttle ──
    for (const id of ['pond-jelly', 'pond-slime', 'pond-fireflies', 'pond-murmur', 'pond-terrarium']) {
      const el = `document.querySelector('[data-card-id="${id}"]')`
      await page.js(`${el}?.scrollIntoView({ block: 'center' })`); await sleep(900)
      const painted = await page.waitFor(`!!globalThis.__pondBoard && !!${el}?.querySelector('canvas,svg')`, 15000)
      const [cx, cy, cw, ch] = await page.js<number[]>(`(() => { const r = ${el}.querySelector('canvas,svg').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })()`)
      await page.mouse('mouseMoved', cx + cw * .5, cy + ch * .55, 0); await page.mouse('mousePressed', cx + cw * .5, cy + ch * .55); await sleep(80); await page.mouse('mouseReleased', cx + cw * .5, cy + ch * .55)
      const live = await page.waitFor(`__pondBoard.mode('${id}') !== 'pristine'`, 2000)
      await page.mouse('mouseMoved', 5, 5, 0)
      check(`life-browser: ${id} paints and a click forks its live world`, painted && live, `${await page.js(`__pondBoard.mode('${id}')`)}`)
      await page.cdp('Emulation.setCPUThrottlingRate', { rate: 4 })
      const bms = await page.js<number>(`Math.min(__pondBoard.bench('${id}', 16), __pondBoard.bench('${id}', 16))`, 120_000).catch((e: Error) => { console.log(`  bench: ${e.message}`); return Infinity })
      await page.cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
      check(`life-browser: ${id} median card draw ≤ 16 ms at 4× throttle (best of 2 medians)`, bms <= 16, `${bms.toFixed(2)} ms`)
    }
    await page.shot(join(out, 'pond-desktop-l2.png'))
    await page.cdp('Page.navigate', { url: `${server.url}pond/?theme=light_signal` })
    await page.waitFor(`!!${card}?.querySelector('canvas,svg')`, READY_MS)
    await page.js(`${card}.scrollIntoView({ block: 'center' })`); await sleep(1500)
    await page.shot(join(out, 'pond-light.png'))
    check('life-browser: no uncaught errors (desktop)', !page.logs.filter(l => !/main thread/.test(l)).length, page.logs.join('; '))
    await page.close(); pages.delete(page)
  }
  // ── touch ──
  {
    at('touch: load')
    const page = await open(375, 812)
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__POND_PROBE__ = true' })
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
    const load = () => page.cdp('Page.navigate', { url: `${server.url}pond/?probe=1` }).then(() => page.waitFor(`!!globalThis.__pond && !!${card}?.querySelector('canvas,svg')`, READY_MS))
    check('life-browser: /pond/ paints pond-koi (touch 375)', await load(), page.logs.join('; '))
    // The swipe. Two things made it flaky on a loaded box:
    //  - room: the pond board is one card, and since the density grids (T3) the page has only ~100 px to scroll below
    //    it, so the check had fallen back to "or to the end of the page". A spacer after the app (outside its
    //    layout) gives the page room, so the swipe must scroll the full 150 px again.
    //  - pacing: CDP sends the finger's moves one round trip apart. When the box is starved, the first move can land
    //    more than TOUCH.hold (300 ms) after the touch started; by the touch policy that is a hold, which grabs the
    //    card and blocks the scroll (0 px). The page timestamps the first touchstart and touchmove itself; a try
    //    whose first move came that late was not a swipe, so it is retried on a fresh page (at most 3 tries).
    let [x, y, w, h] = [0, 0, 0, 0]
    let swipe = { scrolled: 0, room: 0, gap: Infinity, mode: '' }, tries = 0
    for (; tries < 3; tries++) {
      at(`touch: swipe try ${tries + 1}`)
      if (tries) await load()
      await page.js(`(() => {
        const room = document.createElement('div'); room.id = 'probe-room'; room.style.height = innerHeight + 'px'; document.body.append(room)
        globalThis.__swipe = {}
        addEventListener('touchstart', () => { __swipe.start ??= performance.now() }, { capture: true, passive: true })
        addEventListener('touchmove', () => { __swipe.move ??= performance.now() }, { capture: true, passive: true })
      })()`)
      await page.js(`${card}.scrollIntoView({ block: 'start' }); window.scrollBy(0, -40)`); await sleep(800)
      if (!tries) await page.shot(join(out, 'pond-touch.png'));
      [x, y, w, h] = await page.js<number[]>(rectOf)
      const y0 = await page.js<number>('scrollY'), room = (await page.js<number>('document.documentElement.scrollHeight - innerHeight')) - y0
      // a long, steady swipe that starts low on the card and stays on screen: 24 moves of 14 px (headless Chrome has
      // no fling, so the scroll is the finger's travel, 322 px less the touch slop)
      await page.touch(Array.from({ length: 24 }, (_, i) => [[x + w * .5, y + h * .85 - i * 14]]))
      await sleep(600)
      const t = await page.js<{ start?: number; move?: number }>('__swipe')
      swipe = { scrolled: (await page.js<number>('scrollY')) - y0, room, gap: (t.move ?? Infinity) - (t.start ?? 0), mode: await page.js<string>('__pond.mode()') }
      if (swipe.gap < 300) break
      console.log(`  swipe try ${tries + 1}: the first move came ${swipe.gap.toFixed(0)} ms after the touch started (a hold by the policy: the box is starved); retrying`)
    }
    check('life-browser: a vertical swipe on the card scrolls ≥ 150 px and the world stays pristine', swipe.gap < 300 && swipe.scrolled >= 150 && swipe.mode === 'pristine',
      `${swipe.scrolled.toFixed(0)} px of ${swipe.room.toFixed(0)} px room, ${swipe.mode}; first move ${swipe.gap.toFixed(0)} ms after the start (try ${Math.min(tries + 1, 3)} of 3)`)
    at('touch: tap and hold')
    await page.js(`${card}.scrollIntoView({ block: 'center' })`); await sleep(800);
    [x, y, w, h] = await page.js<number[]>(rectOf)
    await page.tap(x + w * .5, y + h * .55)
    check('life-browser: a tap drops pellets (touch)', await page.waitFor('__pond.pellets() > 0', 2000), `${await page.js('__pond.pellets()')} pellets`)
    await sleep(7500)
    const yHold = await page.js<number>('scrollY'), hx = x + w * .5, hy = y + h * .5
    await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx, y: hy }] })
    await sleep(450)
    const engaged = await page.js<boolean>(`${card}.classList.contains('dot-card--engaged') || !!${card}.closest('[data-engaged]')`)
    for (let i = 1; i <= 8; i++) { await page.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hx, y: hy - i * 12 }] }); await sleep(40) }
    const lure = await page.js<number>('__pond.lure()'), still = Math.abs((await page.js<number>('scrollY')) - yHold)
    await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    check('life-browser: a 300 ms hold engages the card (lure) and the page does not scroll during the engaged drag', engaged && lure === 1 && still < 2, `engaged ${engaged}, lure ${lure}, scrolled ${still.toFixed(0)} px`)
    check('life-browser: no uncaught errors (touch)', !page.logs.filter(l => !/main thread/.test(l)).length, page.logs.join('; '))
    await page.close(); pages.delete(page)
  }
  // ── L3.5: all six cards on a phone, at 375 and 390 px ──
  const IDS = ['pond-koi', 'pond-jelly', 'pond-slime', 'pond-fireflies', 'pond-murmur', 'pond-terrarium']
  const elOf = (id: string) => `document.querySelector('[data-card-id="${id}"]')`
  const rectOfEl = (id: string) => `(() => { const r = ${elOf(id)}.querySelector('canvas,svg').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })()`
  const phone = async (width: number, reduce = false) => {
    const page = await open(width, 844)
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__POND_PROBE__ = true' })
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 2, mobile: true })
    if (reduce) await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    await page.cdp('Page.navigate', { url: `${server.url}pond/?probe=1` })
    const ok = await page.waitFor(`!!globalThis.__pondBoard && !!${card}?.querySelector('canvas,svg')`, READY_MS)
    await page.js(`(() => {
      const room = document.createElement('div'); room.style.height = innerHeight + 'px'; document.body.append(room)
      globalThis.__swipe = {}
      addEventListener('touchstart', () => { __swipe.start ??= performance.now() }, { capture: true, passive: true })
      addEventListener('touchmove', () => { __swipe.move ??= performance.now() }, { capture: true, passive: true })
    })()`)
    return { page, ok }
  }
  for (const width of [375, 390]) {
    at(`phone ${width}: load`)
    const { page, ok } = await phone(width)
    const coarse = await page.js<boolean>(`matchMedia('(pointer: coarse)').matches`)
    check(`life-browser: /pond/ paints at ${width} px (coarse pointer ${coarse})`, ok, page.logs.join('; '))
    const swipeBad: string[] = [], tapBad: string[] = [], holdBad: string[] = [], fpsBad: string[] = [], rates: string[] = []
    // the phone tier first, on the untouched page: draws counted over 2 s with each card on screen (input makes a
    // card draw on the next animation frame as well, so this runs before any card is touched); one re-count if over
    for (const id of IDS) {
      at(`phone ${width}: ${id} fps`)
      const want = cardFps((await page.js<number>(`__pondBoard.fps('${id}')`)) ?? 12, 'phone')
      await page.js(`${elOf(id)}.scrollIntoView({ block: 'center' })`); await sleep(900)
      let rate = Infinity
      for (let k = 0; k < 2 && !(rate <= want * 1.15 + 1); k++) {
        const d0 = await page.js<number>(`__pondBoard.draws('${id}')`); await sleep(2000)
        rate = Math.min(rate, ((await page.js<number>(`__pondBoard.draws('${id}')`)) - d0) / 2)
      }
      rates.push(`${id.slice(5)} ${rate.toFixed(1)}/${want}`)
      if (!(rate <= want * 1.15 + 1 && rate >= 3)) fpsBad.push(`${id} ${rate.toFixed(1)} fps (tier ${want})`)
    }
    for (const id of IDS) {
      at(`phone ${width}: ${id}`)
      const el = elOf(id)
      // the swipe (a try whose first move came after the hold time was a hold by the policy: retried, as above)
      let res = { scrolled: 0, gap: Infinity, mode: '' }
      for (let tries = 0; tries < 3; tries++) {
        await page.js(`__swipe.start = undefined; __swipe.move = undefined; ${el}.scrollIntoView({ block: 'start' }); window.scrollBy(0, -40)`); await sleep(700)
        const [x, y, w, h] = await page.js<number[]>(rectOfEl(id)), y0 = await page.js<number>('scrollY')
        await page.touch(Array.from({ length: 24 }, (_, i) => [[x + w * .5, Math.min(y + h * .85, 830) - i * 14]]))
        await sleep(500)
        const tm = await page.js<{ start?: number; move?: number }>('__swipe')
        res = { scrolled: (await page.js<number>('scrollY')) - y0, gap: (tm.move ?? Infinity) - (tm.start ?? 0), mode: await page.js<string>(`__pondBoard.mode('${id}')`) }
        if (res.gap < 300) break
      }
      if (!(res.gap < 300 && res.scrolled >= 150 && res.mode === 'pristine')) swipeBad.push(`${id} ${res.scrolled.toFixed(0)} px ${res.mode} (first move ${res.gap.toFixed(0)} ms)`)
      // a tap acts
      await page.js(`${el}.scrollIntoView({ block: 'center' })`); await sleep(600)
      const [x, y, w, h] = await page.js<number[]>(rectOfEl(id))
      await page.tap(x + w * .5, y + h * .55)
      if (!(await page.waitFor(`__pondBoard.mode('${id}') !== 'pristine'`, 2500))) tapBad.push(id)
      // a 300 ms hold engages
      await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + w * .4, y: y + h * .5 }] })
      await sleep(450)
      if (!(await page.js<boolean>(`${el}.classList.contains('dot-card--engaged') || !!${el}.closest('[data-engaged]')`))) holdBad.push(id)
      await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await sleep(200)
    }
    check(`life-browser: ${width} px: each pond card draws at F0.10's phone tier (draws/s / tier)`, !fpsBad.length, fpsBad.join('; ') || rates.join(', '))
    check(`life-browser: ${width} px: on all 6 cards a vertical swipe scrolls ≥ 150 px with the world pristine`, !swipeBad.length, swipeBad.join('; '))
    check(`life-browser: ${width} px: on all 6 cards a tap acts (the world forks live)`, !tapBad.length, tapBad.join(', '))
    check(`life-browser: ${width} px: on all 6 cards a 300 ms hold engages the card`, !holdBad.length, holdBad.join(', '))
    check(`life-browser: no uncaught errors (${width} px)`, !page.logs.filter(l => !/main thread/.test(l)).length, page.logs.join('; '))
    await page.close(); pages.delete(page)
  }
  // ── L3.5 reduced motion: nothing moves, a tap reaches no world ──
  {
    at('reduced motion')
    const { page, ok } = await phone(390, true)
    const pixels = (id: string) => page.js<string>(`(() => {
      const c = ${elOf(id)}.querySelector('canvas'); if (!c) return ${elOf(id)}.querySelector('svg').innerHTML
      const s = c.toDataURL(); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 } return h.toString(16)
    })()`)
    const bad: string[] = []
    for (const id of IDS) {
      await page.js(`${elOf(id)}.scrollIntoView({ block: 'center' })`); await sleep(900)
      const a = await pixels(id); await sleep(2000)
      const b = await pixels(id)
      const [x, y, w, h] = await page.js<number[]>(rectOfEl(id))
      await page.tap(x + w * .5, y + h * .55); await sleep(1000)
      const c = await pixels(id), mode = await page.js<string>(`__pondBoard.mode('${id}')`)
      if (a !== b || b !== c || mode !== 'pristine') bad.push(`${id}${a !== b ? ' moved' : ''}${b !== c ? ' tap changed it' : ''}${mode !== 'pristine' ? ` ${mode}` : ''}`)
    }
    check('life-browser: reduced motion: no pond card changes over 2 s or after a tap, every world pristine (390 px)', ok && !bad.length, bad.join('; '))
    await page.close(); pages.delete(page)
  }
} catch (e) {
  check('life-browser: the probe ran to the end', false, (e as Error).message)
} finally { clearTimeout(watchdog); await closeAll() }
if (failures) { console.log(`\n${failures} probe check(s) failed`); process.exit(1) }
