/** E2 (selections of many, clipboard, groups, locks) on desktop and on the phone (scripts/editor-browser.ts). */
import { join } from 'node:path'
import { sleep, type Page } from '../lib/cdp'
import { ALT, base, check, CTRL, mid, near, out, SHIFT, type Helpers, type Rect } from './shared'

// ── E2 on desktop: selections of many, marquee, group move / resize, align, distribute, guides,
//    copy / cut / paste (system clipboard, another session), duplicate, Alt-drag, groups, locks, migration
export async function desktopE2(p: Page, h: Helpers) {
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
export async function phoneE2(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
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
  await tapEl(bar('DUP'))
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
  const ungroupBtn = await p.js<boolean>(`!!document.querySelector('${bar('UNGRP')}')`)
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
