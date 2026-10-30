/**
 * MAKE editor in headless Chrome (docs/EDITOR-PLAN.md, E1), on desktop (1440×900, mouse + keys) and on
 * a phone (390×844, touch). Replaces the old COMPOSE / CODE probes (studio-browser, dots-browser).
 *
 *  desktop: the site tabs stay clear; select a frame (label, click, empty canvas deselects); V H F B T C
 *           from the keyboard and the tool bar; pan with H; drag out a frame; resize from two corners
 *           (the far edge stays) and undo / redo each resize as one step; a paint stroke (+ its new
 *           layer) is one undo step, E erases; text and code tools; CODE compiles, shows line:col errors
 *           and keeps the last good program; ANIMATE scrubs; EXPORT writes PNG / SVG / an APNG clip;
 *           a preset as a reference frame, MAKE EDITABLE; the share link round trip (imported once),
 *           data sliders; old `?tab=` / `?make=` links land on their tool, panels and canonical URL;
 *           broken links show an error and run nothing.
 *  phone:   full screen (the site bar steps aside), the dock and top bar are ≥ 44 px and uncovered, no
 *           horizontal overflow; tap selects on release, one finger on an unselected frame pans and on
 *           the selected one moves it; pinch zooms; dock tools (frame, draw, text, code), resize by
 *           touch, undo / redo; bottom sheets at every detent leave the top bar and their own tab bar
 *           uncovered and keep the selection in view; CODE compiles in the sheet; SHARE falls back to
 *           EXPORT; ASSETS / LAYERS sheets; `?make=code` / `?tab=draw` / `?tab=studio`; leaving brings
 *           the site's tab bar back, uncovered.
 *  E3 (both): a sites ring's radius and sweep handles (whole cells, the sweep on the ring's dots), the
 *           quick bar (tone, dot size, lattice; one undo step each), a spec field's bounds corners and a
 *           spec layer moved in whole cells, text typed in place (double-click / Enter / a tap on the
 *           selected text; Enter / DONE / a tap elsewhere commit as one undo step, Esc cancels; a click in
 *           the text moves the caret), the Text tool typing on the canvas, and the eyedropper (I, PICK,
 *           Alt-click). The phone pass also checks the quick bar's 44 px targets above the selection bar.
 *
 * `npx vite build && npx tsx scripts/editor-browser.ts [baseUrl] [--only desktop|phone]`: with no URL it
 * serves `dist/` itself (`vite preview`, port 4319) and stops it at the end. Screenshots and downloads
 * go to `.snapshots/editor/`. Chrome: $CHROME or the usual install paths.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { encodeShare } from '../src/lib/share'
import { addFrame, addLayer, blankCard, EDITOR_KEY, EDITOR_VERSION, type EditorDoc } from '../src/components/editor/doc'
import { encodeCells } from '../src/components/editor/doc'
import { paintLayer, sitesLayer, textLayer, type SpecLayer } from '../src/components/studio/doc'
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'

const args = process.argv.slice(2), onlyAt = args.indexOf('--only'), only = onlyAt >= 0 ? args[onlyAt + 1] : undefined
const urlArg = args.find((a, i) => /^https?:/.test(a) && i !== onlyAt + 1)
const out = resolve('.snapshots', 'editor')
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const server = urlArg ? undefined : await serveDist(4319)
const base = (urlArg ?? server!.url).replace(/\/?$/, '/')

let failures = 0, passes = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (ok) passes++; else failures++ }
type Rect = { x: number; y: number; w: number; h: number; r: number; b: number }

const PROGRAM = `// blobs: three metaballs orbiting the centre
let a = .08 / length(u - .5 - .22 * cos(t), v - .5 - .22 * sin(t * 1.3));
let b = .07 / length(u - .5 - .2 * cos(t * .7 + 2), v - .5 - .25 * sin(t + 1));
let c = .06 / length(u - .5 + .18 * sin(t * 1.1), v - .5 + .2 * cos(t * .8));
smoothstep(.9, 1.6, a + b + c)`

/** Page helpers shared by both passes. */
function helpers(p: Page) {
  const q = JSON.stringify
  const rect = (sel: string) => p.js<Rect | null>(`(() => { const e = document.querySelector(${q(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom } })()`)
  const frameRect = (id: string) => rect(`.ed-frame[data-frame="${id}"]`)
  /** Lit pixels of a frame's canvas (default: the selected one) and a cheap signature of them. */
  const lit = (id?: string) => p.js<{ n: number; sig: number }>(`(() => { const id = ${id ? q(id) : 'window.__editor?.sel'}; const c = id && document.querySelector('.ed-frame[data-frame="' + id + '"]'); if (!c) return { n: -1, sig: 0 }; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, sig = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) { n++; sig = (sig * 31 + i) % 1000003 } return { n, sig } })()`)
  const sel = () => p.js<string | undefined>(`window.__editor?.sel`)
  const frameIds = () => p.js<string[]>(`[...document.querySelectorAll('.ed-frame')].map(c => c.dataset.frame)`)
  const tool = () => p.js<string>(`document.querySelector('.ed-tool[aria-pressed="true"]')?.getAttribute('aria-label') ?? ''`)
  const tab = (scope: string) => p.js<string>(`document.querySelector(${q(scope)} + ' [role=tab][aria-selected="true"]')?.textContent ?? ''`)
  const sizeOf = (id: string) => p.js<string>(`document.querySelector('[data-frame-label="${id}"] small')?.textContent ?? ''`)
  const text = (s: string) => p.js<string>(`document.querySelector(${q(s)})?.textContent ?? ''`)
  const clickText = (s: string, label: string) => p.js(`(() => { const b = [...document.querySelectorAll(${q(s)})].find(b => b.textContent.trim().startsWith(${q(label)})); if (!b) throw new Error('no ' + ${q(label)}); b.click() })()`)
  const setValue = (s: string, v: string | number, event = 'input') => p.js(`(() => { const el = document.querySelector(${q(s)}); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(v))}); el.dispatchEvent(new Event(${q(event)}, { bubbles: true })) })()`)
  const setLabeled = (label: string, v: string | number, event = 'input') => p.js(`(() => { const l = [...document.querySelectorAll('.ed-insp .ed-field')].find(x => x.querySelector('span')?.textContent.trim() === ${q(label)}); const el = l.querySelector('input, select'); const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${q(String(v))}); el.dispatchEvent(new Event(${q(event)}, { bubbles: true })) })()`)
  const typeIR = async (src: string) => { await p.js(`(() => { const a = document.querySelector('.ed-insp .dw-code textarea'); a.focus(); a.select() })()`); await p.cdp('Input.insertText', { text: src }); await sleep(500) }
  const blur = () => p.js(`document.activeElement?.blur()`)
  /** The element at a rect's centre is that element (or inside it): nothing covers it. A disabled control is not hit-tested, so its own ancestor there counts as uncovered. */
  const uncovered = (s: string) => p.js<boolean>(`[...document.querySelectorAll(${q(s)})].every(e => { const r = e.getBoundingClientRect(); if (!r.width) return false; const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && (hit === e || e.contains(hit) || (e.disabled && hit.contains(e))) })`)
  const layerRows = () => p.js<string[]>(`[...document.querySelectorAll('.ed-tree-frame.within .ed-row--layer .ed-row-name')].map(b => b.textContent)`)
  /** Wait until a finished download matches. */
  const downloaded = async (ok: (d: { name: string; bytes: number }) => boolean, ms = 15000) => { for (let i = 0; i < ms / 100; i++) { if (p.downloads.some(ok)) return true; await sleep(100) } return false }
  const fresh = async (url: string) => {
    await p.cdp('Page.navigate', { url }); await p.waitFor(`!!document.querySelector('.ed-frame')`, 60000)
    await p.js(`localStorage.removeItem('dot480.editor.v1')`); await p.cdp('Page.reload')
    return p.waitFor(`!!document.querySelector('.ed-frame') && document.querySelectorAll('.ed-frame').length >= 3`, 60000)
  }
  /** Leave time for the debounced autosave before the next navigation. */
  const go = async (url: string, ready = `!!document.querySelector('.ed-frame')`) => { await sleep(700); await p.cdp('Page.navigate', { url }); const ok = await p.waitFor(ready, 30000); await sleep(600); return ok }
  return { rect, frameRect, lit, sel, frameIds, tool, tab, sizeOf, text, clickText, setValue, setLabeled, typeIR, blur, uncovered, layerRows, downloaded, fresh, go }
}
const near = (a: number, b: number, tol = 1.5) => Math.abs(a - b) <= tol
const mid = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const

