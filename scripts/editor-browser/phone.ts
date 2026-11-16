/** The phone passes, upright (390×844) and on its side (844×390), both touch (scripts/editor-browser.ts). */
import { join } from 'node:path'
import { launch, sleep } from '../lib/cdp'
import { phoneE3 } from './e3'
import { phoneE2 } from './e2'
import { phoneE5 } from './e5'
import { E6_STUBS, holdAt, MENU, phoneE6 } from './e6'
import { base, check, helpers, mid, near, out, PROGRAM } from './shared'

/** A phone on its side: the dock and the selection bar on one row, a side sheet, the menu inside the screen. */
export async function landscape() {
  console.log('\n── phone on its side 844×390, touch')
  const W = 844, H = 390
  const p = await launch(W, H), h = helpers(p)
  const tapEl = async (s: string) => { const r = await h.rect(s); if (!r) throw new Error(`no ${s}`); await p.tap(...mid(r)); await sleep(350) }
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'landscapePrimary', angle: 90 } })
    await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: E6_STUBS })
    const opened = await h.fresh(`${base}?make`)
    check('landscape: ?make opens the full-screen phone editor on its side', opened && await p.js(`!!document.querySelector('.ed-root.is-phone.is-landscape')`), opened ? '' : p.logs.join(' | '))
    if (!opened) return
    await sleep(1000)
    const dock = (await h.rect('.ed-dock'))!, bar = (await h.rect('.ed-selbar'))!, top = (await h.rect('.ed-top'))!
    const small = await p.js<string[]>(`[...document.querySelectorAll('.ed-dock button, .ed-top button, .ed-selbar button')].filter(b => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44 }).map(b => b.getAttribute('aria-label'))`)
    check('landscape: the dock (left) and the selection bar (right) share the bottom row without overlapping; every target ≥ 44 px and uncovered', near(dock.b, bar.b, 2) && dock.r <= bar.x && dock.x >= 0 && bar.r <= W && dock.y > top.b && !small.length && await h.uncovered('.ed-dock button') && await h.uncovered('.ed-selbar button') && await h.uncovered('.ed-top button'), JSON.stringify({ dock, bar, small }))
    check('landscape: no horizontal overflow; the site bar steps aside', await p.js(`document.documentElement.scrollWidth <= ${W}`) && await p.js<boolean>(`[...document.querySelectorAll('.tabbar, .topbar')].every(e => getComputedStyle(e).display === 'none')`))
    await p.shot(join(out, 'landscape-01-open.png'))
    const [f0] = await h.frameIds(), a = (await h.frameRect(f0))!
    await p.tap(...mid(a)); await sleep(300)
    await tapEl('.ed-dock .ed-tool[aria-label^="Inspector"]'); await sleep(700)
    const sh = (await h.rect('.ed-sheet--side'))!, f = (await h.frameRect(f0))!
    check('landscape: the inspector is a side sheet: right edge, under the top bar to the bottom, its tabs and the top bar uncovered, no dock behind it', !!sh && near(sh.r, W, 1) && sh.x > W * .45 && sh.y >= top.b - 1 && near(sh.b, H, 1) && await h.uncovered('.ed-sheet .ed-tabs--sheet [role=tab]') && await h.uncovered('.ed-top button') && !(await p.js(`!!document.querySelector('.ed-dock')`)), JSON.stringify(sh))
    check('landscape: the selected frame stays in view beside the side sheet', f.r <= sh.x + 2 && f.x >= -2 && f.y >= top.b - 2 && f.b <= H + 2, JSON.stringify({ f, sheet: sh.x }))
    await p.shot(join(out, 'landscape-02-side-sheet.png'))
    await tapEl('.ed-sheet-head [aria-label="Close"]')
    const a2 = (await h.frameRect(f0))!
    await holdAt(p, ...mid(a2))
    const m = await h.rect(MENU)
    check('landscape: a long press opens the menu inside the screen, under the top bar', !!m && m.x >= 0 && m.r <= W && m.y >= 0 && m.b <= H, JSON.stringify(m))
    await p.shot(join(out, 'landscape-03-menu.png'))
    await p.tap(8, H / 2); await sleep(300)
    check('landscape: no uncaught errors or console errors', p.logs.length === 0, p.logs.slice(0, 3).join(' | '))
  } catch (e) {
    check('landscape run', false, String(e)); await p.shot(join(out, 'landscape-99-error.png')).catch(() => null)
  } finally { await p.close() }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
export async function phone() {
  console.log('\n── phone 390×844, touch')
  const W = 390, H = 844
  const p = await launch(W, H), h = helpers(p)
  const tapEl = async (s: string) => { const r = await h.rect(s); if (!r) throw new Error(`no ${s}`); await p.tap(...mid(r)); await sleep(350) }
  const dockTool = (name: string) => `.ed-dock .ed-tool[aria-label^="${name}"]`
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 2, mobile: true })
    await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: E6_STUBS })
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
    await phoneE6(p, h, tapEl)

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
