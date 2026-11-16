/** E6 (phone polish: long-press menu, snap cue, detents, keyboard, share sheet) (scripts/editor-browser.ts). */
import { join } from 'node:path'
import { sleep, type Page } from '../lib/cdp'
import { e3Open, E3 } from './e3'
import { linkRe } from './e5'
import { base, check, mid, near, out, type Helpers } from './shared'

// ── E6: phone polish ─────────────────────────────────────────────────────────────────────────────
/**
 * Installed before every page load: `navigator.share` as `window.__shareMode` says (unset: no share sheet,
 * so the older checks copy as before), and a `visualViewport` whose height drops by `window.__kb` (a stand-in
 * for the on-screen keyboard CDP cannot open), with `__setKb(px)` to raise its resize event.
 */
export const E6_STUBS = `(() => {
  Object.defineProperty(Navigator.prototype, 'share', { configurable: true, get() {
    const m = window.__shareMode
    if (!m) return undefined
    return d => { (window.__shared = window.__shared || []).push({ url: d.url, title: d.title }); return m === 'resolve' ? Promise.resolve() : m === 'hang' ? new Promise(() => {}) : Promise.reject(new DOMException(m, m === 'abort' ? 'AbortError' : 'NotAllowedError')) }
  } })
  const real = window.visualViewport
  if (!real) return
  const t = new EventTarget()
  const fake = {
    get height() { return real.height - (window.__kb || 0) }, get width() { return real.width }, get offsetTop() { return real.offsetTop }, get offsetLeft() { return real.offsetLeft },
    get pageTop() { return real.pageTop }, get pageLeft() { return real.pageLeft }, get scale() { return real.scale },
    addEventListener: (...a) => { t.addEventListener(...a); real.addEventListener(...a) }, removeEventListener: (...a) => { t.removeEventListener(...a); real.removeEventListener(...a) }, dispatchEvent: e => t.dispatchEvent(e),
  }
  Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => fake })
  window.__setKb = px => { window.__kb = px; t.dispatchEvent(new Event('resize')) }
})()`
/** A finger held still at x, y for `ms`, then lifted. */
export const holdAt = async (p: Page, x: number, y: number, ms = 800) => {
  await p.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0, radiusX: 2, radiusY: 2, force: 1 }] })
  await sleep(ms)
  await p.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300)
}
export const MENU = '.ed-cmenu'
/** Accent-red pixels on the pasteboard canvas (dark_signal: #FF3B30). */
const accentPx = (p: Page) => p.js<number>(`(() => { const c = document.querySelector('.ed-paste'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] > 150 && d[i + 1] < 110 && d[i + 2] < 110) n++; return n })()`)