// ─────────────────────────────────────────────────────────────────────────────────────────────────
async function desktop() {
  console.log('\n── desktop 1440×900')
  const p = await launch(1440, 900), h = helpers(p)
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await p.allowDownloads(out)
    await p.cdp('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'], origin: new URL(base).origin }).catch(() => null)
    const opened = await h.fresh(`${base}?make&pro=1`)
    check('?make opens the editor (desktop layout, seed frames)', opened && !(await p.js(`!!document.querySelector('.ed-root.is-phone')`)) && (await h.frameIds()).length === 3, opened ? '' : p.logs.join(' | '))
    if (!opened) { await p.shot(join(out, 'desktop-00-failed.png')); return }
    await sleep(1200)
    const editorTop = (await h.rect('.ed-root'))!.y, siteTab = (await h.rect('#tab-MAKE'))!
    check('the site tabs stay visible and uncovered above the editor (MAKE selected)', await h.uncovered('#tab-EXPLORE, #tab-MAKE, #tab-ABOUT') && siteTab.b <= editorTop + 1 && await p.js(`document.querySelector('#tab-MAKE').getAttribute('aria-selected') === 'true'`), `tab bottom ${siteTab.b}, editor top ${editorTop}`)
    check('?make (TUNE) opens with ASSETS on the left and DESIGN on the right', await h.tab('.ed-left') === 'ASSETS' && await h.tab('.ed-right') === 'DESIGN')
    await p.shot(join(out, 'desktop-01-open.png'))
    await h.clickText('.ed-left [role=tab]', 'LAYERS'); await sleep(200)

    // ── select: a frame label, a click on a frame, empty canvas deselects
    const [f0, f1] = await h.frameIds()
    await p.js(`document.querySelector('[data-frame-label="${f0}"]').click()`); await sleep(300)
    check('clicking a frame label selects the frame (outlined; a reference frame has no resize handles)', await h.sel() === f0 && await p.js(`!!document.querySelector('.ed-sel') && document.querySelectorAll('.ed-handle').length === 0`))
    const r1 = (await h.frameRect(f1))!, vp = (await h.rect('.ed-viewport'))!
    await p.mouse('mouseMoved', r1.x + r1.w / 2, r1.y + r1.h / 2, 0); await p.mouse('mousePressed', r1.x + r1.w / 2, r1.y + r1.h / 2); await p.mouse('mouseReleased', r1.x + r1.w / 2, r1.y + r1.h / 2); await sleep(300)
    check('clicking a frame on the canvas selects it (or the layer under the pointer)', await h.sel() === f1)
    await p.mouse('mouseMoved', vp.x + 20, vp.b - 20, 0); await p.mouse('mousePressed', vp.x + 20, vp.b - 20); await p.mouse('mouseReleased', vp.x + 20, vp.b - 20); await sleep(300)
    check('clicking empty canvas deselects', !(await h.sel()))

    // ── tools: V H F B T C by key and by the tool bar; Esc goes back to Move
    await h.blur()
    const keyed: [string, string, number, string][] = [['h', 'KeyH', 72, 'Hand'], ['f', 'KeyF', 70, 'Frame'], ['b', 'KeyB', 66, 'Draw'], ['t', 'KeyT', 84, 'Text'], ['c', 'KeyC', 67, 'Code'], ['v', 'KeyV', 86, 'Move']]
    const got: string[] = []
    for (const [k, code, vk] of keyed) { await p.key(k, code, vk); got.push((await h.tool()).split(/[ :]/)[0]) }
    check('V H F B T C pick their tools', got.join() === keyed.map(k => k[3]).join(), got.join())
    await p.js(`document.querySelector('.ed-top .ed-tool[aria-label^="Draw"]').click()`); await sleep(150)
    const barTool = await h.tool()
    await p.key('Escape', 'Escape', 27)
    check('the tool bar picks a tool too, and Esc returns to Move', barTool.startsWith('Draw') && (await h.tool()).startsWith('Move'), barTool)

    // ── hand: H-drag pans the camera, the selection stays
    await p.js(`document.querySelector('[data-frame-label="${f0}"]').click()`); await sleep(200)
    await p.key('h', 'KeyH', 72)
    const before = (await h.frameRect(f0))!
    await p.drag(before.x + 40, before.y + 40, before.x + 160, before.y + 100); await sleep(300)
    const after = (await h.frameRect(f0))!
    check('the Hand tool pans (the frame moves on screen by the drag, the selection stays)', near(after.x - before.x, 120) && near(after.y - before.y, 60) && await h.sel() === f0, `${(after.x - before.x).toFixed(1)}, ${(after.y - before.y).toFixed(1)}`)
    await p.key('v', 'KeyV', 86)

    // ── frame: drag out a new frame below the others
    const ids0 = await h.frameIds(), rows = await Promise.all(ids0.map(id => h.frameRect(id))), low = Math.max(...rows.map(r => r!.b))
    const fx = vp.x + 60, fy = Math.min(vp.b - 300, low + 50)
    await p.key('f', 'KeyF', 70)
    await p.drag(fx, fy, fx + 260, fy + 200); await sleep(800)
    const ids1 = await h.frameIds(), N = ids1.find(id => !ids0.includes(id))!
    check('the Frame tool drags out a new empty frame, selects it and returns to Move', !!N && ids1.length === 4 && await h.sel() === N && (await h.layerRows()).length === 0 && (await h.tool()).startsWith('Move'), `${ids1.length} frames, ${await h.sizeOf(N)}`)

    // ── resize: SE grows from the top-left, NW grows from the bottom-right; each is one undo step
    const s0 = await h.sizeOf(N), a0 = (await h.frameRect(N))!
    const se = (await h.rect('.ed-handle.se'))!
    await p.drag(...mid(se), mid(se)[0] + 60, mid(se)[1] + 40); await sleep(400)
    const s1 = await h.sizeOf(N), a1 = (await h.frameRect(N))!
    const nw = (await h.rect('.ed-handle.nw'))!
    await p.drag(...mid(nw), mid(nw)[0] - 40, mid(nw)[1] - 30); await sleep(400)
    const s2 = await h.sizeOf(N), a2 = (await h.frameRect(N))!
    const [c0, w0] = s0.split('×').map(Number), [c1, w1] = s1.split('×').map(Number), [c2, w2] = s2.split('×').map(Number)
    check('resizing from SE grows the frame and keeps its top-left', c1 > c0 && w1 > w0 && near(a1.x, a0.x) && near(a1.y, a0.y), `${s0} → ${s1}`)
    check('resizing from NW grows it and keeps its bottom-right', c2 > c1 && w2 > w1 && near(a2.r, a1.r, 2.5) && near(a2.b, a1.b, 2.5), `${s1} → ${s2}; right ${a1.r.toFixed(1)} → ${a2.r.toFixed(1)}`)
    await h.blur()
    await p.key('z', 'KeyZ', 90, 2); const u1 = await h.sizeOf(N)
    await p.key('z', 'KeyZ', 90, 2); const u2 = await h.sizeOf(N)
    await p.key('z', 'KeyZ', 90, 10); await p.key('y', 'KeyY', 89, 2); const r2 = await h.sizeOf(N)
    check('each resize gesture is one undo step; Ctrl+⇧Z / Ctrl+Y redo', u1 === s1 && u2 === s0 && r2 === s2, `${s2} → ${u1} → ${u2} → ${r2}`)

    // ── draw: a stroke on an empty frame adds a paint layer; stroke + layer undo as one step; E erases
    const fr = (await h.frameRect(N))!, y = fr.y + fr.h / 2
    const empty = await h.lit(N)
    await p.key('b', 'KeyB', 66)
    await p.drag(fr.x + fr.w * .25, y, fr.x + fr.w * .75, y, 16); await sleep(500)
    const painted = await h.lit(N), paintRows = await h.layerRows()
    check('a Draw stroke paints dots and adds a paint layer', painted.n > empty.n + 50 && paintRows.length === 1 && paintRows[0].startsWith('PAINT'), `${empty.n} → ${painted.n} lit px; ${paintRows.join(' | ')}`)
    await p.key('z', 'KeyZ', 90, 2); await sleep(300)
    const undone = await h.lit(N), undoneRows = (await h.layerRows()).length
    await p.key('y', 'KeyY', 89, 2); await sleep(400)
    check('undo removes the stroke and its new layer in one step; redo brings both back', undone.n <= empty.n + 5 && undoneRows === 0 && (await h.lit(N)).n === painted.n && (await h.layerRows()).length === 1, `${undone.n} px, ${undoneRows} rows`)
    await p.key('e', 'KeyE', 69)
    await p.drag(fr.x + fr.w * .25, y, fr.x + fr.w * .5, y, 10); await sleep(500)
    const erased = await h.lit(N)
    check('E erases along the stroke', erased.n < painted.n - 20, `${painted.n} → ${erased.n}`)
    await p.key('Escape', 'Escape', 27)

    // ── text: T + click adds a text layer and types into it on the canvas (E3)
    await p.key('t', 'KeyT', 84)
    await p.mouse('mouseMoved', fr.x + 16, fr.y + fr.h * .75, 0); await p.mouse('mousePressed', fr.x + 16, fr.y + fr.h * .75); await p.mouse('mouseReleased', fr.x + 16, fr.y + fr.h * .75); await sleep(500)
    const focused = await p.js<boolean>(`document.activeElement?.matches('.ed-intext.on') ?? false`)
    await p.cdp('Input.insertText', { text: 'dot' }); await sleep(400)
    const withText = await h.lit(N)
    await h.blur()
    check('the Text tool adds a text layer, types into it on the canvas and draws what is typed (upper case)', focused && (await h.layerRows())[0]?.startsWith('TEXT') && await p.js(`document.querySelector('.ed-insp [data-focus="text"]').value === 'DOT'`) && withText.sig !== erased.sig && (await h.tool()).startsWith('Move'))

    // ── code: C + click adds a Field IR layer and opens CODE; it compiles, errors keep the last good program
    await p.key('c', 'KeyC', 67)
    await p.mouse('mouseMoved', fr.x + fr.w / 2, fr.y + fr.h / 3, 0); await p.mouse('mousePressed', fr.x + fr.w / 2, fr.y + fr.h / 3); await p.mouse('mouseReleased', fr.x + fr.w / 2, fr.y + fr.h / 3); await sleep(600)
    check('the Code tool adds a code layer and opens the CODE tab', (await h.layerRows())[0]?.startsWith('CODE') && await h.tab('.ed-right') === 'CODE' && await p.js(`!!document.querySelector('.ed-insp .dw-code textarea')`))
    await h.typeIR(PROGRAM)
    const compiled = await h.lit(N), status = await h.text('.ed-insp .dw-status')
    check('CODE: a typed program compiles and draws', /OK/.test(status) && compiled.sig !== withText.sig && status.includes(`${PROGRAM.length}/4096`), status)
    await h.typeIR(PROGRAM.replace('a + b + c)', 'a + b + c'))
    const err = await h.text('.dw-error'), kept = await h.lit(N)
    check('CODE: a syntax error shows line:col and the frame keeps the last good program', /^\d+:\d+/.test(err) && await p.js(`!!document.querySelector('.ed-err')`) && kept.n > 200, `${err}; ${kept.n} px`)
    await h.typeIR(PROGRAM); await h.blur()
    await p.shot(join(out, 'desktop-02-built.png'))

    // ── animate: the timeline previews the frame at t
    await h.clickText('.ed-right [role=tab]', 'ANIMATE'); await sleep(300)
    await h.setValue('.ed-transport input', .03); await sleep(400); const t0 = await h.lit(N)
    await h.setValue('.ed-transport input', .9); await sleep(400); const t1 = await h.lit(N)
    check('ANIMATE: scrubbing t redraws the frame (the enter track reveals it)', t0.sig !== t1.sig && t0.n < t1.n && (await h.text('.ed-t')).includes('0.90'), `t .03: ${t0.n}, t .9: ${t1.n}`)

    // ── export: the top bar's EXPORT opens the tab; PNG, SVG and an APNG clip land on disk
    await p.js(`[...document.querySelectorAll('.ed-top button')].find(b => b.textContent === 'EXPORT').click()`); await sleep(300)
    check('the EXPORT button opens the EXPORT tab', await h.tab('.ed-right') === 'EXPORT')
    await h.clickText('.ed-insp button', 'PNG')
    const png = await h.downloaded(d => d.name.endsWith('.png') && d.bytes > 1000)
    await h.clickText('.ed-insp button', 'SVG')
    const svg = await h.downloaded(d => d.name.endsWith('.svg') && d.bytes > 1000)
    check('EXPORT: PNG and SVG download', png && svg && (await h.text('.ed-status')) === 'saved', JSON.stringify(p.downloads))
    await h.setLabeled('FORMAT', 'apng', 'change'); await h.setLabeled('FPS', '12', 'change')
    await h.clickText('.ed-insp button', 'RECORD')
    const recorded = await p.waitFor(`!!window.__editorClip`, 60000)
    const clip = await p.js<{ format: string; size: number; frames: number; durationMs: number } | undefined>(`window.__editorClip`)
    const clipFile = !!clip && await h.downloaded(d => d.bytes === clip.size)
    check('EXPORT: the timeline records as an APNG clip (3 s at 12 fps) and downloads', recorded && clip?.format === 'apng' && clip.frames === 36 && near(clip.durationMs, 3000, 1) && clip.size > 1000 && clipFile, JSON.stringify(clip))
    await p.shot(join(out, 'desktop-03-export.png'))

    // ── assets: a preset as a reference frame, then MAKE EDITABLE (card spec v1)
    await h.clickText('.ed-left [role=tab]', 'ASSETS'); await sleep(300)
    await h.setValue('.ed-search', 'level-03'); await sleep(300)
    await p.js(`[...document.querySelectorAll('.ed-asset')].find(b => b.querySelector('small')?.textContent === 'level-03').click()`); await sleep(1500)
    await h.clickText('.ed-left [role=tab]', 'LAYERS'); await sleep(300)
    const refRows = await h.layerRows()
    check('ASSETS: a preset inserts as a read-only reference frame', refRows.length > 3 && refRows[0].startsWith('REF') && (await h.lit()).n > 500, `${refRows.length} layers`)
    await h.clickText('.ed-right [role=tab]', 'DESIGN'); await h.clickText('.ed-insp button', 'MAKE EDITABLE'); await sleep(1500)
    const spec = await h.layerRows()
    check('MAKE EDITABLE re-imports it through card spec v1', spec.length > 0 && !spec[0].startsWith('REF') && (await h.lit()).n > 500, spec.slice(0, 3).join(' | '))

    // ── share: ?make=code selects the code frame; COPY LINK → reload imports once; data sliders
    // (from the seed document, so the selected code frame is the 144² ripple, on a share grid)
    check('?make=code selects a code layer with CODE open', await h.fresh(`${base}?make=code&pro=1`) && await p.waitFor(`!!document.querySelector('.ed-insp .dw-code textarea')`) && await h.tab('.ed-right') === 'CODE')
    await h.typeIR(PROGRAM); await h.blur()
    await h.clickText('.ed-insp button', 'COPY LINK'); await sleep(500)
    const link = await p.js<string>(`window.__editorLink ?? ''`)
    check('COPY LINK makes a compact ?make=code&p=z… link', /\?make=code&p=z[A-Za-z0-9_-]+$/.test(link) && link.length < 400, `${link.length} chars`)
    const n0 = (await h.frameIds()).length
    check('opening the link shows the same program', await h.go(link, `document.querySelector('.ed-insp .dw-code textarea')?.value === ${JSON.stringify(PROGRAM)}`))
    const n1 = (await h.frameIds()).length
    await h.go(link, `!!document.querySelector('.ed-insp .dw-code textarea')`); await sleep(600)
    check('opening the same link again re-selects its frame instead of adding a copy', (await h.frameIds()).length === n1 && n1 <= n0 + 1, `${n0} → ${n1} → ${(await h.frameIds()).length}`)
    await h.clickText('.ed-left [role=tab]', 'ASSETS'); await sleep(300)
    await h.clickText('.ed-agroup[aria-label="Programs"] .ed-asset', 'rain'); await sleep(1200)
    const sliders = await p.js<string[]>(`[...document.querySelectorAll('.ed-insp .ed-slider > span')].map(s => s.firstChild.textContent)`)
    const d0 = await h.lit(); await h.setValue('.ed-insp .ed-slider input', 1); await sleep(600); const d1 = await h.lit()
    check('data.* sliders are generated for the keys a program reads, and move the frame', sliders.join() === 'data.density' && d1.n !== d0.n, `${sliders.join()}; ${d0.n} → ${d1.n}`)
    await h.clickText('.ed-agroup[aria-label="Start"] .ed-asset', 'Drawing'); await sleep(600) // a paint frame for ?make=draw below
    await p.key('Escape', 'Escape', 27); await h.clickText('.ed-left [role=tab]', 'LAYERS')

    // ── old links: each lands on its tool, panels and canonical URL
    const links: [string, string, string, string, string, string][] = [
      // url, tool, left tab, right tab, canonical search, path
      ['?tab=workspace', 'Move', 'ASSETS', 'DESIGN', '?make', '/'],
      ['?tab=studio', 'Move', 'LAYERS', 'DESIGN', '?make=compose', '/'],
      ['?tab=draw', 'Draw', 'LAYERS', 'DESIGN', '?make=draw', '/'],
      ['?tab=dots', 'Move', 'LAYERS', 'CODE', '?make=code', '/'],
      ['?make=compose', 'Move', 'LAYERS', 'DESIGN', '?make=compose', '/'],
      ['light/?tab=STUDIO', 'Move', 'LAYERS', 'DESIGN', '?make=compose', '/light/'],
    ]
    const wrong: string[] = []
    for (const [u, t, l, r, search, path] of links) {
      const ok = await h.go(`${base}${u}`)
      const got = { tool: (await h.tool()).split(/[ :]/)[0], left: await h.tab('.ed-left'), right: await h.tab('.ed-right'), search: await p.js<string>('location.search'), path: await p.js<string>('location.pathname') }
      if (!ok || got.tool !== t || got.left !== l || got.right !== r || got.search !== search || got.path !== path) wrong.push(`${u} → ${JSON.stringify(got)}`)
    }
    check('old ?tab= / ?make= links open the editor on their tool and panels, at the canonical URL', !wrong.length, wrong.join(' | '))
    await h.go(`${base}?make=draw`)
    check('?make=draw selects a paint layer', (await p.js<string>(`document.querySelector('.ed-row--layer.on .ed-row-name')?.textContent ?? ''`)).startsWith('PAINT'))

    // ── broken links: an error, nothing run
    await p.cdp('Page.navigate', { url: `${base}?tab=dots&p=zNotARealLink` })
    check('a corrupt link shows an error banner', await p.waitFor(`/Could not open/.test(document.querySelector('.ed-banner')?.textContent ?? '')`, 30000), await h.text('.ed-banner'))
    const bad = await encodeShare({ src: 'let x = u * ;\nx', grid: 'square', lattice: 2, tone: 'auto' })
    await h.go(`${base}?tab=dots&p=${bad}`, `!!document.querySelector('.dw-error')`); await sleep(600)
    check('an invalid shared program shows its IR error and is not run', /^1:\d+/.test(await h.text('.dw-error')) && (await h.lit()).n === 0, await h.text('.dw-error'))
    await p.shot(join(out, 'desktop-04-links.png'))
    await desktopE2(p, h)
    await desktopE3(p, h)
    await desktopE5(p, h)
    check('desktop: no uncaught errors or console errors', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
  } catch (e) {
    check('desktop run', false, String(e)); await p.shot(join(out, 'desktop-99-error.png')).catch(() => null)
  } finally { await p.close() }
}

