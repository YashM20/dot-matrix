/**
 * Card input edge cases in headless Chrome (docs/STATE-MACHINES.md B4), on the components board's first range control:
 *  - a plain mouse drag moves it, and a mouse moving with no button down afterwards does not;
 *  - B4-1: the window loses focus mid drag (another tab comes to the front) and the button comes up outside the page,
 *    so the page never sees the release. When the mouse comes back with no button down, the control must not follow it.
 * PNGs in `.snapshots/input/`.
 *
 *   npx vite build && npx vite preview --port 4173 & npx tsx scripts/input-browser.ts http://localhost:4173/
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, sleep } from './lib/cdp'
import { checker } from './lib/check'

if (!findChrome()) { console.log('no Chrome found (set $CHROME)'); process.exit(0) }
const base = process.argv[2] ?? 'http://localhost:4173/'
const OUT = join(import.meta.dirname, '../.snapshots/input')
mkdirSync(OUT, { recursive: true })
const { assert, done } = checker('input browser')
const p = await launch(1280, 900)

try {
  await p.cdp('Page.navigate', { url: new URL('components/', base.replace(/\/?$/, '/')).href })
  const found = await p.waitFor(`!!document.querySelector('.dot-card input[type=range][data-dot-focus]')`, 60000)
  assert('the components board shows a card with a range control', found)
  if (!found) throw new Error('no range control')
  await p.js(`document.querySelector('.dot-card input[type=range][data-dot-focus]').closest('.dot-card').scrollIntoView({ block: 'center' }), 1`)
  await sleep(800)
  const box = await p.js<{ x: number; y: number; w: number; h: number; key: string }>(`(() => {
    const e = document.querySelector('.dot-card input[type=range][data-dot-focus]'), r = e.getBoundingClientRect()
    window.__ctl = e; return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, key: e.getAttribute('aria-label') } })()`)
  const value = () => p.js<number>(`+window.__ctl.getAttribute('aria-valuenow')`)
  /** A mouse move with no button down: what Chrome sees when the button came up somewhere else. */
  const hover = (x: number, y: number) => p.cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 })
  const d = Math.max(12, Math.min(box.w, box.h) * .35), path = (k: number) => [box.x + d * k, box.y - d * k] as const

  // a plain drag, then a hover: the control follows only while the button is down
  const v0 = await value()
  await hover(box.x, box.y); await p.mouse('mousePressed', box.x, box.y)
  for (let k = 1; k <= 6; k++) { await p.mouse('mouseMoved', ...path(k / 6)); await sleep(30) }
  await p.mouse('mouseReleased', ...path(1)); await sleep(200)
  const v1 = await value()
  for (let k = 1; k <= 6; k++) { await hover(...path(1 - k / 6)); await sleep(30) }
  await sleep(200)
  const v2 = await value()
  assert('a mouse drag on a card control moves it', v1 !== v0, `${box.key}: ${v0} → ${v1}`)
  assert('after the release, a mouse moving with no button down leaves it alone', v2 === v1, `${v1} → ${v2}`)

  // B4-1: press and drag, the window loses focus, the button comes up elsewhere, the mouse comes back with no button
  await hover(box.x, box.y); await p.mouse('mousePressed', box.x, box.y)
  for (let k = 1; k <= 3; k++) { await p.mouse('mouseMoved', ...path(k / 6)); await sleep(30) }
  await sleep(200)
  const v3 = await value()
  let blurred = 'none'
  try {
    const { result } = await p.cdp('Target.createTarget', { url: 'about:blank' })
    await p.cdp('Target.activateTarget', { targetId: result.targetId }); await sleep(300)
    blurred = `another tab in front, page focus ${await p.js('document.hasFocus()')}`
    await p.cdp('Page.bringToFront'); await sleep(300)
    await p.cdp('Target.closeTarget', { targetId: result.targetId })
  } catch (e) { blurred = `no second tab (${(e as Error).message}); window blur event only`; await p.js(`window.dispatchEvent(new Event('blur')), 1`) }
  for (let k = 1; k <= 6; k++) { await hover(...path(.5 - k / 6)); await sleep(30) }
  await sleep(250)
  const v4 = await value()
  await p.shot(join(OUT, 'after-blur.png'))
  assert('B4-1: a drag whose release happened outside the page (window blurred mid drag) lets go: the control does not follow a mouse with no button down',
    v4 === v3, `${blurred}; ${v3} → ${v4}`)
  await p.mouse('mouseReleased', ...path(0)) // tidy up either way
  assert('no console errors or exceptions', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
} finally { await p.close() }
done('All input browser checks passed')
