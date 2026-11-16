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
 *  E6 (phone): a long press opens the menu (not under the finger, 44 px items, taps only after the lift);
 *           FORWARD / TO FRONT / TO BACK / DUPLICATE / DELETE for frames, one undo step each; a moving finger
 *           or two fingers open nothing; a tap outside closes it; a layer's menu holds its quick bar; the
 *           snap cue lights accent dots on the pasteboard while a drag snaps, then they go; the sheet keeps
 *           its detent per panel (and after a reload); the keyboard (a stubbed `visualViewport`) never covers
 *           the CODE sheet or the caret of text typed in place; SHARE through a stubbed `navigator.share`:
 *           shared, cancelled (no error), refused (the clipboard / EXPORT · LINK), hung (the next SHARE copies).
 *  landscape (844×390, touch): the dock and the selection bar share the bottom row, nothing overlaps or
 *           overflows, the inspector is a side sheet under the top bar with the selection kept in view
 *           beside it, and the long-press menu stays inside the screen.
 *
 * `npx vite build && npx tsx scripts/editor-browser.ts [baseUrl] [--only desktop,phone,landscape]`: with no URL it
 * serves `dist/` itself (`vite preview`, port 4319) and stops it at the end. Screenshots and downloads
 * go to `.snapshots/editor/`. Chrome: $CHROME or the usual install paths.
 *
 * This file runs the desktop pass. The shared helpers, the phone passes and the E2 / E3 / E5 / E6 checks live in
 * `scripts/editor-browser/`, one file per phase.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { encodeShare } from '../src/lib/share'
import { findChrome, launch, serveDist, sleep } from './lib/cdp'
import { desktopE2 } from './editor-browser/e2'
import { desktopE3 } from './editor-browser/e3'
import { desktopE5 } from './editor-browser/e5'
import { desktopFit } from './editor-browser/fit'
import { landscape, phone } from './editor-browser/phone'
import { base, check, failures, helpers, mid, near, out, passes, PROGRAM, setBase } from './editor-browser/shared'

const args = process.argv.slice(2), onlyAt = args.indexOf('--only'), only = onlyAt >= 0 ? args[onlyAt + 1] : undefined
const want = (pass: string) => !only || only.split(',').includes(pass)
const urlArg = args.find((a, i) => /^https?:/.test(a) && !(onlyAt >= 0 && i === onlyAt + 1)) // a base URL anywhere but after --only
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const server = urlArg ? undefined : await serveDist(4319)
setBase((urlArg ?? server!.url).replace(/\/?$/, '/'))