// ── E2 on desktop: selections of many, marquee, group move / resize, align, distribute, guides,
//    copy / cut / paste (system clipboard, another session), duplicate, Alt-drag, groups, locks, migration
const ALT = 1, CTRL = 2, SHIFT = 8
type Helpers = ReturnType<typeof helpers>
async function desktopE2(p: Page, h: Helpers) {
  console.log('  · E2')
  await p.cdp('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => null)
  await p.js(`localStorage.removeItem('dot480.editor.clip')`)
  const opened = await h.fresh(`${base}?make=compose&pro=1`)
  await sleep(1200)
  const picks = () => p.js<string[]>(`window.__editor?.picks ?? []`)
  const count = async () => (await h.frameIds()).length
  const rectOf = async (id: string) => (await h.frameRect(id))!
  const centre = async (id: string) => mid(await rectOf(id))
  const ev = (type: string, x: number, y: number, modifiers: number, buttons: number) => p.cdp('Input.dispatchMouseEvent', { type, x, y, modifiers, button: 'left', buttons, clickCount: 1 })
  const click = async (x: number, y: number, mods = 0) => { await ev('mouseMoved', x, y, mods, 0); await ev('mousePressed', x, y, mods, 1); await ev('mouseReleased', x, y, mods, 0); await sleep(250) }
  const drag = async (x0: number, y0: number, x1: number, y1: number, mods = 0, during?: () => Promise<void>, steps = 12) => {
    await ev('mouseMoved', x0, y0, mods, 0); await ev('mousePressed', x0, y0, mods, 1)
    for (let i = 1; i <= steps; i++) { await ev('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, mods, 1); await sleep(16); if (i === steps && during) await during() }
    await ev('mouseReleased', x1, y1, mods, 0); await sleep(350)
  }
  const label = (id: string) => p.js(`document.querySelector('[data-frame-label="${id}"]').click()`).then(() => sleep(200))
  const shiftLabel = async (id: string) => { const r = (await h.rect(`[data-frame-label="${id}"]`))!; await click(r.x + Math.min(12, r.w / 2), r.y + r.h / 2, SHIFT) }
  const key = (k: string, code: string, vk: number, mods = 0) => p.key(k, code, vk, mods).then(() => sleep(150))
  const undo = () => key('z', 'KeyZ', 90, CTRL)
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
  if (!opened) { check('E2: the editor reopens fresh', false); return }
  const [f0, f1, f2] = await h.frameIds(), vp = (await h.rect('.ed-viewport'))!

  // ⇧-click, marquee, select all
  await h.blur()
  await click(...await centre(f0)); await click(...await centre(f1), SHIFT)
  const two = await picks()
  check('E2: ⇧-click adds a frame (each outlined, one dashed box around them)', same(two, [f0, f1]) && !(await p.js(`window.__editor.layer`)) && await p.js(`document.querySelectorAll('.ed-sel--pick').length === 2 && !!document.querySelector('.ed-sel--group')`), two.join())
  await click(...await centre(f1), SHIFT)
  check('E2: ⇧-click on a selected frame takes it out', (await picks()).join() === f0, (await picks()).join())
  let marqShown = false
  await drag(vp.x + 8, vp.b - 8, ...await centre(f1), 0, async () => { marqShown = await p.js(`!!document.querySelector('.ed-marquee')`) })
  check('E2: a drag on empty canvas draws a marquee and selects the frames it touches', marqShown && same(await picks(), [f0, f1]) && !(await p.js(`!!document.querySelector('.ed-marquee')`)), (await picks()).join())
  await key('a', 'KeyA', 65, CTRL)
  check('E2: Ctrl+A selects every frame', same(await picks(), [f0, f1, f2]))

  // group move: one drag moves all three; one undo puts them back
  const before = await Promise.all([f0, f1, f2].map(rectOf))
  const [gx, gy] = await centre(f2)
  await drag(gx, gy, gx + 40, gy + 60)
  const moved = await Promise.all([f0, f1, f2].map(rectOf)), dxs = moved.map((r, i) => r.x - before[i].x), dys = moved.map((r, i) => r.y - before[i].y)
  check('E2: dragging one of the selected frames moves them all by the same amount', dxs.every(d => d > 20 && near(d, dxs[0], .6)) && dys.every(d => d > 30 && near(d, dys[0], .6)), `${dxs.map(d => d.toFixed(1))} / ${dys.map(d => d.toFixed(1))}`)
  await undo()
  const back = await Promise.all([f0, f1, f2].map(rectOf))
  check('E2: the group move is one undo step', back.every((r, i) => near(r.x, before[i].x, .6) && near(r.y, before[i].y, .6)))

  // align: f1 nudged down, then f0 + f1 aligned to the top from the inspector; undo
  await label(f1); await h.blur()
  for (let i = 0; i < 3; i++) await key('ArrowDown', 'ArrowDown', 40, SHIFT)
  const down = (await rectOf(f1)).y - (await rectOf(f0)).y
  await label(f0); await shiftLabel(f1)
  const head = await h.text('.ed-insp .ed-sec h3')
  await h.clickText('.ed-insp button', 'TOP'); await sleep(300)
  const aligned = (await rectOf(f1)).y - (await rectOf(f0)).y
  await undo()
  const unaligned = (await rectOf(f1)).y - (await rectOf(f0)).y
  check('E2: the inspector shows the selection; TOP aligns the frames, one undo step', /^SELECTION/.test(head) && down > 10 && near(aligned, 0, .6) && near(unaligned, down, .6), `${head.slice(0, 20)}; ${down.toFixed(1)} → ${aligned.toFixed(1)} → ${unaligned.toFixed(1)}`)
  await undo() // the nudges (one coalesced step)

  // distribute: f1 nudged right, three frames distributed to equal gaps
  await label(f1); await h.blur()
  for (let i = 0; i < 4; i++) await key('ArrowRight', 'ArrowRight', 39, SHIFT)
  await key('a', 'KeyA', 65, CTRL)
  const gaps = async () => { const [a, b, c] = await Promise.all([f0, f1, f2].map(rectOf)); return [b.x - a.r, c.x - b.r] }
  const g0 = await gaps()
  await h.clickText('.ed-insp button', 'DISTRIBUTE ↔'); await sleep(300)
  const g1 = await gaps()
  check('E2: DISTRIBUTE ↔ evens out the gaps between three frames', !near(g0[0], g0[1], 2) && near(g1[0], g1[1], 1), `${g0.map(x => x.toFixed(1))} → ${g1.map(x => x.toFixed(1))}`)
  await undo(); await undo()

  // group resize: two code frames (reference frames have no handles), from the SE corner of their box
  await label(f2); await h.blur(); await key('d', 'KeyD', 68, CTRL)
  const f3 = (await picks())[0]
  await key('!', 'Digit1', 49, SHIFT); await sleep(400)
  await shiftLabel(f2)
  const pair = await picks(), s0 = [await h.sizeOf(f2), await h.sizeOf(f3)], r0 = await Promise.all([f2, f3].map(rectOf))
  const se = await h.rect('.ed-sel--group .ed-handle.se')
  if (se) await drag(...mid(se), mid(se)[0] + 60, mid(se)[1] + 40)
  const s1 = [await h.sizeOf(f2), await h.sizeOf(f3)], r1 = await Promise.all([f2, f3].map(rectOf))
  await undo()
  const s2 = [await h.sizeOf(f2), await h.sizeOf(f3)]
  check('E2: two frames resize together from their box (top-left kept, whole cells), one undo step', same(pair, [f2, f3]) && !!se && s1.every((x, i) => x !== s0[i]) && near(Math.min(r1[0].x, r1[1].x), Math.min(r0[0].x, r0[1].x), 1) && near(Math.min(r1[0].y, r1[1].y), Math.min(r0[0].y, r0[1].y), 1) && s2.join() === s0.join(), `${s0} → ${s1} → ${s2}`)

  // copy / paste: this browser's clipboard and the system one; a paste steps aside; undo
  await h.blur(); await key('c', 'KeyC', 67, CTRL); await sleep(300)
  const stored = await p.js<number>(`(() => { try { return JSON.parse(localStorage.getItem('dot480.editor.clip')).frames.length } catch { return -1 } })()`)
  const system = await p.js<string>(`navigator.clipboard.readText().then(t => t.includes('"dot480.clip"') ? 'clip' : 'other', e => 'blocked: ' + e.name)`)
  check('E2: Ctrl+C puts the selection on this browser\'s clipboard and the system clipboard (JSON text)', stored === 2 && system === 'clip', `stored ${stored}, system ${system}`)
  const n0 = await count()
  await key('v', 'KeyV', 86, CTRL); await sleep(300)
  const copies = await picks(), cr = copies.length === 2 ? await Promise.all(copies.map(rectOf)) : [], or = await Promise.all([f2, f3].map(rectOf))
  const offs = cr.map(r => [Math.round(r.x - Math.min(...or.map(o => o.x))), Math.round(r.y - Math.min(...or.map(o => o.y)))])
  check('E2: Ctrl+V pastes the frames, selected, stepped aside (not stacked on the originals)', (await count()) === n0 + 2 && copies.length === 2 && !copies.some(id => [f2, f3].includes(id)) && cr.every(r => !or.some(o => near(o.x, r.x, .5) && near(o.y, r.y, .5))), JSON.stringify(offs))
  await undo()
  check('E2: the paste is one undo step', (await count()) === n0)
  await label(f2); await shiftLabel(f3)
  const cutAt = await Promise.all([f2, f3].map(rectOf))
  await h.blur(); await key('x', 'KeyX', 88, CTRL); await sleep(300)
  const afterCut = await count()
  await key('v', 'KeyV', 86, CTRL); await sleep(300)
  const backIds = await picks(), backAt = backIds.length === 2 ? await Promise.all(backIds.map(rectOf)) : []
  check('E2: Ctrl+X cuts; Ctrl+V pastes the cut frames back in place', afterCut === n0 - 2 && (await count()) === n0 && backAt.every(r => cutAt.some(c => near(c.x, r.x, .6) && near(c.y, r.y, .6))), `${n0} → ${afterCut} → ${await count()}`)
  await undo(); await undo() // the paste, then the cut: the frames are back with their own ids
  check('E2: undoing the paste and the cut restores the original frames', (await h.frameIds()).includes(f2) && (await h.frameIds()).includes(f3) && (await count()) === n0)
  const clipJson = await p.js<string>(`localStorage.getItem('dot480.editor.clip')`)
  await p.js(`(() => { const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(clipJson)}); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true })) })()`); await sleep(300)
  check('E2: a paste event carrying a dot480 clip (the system clipboard) pastes it', (await count()) === n0 + 2)
  await undo()
  await h.go(`${base}?make=compose&pro=1`, `document.querySelectorAll('.ed-frame').length >= ${n0}`)
  await h.blur(); await key('v', 'KeyV', 86, CTRL); await sleep(400)
  check('E2: after a reload (a new session) Ctrl+V still pastes the last copy', (await count()) === n0 + 2, `${n0} → ${await count()}`)
  await undo()

  // duplicate many, delete many, each one step
  await label(f0); await shiftLabel(f1); await h.blur()
  await key('d', 'KeyD', 68, CTRL)
  const dup = await count(), dupIds = await picks()
  await key('Delete', 'Delete', 46)
  const del = await count()
  await undo(); const undel = await count()
  await undo(); const undup = await count()
  check('E2: Ctrl+D duplicates the selection, Delete deletes it; each is one undo step', dup === n0 + 2 && dupIds.length === 2 && del === n0 && undel === n0 + 2 && undup === n0, `${n0} → ${dup} → ${del} → ${undel} → ${undup}`)

  // Alt-drag moves a copy; the original stays; one undo step
  await key('Escape', 'Escape', 27); await key('Escape', 'Escape', 27)
  const o0 = await rectOf(f0), [ax, ay] = mid(o0)
  await drag(ax, ay, ax + 30, ay + 90, ALT)
  const altIds = (await h.frameIds()).filter(id => ![f0, f1, f2, f3].includes(id)), o1 = await rectOf(f0)
  const copyR = altIds[0] ? await rectOf(altIds[0]) : undefined
  await undo()
  check('E2: Alt-drag moves a copy and leaves the original; one undo step removes the copy', altIds.length === 1 && near(o1.x, o0.x, .6) && near(o1.y, o0.y, .6) && !!copyR && copyR.y - o0.y > 40 && (await count()) === n0, `${altIds.length} copies`)

  // smart guides: f1 nudged down, dragged back near f0's top: the guide shows and it snaps level
  await label(f1); await h.blur()
  for (let i = 0; i < 3; i++) await key('ArrowDown', 'ArrowDown', 40, SHIFT)
  const off = (await rectOf(f1)).y - (await rectOf(f0)).y, [bx, by] = await centre(f1)
  let guide = 0
  await drag(bx, by, bx, by - off + 2.5, 0, async () => { guide = await p.js<number>(`document.querySelectorAll('.ed-guide').length`) })
  const snapped = (await rectOf(f1)).y - (await rectOf(f0)).y
  check('E2: dragging a frame near another\'s edge shows a smart guide and snaps to it', guide > 0 && near(snapped, 0, .6) && off > 10, `guides ${guide}, ${off.toFixed(1)} → ${snapped.toFixed(1)}`)
  await undo(); await undo()

  // groups in LAYERS: ⇧-click two rows, Ctrl+G, collapse, pick a child, pick the group, ungroup, undo, reload
  await label(f0)
  const rows = `.ed-left .ed-tree-frame.within .ed-row--layer .ed-row-name`
  await p.js(`document.querySelector(${JSON.stringify(rows)}).scrollIntoView({ block: 'center' })`); await sleep(150)
  await p.js(`document.querySelectorAll(${JSON.stringify(rows)})[0].click()`); await sleep(150)
  const second = await p.js<Rect>(`(() => { const r = document.querySelectorAll(${JSON.stringify(rows)})[1].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom } })()`)
  await click(second.x + second.w / 2, second.y + second.h / 2, SHIFT)
  const twoLayers = await picks()
  await h.blur(); await key('g', 'KeyG', 71, CTRL); await sleep(300)
  const grp = `.ed-left .ed-tree-frame.within .ed-row--group`, kids = `.ed-left .ed-tree-frame.within .ed-row--child`
  const made = await p.js<number>(`document.querySelectorAll('${grp}').length`), kidN = await p.js<number>(`document.querySelectorAll('${kids}').length`)
  check('E2: ⇧-click two layer rows, Ctrl+G: a group row with the two layers under it', twoLayers.length === 2 && made === 1 && kidN === 2 && same(await picks(), twoLayers), `${twoLayers.length} picked, ${made} groups, ${kidN} children`)
  await p.js(`document.querySelector('${grp} .ed-twist').click()`); await sleep(200)
  const folded = await p.js<number>(`document.querySelectorAll('${kids}').length`)
  await p.js(`document.querySelector('${grp} .ed-twist').click()`); await sleep(200)
  await p.js(`document.querySelector('${kids} .ed-row-name').click()`); await sleep(200)
  const child = await picks()
  await p.js(`document.querySelector('${grp} .ed-row-name').click()`); await sleep(200)
  const whole = await picks()
  check('E2: a group row folds; a child row selects that layer; the group row selects the group', folded === 0 && child.length === 1 && same(whole, twoLayers) && /^GROUP/.test(await h.text('.ed-insp .ed-sec h3')))
  await h.blur(); await key('G', 'KeyG', 71, CTRL | SHIFT); await sleep(300)
  const ungrouped = await p.js<number>(`document.querySelectorAll('${grp}').length`)
  await undo()
  const regrouped = await p.js<number>(`document.querySelectorAll('${grp}').length`)
  check('E2: Ctrl+⇧G ungroups; one undo brings the group back', ungrouped === 0 && regrouped === 1)
  await h.go(`${base}?make=compose&pro=1`)
  const kept = await p.js<boolean>(`!!document.querySelector('.ed-row--group') && JSON.parse(localStorage.getItem('dot480.editor.v1')).v === 2`)
  check('E2: groups are saved with the document (v2) and survive a reload', kept)

  // lock: a locked frame does not move under a drag; unlocking from its label
  await label(f0); await h.blur(); await key('L', 'KeyL', 76, CTRL | SHIFT); await sleep(200)
  const lockTag = await p.js<boolean>(`document.querySelector('[data-frame-label="${f0}"]').classList.contains('locked')`)
  const l0 = await rectOf(f0), [lx, ly] = mid(l0)
  await drag(lx, ly, lx + 60, ly + 40)
  const l1 = await rectOf(f0)
  await label(f0); await h.blur(); await key('L', 'KeyL', 76, CTRL | SHIFT); await sleep(200)
  const unlocked = !(await p.js<boolean>(`document.querySelector('[data-frame-label="${f0}"]').classList.contains('locked')`))
  check('E2: Ctrl+⇧L locks a frame (its label says so; a drag on it does not move it) and unlocks it', lockTag && near(l1.x, l0.x, .5) && near(l1.y, l0.y, .5) && unlocked)

  // migration: the autosave rewritten as a v1 document loads, and is saved back as v2 after an edit
  const n1 = await p.js<number>(`(() => { const d = JSON.parse(localStorage.getItem('dot480.editor.v1')); d.v = 1; for (const f of d.frames) { delete f.groups; delete f.locks; delete f.locked } localStorage.setItem('dot480.editor.v1', JSON.stringify(d)); return d.frames.length })()`)
  await h.go(`${base}?make=compose&pro=1`)
  const n2 = await count()
  await label(f1); await h.blur(); await key('ArrowRight', 'ArrowRight', 39); await sleep(900)
  const v = await p.js<number>(`JSON.parse(localStorage.getItem('dot480.editor.v1')).v`)
  check('E2: a v1 document in the autosave loads (every frame) and is written back as v2', n1 === n2 && n1 >= 4 && v === 2, `${n1} → ${n2}, v${v}`)
  await key('?', 'Slash', 191, SHIFT)
  check('E2: the shortcut list has the new keys', /Ctrl\+G/.test(await h.text('.ed-keys')) && /Ctrl\+C/.test(await h.text('.ed-keys')))
  await key('Escape', 'Escape', 27)
  await p.shot(join(out, 'desktop-05-e2.png'))
}

// ── E2 on the phone: the selection bar, SELECT mode (taps add, a drag draws a marquee, off = pan), duplicate, group, copy / paste
async function phoneE2(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
  console.log('  · E2')
  const W = 390
  const picks = () => p.js<string[]>(`window.__editor?.picks ?? []`)
  const count = async () => (await h.frameIds()).length
  const rectOf = async (id: string) => (await h.frameRect(id))!
  const same = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x))
  const bar = (label: string) => `.ed-selbar button[aria-label^="${label}"]`
  const opened = await h.fresh(`${base}?make`)
  if (!opened) { check('phone E2: the editor reopens fresh', false); return }
  await sleep(1000)
  await tapEl('.ed-zoom-pct'); await p.js(`[...document.querySelectorAll('.ed-menu button')].find(b => b.textContent.startsWith('Zoom to fit')).click()`); await sleep(400)
  const [f0, f1, f2] = await h.frameIds()
  const sb = (await h.rect('.ed-selbar'))!, dock = (await h.rect('.ed-dock'))!
  const small = await p.js<string[]>(`[...document.querySelectorAll('.ed-selbar button')].filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).map(b => b.textContent)`)
  check('phone E2: the selection bar sits above the dock, inside the screen, every button ≥ 44 px and uncovered', sb.x >= 0 && sb.r <= W && sb.b <= dock.y && !small.length && await h.uncovered('.ed-selbar button'), `bar ${Math.round(sb.x)}..${Math.round(sb.r)} × ${Math.round(sb.y)}..${Math.round(sb.b)}, dock top ${Math.round(dock.y)}; small: ${small.join(', ')}`)
  await tapEl(bar('Select mode'))
  const on = await p.js<boolean>(`document.querySelector('${bar('Select mode')}').getAttribute('aria-pressed') === 'true'`)
  await p.tap(...mid(await rectOf(f0))); await sleep(300); await p.tap(...mid(await rectOf(f1))); await sleep(300)
  const twoF = await picks()
  await p.tap(...mid(await rectOf(f1))); await sleep(300)
  const oneF = await picks()
  check('phone E2: in SELECT mode taps add frames to the selection and take them out', on && same(twoF, [f0, f1]) && oneF.join() === f0, `${twoF.join()} / ${oneF.join()}`)
  const a0 = await rectOf(f0), r2 = await rectOf(f2), ys = Math.min(dock.y, sb.y) - 30
  await p.touch(Array.from({ length: 10 }, (_, i) => [[W - 8 - i * ((W - 8 - (r2.x + r2.w / 2)) / 9), ys - i * ((ys - (r2.y + r2.h / 2)) / 9)]])); await sleep(400)
  const a1 = await rectOf(f0), marq = await picks()
  check('phone E2: in SELECT mode one finger on empty canvas draws a marquee (adds what it touches, no pan)', marq.includes(f0) && marq.includes(f2) && near(a1.x, a0.x, .5) && near(a1.y, a0.y, .5), `${marq.length} picked; moved ${(a1.x - a0.x).toFixed(1)}`)
  const n0 = await count(), k = marq.length
  await tapEl(bar('Duplicate'))
  const dup = await count()
  await tapEl('.ed-top [aria-label="Undo"]')
  check('phone E2: DUP duplicates the selection; the top bar undo takes it back in one step', dup === n0 + k && (await count()) === n0, `${n0} → ${dup} → ${await count()}`)
  await tapEl(bar('Select mode'))
  const p0 = await rectOf(f0)
  await p.touch(Array.from({ length: 9 }, (_, i) => [[W - 20 - i * 10, ys - 10]])); await sleep(300)
  const p1 = await rectOf(f0)
  check('phone E2: with SELECT off the same drag pans again', near(p1.x - p0.x, -80, 2), `${(p1.x - p0.x).toFixed(1)}`)

  // group from the bar: SELECT on, two layer rows tapped in the LAYERS sheet, GROUP
  await p.js(`document.querySelector('[data-frame-label="${f0}"]').click()`); await sleep(200)
  await tapEl(bar('Select mode'))
  await tapEl('.ed-dock .ed-tool[aria-label="Layers"]')
  const rows = `.ed-sheet .ed-tree-frame.within .ed-row--layer .ed-row-name`
  for (const i of [0, 1]) { await p.js(`document.querySelectorAll(${JSON.stringify(rows)})[${i}].scrollIntoView({ block: 'center' })`); await sleep(150); const r = await p.js<Rect>(`(() => { const r = document.querySelectorAll(${JSON.stringify(rows)})[${i}].getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom } })()`); await p.tap(r.x + r.w / 2, r.y + r.h / 2); await sleep(300) }
  const twoL = await picks()
  await tapEl('.ed-sheet-head [aria-label="Close"]')
  await tapEl(bar('Group'))
  const ungroupBtn = await p.js<boolean>(`!!document.querySelector('${bar('Ungroup')}')`)
  await tapEl('.ed-dock .ed-tool[aria-label="Layers"]')
  const grouped = await p.js<number>(`document.querySelectorAll('.ed-sheet .ed-row--group').length`), kids = await p.js<number>(`document.querySelectorAll('.ed-sheet .ed-row--child').length`)
  await tapEl('.ed-sheet-head [aria-label="Close"]')
  check('phone E2: SELECT + two layer rows in the LAYERS sheet + GROUP makes a group (and the bar offers UNGRP)', twoL.length === 2 && grouped === 1 && kids === 2 && ungroupBtn, `${twoL.length} layers, ${grouped} groups, ${kids} children`)
  await tapEl(bar('Select mode'))

  // copy / paste from the bar
  await p.js(`document.querySelector('[data-frame-label="${f1}"]').click()`); await sleep(200)
  const n1 = await count()
  const sel1 = (await picks()).join()
  await tapEl(bar('Copy'))
  const note = await h.text('.ed-note'), canPaste = await p.js<boolean>(`!document.querySelector('${bar('Paste')}').disabled`)
  await tapEl(bar('Paste'))
  const pasted = await count()
  await tapEl('.ed-top [aria-label="Undo"]')
  check('phone E2: COPY then PASTE adds a copy; undo removes it', pasted === n1 + 1 && (await count()) === n1, `picked ${sel1}; "${note}"; paste ${canPaste ? 'on' : 'off'}; ${n1} → ${pasted} → ${await count()}`)
  await p.shot(join(out, 'phone-04-e2.png'))
}

// ── E3: editing on canvas. One 80×80 frame (pitch 4): a paint layer (lattice 2, cells of ink .6 and 1), a
//    spec IR field placed into bounds (lattice 2), a sites ring, and a 5×7 text. Seeded through the autosave.
const TAU = Math.PI * 2
const E3 = { ring: 'e3ring', text: 'e3text', spec: 'e3spec', paint: 'e3paint' }
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
async function e3Open(p: Page, h: Helpers, tapEl?: (s: string) => Promise<void>) {
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

async function desktopE3(p: Page, h: Helpers) {
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

async function phoneE3(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
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

// ── E5: share. Frame and document links (made, opened once, kept across a reload and Back), their lineage in
//    CODE, the remix graph, EXPORT · DEVICES (every toDevice profile, exported) and QUALITY (scorecard, bar
//    sheet, loaded with the fold), a link too big for a URL, a corrupt link.
/** A document whose one frame holds 160×160 cells of noise: its link would be far past the cap. */
function bigDoc(): string {
  const card = blankCard({ cols: 160, rows: 160, pitch: 4 }, 'noise'), pl = paintLayer(card.grid, { name: 'noise', lattice: 1 }), cells = new Uint8Array(pl.cols * pl.rows)
  let s = 11
  for (let i = 0; i < cells.length; i++) { s = (s * 1103515245 + 12345) >>> 0; cells[i] = s >>> 24 }
  const d = addFrame({ kind: 'dot480.editor', v: EDITOR_VERSION, name: 'big', frames: [] }, card, { at: { x: 0, y: 0 } }).doc
  return JSON.stringify(addLayer(d, d.frames[0].id, { ...pl, cells: encodeCells(cells) }))
}
const linkRe = /\?make&d=[zb][A-Za-z0-9_-]+$/
/** EXPORT's fold opened by hand (its chunk loads then). */
const openFold = (p: Page, id: string) => p.js(`(() => { const d = document.querySelector('details[data-fold="${id}"]'); if (!d) throw new Error('no fold ${id}'); d.open = true })()`)
const reviewLoaded = (p: Page) => p.js<boolean>(`performance.getEntriesByType('resource').some(e => /\\/Review-[^/]*\\.js/.test(e.name))`)
async function e5Folds(p: Page, h: Helpers, who: string) {
  await openFold(p, 'editor-export-devices')
  const drawn = await p.waitFor(`(() => { const cs = [...document.querySelectorAll('.ed-insp .ed-devices canvas')]; return cs.length === 5 && cs.every(c => c.width > 0) && cs.some(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 120) return true; return false }) })()`, 30000)
  check(`${who}: EXPORT · DEVICES draws the frame on every device profile (toDevice)`, drawn && await reviewLoaded(p), (await p.js<string[]>(`[...document.querySelectorAll('.ed-insp .ed-devices figcaption')].map(f => f.textContent)`)).join(' | '))
  await openFold(p, 'editor-export-quality')
  const scored = await p.waitFor(`document.querySelectorAll('.ed-insp .ed-score li').length === 4 && /GATES PASS/.test(document.querySelector('.ed-insp .ed-score-sum')?.textContent ?? '')`, 30000)
  const bar = await p.waitFor(`(document.querySelector('.ed-insp .ed-bar canvas')?.width ?? 0) > 400`, 30000)
  check(`${who}: EXPORT · QUALITY shows the scorecard (4 gates, metrics) and draws the bar sheet`, scored && bar, await h.text('.ed-insp .ed-score-sum'))
}

async function desktopE5(p: Page, h: Helpers) {
  console.log('  · E5')
  const sel = () => p.js<string | undefined>(`window.__editor?.sel`)
  const count = async () => (await h.frameIds()).length
  // fold choices are remembered: start with both folded, so the review chunk loads only when one opens
  await p.cdp('Page.navigate', { url: `${base}?make` }); await p.waitFor(`!!document.querySelector('.ed-frame')`, 60000)
  await p.js(`localStorage.removeItem('dot480.editor.v1'); localStorage.removeItem('dot480.editor.links'); for (const k of ['editor-export-devices', 'editor-export-quality']) localStorage.removeItem('dot480:fold:' + k)`)
  await p.cdp('Page.reload'); await p.waitFor(`document.querySelectorAll('.ed-frame').length === 3`, 60000); await sleep(900)
  const [f0] = await h.frameIds(), n0 = await count()
  await p.js(`document.querySelector('[data-frame-label="${f0}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await sleep(300)
  check('E5: EXPORT has a LINK section, and the review folds are folded and not loaded', await p.js(`!!document.querySelector('.ed-insp section[aria-label="LINK"]')`) && !(await reviewLoaded(p)))
  await p.js(`window.__editorLink = ''`)
  await h.clickText('.ed-insp button', 'FRAME LINK')
  await p.waitFor(`/\\?make&d=/.test(window.__editorLink ?? '')`, 15000)
  const link = await p.js<string>(`window.__editorLink`), info = await h.text('.ed-insp .ed-url'), id = /#([0-9a-f]{8})/.exec(info)?.[1] ?? ''
  check('E5: FRAME LINK makes a deflated ?make&d=… link under the cap, shown with its length and id', linkRe.test(link) && link.length < 12000 && /FRAME LINK \d+ CHARS · DEFLATE · #[0-9a-f]{8}/.test(info) && await p.js(`document.querySelector('.ed-insp .ed-link-url').value`) === link, `${link.length} chars; ${info}`)

  // open it: one new frame, selected, drawn; a reload and Back keep it to one
  const opened = await h.go(link, `document.querySelectorAll('.ed-frame').length === ${n0 + 1} && !!window.__editor?.sel`)
  const ids1 = await h.frameIds(), got = ids1.find(x => x !== f0 && x === (ids1[ids1.length - 1]))!
  check('E5: opening the frame link adds the frame once, selects it and draws it', opened && await sel() === got && (await h.lit(got)).n > 500, `${n0} → ${ids1.length}; sel ${await sel()}`)
  await sleep(700); await p.cdp('Page.reload')
  await p.waitFor(`document.querySelectorAll('.ed-frame').length >= ${n0 + 1} && window.__editor?.sel === ${JSON.stringify(got)}`, 30000); await sleep(800)
  check('E5: a reload of the link re-selects its frame instead of adding a copy', await count() === n0 + 1 && await sel() === got, `${await count()} frames, sel ${await sel()}`)
  await p.js(`document.querySelector('#tab-EXPLORE').click()`); await sleep(900)
  const away = await p.js<string>('location.search')
  await p.js(`history.back()`)
  await p.waitFor(`!!document.querySelector('.ed-frame') && document.querySelectorAll('.ed-frame').length >= ${n0 + 1}`, 30000); await sleep(1000)
  check('E5: leaving MAKE drops the link from the URL; Back brings it and the editor back, still one copy', !/d=/.test(away) && /[?&]d=/.test(await p.js<string>('location.search')) && await count() === n0 + 1, `away ${away}; back ${await p.js<string>('location.search')}; ${await count()} frames`)

  // lineage: CODE names the link it came from; changed, its new link is a remix of it
  await p.js(`document.querySelector('[data-frame-label="${got}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'CODE'); await sleep(300)
  const lin = await h.text('.ed-insp .ed-lineage--list')
  check('E5: CODE shows the frame\'s link lineage (opened from #id)', !!id && lin.includes(`OPENED FROM #${id}`), lin)
  await h.clickText('.ed-right [role=tab]', 'DESIGN'); await h.setLabeled('NAME', 'level 03 remix'); await sleep(300)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await h.clickText('.ed-insp button', 'FRAME LINK'); await sleep(800)
  const remix = await h.text('.ed-insp .ed-url')
  check('E5: a changed frame\'s link records the link it came from (REMIX OF #id)', remix.includes(`REMIX OF #${id}`) && !remix.includes(`#${id} ·`), remix)

  // the whole document from the top bar, opened in a fresh browser profile's canvas
  await p.key('Escape', 'Escape', 27); await p.key('Escape', 'Escape', 27); await sleep(200)
  const nDoc = await count()
  await p.js(`window.__editorLink = ''`)
  await h.clickText('.ed-top button', 'SHARE'); await p.waitFor(`/\\?make&d=/.test(window.__editorLink ?? '')`, 15000)
  const docLink = await p.js<string>(`window.__editorLink`), note = await h.text('.ed-note')
  check('E5: SHARE with nothing selected copies a link of the whole document', !(await sel()) && linkRe.test(docLink) && /whole document/.test(note), `${docLink.length} chars; ${note}`)
  await sleep(700); await p.js(`localStorage.removeItem('dot480.editor.v1')`)
  const docOpened = await h.go(docLink, `document.querySelectorAll('.ed-frame').length >= ${3 + nDoc}`)
  check('E5: the document link opens every frame (beside the starter canvas of a fresh visit)', docOpened, `${await count()} frames, want ${3 + nDoc}`)

  // the review folds: every device, exported; the scorecard and the bar sheet
  await p.js(`document.querySelector('[data-frame-label="${(await h.frameIds())[0]}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await sleep(300)
  await e5Folds(p, h, 'E5')
  const before = p.downloads.length
  await h.clickText('.ed-insp button', 'EXPORT ALL DEVICES')
  const all = await h.downloaded(() => p.downloads.slice(before).filter(d => d.name.endsWith('.png')).length >= 5 && p.downloads.slice(before).some(d => d.name.endsWith('-plotter-device.svg')), 30000)
  check('E5: EXPORT ALL DEVICES writes a PNG per device (TRMNL at 800×480) and the plotter\'s pen plan', all && p.downloads.slice(before).some(d => d.name.endsWith('-trmnl-800x480.png')), p.downloads.slice(before).map(d => d.name).join(', '))
  await p.shot(join(out, 'desktop-e5-export.png'))

  // a link past the cap: refused with the reason; a corrupt link: a banner
  await p.js(`localStorage.setItem(${JSON.stringify(EDITOR_KEY)}, ${JSON.stringify(bigDoc())})`); await p.cdp('Page.navigate', { url: `${base}?make` })
  await p.waitFor(`document.querySelectorAll('.ed-frame').length === 1`, 60000); await sleep(800)
  await p.js(`document.querySelector('[data-frame-label="${(await h.frameIds())[0]}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await h.clickText('.ed-insp button', 'FRAME LINK'); await sleep(1500)
  check('E5: a frame too big for a link is refused with its length (DOWNLOAD JSON offered)', /more than 12000/.test(await h.text('.ed-insp .ed-bad')) && /DOWNLOAD JSON/.test(await h.text('.ed-insp .ed-bad')), await h.text('.ed-insp .ed-bad'))
  await p.cdp('Page.navigate', { url: `${base}?make&d=zNotARealLink` })
  check('E5: a corrupt frame link shows an error banner and adds nothing', await p.waitFor(`/Could not open/.test(document.querySelector('.ed-banner')?.textContent ?? '')`, 30000) && await count() === 1, await h.text('.ed-banner'))

  // remix graph: a changed program's link goes under the program it came from; a node opens a program
  check('E5: ?make=code opens a code layer', await h.fresh(`${base}?make=code`) && await p.waitFor(`!!document.querySelector('.ed-insp .dw-code textarea')`))
  await p.waitFor(`Number(document.querySelector('.ed-insp .ed-graph canvas')?.dataset.nodes) >= 8`, 15000)
  const nodes0 = Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.nodes`))
  await h.typeIR(PROGRAM.replace('blobs:', 'blobs e5:')); await h.blur()
  // the link is encoded (debounced) after the typing: COPY LINK is enabled once it is ready
  await p.waitFor(`(() => { const b = [...document.querySelectorAll('.ed-insp button')].find(b => b.textContent.trim() === 'COPY LINK'); return !!b && !b.disabled })()`, 30000)
  await h.clickText('.ed-insp button', 'COPY LINK')
  await p.waitFor(`Number(document.querySelector('.ed-insp .ed-graph canvas')?.dataset.nodes) === ${nodes0 + 1}`, 30000)
  const remixes = await p.js<string[]>(`[...document.querySelectorAll('.ed-insp .ed-remixes button')].map(b => b.textContent)`)
  check('E5: COPY LINK puts the program in the remix graph, under the example it came from', remixes.length >= 1 && remixes.some(r => /^blobs e5.*← #[0-9a-f]{8}/.test(r)) && Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.nodes`)) === nodes0 + 1, `nodes ${nodes0}; ${remixes.join(' | ')}`)
  await p.js(`document.querySelector('.ed-insp .ed-graph canvas').scrollIntoView({ block: 'center' })`); await sleep(300) // REMIX sits below the code editor
  const n1 = await count(), g = (await h.rect('.ed-insp .ed-graph canvas'))!, cols = Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.cols`)), rows = Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.rows`))
  // the second example's thumbnail: slot 1 of row 0 (centre at lattice cell 32, 11 on a 2× lattice)
  await p.mouse('mouseMoved', g.x + g.w * (64 / cols), g.y + g.h * (22 / rows), 0); await p.mouse('mousePressed', g.x + g.w * (64 / cols), g.y + g.h * (22 / rows)); await p.mouse('mouseReleased', g.x + g.w * (64 / cols), g.y + g.h * (22 / rows)); await p.waitFor(`document.querySelectorAll('.ed-frame').length === ${n1 + 1}`, 15000)
  check('E5: a click on a node in the remix graph opens that program as a frame', await count() === n1 + 1, `${n1} → ${await count()}`)
  await p.shot(join(out, 'desktop-e5-remix.png'))
}

async function phoneE5(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
  console.log('  · E5')
  const count = async () => (await h.frameIds()).length
  const ok = await h.fresh(`${base}?make`)
  const [, f1] = await h.frameIds(), n0 = await count()
  await p.js(`document.querySelector('[data-frame-label="${f1}"]').click()`); await sleep(300)
  await p.js(`window.__editorLink = ''`)
  await tapEl('.ed-top [aria-label="Share or export"]'); await sleep(900)
  const link = await p.js<string>(`window.__editorLink ?? ''`)
  check('phone E5: SHARE on the selected frame makes a frame link', ok && linkRe.test(link), `${link.length} chars`)
  if (await p.js(`!!document.querySelector('.ed-sheet')`)) await tapEl('.ed-sheet-head [aria-label="Close"]')
  const opened = await h.go(link, `document.querySelectorAll('.ed-frame').length === ${n0 + 1} && !!window.__editor?.sel`)
  const got = (await h.frameIds())[n0]
  check('phone E5: the link opens on the phone: one new frame, selected and drawn, no horizontal overflow', opened && await p.js(`window.__editor?.sel`) === got && (await h.lit(got)).n > 100 && await p.js(`document.documentElement.scrollWidth <= 390`))
  await sleep(700); await p.cdp('Page.reload')
  await p.waitFor(`document.querySelectorAll('.ed-frame').length >= ${n0 + 1} && window.__editor?.sel === ${JSON.stringify(got)}`, 30000); await sleep(800)
  check('phone E5: a reload of the link keeps one copy, selected', await count() === n0 + 1 && await p.js(`window.__editor?.sel`) === got)
  await tapEl('.ed-top [aria-label="Leave the editor"]'); await sleep(900)
  const away = await p.js<string>('location.search')
  await p.js(`history.back()`)
  await p.waitFor(`!!document.querySelector('.ed-root.is-phone .ed-frame') && document.querySelectorAll('.ed-frame').length >= ${n0 + 1}`, 30000); await sleep(1000)
  check('phone E5: leaving drops the link from the URL; Back opens the editor on it again, still one copy', !/d=/.test(away) && /[?&]d=/.test(await p.js<string>('location.search')) && await count() === n0 + 1, `away ${away}; ${await count()} frames`)

  // EXPORT · LINK, DEVICES and QUALITY in the sheet
  await p.js(`document.querySelector('[data-frame-label="${got}"]').click()`); await sleep(300)
  await tapEl('.ed-dock [aria-label^="Inspector"]'); await tapEl('.ed-sheet #ed-tab-export')
  await p.js(`document.querySelector('.ed-sheet section[aria-label="LINK"]').scrollIntoView()`); await sleep(200)
  await tapEl('.ed-sheet section[aria-label="LINK"] .ed-row-btns button')
  await p.waitFor(`!!document.querySelector('.ed-sheet .ed-link-url')`, 15000)
  const small = await p.js<string[]>(`[...document.querySelectorAll('.ed-sheet section[aria-label="LINK"] button, .ed-sheet .ed-link-url')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent || b.className)`)
  check('phone E5: EXPORT · LINK in the sheet: the link is shown to copy by hand; its targets are ≥ 44 px', linkRe.test(await p.js<string>(`document.querySelector('.ed-sheet .ed-link-url').value`)) && !small.length, small.join(', '))
  await e5Folds(p, h, 'phone E5')
  check('phone E5: the sheet does not overflow sideways with the review folds open', await p.js(`(() => { const b = document.querySelector('.ed-sheet-body'); return b.scrollWidth <= b.clientWidth + 1 })()`))
  await p.shot(join(out, 'phone-e5-export.png'))
  await tapEl('.ed-sheet-head [aria-label="Close"]')
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
async function phone() {
  console.log('\n── phone 390×844, touch')
  const W = 390, H = 844
  const p = await launch(W, H), h = helpers(p)
  const tapEl = async (s: string) => { const r = await h.rect(s); if (!r) throw new Error(`no ${s}`); await p.tap(...mid(r)); await sleep(350) }
  const dockTool = (name: string) => `.ed-dock .ed-tool[aria-label^="${name}"]`
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
    await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await p.allowDownloads(out)
    const opened = await h.fresh(`${base}?make`)
    check('phone: ?make opens the full-screen editor', opened && await p.js(`!!document.querySelector('.ed-root.is-phone')`), opened ? '' : p.logs.join(' | '))
    if (!opened) { await p.shot(join(out, 'phone-00-failed.png')); return }
    await sleep(1200)

    // ── chrome: the site bar steps aside; dock + top bar are ≥ 44 px, inside the screen, uncovered; no overflow
    const hidden = await p.js<boolean>(`[...document.querySelectorAll('.tabbar, .topbar')].every(e => getComputedStyle(e).display === 'none')`)
    const dock = (await h.rect('.ed-dock'))!, top = (await h.rect('.ed-top'))!
    const small = await p.js<string[]>(`[...document.querySelectorAll('.ed-dock button, .ed-top button')].map(b => { const r = b.getBoundingClientRect(); return [b.getAttribute('aria-label') ?? b.textContent, Math.round(r.width), Math.round(r.height)] }).filter(([, w, h]) => w < 44 || h < 44).map(x => x.join(' '))`)
    check('phone: the site tab bar steps aside while the editor is full screen', hidden)
    check('phone: the dock sits inside the screen, below the top bar, every button ≥ 44 px and uncovered', dock.x >= 0 && dock.r <= W && dock.b <= H && dock.y > top.b && !small.length && await h.uncovered('.ed-dock button') && await h.uncovered('.ed-top button'), `dock ${Math.round(dock.x)}..${Math.round(dock.r)} × ${Math.round(dock.y)}..${Math.round(dock.b)}; small: ${small.join(', ')}`)
    check('phone: no horizontal overflow', await p.js(`document.documentElement.scrollWidth <= ${W}`))
    await p.shot(join(out, 'phone-01-open.png'))

    // ── touch: tap selects on release; one finger on an unselected frame pans; on the selected one it moves it
    const fitAll = async () => { await tapEl('.ed-zoom-pct'); await p.js(`[...document.querySelectorAll('.ed-menu button')].find(b => b.textContent.startsWith('Zoom to fit')).click()`); await sleep(400) }
    await fitAll()
    const [f0, f1] = await h.frameIds(), a = (await h.frameRect(f0))!
    await p.tap(a.x + a.w / 2, a.y + a.h / 2); await sleep(300)
    check('phone: a tap selects the frame under it', await h.sel() === f0)
    const b0 = (await h.frameRect(f1))!, a0 = (await h.frameRect(f0))!
    const [sx, sy] = mid(b0)
    await p.touch(Array.from({ length: 9 }, (_, i) => [[sx - i * 10, sy]]))
    await sleep(300)
    const b1 = (await h.frameRect(f1))!, a1 = (await h.frameRect(f0))!
    check('phone: a drag that starts on an unselected frame pans the canvas (both frames move, selection kept)', near(b1.x - b0.x, -80, 2) && near(a1.x - a0.x, -80, 2) && await h.sel() === f0, `${(b1.x - b0.x).toFixed(1)}`)
    const ax = a1.x + a1.w / 2, ay = a1.y + a1.h / 2
    await p.touch(Array.from({ length: 9 }, (_, i) => [[ax + i * 5, ay + i * 5]]))
    await sleep(300)
    const a2 = (await h.frameRect(f0))!, b2 = (await h.frameRect(f1))!
    check('phone: dragging the selected frame moves it (the others stay)', a2.x - a1.x > 20 && a2.y - a1.y > 20 && near(b2.x, b1.x), `${(a2.x - a1.x).toFixed(1)}, ${(a2.y - a1.y).toFixed(1)}`)
    await tapEl('.ed-top [aria-label="Undo"]')
    const a3 = (await h.frameRect(f0))!
    check('phone: the top bar undo puts it back', near(a3.x, a1.x) && near(a3.y, a1.y))

    // ── pinch: two fingers apart zoom in
    const z0 = await h.text('.ed-zoom-pct')
    await p.touch(Array.from({ length: 9 }, (_, i) => [[190 - i * 8, 420 - i * 8], [210 + i * 8, 440 + i * 8]]))
    await sleep(300)
    const z1 = await h.text('.ed-zoom-pct')
    check('phone: pinching apart zooms in', parseInt(z1) > parseInt(z0) * 1.5, `${z0} → ${z1}`)
    await fitAll()

    // ── dock tools: Frame (drag out), resize by touch, Draw (stroke), Text, Code
    const ids0 = await h.frameIds()
    await tapEl(dockTool('Frame'))
    check('phone: the dock picks the Frame tool', (await h.tool()).startsWith('Frame'))
    await p.touch(Array.from({ length: 11 }, (_, i) => [[60 + i * 24, 180 + i * 22]])); await sleep(800)
    const N = (await h.frameIds()).find(id => !ids0.includes(id))!
    check('phone: dragging with the Frame tool makes a new frame, selected, back on Move', !!N && await h.sel() === N && (await h.tool()).startsWith('Move'), await h.sizeOf(N))
    const s0 = await h.sizeOf(N), se = (await h.rect('.ed-handle.se'))!
    await p.touch(Array.from({ length: 7 }, (_, i) => [[mid(se)[0] + i * 6, mid(se)[1] + i * 6]])); await sleep(400)
    const s1 = await h.sizeOf(N)
    await tapEl('.ed-top [aria-label="Undo"]'); const s2 = await h.sizeOf(N)
    await tapEl('.ed-top [aria-label="Redo"]'); const s3 = await h.sizeOf(N)
    check('phone: a corner handle resizes by touch; undo / redo step it', s1 !== s0 && s2 === s0 && s3 === s1, `${s0} → ${s1} → ${s2} → ${s3}`)
    let fr = (await h.frameRect(N))!
    const empty = await h.lit(N)
    await tapEl(dockTool('Draw'))
    await p.touch(Array.from({ length: 12 }, (_, i) => [[fr.x + fr.w * (.2 + i * .05), fr.y + fr.h * .45]])); await sleep(500)
    const painted = await h.lit(N)
    check('phone: a one-finger stroke with Draw paints dots', painted.n > empty.n + 30, `${empty.n} → ${painted.n}`)
    await tapEl('.ed-top [aria-label="Undo"]')
    const unpainted = await h.lit(N)
    await tapEl('.ed-top [aria-label="Redo"]')
    check('phone: undo / redo the stroke', unpainted.n <= empty.n + 5 && (await h.lit(N)).n === painted.n, `${unpainted.n}`)

    // text: typed on the canvas (no sheet over it), then the inspector sheet shows it on DESIGN
    await tapEl(dockTool('Text'))
    fr = (await h.frameRect(N))!
    await p.tap(fr.x + fr.w * .4, fr.y + fr.h * .2); await sleep(700) // the top of the frame: clear of the other frames' labels
    const inPlace = await p.js<boolean>(`document.activeElement?.matches('.ed-intext.on') ?? false`), noSheet = !(await p.js(`!!document.querySelector('.ed-sheet')`))
    await p.cdp('Input.insertText', { text: 'HI' }); await sleep(300); await h.blur()
    await tapEl('.ed-dock .ed-tool[aria-label^="Inspector"]')
    check('phone: the Text tool types on the canvas (no sheet); the inspector sheet then shows the text on DESIGN', inPlace && noSheet && await h.tab('.ed-sheet') === 'DESIGN' && await p.js(`document.querySelector('.ed-sheet [data-focus="text"]')?.value === 'HI'`))

    // ── sheets: at every detent the top bar and the sheet's own tab bar stay uncovered, the selection in view
    const geom = async () => {
      await sleep(700)
      const sh = (await h.rect('.ed-sheet'))!, tb = (await h.rect('.ed-top'))!, f = (await h.frameRect(N))!
      return { top: Math.round(sh.y), ok: sh.y >= tb.b && await h.uncovered('.ed-sheet .ed-tabs--sheet [role=tab]') && await h.uncovered('.ed-top button') && !(await p.js(`!!document.querySelector('.ed-dock')`)), inView: f.b <= sh.y + 2 && f.y >= tb.b - 2 }
    }
    // detents 60 % → (tap the handle) 90 % → 36 %; at 90 % there is no canvas left to keep the frame in
    const det: { top: number; ok: boolean; inView: boolean }[] = [await geom()]
    for (let i = 0; i < 2; i++) { await tapEl('.ed-sheet-grab'); det.push(await geom()) }
    check('phone: at every sheet detent the top bar and the sheet\'s tab bar are uncovered (the dock steps aside)', det.every(d => d.ok) && new Set(det.map(d => d.top)).size === 3, JSON.stringify(det))
    check('phone: the selected frame stays in view above the sheet (60 % and 36 % detents)', det[0].inView && det[2].inView, JSON.stringify(det.map(d => d.inView)))
    await p.shot(join(out, 'phone-02-sheet.png'))
    await tapEl('.ed-sheet-head [aria-label="Close"]')
    check('phone: closing the sheet brings the dock back', !(await p.js(`!!document.querySelector('.ed-sheet')`)) && await p.js(`!!document.querySelector('.ed-dock')`))

    // code: the sheet opens on CODE (tall detent); a program compiles there
    await tapEl(dockTool('Code'))
    fr = (await h.frameRect(N))!
    await p.tap(fr.x + fr.w / 2, fr.y + fr.h / 3); await sleep(800)
    check('phone: the Code tool opens the sheet on CODE', await h.tab('.ed-sheet') === 'CODE' && await p.js(`!!document.querySelector('.ed-sheet .dw-code textarea')`))
    await h.typeIR(PROGRAM); await h.blur()
    check('phone: CODE compiles in the sheet', /OK/.test(await h.text('.ed-insp .dw-status')), await h.text('.ed-insp .dw-status'))
    await tapEl('.ed-sheet-head [aria-label="Close"]')

    // ── share: a selected frame gets a frame link (E5; copied, or EXPORT · LINK opens to copy it by hand); PNG downloads
    await p.js(`window.__editorLink = ''`)
    await tapEl('.ed-top [aria-label="Share or export"]'); await sleep(800)
    const plink = await p.js<string>(`window.__editorLink ?? ''`)
    check('phone: SHARE on a frame makes a frame link (?make&d=…), copied or shown in EXPORT · LINK', /\?make&d=[zb][A-Za-z0-9_-]+$/.test(plink) && (!(await p.js(`!!document.querySelector('.ed-sheet')`)) || await h.tab('.ed-sheet') === 'EXPORT'), `${plink.length} chars`)
    if (!(await p.js(`!!document.querySelector('.ed-sheet')`))) await tapEl('.ed-dock [aria-label^="Inspector"]')
    await tapEl('.ed-sheet #ed-tab-export')
    check('phone: the inspector sheet opens on EXPORT', await h.tab('.ed-sheet') === 'EXPORT')
    await tapEl('.ed-sheet .ed-insp button.ed-primary')
    check('phone: EXPORT PNG downloads (tapped)', await h.downloaded(d => d.name.endsWith('.png') && d.bytes > 1000), JSON.stringify(p.downloads))
    await tapEl('.ed-sheet-head [aria-label="Close"]')

    // ── ASSETS / LAYERS sheets
    const n0 = (await h.frameIds()).length
    await tapEl('.ed-top [aria-label="Insert from assets"]')
    const assets = await p.js<boolean>(`!!document.querySelector('.ed-sheet[aria-label="ASSETS"]')`)
    await p.js(`[...document.querySelectorAll('.ed-agroup[aria-label="Programs"] .ed-asset')][1].click()`); await sleep(1000)
    check('phone: ASSETS sheet inserts a frame and closes', assets && (await h.frameIds()).length === n0 + 1 && !(await p.js(`!!document.querySelector('.ed-sheet')`)))
    await tapEl('.ed-dock .ed-tool[aria-label="Layers"]')
    check('phone: the LAYERS sheet lists the frames', await p.js(`!!document.querySelector('.ed-sheet[aria-label="LAYERS"]') && document.querySelectorAll('.ed-sheet .ed-tree-frame').length === ${n0 + 1}`))
    await tapEl('.ed-sheet-head [aria-label="Close"]')
    check('phone: no tap target under 44 px in the dock, top bar or sheet header', !(await p.js<string[]>(`[...document.querySelectorAll('.ed-dock button, .ed-top button, .ed-sheet-head button')].filter(b => { const r = b.getBoundingClientRect(); return r.width && (r.width < 44 || r.height < 44) }).map(b => b.getAttribute('aria-label'))`)).length)

    await phoneE2(p, h, tapEl)

    // ── old links on the phone
    const code = await h.go(`${base}?make=code`, `!!document.querySelector('.ed-sheet .dw-code textarea')`)
    check('phone: ?make=code opens the CODE sheet on a code layer', code && await h.tab('.ed-sheet') === 'CODE')
    await h.go(`${base}?tab=draw`)
    check('phone: ?tab=draw opens on the Draw tool (dock, no sheet)', (await h.tool()).startsWith('Draw') && !(await p.js(`!!document.querySelector('.ed-sheet')`)) && await p.js(`location.search === '?make=draw'`))
    await h.go(`${base}?tab=studio`)
    check('phone: ?tab=studio opens on Move', (await h.tool()).startsWith('Move') && await p.js(`location.search === '?make=compose'`))

    await phoneE3(p, h, tapEl) // after the old links: it replaces the document with its own
    await phoneE5(p, h, tapEl)

    // ── leaving: the site's tab bar comes back, uncovered
    await tapEl('.ed-top [aria-label="Leave the editor"]'); await sleep(800)
    const back = await p.js<boolean>(`!document.querySelector('.ed-root') && getComputedStyle(document.querySelector('.tabbar')).display !== 'none'`)
    check('phone: leaving the editor brings back the site tab bar, uncovered', back && await h.uncovered('.tabbar button'), await p.js('location.href'))
    await p.shot(join(out, 'phone-03-left.png'))
    check('phone: no uncaught errors or console errors', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
  } catch (e) {
    check('phone run', false, String(e)); await p.shot(join(out, 'phone-99-error.png')).catch(() => null)
  } finally { await p.close() }
}

try {
  if (only !== 'phone') await desktop()
  if (only !== 'desktop') await phone()
} finally { server?.stop() }
console.log(failures ? `\n${failures} editor browser check(s) failed, ${passes} passed` : `\nAll ${passes} editor browser checks passed`)
process.exit(failures ? 1 : 0)
