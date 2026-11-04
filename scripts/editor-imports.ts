/**
 * Import hardening checks (#143), the E5 corrupt cases for crafted links, files and saved documents. Each case
 * from the issue is refused with a readable reason or recovered from: a control with a huge `options` count,
 * non-finite or flipped min / max, bad bindings, a malicious spec layer (refused at the door, and kept from
 * `buildLayer` when an edit brings it in), a sites layer that would place millions of dots, a 512 × 512 frame at
 * pitch 32, too many frames or too many pixels in all, a saved document that fails its checks, and one that
 * throws while rendering (the recovery screen and its reset). Also: a link waits to be confirmed (`stageLink`)
 * and stays out of the autosave until it draws once, the accessibility overlay caps what it allocates, and no
 * preset's grid, controls or bindings are refused (no false refusals).
 * Then the follow-ups: a frame of every preset opens again after a reload (reference layers have their own cap), the
 * autosave refuses a document that would not open again, a document or card from a file waits to draw before it is
 * saved, a `?p=` program reaches the remix gallery only once it drew within the frame budget (#142), and the link
 * prompt says what the link holds with KEEP and DISMISS.
 * `pnpm verify` runs them through `editorImportChecks()`; run alone with `npx tsx scripts/editor-imports.ts`.
 */
import * as React from 'react'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ControlOverlay } from '../src/components/ControlOverlay'
import { EditorBoundary, RESET_LABEL } from '../src/components/editor/EditorBoundary'
import { clipOf, pasteClip } from '../src/components/editor/clip'
import { addFrame, blankCard, docToJSON, EDITOR_KEY, loadDoc, loadSaved, MAX_FRAMES, newIRLayer, presetCard, saveChecked, seedDoc, validateDoc, type EditorDoc, type EditorFrame } from '../src/components/editor/doc'
import { ImportPrompt } from '../src/components/editor/imports'
import { decodeLink, linkPayload } from '../src/components/editor/link'
import { autosaveDoc, drew, resetEditorDoc, saveable, useEditor, whenDrawn } from '../src/components/editor/store'
import { bindingsIssue, controlsIssue, gridIssue } from '../src/components/studio/checks'
import { compileCard, guardKey, historyOf, importPreset, layersIssue, MAX_LAYERS, MAX_REF_LAYERS, newCard, type StudioCard, type StudioLayer } from '../src/components/studio/doc'
import { EXAMPLES } from '../src/components/dwitter/examples'
import { userPrograms } from '../src/components/dwitter/program'
import type { SharedProgram } from '../src/lib/share'
import { widgetPresets } from '../src/widgets'

type Assert = (name: string, cond: boolean, detail?: string) => void
// tsx compiles the app's .tsx with the classic JSX transform here (the root tsconfig only holds references)
;(globalThis as { React?: typeof React }).React ??= React
/** A link with this JSON text inside (plain base64url, the `b` format). */
const plain = (text: string) => 'b' + Buffer.from(text).toString('base64url')
const wire = (frames: unknown[]) => JSON.stringify({ v: 1, k: frames.length === 1 ? 'f' : 'd', n: 'crafted', f: frames })
const refusal = async (s: string) => { try { await decodeLink(s); return '' } catch (e) { return (e as Error).message } }
const thrown = (fn: () => unknown) => { try { fn(); return '' } catch (e) { return (e as Error).message } }
const memKV = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v) }, removeItem: (k: string) => { m.delete(k) } } }
/** JSON can't say Infinity; `1e400` parses to it. Swapped in for this sentinel after stringifying. */
const INF = 123456789.25, inf = (json: string) => json.split(String(INF)).join('1e400')

