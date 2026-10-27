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
 *
 * `npx vite build && npx tsx scripts/editor-browser.ts [baseUrl] [--only desktop|phone]`: with no URL it
 * serves `dist/` itself (`vite preview`, port 4319) and stops it at the end. Screenshots and downloads
 * go to `.snapshots/editor/`. Chrome: $CHROME or the usual install paths.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { encodeShare } from '../src/lib/share'
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
  /** The element at a rect's centre is that element (or inside it): nothing covers it. */
  const uncovered = (s: string) => p.js<boolean>(`[...document.querySelectorAll(${q(s)})].every(e => { const r = e.getBoundingClientRect(); if (!r.width) return false; const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !!hit && (hit === e || e.contains(hit)) })`)
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

    // ── text: T + click adds a text layer and focuses its field
    await p.key('t', 'KeyT', 84)
    await p.mouse('mouseMoved', fr.x + 16, fr.y + fr.h * .75, 0); await p.mouse('mousePressed', fr.x + 16, fr.y + fr.h * .75); await p.mouse('mouseReleased', fr.x + 16, fr.y + fr.h * .75); await sleep(500)
    const focused = await p.js<boolean>(`document.activeElement?.matches('.ed-insp [data-focus="text"]') ?? false`)
    await p.cdp('Input.insertText', { text: 'dot' }); await sleep(400)
    const withText = await h.lit(N)
    await h.blur()
    check('the Text tool adds a text layer, focuses it and draws what is typed (upper case)', focused && (await h.layerRows())[0]?.startsWith('TEXT') && await p.js(`document.querySelector('.ed-insp [data-focus="text"]').value === 'DOT'`) && withText.sig !== erased.sig && (await h.tool()).startsWith('Move'))

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
    check('desktop: no uncaught errors or console errors', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
  } catch (e) {
    check('desktop run', false, String(e)); await p.shot(join(out, 'desktop-99-error.png')).catch(() => null)
  } finally { await p.close() }
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

    // text: the sheet opens on DESIGN with the text field focused
    await tapEl(dockTool('Text'))
    fr = (await h.frameRect(N))!
    await p.tap(fr.x + fr.w * .4, fr.y + fr.h * .2); await sleep(700) // the top of the frame: clear of the other frames' labels
    const sheetOpen = await p.js<boolean>(`!!document.querySelector('.ed-sheet[aria-label="Inspector"]')`)
    check('phone: the Text tool opens the inspector sheet on DESIGN with its text field focused', sheetOpen && await h.tab('.ed-sheet') === 'DESIGN' && await p.js(`document.activeElement?.matches('[data-focus="text"]') ?? false`))
    await p.cdp('Input.insertText', { text: 'HI' }); await sleep(300); await h.blur()

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

    // ── share falls back to EXPORT for a frame that is not on a share grid; PNG downloads
    await tapEl('.ed-top [aria-label="Share or export"]'); await sleep(400)
    check('phone: SHARE on a non-share frame opens the sheet on EXPORT', await h.tab('.ed-sheet') === 'EXPORT')
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

    // ── old links on the phone
    const code = await h.go(`${base}?make=code`, `!!document.querySelector('.ed-sheet .dw-code textarea')`)
    check('phone: ?make=code opens the CODE sheet on a code layer', code && await h.tab('.ed-sheet') === 'CODE')
    await h.go(`${base}?tab=draw`)
    check('phone: ?tab=draw opens on the Draw tool (dock, no sheet)', (await h.tool()).startsWith('Draw') && !(await p.js(`!!document.querySelector('.ed-sheet')`)) && await p.js(`location.search === '?make=draw'`))
    await h.go(`${base}?tab=studio`)
    check('phone: ?tab=studio opens on Move', (await h.tool()).startsWith('Move') && await p.js(`location.search === '?make=compose'`))

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