export async function phoneE6(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
  console.log('  · E6')
  const H = 844
  const menuOpen = () => p.js<boolean>(`!!document.querySelector(${JSON.stringify(MENU)})`)
  const order = () => h.frameIds()
  const item = (id: string) => `${MENU} [data-menu="${id}"]`
  const fitAll = async () => { await tapEl('.ed-zoom-pct'); await p.js(`[...document.querySelectorAll('.ed-menu button')].find(b => b.textContent.startsWith('Zoom to fit')).click()`); await sleep(400) }
  const ok = await h.fresh(`${base}?make`)
  if (!ok) { check('phone E6: the editor opens', false); return }
  await sleep(800); await fitAll()

  // ── the long-press menu on a frame
  const ids0 = await order(), [f0] = ids0, a = (await h.frameRect(f0))!, [ax, ay] = mid(a)
  await holdAt(p, ax, ay)
  const m = await h.rect(MENU), items = await p.js<{ id: string; h: number; off: boolean }[]>(`[...document.querySelectorAll('${MENU} [data-menu]')].map(b => ({ id: b.dataset.menu, h: b.getBoundingClientRect().height, off: b.disabled }))`)
  const under = !!m && ax >= m.x && ax <= m.r && ay >= m.y && ay <= m.b
  check('phone E6: a long press on a frame selects it and opens its menu (not under the finger), six items ≥ 44 px, uncovered', await h.sel() === f0 && !!m && !under && items.length === 6 && items.every(i => i.h >= 44) && await h.uncovered(`${MENU} [data-menu]:not(:disabled)`), JSON.stringify({ m, items: items.map(i => i.id + (i.off ? '-' : '')) }))
  check('phone E6: the bottom frame offers FORWARD and TO FRONT, not BACKWARD or TO BACK', items.find(i => i.id === 'forward')?.off === false && items.find(i => i.id === 'front')?.off === false && items.find(i => i.id === 'backward')?.off === true && items.find(i => i.id === 'back')?.off === true)
  await p.shot(join(out, 'phone-06-menu.png'))
  await tapEl(item('forward'))
  const fwd = await order()
  check('phone E6: FORWARD moves the frame one up the canvas stack and closes the menu', fwd[1] === f0 && fwd[0] === ids0[1] && !(await menuOpen()), fwd.join())
  await tapEl('.ed-top [aria-label="Undo"]')
  check('phone E6: one undo step puts it back', (await order()).join() === ids0.join())
  await holdAt(p, ax, ay); await tapEl(item('front'))
  const fr = await order()
  await holdAt(p, ax, ay); await tapEl(item('back'))
  check('phone E6: TO FRONT, then TO BACK', fr.at(-1) === f0 && (await order())[0] === f0, `${fr.join()} | ${(await order()).join()}`)
  await holdAt(p, ax, ay); await tapEl(item('duplicate'))
  const dup = await order(), copy = dup.find(id => !ids0.includes(id))
  check('phone E6: DUPLICATE adds a copy, selected', dup.length === ids0.length + 1 && !!copy && await h.sel() === copy)
  const c = (await h.frameRect(copy!))!
  await holdAt(p, ...mid(c)); await tapEl(item('delete'))
  check('phone E6: DELETE removes it', (await order()).length === ids0.length && !(await order()).includes(copy!))

  // nothing opens for a finger that moves, or for two fingers; a tap outside closes the menu (and only that)
  await p.tap(ax, ay); await sleep(300)
  const sel0 = await h.sel()
  await p.touch(Array.from({ length: 30 }, (_, i) => [[ax + i * 2, ay]])); await sleep(500)
  const movedOpen = await menuOpen()
  await tapEl('.ed-top [aria-label="Undo"]')
  await p.touch(Array.from({ length: 40 }, () => [[ax - 20, ay], [ax + 20, ay + 20]])); await sleep(400)
  check('phone E6: a finger that moves (it drags) or two fingers held still open no menu', !movedOpen && !(await menuOpen()))
  await holdAt(p, ax, ay)
  const opened = await menuOpen(), mr = (await h.rect(MENU))!
  // canvas beside the menu (a press there only closes it, even on a frame)
  await p.tap(mr.x > 195 ? 12 : 378, mr.y + mr.h / 2); await sleep(350)
  const sel1 = await h.sel()
  check('phone E6: a tap outside the menu closes it and changes nothing else', opened && !(await menuOpen()) && sel1 === sel0, JSON.stringify({ opened, still: await menuOpen(), sel0, sel1, mr }))

  // ── the snap cue: a drag that reaches a guide lights accent dots on the pasteboard for a moment
  await fitAll()
  const [g0, f1] = await order(), b = (await h.frameRect(f1))!, [bx, by] = mid(b), g = (await h.frameRect(g0))!
  await p.tap(bx, by); await sleep(300)
  const picked = await h.sel(), dy = g.y - b.y // the drag ends with f1's top 1 px off f0's: within reach of that guide
  const pt = (x: number, y: number) => [{ x, y, id: 0, radiusX: 2, radiusY: 2, force: 1 }]
  const cues0 = await p.js<number>(`window.__editor?.cues ?? 0`), px0 = await accentPx(p)
  await p.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(bx, by) })
  for (let i = 1; i <= 8; i++) { await sleep(20); await p.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(bx, by + i * 6) }) }
  await sleep(500)
  const away = await accentPx(p)
  for (let i = 1; i <= 8; i++) { await sleep(20); await p.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(bx, by + 48 + (dy + 1 - 48) * i / 8) }) }
  // the cue lasts 420 ms: look for its dots a few times while it shows (a busy frame can draw it late)
  let lit = 0
  for (let i = 0; i < 8 && !lit; i++) { await sleep(40); lit = await accentPx(p) }
  const cues1 = await p.js<number>(`window.__editor?.cues ?? 0`), guides = await p.js<number>(`document.querySelectorAll('.ed-guide').length`)
  await sleep(900)
  const after = await accentPx(p)
  await p.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(300)
  const moved = Math.abs((await h.frameRect(f1))!.y - b.y) > .5
  if (moved) await tapEl('.ed-top [aria-label="Undo"]')
  check('phone E6: a drag that snaps to a guide lights accent dots on the pasteboard, which go again (no accent dots before or after)', picked === f1 && px0 === 0 && away === 0 && cues1 > cues0 && guides > 0 && lit > 10 && after === 0, JSON.stringify({ picked: picked === f1, dy, px0, away, lit, after, cues: cues1 - cues0, guides }))

  // ── detent memory: LAYERS left at 90 % opens at 90 % again, after a reload too; the inspector keeps its own
  const detent = () => p.js<string | null>(`document.querySelector('.ed-sheet')?.dataset.detent ?? null`)
  // the earlier passes left the inspector at 36 %: start from nothing remembered (storage, and the session by a reload)
  await p.js(`localStorage.removeItem('dot480.editor.sheet')`); await p.cdp('Page.reload'); await p.waitFor(`!!document.querySelector('.ed-dock')`, 30000); await sleep(800)
  await tapEl('.ed-dock .ed-tool[aria-label="Layers"]')
  const d0 = await detent()
  await tapEl('.ed-sheet-grab'); await sleep(300)
  const d1 = await detent()
  await tapEl('.ed-sheet-head [aria-label="Close"]')
  await tapEl('.ed-dock .ed-tool[aria-label="Layers"]')
  const d2 = await detent()
  await tapEl('.ed-sheet-head [aria-label="Close"]')
  await tapEl('.ed-dock .ed-tool[aria-label^="Inspector"]')
  const di = await detent()
  await tapEl('.ed-sheet-head [aria-label="Close"]')
  await sleep(600); await p.cdp('Page.reload'); await p.waitFor(`!!document.querySelector('.ed-dock')`, 30000); await sleep(800)
  await tapEl('.ed-dock .ed-tool[aria-label="Layers"]')
  const d3 = await detent(), stored = await p.js<string | null>(`localStorage.getItem('dot480.editor.sheet')`)
  await tapEl('.ed-sheet-head [aria-label="Close"]')
  check('phone E6: the sheet opens where it was left for that panel (LAYERS 60 % → 90 %, again 90 %, after a reload too); the inspector keeps its own', d0 === '1' && d1 === '2' && d2 === '2' && di === '1' && d3 === '2' && /"layers":2/.test(stored ?? ''), JSON.stringify({ d0, d1, d2, di, d3, stored }))

  // ── the keyboard: the CODE sheet sits on it, its tabs and the code stay visible
  const kbClosed = () => p.js<boolean>(`!document.querySelector('.ed-root.has-kb')`)
  await h.go(`${base}?make=code`, `!!document.querySelector('.ed-sheet .dw-code textarea')`)
  await p.js(`document.querySelector('.ed-sheet .dw-code textarea').focus()`); await sleep(200)
  await p.js(`window.__setKb(330)`); await sleep(700)
  const vis = H - 330, sh = (await h.rect('.ed-sheet'))!, ta = (await h.rect('.ed-sheet .dw-code textarea'))!, top = (await h.rect('.ed-top'))!
  check('phone E6: keyboard open: the CODE sheet sits on it (bottom at the keyboard), its tabs, the top bar and the code stay visible', await p.js(`!!document.querySelector('.ed-root.has-kb')`) && near(sh.b, vis, 2) && sh.y >= top.b - 1 && await h.uncovered('.ed-sheet .ed-tabs--sheet [role=tab]') && await h.uncovered('.ed-top button') && ta.y < vis - 20 && ta.b > sh.y + 20, JSON.stringify({ sh, ta, vis }))
  await p.shot(join(out, 'phone-07-keyboard-code.png'))
  await p.js(`window.__setKb(0)`); await sleep(600)
  check('phone E6: keyboard closed: the sheet is back on the bottom edge', await kbClosed() && near((await h.rect('.ed-sheet'))!.b, H, 2))
  await h.blur(); await tapEl('.ed-sheet-head [aria-label="Close"]')

  // ── the keyboard: the caret of text typed in place stays above it
  const e = await e3Open(p, h, tapEl)
  await p.tap(...(await e.at(8, 71))); await sleep(400)
  await p.tap(...(await e.at(8, 71))); await sleep(500)
  const typing = await p.js<boolean>(`document.activeElement?.matches('.ed-intext.on') ?? false`)
  await p.js(`window.__setKb(340)`); await sleep(900)
  const caret = await h.rect('.ed-caret, .ed-textsel'), tb = (await h.rect('.ed-top'))!
  check('phone E6: keyboard open while typing on the canvas: the caret (or the selected text) stays between the top bar and the keyboard', typing && !!caret && caret.y >= tb.b - 1 && caret.b <= H - 340 + 1, JSON.stringify({ typing, caret }))
  await p.shot(join(out, 'phone-08-keyboard-text.png'))
  await p.key('Escape', 'Escape', 27); await sleep(300)
  await p.js(`window.__setKb(0)`); await sleep(400)

  // ── the layer menu: the quick bar comes inside it; TO BACK moves the layer to the bottom of its frame
  // (the text the typing left selected: a long press on it opens the menu, never typing; the ring has handles under its dots)
  await tapEl('.ed-zoom-pct'); await p.js(`[...document.querySelectorAll('.ed-menu button')].find(b => b.textContent.startsWith('Zoom to fit')).click()`); await sleep(500)
  const textSel = await p.js<string | undefined>(`window.__editor?.layer`) === E3.text, tone0 = (await e.saved<{ tone: string }>(E3.text)).tone
  await holdAt(p, ...(await e.at(8, 71)))
  const inMenuBar = await p.js<boolean>(`!!document.querySelector('${MENU} .ed-qbar [data-q="tone"]') && !document.querySelector('.ed-overlay > .ed-qbar')`), noTyping = !(await p.js<boolean>(`document.activeElement?.matches('.ed-intext.on') ?? false`))
  if (inMenuBar) await tapEl(`${MENU} .ed-qbar [data-q="tone"]`)
  const toned = (await e.saved<{ tone: string }>(E3.text)).tone, still = await menuOpen()
  if (still) await tapEl(item('back'))
  const ls = await e.layers() as unknown as { id: string; z: number }[], lowZ = Math.min(...ls.map(l => l.z))
  check('phone E6: a long press on a layer: its menu holds the quick bar (TONE steps, the menu stays); TO BACK puts the layer at the bottom', textSel && inMenuBar && noTyping && toned !== tone0 && still && ls.find(l => l.id === E3.text)?.z === lowZ, JSON.stringify({ textSel, inMenuBar, noTyping, tone0, toned, still, z: ls.map(l => `${l.id}:${l.z}`) }))
  await p.shot(join(out, 'phone-09-layer-menu.png'))

  // ── SHARE through the share sheet (stubbed): shared, cancelled, refused, hung
  const shareOnce = async (mode: string | null) => {
    await p.js(`window.__shareMode = ${JSON.stringify(mode)}; window.__shared = []; window.__editorShared = undefined; window.__editorLink = ''`)
    await tapEl('.ed-top [aria-label="Share or export"]'); await p.waitFor('window.__editorShared !== undefined', 8000); await sleep(200) // the outcome, then the note it set
    return { out: await p.js<string | undefined>(`window.__editorShared`), shared: await p.js<{ url: string; title: string }[]>(`window.__shared ?? []`), note: await h.text('.ed-note'), sheet: await p.js<boolean>(`!!document.querySelector('.ed-sheet')`) }
  }
  const closeSheet = async () => { if (await p.js(`!!document.querySelector('.ed-sheet')`)) await tapEl('.ed-sheet-head [aria-label="Close"]') }
  const logs0 = p.logs.length
  const s1 = await shareOnce('resolve')
  check('phone E6: SHARE with a share sheet hands it the frame link (shared, said so; no sheet opens)', s1.out === 'shared' && s1.shared.length === 1 && linkRe.test(s1.shared[0].url) && /matrix/i.test(s1.shared[0].title) && /shared/i.test(s1.note) && !s1.sheet, JSON.stringify(s1))
  const s2 = await shareOnce('abort')
  check('phone E6: a cancelled share is no error: nothing said, no sheet, nothing logged', s2.out === 'cancelled' && s2.shared.length === 1 && !/no link|error|fail/i.test(s2.note) && !s2.sheet && p.logs.length === logs0, JSON.stringify(s2))
  const s3 = await shareOnce('refuse')
  check('phone E6: a refused share falls back: copied, or EXPORT · LINK opens with the link', (s3.out === 'copied' && /copied/i.test(s3.note)) || (s3.out === 'manual' && s3.sheet && await h.tab('.ed-sheet') === 'EXPORT'), JSON.stringify(s3))
  await closeSheet()
  await p.js(`window.__shareMode = 'hang'; window.__shared = []; window.__editorShared = undefined`)
  await tapEl('.ed-top [aria-label="Share or export"]'); await sleep(600)
  const pending = await p.js<string | undefined>(`window.__editorShared`)
  await tapEl('.ed-top [aria-label="Share or export"]'); await sleep(2200)
  const next = await p.js<string | undefined>(`window.__editorShared`), asked = await p.js<number>(`window.__shared.length`)
  check('phone E6: a share sheet that never answers does not block the next SHARE (it copies, or shows the link)', pending === undefined && (next === 'copied' || next === 'manual') && asked === 1, JSON.stringify({ pending, next, asked }))
  await closeSheet()
  const s5 = await shareOnce(null)
  check('phone E6: no share sheet (feature-detected): the clipboard, or EXPORT · LINK, as before', s5.out === 'copied' || (s5.out === 'manual' && s5.sheet), JSON.stringify(s5))
  await closeSheet()
  await p.js(`window.__shareMode = undefined`)
}
