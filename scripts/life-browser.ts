/**
 * Browser probe for the pond board (docs/living-matter/L-pond.md L1.9 / L1.10), headless Chrome over CDP:
 *  - desktop 1280: `/pond/?probe=1` paints `pond-koi`; hovering it forks the live world, a click drops pellets, 7 s
 *    idle heals back to pristine; Chrome's pristine state hash at step 1440 = Node's (scripts/life.ts --snapshot);
 *    the card's frame (layers + sample) at 4× CPU throttle ≤ 16 ms;
 *  - touch 375 × 812: a vertical swipe that starts on the card scrolls the page ≥ 150 px and the world stays
 *    pristine; a tap drops pellets; a 300 ms hold engages the card (lure) and the page does not scroll while engaged;
 *  - L2: each ecosystem card (jelly, slime, fireflies, murmur, terrarium) paints, a click forks its live world, and
 *    its frame at 4× CPU throttle is ≤ 16 ms (`__pondBoard`, src/widgets/boards/pond/index.ts);
 *  - screenshots (dark and light_signal) into `<out>` (default .snapshots/l1).
 * Needs dist/: `npx vite build`, then `npx tsx scripts/life-browser.ts [outDir]` (it runs `vite preview` itself).
 * Never hangs: every CDP call has a timeout (scripts/lib/cdp.ts), the pages and the preview server close in `finally`,
 * and a watchdog (`LIFE_BROWSER_TIMEOUT_S`, default 480 s) kills Chrome and the server and fails the run.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'
import { lifeSnapshot } from './life'

const out = process.argv[2] ?? join('.snapshots', 'l1')
mkdirSync(out, { recursive: true })
if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const server = await serveDist(Number(process.env.PREVIEW_PORT) || 4321)
const pages = new Set<Page>()
const open = async (w: number, h: number) => { const p = await launch(w, h); pages.add(p); return p }
const closeAll = async () => { for (const p of pages) await p.close().catch(() => {}); pages.clear(); server.stop() }
const limit = (Number(process.env.LIFE_BROWSER_TIMEOUT_S) || 480) * 1000
const watchdog = setTimeout(() => {
  console.log(`✗ life-browser: the probe ran over ${limit / 1000} s (a step never finished); killing Chrome and the preview server`)
  void closeAll().finally(() => process.exit(1))
}, limit)
const card = `document.querySelector('[data-card-id="pond-koi"]')`
const rectOf = `(() => { const r = ${card}.querySelector('canvas,svg').getBoundingClientRect(); return [r.x, r.y, r.width, r.height] })()`
try {
  // ── desktop ──
  {
    const page = await open(1280, 900)
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__POND_PROBE__ = true' })
    await page.cdp('Page.navigate', { url: `${server.url}pond/?probe=1` })
    const ready = await page.waitFor(`!!globalThis.__pond && !!${card}?.querySelector('canvas,svg')`, 20000)
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
    await page.cdp('Emulation.setCPUThrottlingRate', { rate: 4 })
    // bounded: a starved box at 4× throttle must fail this check, not hang the run
    const ms = await page.js<number>('__pond.bench(24)', 90_000).catch((e: Error) => { console.log(`  bench: ${e.message}`); return Infinity })
    await page.cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
    check('life-browser: pond-koi median card draw ≤ 16 ms at 4× throttle', ms <= 16, `${ms.toFixed(2)} ms`)
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
      const bms = await page.js<number>(`__pondBoard.bench('${id}', 16)`, 90_000).catch((e: Error) => { console.log(`  bench: ${e.message}`); return Infinity })
      await page.cdp('Emulation.setCPUThrottlingRate', { rate: 1 })
      check(`life-browser: ${id} median card draw ≤ 16 ms at 4× throttle`, bms <= 16, `${bms.toFixed(2)} ms`)
    }
    await page.shot(join(out, 'pond-desktop-l2.png'))
    await page.cdp('Page.navigate', { url: `${server.url}pond/?theme=light_signal` })
    await page.waitFor(`!!${card}?.querySelector('canvas,svg')`, 20000)
    await page.js(`${card}.scrollIntoView({ block: 'center' })`); await sleep(1500)
    await page.shot(join(out, 'pond-light.png'))
    check('life-browser: no uncaught errors (desktop)', !page.logs.filter(l => !/main thread/.test(l)).length, page.logs.join('; '))
    await page.close(); pages.delete(page)
  }
  // ── touch ──
  {
    const page = await open(375, 812)
    await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__POND_PROBE__ = true' })
    await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true })
    await page.cdp('Page.navigate', { url: `${server.url}pond/?probe=1` })
    check('life-browser: /pond/ paints pond-koi (touch 375)', await page.waitFor(`!!globalThis.__pond && !!${card}?.querySelector('canvas,svg')`, 20000), page.logs.join('; '))
    await page.js(`${card}.scrollIntoView({ block: 'start' }); window.scrollBy(0, -40)`); await sleep(800)
    await page.shot(join(out, 'pond-touch.png'))
    let [x, y, w, h] = await page.js<number[]>(rectOf)
    const y0 = await page.js<number>('scrollY')
    // a long, steady swipe that starts on the card (headless Chrome has no fling, so the scroll is the finger's travel)
    await page.touch(Array.from({ length: 24 }, (_, i) => [[x + w * .5, y + h * (.9 - i * .06)]]))
    await sleep(600)
    const scrolled = (await page.js<number>('scrollY')) - y0, room = (await page.js<number>('document.documentElement.scrollHeight - innerHeight')) - y0
    // the pond board is one card: the page may have less than 150 px left to scroll, so the swipe must use what there is
    check('life-browser: a vertical swipe on the card scrolls ≥ 150 px (or to the end of the page) and the world stays pristine', scrolled >= Math.min(150, room - 2) && (await page.js('__pond.mode()')) === 'pristine', `${scrolled.toFixed(0)} px of ${room.toFixed(0)} px room, ${await page.js('__pond.mode()')}`)
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
} catch (e) {
  check('life-browser: the probe ran to the end', false, (e as Error).message)
} finally { clearTimeout(watchdog); await closeAll() }
if (failures) { console.log(`\n${failures} probe check(s) failed`); process.exit(1) }