export async function editorImportChecks(assert: Assert) {
  const seed = seedDoc(), code = seed.frames[seed.frames.length - 1]
  const pf = linkPayload(seed, [code.id])
  if (typeof pf === 'string') { assert('E5 corrupt: a frame to craft links from', false, pf); return }
  const frame0 = pf.frames[0], layers0 = frame0.card.layers
  const withCard = (o: Record<string, unknown>) => ({ ...frame0, card: { ...frame0.card, ...o } })
  const linkWith = (o: Record<string, unknown>) => refusal(plain(inf(wire([withCard(o)]))))
  assert('E5 corrupt: the frame the crafted links start from opens as is', await refusal(plain(wire([frame0]))) === '')

  // ── controls and bindings by the spec rules
  const seg = { key: 'mode', kind: 'segmented', box: [0, 0, 40, 10], label: 'Mode', options: 3 }, slider = { key: 'level', kind: 'slider', box: [0, 0, 40, 10], label: 'Level', min: 0, max: 1 }
  const ctl = await Promise.all([
    linkWith({ controls: [{ ...seg, options: 1e9 }] }), linkWith({ controls: [{ ...slider, max: INF }] }), linkWith({ controls: [{ ...slider, min: 1, max: 0 }] }),
    linkWith({ controls: [{ ...seg, box: [600, 0, 10, 10] }] }), linkWith({ controls: [{ ...seg, kind: 'evil' }] }), linkWith({ controls: [{ ...seg, label: 'x'.repeat(300) }] }),
    linkWith({ controls: Array.from({ length: 65 }, (_, i) => ({ ...seg, key: `k${i}` })) }),
  ])
  const ctlWant = [/options: must be ≤ 64/, /max: expected a finite number/, /max: must be more than min/, /box: must lie on the/, /kind: must be one of/, /label: longer than 256/, /controls must be an array of ≤ 64/]
  assert('E5 corrupt: controls go through the spec rules (options ≤ 64, finite min < max, known kinds, capped labels, boxes on the card, ≤ 64 of them)', ctl.every((m, i) => ctlWant[i].test(m)), ctl.join(' | '))
  const b0 = { key: 'level', kind: 'slider', min: 0, max: 1, step: .1 }
  const bind = await Promise.all([{ ...b0, step: 0 }, { ...b0, min: 2 }, { ...b0, kind: 'evil' }, { ...b0, source: 'evil' }, { ...b0, max: INF }, { ...b0, key: '' }].map(b => linkWith({ bindings: [b] })))
  const bindWant = [/step must be a number above 0/, /max must be more than min/, /kind must be slider or source/, /source must be one of/, /min and \.max must be numbers/, /key must be a string/]
  assert('E5 corrupt: bindings need a key, a known kind and source, finite min < max and a step above 0', bind.every((m, i) => bindWant[i].test(m)), bind.join(' | '))

  // ── spec layers through the spec layer validator, at the door and before buildLayer
  const specL = (spec: unknown, id = 'evil'): StudioLayer => ({ id, name: id, kind: 'spec', tone: 'preset', z: 9, blend: 'normal', visible: true, spec } as StudioLayer)
  const evil = [
    { kind: 'ir', src: 'sin(' }, { kind: 'ir', src: '1', bounds: [0, 0, 0, 5] }, { kind: 'raster', grid: { cols: 4, rows: 4 }, format: 'u8', asset: 'AAAA' },
    { kind: 'generator', name: 'evil', params: [] }, { kind: 'sites', points: [[0, 0]], size: 1e9 }, { kind: 'text', at: [0, 0], text: 'x', scale: 1e6 }, { kind: 'ir', src: '1', onload: 'x' },
  ]
  const spec = await Promise.all(evil.map(s => linkWith({ layers: [...layers0, specL(s)] })))
  assert('E5 corrupt: a malicious spec layer is refused with the spec rule it breaks (IR that does not parse, bounds, asset size, generator, size, scale, unknown keys)', spec.every(m => /layers\[\d+\]\.spec/.test(m)), spec.join(' | '))
  const card: StudioCard = { ...newCard('x'), layers: [specL(evil[2]), specL({ kind: 'ir', src: '.5' }, 'fine')] }
  const cc = compileCard(card), drawn = cc.layers({ t: 0, data: {} })
  assert('E5 corrupt: a spec layer that skipped the checks (an inspector edit) never reaches buildLayer: it is reported and draws nothing', /spec layer evil: spec\.asset/.test(cc.errors.get('evil')?.message ?? '') && !cc.errors.has('fine') && drawn.length === 1, `${cc.errors.get('evil')?.message} · ${drawn.length} layers`)

  // ── sites that would place a flood of dots
  const sites = (p: Record<string, number | string>): StudioLayer => ({ id: 's', name: 's', kind: 'sites', tone: 'idle', z: 9, blend: 'normal', visible: true, src: '1', size: 2, params: { shape: 'disc', cx: 72, cy: 72, r: 40, x1: 0, y1: 0, spacing: 4, start: 0, sweep: 6, ...p } } as StudioLayer)
  const st = await Promise.all([{ r: 4000, spacing: .25 }, { spacing: 0 }, { shape: 'ring', r: 4000, spacing: .25 }, { cx: INF }].map(p => linkWith({ layers: [...layers0, sites(p)] })))
  const stWant = [/would place [\d,]+ dots, more than 20,000/, /spacing must be a number in 0\.25\.\.512/, /would place [\d,]+ dots/, /cx must be a number/]
  assert('E5 corrupt: a sites layer that would place too many dots (or loop on spacing 0) is refused with its count', st.every((m, i) => stWant[i].test(m)), st.join(' | '))

  // ── grid size: one frame, and all frames
  const giant = await linkWith({ grid: { cols: 512, rows: 512, pitch: 32 } })
  assert('E5 corrupt: a 512 × 512 frame at pitch 32 is refused with its size in px', /a 512 × 512 grid at pitch 32 is 16,384 × 16,384 px, more than a frame may cover/.test(giant), giant)
  const blank = (cols: number, rows: number, pitch: number, i: number): EditorFrame => ({ id: `f${i}`, x: i * 10, y: 0, theme: 'dot480', card: { ...blankCard({ cols, rows, pitch }), id: `c${i}` } })
  const docOf = (frames: EditorFrame[]): EditorDoc => ({ kind: 'dot480.editor', v: 2, name: 'crafted', frames })
  const frames = (n: number, cols: number, pitch: number) => docOf(Array.from({ length: n }, (_, i) => blank(cols, cols, pitch, i)))
  const many = thrown(() => validateDoc(frames(MAX_FRAMES + 1, 144, 4))), heavy = thrown(() => validateDoc(frames(MAX_FRAMES, 512, 11))), editorMax = thrown(() => validateDoc(frames(MAX_FRAMES, 512, 8)))
  assert('E5 corrupt: too many frames, or frames covering too many px in all, are refused; 48 of the editor\'s own largest frames still open', /frames must be an array of ≤ 48/.test(many) && /cover [\d,]+ px in all, more than/.test(heavy) && editorMax === '', [many, heavy, editorMax].join(' | '))

  // ── the saved document: fails its checks, unreadable, or storage that throws
  const kv = memKV()
  kv.setItem(EDITOR_KEY, JSON.stringify(docOf([blank(512, 512, 32, 0)])))
  const bad = loadSaved(kv)
  kv.setItem(EDITOR_KEY, '{not json')
  const junk = loadSaved(kv), throws = loadSaved({ getItem: () => { throw new Error('denied') }, setItem: () => {} })
  assert('E5 recover: a saved document that fails its checks, or is not JSON, is not opened: the editor starts fresh and knows why; storage that throws reads as empty', !bad.doc && /16,384 × 16,384 px/.test(bad.error ?? '') && loadDoc(kv) === undefined && /not JSON/.test(junk.error ?? '') && !throws.doc && !throws.error, `${bad.error} | ${junk.error}`)

  // ── a link waits to be confirmed, then stays out of the autosave until it draws once
  useEditor.setState({ h: historyOf(seed), sel: {} })
  const s = useEditor.getState, before = s().h.present, pending = s().stageLink(pf)
  assert('E5 confirm: staging a link says what it holds and changes nothing until confirmed', !pending.already && pending.kind === 'frame' && pending.frames === 1 && /^Open frame ".+" from a link/.test(pending.summary) && s().h.present === before, pending.summary)
  const ids = pending.confirm(), opened = Array.isArray(ids) ? ids : []
  const heldBack = opened.length === 1 && s().h.present.frames.some(f => f.id === opened[0]) && !saveable(s().h.present).frames.some(f => f.id === opened[0])
  const linked = s().h.present.frames.find(f => f.id === opened[0])
  const linkKeys = (linked?.card.layers ?? []).flatMap(l => (l.kind === 'ir' ? [guardKey(linked!.card.grid, l.lattice, l.src || '1')] : []))
  const ranBefore = linkKeys.every(k => userPrograms.state(k) === 'ok') // `pnpm verify` may have drawn this program in budget already
  opened.forEach(drew)
  const drawnOnly = opened.length === 1 && (ranBefore || !saveable(s().h.present).frames.some(f => f.id === opened[0])) // a program not in budget yet still holds it (#142)
  userPrograms.begin()
  for (const k of linkKeys) userPrograms.field(k, 1, () => 1)(.5, .5, 0, 0)
  userPrograms.settle(); await new Promise(r => setTimeout(r, 0))
  const released = opened.length === 1 && saveable(s().h.present).frames.some(f => f.id === opened[0])
  assert('E5 confirm: a confirmed link is kept out of the autosave until it draws once and its programs kept to the frame budget; staged again it is open already', heldBack && drawnOnly && released && s().stageLink(pf).already, `${heldBack} ${drawnOnly} ${released}`)
  const prog = s().stageProgram(EXAMPLES[1] ?? EXAMPLES[0]), n0 = s().h.present.frames.length
  const pid = prog.confirm()
  assert('E5 confirm: a shared program is staged the same way and held from the autosave once inserted', /^Open program ".+" from a link/.test(prog.summary) && s().h.present.frames.length === n0 + 1 && !saveable(s().h.present).frames.some(f => f.id === pid), prog.summary)
  useEditor.setState({ h: historyOf(seed), sel: {} })

  // ── the accessibility overlay caps what it allocates from a card that skipped the checks
  const stub = { focus() {}, value: () => 0, set() {}, press() {} } as never
  const overlay = (controls: unknown[]) => renderToStaticMarkup(createElement(ControlOverlay, { controls: controls as never, grid: { cols: 40, rows: 10 }, data: {}, input: stub }))
  const radios = (o: unknown) => (overlay([{ ...seg, options: o }]).match(/role="radio"/g) ?? []).length
  const buttons = (overlay(Array.from({ length: 500 }, (_, i) => ({ key: `b${i}`, kind: 'button', box: [0, 0, 1, 1], label: 'b' }))).match(/<button/g) ?? []).length
  assert('E5 corrupt: the accessibility overlay clamps options to 1…64 and draws at most 64 controls', radios(1e9) === 64 && radios(NaN) === 1 && radios(3) === 3 && buttons === 64, `${radios(1e9)} ${radios(NaN)} ${radios(3)} ${buttons}`)

  // ── no false refusals: the seed, and every preset's grid, controls (as JSON carries them) and the bindings a frame of it gets
  const fails: string[] = []
  for (const p of widgetPresets) {
    const why = gridIssue({ ...p.grid, pitch: p.grid.pitch ?? 4 }) ?? controlsIssue(JSON.parse(JSON.stringify(p.controls ?? [])), p.grid)
    let card: StudioCard | undefined
    try { card = importPreset(p.id) } catch { /* a control with a drag map (a function) cannot be cloned into a frame: nothing to check */ }
    // a live card whose defaults fall outside the data rule (a timestamp, a NaN) is refused by that rule already, bindings or not
    const b = card && Object.values(p.defaults ?? {}).every(v => Number.isFinite(v) && Math.abs(v) <= 1e9) ? bindingsIssue(card.bindings) : undefined
    if (why || b) fails.push(`${p.id}: ${why ?? b}`)
  }
  assert(`E5 corrupt: the seed document passes, and so do the grids, controls and bindings of all ${widgetPresets.length} presets (no false refusals)`, !fails.length && thrown(() => validateDoc(JSON.parse(JSON.stringify(seed)))) === '', fails.slice(0, 4).join(' | '))

  // ── #143: every preset opens again after a reload as a reference frame (more than 24 layers, live text ids, long text)
  const refFails: string[] = []
  for (const p of widgetPresets) {
    let card: StudioCard
    try { card = presetCard(p.id) } catch { continue } // a control with a drag map: not offered as a frame
    const why = thrown(() => validateDoc(JSON.parse(docToJSON(addFrame(seed, card, { source: `preset:${p.id}` }).doc))))
    if (why) refFails.push(`${p.id} (${card.layers.length} layers): ${why}`)
  }
  assert('#143 reference: a frame of every preset (vision-camera has 56 layers, live cards keep text ids past 1e9) opens again after a reload', !refFails.length, refFails.slice(0, 4).join(' | '))
  const refs = (n: number) => Array.from({ length: n }, () => ({ kind: 'preset-layer' })), own = (n: number) => Array.from({ length: n }, () => ({ kind: 'ir' }))
  const counts = [layersIssue([...own(MAX_LAYERS), ...refs(MAX_REF_LAYERS)]), layersIssue(own(MAX_LAYERS + 1)), layersIssue(refs(MAX_REF_LAYERS + 1))]
  assert(`#143 reference: a card holds ${MAX_LAYERS} layers of its own plus ${MAX_REF_LAYERS} reference layers, and one more of either is refused`, counts[0] === undefined && /at most 24 layers of its own \(this one has 25\)/.test(counts[1] ?? '') && /at most 96 reference layers/.test(counts[2] ?? ''), counts.join(' | '))
  const vc = addFrame(seed, presetCard('vision-camera')), irOf = (f: EditorFrame) => f.card.layers.find(l => l.kind === 'ir')!
  const clip = clipOf(vc.doc, { frame: code.id, layer: irOf(code).id }), into = clip && pasteClip(vc.doc, clip, { frame: vc.frame.id })
  const full = addFrame(seed, { ...blankCard(), layers: Array.from({ length: MAX_LAYERS }, (_, i) => newIRLayer(i)) }), over = clip && pasteClip(full.doc, clip, { frame: full.frame.id })
  assert('#143 reference: a layer pastes into a 56-layer reference frame; a frame with 24 layers of its own refuses one more, with the reason', !!into && typeof into !== 'string' && /a frame holds at most 24 layers of its own/.test(String(over)), `${typeof into === 'string' ? into : 'pasted'} | ${typeof over === 'string' ? over : 'pasted'}`)

  // ── #143: the autosave only writes what opens again; a document from a file waits to draw before it replaces the saved one
  const kvS = memKV(), good = JSON.stringify(seed)
  kvS.setItem(EDITOR_KEY, good)
  const tooMany = { ...full.doc, frames: full.doc.frames.map(f => (f.id === full.frame.id ? { ...f, card: { ...f.card, layers: [...f.card.layers, newIRLayer(99)] } } : f)) }
  const refusedSave = saveChecked(tooMany, kvS), keptSave = kvS.m.get(EDITOR_KEY) === good, okSave = saveChecked(seed, kvS)
  assert('#143 save: an edit the checks would refuse on reload is not autosaved (the saved document stays, the reason comes back)', typeof refusedSave === 'string' && /at most 24 layers of its own/.test(refusedSave) && keptSave && okSave === true, String(refusedSave))
  useEditor.setState({ h: historyOf(seed), sel: {} })
  const fileDoc: EditorDoc = { ...seed, name: 'from a file', frames: seed.frames.map((f, i) => ({ ...f, id: `file${i}` })) }
  useEditor.getState().openDoc(fileDoc)
  const heldDoc = autosaveDoc() === undefined && useEditor.getState().h.present === fileDoc
  fileDoc.frames.slice(0, -1).forEach(f => drew(f.id))
  const stillHeld = autosaveDoc() === undefined
  drew(fileDoc.frames[fileDoc.frames.length - 1].id)
  const freed = autosaveDoc()
  assert('#143 file: a document opened from a file replaces this one, but the autosave keeps the saved one until each of its frames drew once', heldDoc && stillHeld && !!freed && freed.frames.length > 0 && freed.frames.every(f => fileDoc.frames.some(x => x.id === f.id)), `${heldDoc} ${stillHeld} ${freed?.frames.length}`)
  const cardFile = useEditor.getState().insertCard(blankCard(), { source: 'file' }), cardHeld = !autosaveDoc()!.frames.some(f => f.id === cardFile)
  drew(cardFile)
  assert('#143 file: a card from a file is held from the autosave until it draws once', cardHeld && autosaveDoc()!.frames.some(f => f.id === cardFile))

  // ── #142: a ?p= program goes into the remix gallery (and the autosave) only once it drew one frame within budget
  const tick = () => new Promise(r => setTimeout(r, 0))
  const progOf = (src: string): SharedProgram => ({ src, grid: 'square', lattice: 2, tone: 'auto' })
  const keyOf = (id: string) => { const f = useEditor.getState().h.present.frames.find(x => x.id === id)!, l = irOf(f) as StudioLayer & { src: string; lattice: number }; return guardKey(f.card.grid, l.lattice, l.src) }
  const fast = useEditor.getState().stageProgram(progOf('// gallery hold\n.5 + .5 * sin(u * 7.25 - t)')).confirm()
  let recorded = 0
  whenDrawn(fast, () => recorded++)
  drew(fast); await tick()
  const afterDraw = recorded, savedEarly = autosaveDoc()!.frames.some(f => f.id === fast)
  userPrograms.begin(); userPrograms.field(keyOf(fast), 1, () => 1)(.5, .5, 0, 0); userPrograms.settle(); await tick()
  assert('#142 gallery: a kept program is recorded and autosaved only after it drew once and kept to the frame budget', afterDraw === 0 && !savedEarly && recorded === 1 && autosaveDoc()!.frames.some(f => f.id === fast), `${afterDraw} ${savedEarly} ${recorded}`)
  const slow = useEditor.getState().stageProgram(progOf('// gallery slow\n.5 + .5 * sin(v * 9.5 + t)')).confirm()
  let slowRecorded = 0
  whenDrawn(slow, () => slowRecorded++)
  // performance.now (the guard's clock): `pnpm verify` pins Date. Capped, so a stubbed clock can't spin forever
  const busy = () => { const end = performance.now() + 60; for (let i = 0; i < 5e8 && performance.now() < end; i++) { /* a frame past the budget */ } return 1 }
  userPrograms.begin(); const g = userPrograms.field(keyOf(slow), 1e6, busy); g(.5, .5, 0, 0); g(.5, .5, 0, 0); userPrograms.settle(); drew(slow); await tick()
  assert('#142 gallery: a program paused for running past the budget is never recorded in the gallery nor autosaved', userPrograms.state(keyOf(slow)) === 'paused' && slowRecorded === 0 && !autosaveDoc()!.frames.some(f => f.id === slow), `${userPrograms.state(keyOf(slow))} ${slowRecorded}`)
  useEditor.setState({ h: historyOf(seed), sel: {} })

  // ── #143: the link prompt (KEEP / DISMISS, an alert dialog naming what the link holds)
  const ask = renderToStaticMarkup(createElement(ImportPrompt, { prompt: { id: 1, summary: 'Open frame "level 03" from a link', keep() {}, dismiss() {} } }))
  assert('#143 confirm: the link prompt is an alert dialog that says what the link holds, with KEEP and DISMISS buttons', /role="alertdialog"/.test(ask) && /aria-describedby="ed-confirm-d"/.test(ask) && ask.includes('Open frame &quot;level 03&quot; from a link.') && />KEEP</.test(ask) && />DISMISS</.test(ask), ask.slice(0, 200))

  // ── a document that throws while rendering: the recovery screen, and its reset (last: it stops this process's autosave)
  const screen = new EditorBoundary({ area: 'canvas' })
  screen.state = EditorBoundary.getDerivedStateFromError(new Error('frames[0] broke the canvas'))
  const html = renderToStaticMarkup(screen.render() as ReactElement), fine = renderToStaticMarkup(createElement(EditorBoundary, { area: 'canvas' }, createElement('i', null, 'ok')))
  assert('E5 recover: a render crash shows the recovery screen (what broke, RESET EDITOR DOCUMENT); without one the editor renders as is', html.includes(RESET_LABEL) && html.includes('frames[0] broke the canvas') && html.includes('role="alert"') && fine === '<i>ok</i>', html.slice(0, 160))
  const kvR = memKV()
  kvR.setItem(EDITOR_KEY, JSON.stringify(docOf([blank(144, 144, 4, 0)])))
  const reset = resetEditorDoc(kvR), after = loadDoc(kvR)
  assert('E5 recover: RESET EDITOR DOCUMENT replaces the saved document with a fresh seed that opens', reset && !!after && after.frames.length === seed.frames.length && after.frames.every(f => f.id !== 'f0'))
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('editor-imports.ts')) {
  let failed = 0
  await editorImportChecks((name, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${detail && !cond ? ` · ${detail}` : ''}`); if (!cond) failed++ })
  if (failed) { console.error(`\n${failed} editor import check(s) failed`); process.exit(1) }
  console.log('\nAll editor import checks passed')
  process.exit(0)
}
