/** E3 (editing on canvas) on desktop and on the phone (scripts/editor-browser.ts). */
import { join } from 'node:path'
import { addFrame, addLayer, blankCard, EDITOR_KEY, EDITOR_VERSION, encodeCells, type EditorDoc } from '../../src/components/editor/doc'
import { paintLayer, sitesLayer, textLayer, type SpecLayer } from '../../src/components/studio/doc'
import { sleep, type Page } from '../lib/cdp'
import { ALT, base, check, CTRL, mid, out, SHIFT, type Helpers } from './shared'

// ── E3: editing on canvas. One 80×80 frame (pitch 4): a paint layer (lattice 2, cells of ink .6 and 1), a
//    spec IR field placed into bounds (lattice 2), a sites ring, and a 5×7 text. Seeded through the autosave.
const TAU = Math.PI * 2
export const E3 = { ring: 'e3ring', text: 'e3text', spec: 'e3spec', paint: 'e3paint' }
function e3Doc(): string {
  const card = blankCard({ cols: 80, rows: 80, pitch: 4 }, 'e3')
  let d: EditorDoc = addFrame({ kind: 'dot480.editor', v: EDITOR_VERSION, name: 'e3', frames: [] }, card, { at: { x: 0, y: 0 } }).doc
  const fid = d.frames[0].id, paint = paintLayer(card.grid, { name: 'ink', lattice: 2 }), cells = new Uint8Array(paint.cols * paint.rows)
  for (let r = 3; r < 8; r++) for (let c = 33; c < 38; c++) cells[r * paint.cols + c] = 153
  for (let r = 9; r < 12; r++) for (let c = 33; c < 38; c++) cells[r * paint.cols + c] = 255
  const spec: SpecLayer = { id: E3.spec, name: 'box', kind: 'spec', tone: 'mid', z: 0, blend: 'normal', visible: true, spec: { kind: 'ir', src: '1', bounds: [2, 2, 8, 5], lattice: 2 } }
  for (const l of [{ ...paint, id: E3.paint, cells: encodeCells(cells) }, spec, sitesLayer({ id: E3.ring, name: 'ring', params: { shape: 'ring', cx: 40, cy: 44, r: 16, spacing: 4.5, start: 0, sweep: TAU } }), textLayer('HI', { id: E3.text, name: 'hi', params: { col: 6, row: 68 } })]) d = addLayer(d, fid, l)
  return JSON.stringify(d)
}
/** Load the E3 document, select its frame and zoom to it; returns cell → screen helpers. */
export async function e3Open(p: Page, h: Helpers, tapEl?: (s: string) => Promise<void>) {
  await p.cdp('Page.navigate', { url: `${base}?make=compose&pro=1` }); await p.waitFor(`!!document.querySelector('.ed-frame')`, 60000)
  await p.js(`localStorage.setItem(${JSON.stringify(EDITOR_KEY)}, ${JSON.stringify(e3Doc())})`); await p.cdp('Page.reload')
  const ok = await p.waitFor(`document.querySelectorAll('.ed-frame').length === 1`, 60000)
  await sleep(900)
  const fid = (await h.frameIds())[0]
  await p.js(`document.querySelector('[data-frame-label="${fid}"]').click()`); await sleep(200)
  if (tapEl) await tapEl('.ed-zoom-pct'); else await p.js(`document.querySelector('.ed-zoom-pct').click()`)
  await sleep(200)
  await p.js(`[...document.querySelectorAll('.ed-menu button')].find(b => b.textContent.startsWith('Zoom to selection')).click()`); await sleep(600)
  const k = (await h.frameRect(fid))!.w / 80
  /** Card cell → screen px, read afresh (typing on a phone pans the canvas above the keyboard). */
  const at = async (c: number, row: number) => { const r = (await h.frameRect(fid))!; return [r.x + (c + .5) * k, r.y + (row + .5) * k] as const }
  /** The layer as saved (the autosave follows every edit, undo and redo). */
  const saved = async <T = Record<string, unknown>>(id: string) => { await sleep(700); return p.js<T>(`(() => { const d = JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_KEY)})); for (const f of d.frames) for (const l of f.card.layers) if (l.id === ${JSON.stringify(id)}) return l; return null })()`) }
  const layers = async () => { await sleep(700); return p.js<{ id: string; kind: string; params?: { text: string } }[]>(`JSON.parse(localStorage.getItem(${JSON.stringify(EDITOR_KEY)})).frames[0].card.layers`) }
  return { ok, fid, k, at, saved, layers }
}
type Ring = { params: { r: number; sweep: number }; tone: string; size: number }
type Spec = { spec: { bounds?: number[]; origin?: number[]; lattice?: number } }
type Txt = { params: { text: string } }