// ─────────────────────────────────────────────────────────────────────────────────────────────────
async function desktop() {
  console.log('\n── desktop 1440×900')
  const p = await launch(1440, 900), h = helpers(p)
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    // every note the editor shows (each clears itself after a few seconds), so a failed autosave check can say why
    await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__notes = []; new MutationObserver(() => { const n = document.querySelector('.ed-note')?.textContent; if (n && window.__notes.at(-1) !== n) window.__notes.push(n) }).observe(document, { subtree: true, childList: true, characterData: true })` })
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
    // B6-3: another tab saves a different document; the note shows with RELOAD and KEEP MINE, KEEP MINE clears it
    await p.js(`window.dispatchEvent(new StorageEvent('storage', { key: 'dot480.editor.v1', newValue: '{"kind":"other tab"}' })), 1`)
    const otherTab = await p.waitFor(`/Changed in another tab/.test(document.querySelector('.ed-other')?.textContent ?? '') && document.querySelectorAll('.ed-other button').length === 2`, 5000)
    await p.shot(join(out, 'desktop-01-other-tab.png'))
    await p.js(`[...document.querySelectorAll('.ed-other button')].find(b => b.textContent === 'KEEP MINE')?.click(), 1`)
    check('another tab\'s save shows "Changed in another tab" with RELOAD and KEEP MINE; KEEP MINE clears it (B6-3)', otherTab && await p.waitFor(`document.querySelector('.ed-other')?.childElementCount === 0`, 3000) && (await h.frameIds()).length === 3)
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
    // wait for the frame itself to be drawn at t (the render loop's `__editor.tl`) and the readout to follow, never
    // a fixed sleep: idle work or a busy box can hold the next draw past any delay (#28)
    const scrub = async (t: number) => {
      await h.setValue('.ed-transport input', t)
      const drawn = await p.waitFor(`window.__editor?.tl?.[${JSON.stringify(N)}] === ${t} && !!document.querySelector('.ed-t')?.textContent?.includes(${JSON.stringify(t.toFixed(2))})`, 15000)
      return { drawn, ...await h.lit(N) }
    }
    const t0 = await scrub(.03), t1 = await scrub(.9)
    check('ANIMATE: scrubbing t redraws the frame (the enter track reveals it)', t0.drawn && t1.drawn && t0.sig !== t1.sig && t0.n < t1.n, `t .03: ${t0.drawn ? t0.n : 'never drawn'}, t .9: ${t1.drawn ? t1.n : 'never drawn'}`)

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
    check('opening the link asks first, then KEEP shows the same program', await h.keep(link, `document.querySelector('.ed-insp .dw-code textarea')?.value === ${JSON.stringify(PROGRAM)}`))
    const n1 = (await h.frameIds()).length
    // a kept link frame is saved only once it drew within the program budget (#142): wait for that save, as a
    // visitor's reload would come after it (a slow runner can take longer than the autosave's 500 ms)
    const saved = await p.waitFor(`(JSON.parse(localStorage.getItem('dot480.editor.v1') ?? '{}').frames?.length ?? -1) === ${n1}`, 15000)
    const notes = saved ? '' : await p.js<string>(`(window.__notes ?? []).join(' | ')`)
    check('the kept link frame is autosaved (once it drew within budget)', saved, `${n1} frames on screen${notes && `; notes: ${notes}`}`)
    // without the save a reload drops the frame by design (#142), so the re-open check would test nothing
    if (saved) {
      await h.go(link, `!!document.querySelector('.ed-insp .dw-code textarea')`); await sleep(600)
      check('opening the same link again re-selects its frame instead of adding a copy', (await h.frameIds()).length === n1 && n1 <= n0 + 1, `${n0} → ${n1} → ${(await h.frameIds()).length}`)
    }
    await h.clickText('.ed-left [role=tab]', 'ASSETS'); await sleep(300)
    await h.clickText('.ed-agroup[aria-label="Programs"] .ed-asset', 'rain'); await sleep(1200)
    const sliders = await p.js<string[]>(`[...document.querySelectorAll('.ed-insp .ed-slider > label')].map(s => s.firstChild.textContent)`)
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
    await h.keep(`${base}?tab=dots&p=${bad}`, `!!document.querySelector('.dw-error')`); await sleep(600)
    check('an invalid shared program shows its IR error and is not run', /^1:\d+/.test(await h.text('.dw-error')) && (await h.lit()).n === 0, await h.text('.dw-error'))
    await p.shot(join(out, 'desktop-04-links.png'))
    await desktopFit(p)
    await desktopE2(p, h)
    await desktopE3(p, h)
    await desktopE5(p, h)
    check('desktop: no uncaught errors or console errors', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
  } catch (e) {
    check('desktop run', false, String(e)); await p.shot(join(out, 'desktop-99-error.png')).catch(() => null)
  } finally { await p.close() }
}

try {
  if (want('desktop')) await desktop()
  if (want('phone')) await phone()
  if (want('landscape')) await landscape()
} finally { server?.stop() }
console.log(failures ? `\n${failures} editor browser check(s) failed, ${passes} passed` : `\nAll ${passes} editor browser checks passed`)
process.exit(failures ? 1 : 0)