export async function desktopE3(p: Page, h: Helpers) {
  console.log('  · E3')
  const ev = (type: string, x: number, y: number, modifiers = 0, buttons = 0, clickCount = 1) => p.cdp('Input.dispatchMouseEvent', { type, x, y, modifiers, button: 'left', buttons, clickCount })
  const click = async (x: number, y: number, mods = 0) => { await ev('mouseMoved', x, y, mods); await ev('mousePressed', x, y, mods, 1); await ev('mouseReleased', x, y, mods); await sleep(300) }
  const dbl = async (x: number, y: number) => { await ev('mouseMoved', x, y); await ev('mousePressed', x, y, 0, 1, 1); await ev('mouseReleased', x, y, 0, 0, 1); await ev('mousePressed', x, y, 0, 1, 2); await ev('mouseReleased', x, y, 0, 0, 2); await sleep(400) }
  const path = async (pts: (readonly [number, number])[], mods = 0) => {
    await ev('mouseMoved', pts[0][0], pts[0][1], mods); await ev('mousePressed', pts[0][0], pts[0][1], mods, 1)
    for (const [x, y] of pts.slice(1)) { await ev('mouseMoved', x, y, mods, 1); await sleep(16) }
    const [x, y] = pts[pts.length - 1]; await ev('mouseReleased', x, y, mods); await sleep(350)
  }
  const line = (a: readonly [number, number], b: readonly [number, number], n = 10) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n] as const)
  const key = (k: string, code: string, vk: number, mods = 0) => p.key(k, code, vk, mods).then(() => sleep(200))
  const undo = () => key('z', 'KeyZ', 90, CTRL), redo = () => key('z', 'KeyZ', 90, CTRL | SHIFT)
  const layer = () => p.js<string | undefined>(`window.__editor?.layer`)
  const q = (name: string) => `.ed-qbar [data-q="${name}"]`
  const typingIn = () => p.js<boolean>(`document.activeElement?.matches('.ed-intext.on') ?? false`)
  const e = await e3Open(p, h)
  if (!e.ok) { check('E3: the editor opens the E3 document', false); return }
  const { at, saved } = e

  // sites: select the ring by one of its dots; handles + quick bar
  await h.blur(); await click(...(await at(40, 28)))
  const handles = await p.js<string[]>(`[...document.querySelectorAll('[data-site]')].map(x => x.dataset.site)`)
  const bar = await h.rect('.ed-qbar'), vp = (await h.rect('.ed-viewport'))!
  check('E3: a click on a ring dot selects the sites layer: radius and sweep handles, and the quick bar inside the canvas', await layer() === E3.ring && handles.join() === 'r,sweep' && !!bar && bar.x >= vp.x && bar.r <= vp.r && bar.y >= vp.y && await h.uncovered('.ed-qbar button'), `${await layer()} ${handles.join()}`)
  await p.shot(join(out, 'desktop-05-e3-ring.png'))
  const rH = mid((await h.rect('[data-site="r"]'))!)
  await path(line(rH, [rH[0], rH[1] + 5 * e.k]))
  const r1 = (await saved<Ring>(E3.ring)).params.r
  await undo(); const r0 = (await saved<Ring>(E3.ring)).params.r
  await redo(); const r2 = (await saved<Ring>(E3.ring)).params.r
  await undo()
  check('E3: dragging the radius handle 5 cells out makes the radius 21 (whole cells); undo / redo step it', r1 === 21 && r0 === 16 && r2 === 21, `${r0} → ${r1} → ${r2}`)
  const litFull = await h.lit(e.fid)
  const sw = mid((await h.rect('[data-site="sweep"]'))!), c = await at(40, 44), R = sw[1] - c[1]
  await path(Array.from({ length: 11 }, (_, i) => { const a = (i / 10) * (TAU / 4) + .02; return [c[0] - R * Math.sin(a), c[1] + R * Math.cos(a)] as const }))
  const sweep = (await saved<Ring>(E3.ring)).params.sweep, n = Math.max(3, Math.round(TAU * 16 / 4.5)), litArc = await h.lit(e.fid)
  check('E3: dragging the sweep handle round to 3 o\'clock leaves a quarter arc, ending on one of the ring\'s dots', Math.abs(sweep - TAU / 4) <= TAU / n * .6 && Math.abs(Math.round(sweep / (TAU / n)) * (TAU / n) - sweep) < 1e-6 && litArc.n < litFull.n, `sweep ${sweep.toFixed(3)}; ${litFull.n} → ${litArc.n} px`)
  await undo()
  check('E3: the sweep drag is one undo step', (await saved<Ring>(E3.ring)).params.sweep === TAU)
  await p.js(`document.querySelector('${q('tone')}').click()`); const t1 = (await saved<Ring>(E3.ring)).tone
  await p.js(`document.querySelector('${q('size+')}').click()`); const s1 = (await saved<Ring>(E3.ring)).size
  await undo(); const s0 = (await saved<Ring>(E3.ring)).size
  await undo(); const t0 = (await saved<Ring>(E3.ring)).tone
  check('E3: the quick bar steps the tone and the dot size, one undo step each', t1 === 'faint' && s1 === 2.5 && s0 === 2 && t0 === 'idle', `${t0} → ${t1}; ${s0} → ${s1}`)

  // spec: its declared bounds, corner handles, a move in whole cells, the lattice toggle
  await click(...(await at(12, 9)))
  const corners = await p.js<number>(`document.querySelectorAll('.ed-sel--bounds [data-bounds]').length`)
  check('E3: a click inside a placed spec field selects it; its box is its bounds, with four corners', await layer() === E3.spec && corners === 4, `${await layer()} ${corners}`)
  const se = mid((await h.rect('.ed-sel--bounds [data-bounds="se"]'))!)
  await path(line(se, [se[0] + 4 * e.k, se[1] + 4 * e.k]))
  const b1 = (await saved<Spec>(E3.spec)).spec.bounds?.join()
  await undo(); const b0 = (await saved<Spec>(E3.spec)).spec.bounds?.join()
  check('E3: dragging a bounds corner 2 layer cells grows the field 2 cells each way; one undo puts it back', b1 === '2,2,10,7' && b0 === '2,2,8,5', `${b0} → ${b1}`)
  await path(line(await at(12, 9), await at(15, 9)))
  const o1 = (await saved<Spec>(E3.spec)).spec.origin?.join()
  await undo()
  check('E3: dragging the spec field moves it in whole card cells (its origin); one undo step', o1 === '3,0' && !(await saved<Spec>(E3.spec)).spec.origin, String(o1))
  await p.js(`document.querySelector('${q('lattice+')}').click()`)
  const lat = await saved<Spec>(E3.spec), latText = await h.text('.ed-qbar-step b')
  await undo()
  check('E3: LATTICE + puts the field on the next rung (2 → 2.5) and keeps its bounds on the card; one undo step', lat.spec.lattice === 2.5 && lat.spec.bounds?.join() === '2,2,6,4' && latText === '2.5×' && (await saved<Spec>(E3.spec)).spec.lattice === 2, `${lat.spec.lattice} ${lat.spec.bounds} ${latText}`)

  // text in place: double-click, type, Enter; Enter, End, type, Esc; a click in the text moves the caret
  const hiSig = await h.lit(e.fid)
  await dbl(...(await at(8, 71)))
  const inA = await typingIn(), allSel = await p.js<boolean>(`!!document.querySelector('.ed-textsel')`)
  await p.cdp('Input.insertText', { text: 'yo' }); await sleep(300)
  const yoSig = await h.lit(e.fid), live = await h.text('.ed-insp [data-focus="text"]') || await p.js<string>(`document.querySelector('.ed-insp [data-focus="text"]')?.value ?? ''`)
  await key('Enter', 'Enter', 13)
  const yo = (await saved<Txt>(E3.text)).params.text, doneTyping = !(await typingIn()) && !(await p.js(`!!document.querySelector('.ed-caret, .ed-textsel')`))
  await undo()
  const hiBack = (await saved<Txt>(E3.text)).params.text
  check('E3: a double-click types into the text on the canvas (all selected); it redraws as dots, Enter commits, one undo step', inA && allSel && yoSig.sig !== hiSig.sig && live === 'YO' && yo === 'YO' && doneTyping && hiBack === 'HI', `${inA} ${allSel} "${live}" ${yo} → ${hiBack}`)
  await key('Enter', 'Enter', 13)
  const inB = await typingIn()
  await key('End', 'End', 35)
  const caretEnd = await h.rect('.ed-caret')
  await click(...(await at(6.1, 71)))
  const caretStart = await h.rect('.ed-caret'), left = (await at(6, 71))[0] - e.k / 2
  await p.cdp('Input.insertText', { text: 'x' }); await sleep(300)
  const xhi = (await p.js<string>(`document.querySelector('.ed-insp [data-focus="text"]')?.value ?? ''`))
  await key('Escape', 'Escape', 27)
  check('E3: Enter types into the selected text; End puts the caret after it, a click in the text before it (between glyphs)', inB && !!caretEnd && !!caretStart && caretEnd.x > caretStart.x + 8 * e.k && Math.abs(caretStart.x + caretStart.w / 2 - left) < e.k && xhi === 'XHI', `${caretStart?.x} vs ${left}; ${xhi}`)
  check('E3: Esc cancels the typing: the text is back, no step to undo', !(await typingIn()) && (await saved<Txt>(E3.text)).params.text === 'HI')
  const n0 = (await e.layers()).length
  await key('t', 'KeyT', 84); await click(...(await at(50, 70)))
  const inC = await typingIn()
  await p.cdp('Input.insertText', { text: 'new' }); await key('Enter', 'Enter', 13)
  const made = (await e.layers()).find(l => l.kind === 'text' && l.params?.text === 'NEW')
  await undo()
  check('E3: the Text tool types on the canvas; the new layer and its text undo together', inC && !!made && (await e.layers()).length === n0, `${inC} ${!!made} ${n0} → ${(await e.layers()).length}`)

  // the eyedropper: I, a click on the .6 ink; Alt-click while drawing on the full ink
  await click(...(await at(70, 10)))
  const cells0 = (await saved<{ cells: string }>(E3.paint)).cells
  const paintSel = await layer() === E3.paint, ink0 = await h.text(`.ed-qbar-step:has([data-q="ink-"]) b`)
  await key('i', 'KeyI', 73)
  const pickOn = await p.js<boolean>(`document.querySelector('${q('pick')}')?.getAttribute('aria-pressed') === 'true'`), drawTool = (await h.tool()).startsWith('Draw')
  await click(...(await at(70, 10)))
  const ink1 = await h.text(`.ed-qbar-step:has([data-q="ink-"]) b`), pickOff = await p.js<boolean>(`document.querySelector('${q('pick')}')?.getAttribute('aria-pressed') === 'false'`)
  await click(...(await at(70, 20)), ALT)
  const ink2 = await h.text(`.ed-qbar-step:has([data-q="ink-"]) b`)
  const strokeless = (await e.layers()).length === n0 && (await saved<{ cells: string }>(E3.paint)).cells === cells0
  check('E3: the eyedropper (I) takes the ink of the painted dot it clicks (.6), Alt-click while drawing too (1); neither paints', paintSel && ink0 === 'INK 1.0' && pickOn && drawTool && ink1 === 'INK 0.6' && pickOff && ink2 === 'INK 1.0' && strokeless, `${ink0} → ${ink1} → ${ink2}; pick ${pickOn}/${pickOff}`)
  await key('Escape', 'Escape', 27)
  await p.shot(join(out, 'desktop-06-e3.png'))
}

export async function phoneE3(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
  console.log('  · E3')
  const W = 390
  const layer = () => p.js<string | undefined>(`window.__editor?.layer`)
  const q = (name: string) => `.ed-qbar [data-q="${name}"]`
  const typingIn = () => p.js<boolean>(`document.activeElement?.matches('.ed-intext.on') ?? false`)
  const drag = async (a: readonly [number, number], b: readonly [number, number], n = 8) => { await p.touch(Array.from({ length: n + 1 }, (_, i) => [[a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]])); await sleep(400) }
  const undo = () => tapEl('.ed-top [aria-label="Undo"]')
  const e = await e3Open(p, h, tapEl)
  if (!e.ok) { check('phone E3: the editor opens the E3 document', false); return }
  const { at, saved } = e
  await p.tap(...(await at(40, 28))); await sleep(400)
  const sb = (await h.rect('.ed-selbar'))!, bar = await h.rect('.ed-qbar')
  const small = await p.js<string[]>(`[...document.querySelectorAll('.ed-qbar button')].filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).map(b => b.dataset.q)`)
  check('phone E3: a tap selects the ring; its handles and the quick bar show; every quick button ≥ 44 px, uncovered, above the selection bar', await layer() === E3.ring && await p.js<boolean>(`document.querySelectorAll('[data-site]').length === 2`) && !!bar && bar.x >= 0 && bar.r <= W && bar.b <= sb.y && !small.length && await h.uncovered('.ed-qbar button'), `${await layer()}; bar ${bar && Math.round(bar.x)}..${bar && Math.round(bar.r)} × ..${bar && Math.round(bar.b)}, selbar ${Math.round(sb.y)}; small ${small.join()}`)
  await p.shot(join(out, 'phone-05-e3.png'))
  const rH = mid((await h.rect('[data-site="r"]'))!)
  await drag(rH, [rH[0], rH[1] + 6 * e.k])
  const r1 = (await saved<Ring>(E3.ring)).params.r
  await undo()
  check('phone E3: a finger on the radius handle drags the radius out in whole cells; undo puts it back', r1 === 22 && (await saved<Ring>(E3.ring)).params.r === 16, `${r1}`)
  await tapEl(q('tone'))
  const t1 = (await saved<Ring>(E3.ring)).tone
  await undo()
  check('phone E3: a tap on TONE steps the tone; undo', t1 === 'faint' && (await saved<Ring>(E3.ring)).tone === 'idle', t1)

  // text: a tap selects it, a second tap types into it; DONE commits as one undo step
  await p.tap(...(await at(8, 71))); await sleep(400)
  const selText = await layer() === E3.text
  await p.tap(...(await at(8, 71))); await sleep(400)
  const inA = await typingIn()
  await p.cdp('Input.insertText', { text: 'ok' }); await sleep(300)
  await tapEl(q('done'))
  const ok = (await saved<Txt>(E3.text)).params.text, done = !(await typingIn())
  await undo()
  check('phone E3: a tap on the selected text types into it on the canvas; DONE commits; undo brings the old text back', selText && inA && ok === 'OK' && done && (await saved<Txt>(E3.text)).params.text === 'HI', `${selText} ${inA} ${ok}`)
  const n0 = (await e.layers()).length
  await tapEl('.ed-dock .ed-tool[aria-label^="Text"]')
  await p.tap(...(await at(50, 70))); await sleep(500)
  const inB = await typingIn(), noSheet = !(await p.js(`!!document.querySelector('.ed-sheet')`))
  await p.cdp('Input.insertText', { text: 'new' }); await sleep(300)
  const fr = (await h.frameRect(e.fid))!
  await p.tap(fr.x + fr.w / 2, Math.min(fr.b + 30, sb.y - 60)); await sleep(400)
  const made = (await e.layers()).find(l => l.kind === 'text' && l.params?.text === 'NEW')
  check('phone E3: the Text tool types on the canvas with no sheet over it; a tap elsewhere commits', inB && noSheet && !!made && (await e.layers()).length === n0 + 1 && !(await typingIn()), `${inB} ${noSheet} ${!!made}`)

  // spec bounds by touch; the eyedropper by PICK (typing panned the text above the keyboard: fit the frame again)
  await tapEl('.ed-zoom-pct'); await p.js(`[...document.querySelectorAll('.ed-menu button')].find(b => b.textContent.startsWith('Zoom to fit')).click()`); await sleep(500)
  await p.tap(...(await at(12, 9))); await sleep(400)
  const se = mid((await h.rect('.ed-sel--bounds [data-bounds="se"]'))!)
  await drag(se, [se[0] + 4 * e.k, se[1] + 2 * e.k])
  const b1 = (await saved<Spec>(E3.spec)).spec.bounds?.join()
  check('phone E3: a finger on a bounds corner resizes the spec field in whole layer cells', await layer() === E3.spec && b1 === '2,2,10,6', String(b1))
  await p.tap(...(await at(70, 10))); await sleep(400)
  await tapEl(q('pick'))
  const pickOn = await p.js<boolean>(`document.querySelector('${q('pick')}')?.getAttribute('aria-pressed') === 'true'`)
  await tapEl(q('ink-'))
  const ink0 = await h.text(`.ed-qbar-step:has([data-q="ink-"]) b`)
  await p.tap(...(await at(70, 10))); await sleep(400)
  const ink1 = await h.text(`.ed-qbar-step:has([data-q="ink-"]) b`)
  check('phone E3: PICK then a tap on a painted dot takes its ink (.6); the tap paints nothing', await layer() === E3.paint && pickOn && ink1 === 'INK 0.6' && (await e.layers()).length === n0 + 1, `${pickOn} ${ink0} → ${ink1}`)
  await tapEl(q('ink+'))
  check('phone E3: INK + steps the ink up the .2 ladder', await h.text(`.ed-qbar-step:has([data-q="ink-"]) b`) === 'INK 0.8')
}
