/**
 * MAKE editor checks (docs/EDITOR-PLAN.md, E1): the multi-frame document round-trips, frames are placed
 * without overlap, pure edits keep untouched frames and layers, paint layers draw exactly the cells
 * painted (through the engine) and their cells encode losslessly, a frame resized from any corner keeps
 * text, sites and paint where they were (whole cells, 8…512), layer order, hit tests and bounds by dots,
 * share links for code layers, the camera maths (zoom about a point, pinch, fit), the gesture geometry
 * (drag snapping, the Frame tool), the tool keys and where every old MAKE mode lands, and the history:
 * one undo step per gesture, typing coalesced by tag, a cancelled gesture leaves no trace.
 * E2 adds selections of many (⇧-click, marquee, select all), groups and locks, group resize from the box,
 * align / distribute, smart guides, the clipboard (round trip, ids, paste offsets), v1 → v2 migration and
 * one undo step per command or gesture.
 * `pnpm verify` runs them through `editorChecks()`; run alone with `npx tsx scripts/editor.ts`.
 * The browser side (desktop + touch): `scripts/editor-browser.ts`.
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { COALESCE_MS, compileCard, historyOf, irLayer, paintCells, paintLayer, sitesLayer, textLayer, validateCard, type PaintLayer, type SitesLayer, type TextLayer } from '../src/components/studio/doc'
import { addFrame, addLayer, blankCard, boundsOf, cellsFromMatrix, docFromJSON, docToJSON, drawingCard, duplicateFrame, duplicateLayer, editFrame, editLayer, encodeCells, EDITOR_KEY, frameById, frameSize, hitFrame, hitLayer, layerBounds, line, loadDoc, movable, moveLayer, nudgeLayer, paintCellAt, raiseFrame, removeFrame, removeLayer, resizeFrame, saveDoc, seedDoc, shareable, stamp, topDown, type EditorDoc, type EditorFrame } from '../src/components/editor/doc'
import { codeTarget, dragCells, dragFramePos, draftFrame, fitCam, FRAME_PITCH, KEY_TOOL, MODE_ENTRY, paintTarget, pinchCam, resizeByHandle, zoomCam, ZOOM_MAX, ZOOM_MIN, type Handle } from '../src/components/editor/input'
import { useEditor } from '../src/components/editor/store'
import { copyFrames, copyLayers, EDITOR_VERSION, frameOf, groupLayers, lockFrames, lockLayers, MAX_FRAMES, migrateDoc, removeFrames, removeLayers, shiftLayers, ungroup, unitsOf } from '../src/components/editor/doc'
import { alignDeltas, arrangeFrames, arrangeLayers, canResize, clickLayer, distributeDeltas, frameBox, framesBox, framesSel, inSel, layersSel, marqueeFrames, marqueeLayers, marqueeSel, normBox, resizeGroup, selCount, selectAll, selFrames, selGroup, selLayers, snapBox, toggleSel, unionBox, validSel } from '../src/components/editor/select'
import { asClip, clipFromJSON, clipOf, clipToJSON, pasteClip } from '../src/components/editor/clip'
import { arrangeSel, copySel, deleteSel, duplicateSel, groupSel, lockSel, nudgeSel, paste, ungroupSel } from '../src/components/editor/actions'
import { MODES, viewFromUrl } from '../src/site/views'

type Assert = (name: string, cond: boolean, detail?: string) => void
const litCount = (ds: { r: number; opacity: number }[]) => ds.filter(d => d.r > 0 && d.opacity > 0).length

export function editorChecks(assert: Assert) {
  // document: seed, JSON round trip, validation
  const seed = seedDoc()
  assert('editor: the seed document has frames and validates', seed.frames.length >= 3 && docToJSON(docFromJSON(docToJSON(seed))) === docToJSON(seed))
  const badDoc = (mut: (d: EditorDoc) => void) => { const d = structuredClone(seed); mut(d); try { docFromJSON(JSON.stringify(d)); return '' } catch (e) { return (e as Error).message } }
  const errs = [badDoc(d => { d.kind = 'x' as 'dot480.editor' }), badDoc(d => { d.frames[1].id = d.frames[0].id }), badDoc(d => { d.frames[0].theme = 'pink' as 'dot480' }), badDoc(d => { d.frames[0].x = NaN })]
  assert('editor: bad documents are rejected with a reason', errs.every(Boolean), errs.join(' | '))

  // placement: a new frame never overlaps the others
  let d = seed
  for (let i = 0; i < 6; i++) d = addFrame(d, blankCard()).doc
  const boxes = d.frames.map(f => ({ ...frameSize(f), x: f.x, y: f.y }))
  const overlap = boxes.some((a, i) => boxes.some((b, j) => i < j && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h))
  assert('editor: inserted frames are placed without overlapping', !overlap, JSON.stringify(boxes.map(b => [b.x, b.y])))

  // paint: stamped cells draw exactly, through compile → sample
  const card = drawingCard(40, 30, 4, 1), pl = card.layers[0] as PaintLayer, cells = paintCells(pl).slice()
  const n = stamp(cells, pl.cols, pl.rows, 10, 10, 1, 1) + stamp(cells, pl.cols, pl.rows, 20, 12, 2, 1)
  const painted = { ...card, layers: [{ ...pl, cells: encodeCells(cells) }] }
  const dots = sampleLayers(compileCard(painted).layers({ t: 0, data: {} }), painted.grid, { ...painted.style, quantizeSteps: 5 }, dot480)
  assert('editor: a paint layer draws exactly the cells painted (1 + a 3×3 size-2 brush)', n === 1 + 9 && litCount(dots) === n, `${n} painted, ${litCount(dots)} lit`)
  const lat = paintLayer({ cols: 144, rows: 144, pitch: 2.25 }, { lattice: 2 })
  assert('editor: a paint layer on a 2× lattice has a 72×72 cell grid', lat.cols === 72 && lat.rows === 72 && paintCells(lat).length === 72 * 72)
  let threw = ''
  try { validateCard({ ...painted, layers: [{ ...pl, cells: 'AAAA' }] }) } catch (e) { threw = (e as Error).message }
  assert('editor: a paint layer whose cells do not match cols × rows is rejected', /cells/.test(threw), threw)

  // resize from the left / top: frame moves, text / sites / paint stay put on screen
  let doc: EditorDoc = { kind: 'dot480.editor', v: 1, name: 't', frames: [] }
  const r = addFrame(doc, painted, { at: { x: 100, y: 100 } }); doc = r.doc
  const text = textLayer('HI', { params: { col: 5, row: 6 } })
  doc = addLayer(doc, r.frame.id, text)
  const f0 = doc.frames[0], f1 = resizeFrame(f0, 50, 36, 10, 6)
  const t1 = f1.card.layers.find(l => l.kind === 'text') as TextLayer, p1 = f1.card.layers.find(l => l.kind === 'paint') as PaintLayer
  const moved = f1.x === 100 - 10 * 4 && f1.y === 100 - 6 * 4 && t1.params.col === 15 && t1.params.row === 12
  const pc = paintCells(p1)
  assert('editor: resizing from the top-left keeps text and paint in place', moved && p1.cols === 50 && p1.rows === 36 && pc[(10 + 6) * 50 + 10 + 10] === 255 && pc[10 * 50 + 10] === 0, `x ${f1.x} y ${f1.y} text ${t1.params.col},${t1.params.row}`)

  // layer order, hit tests and bounds by dots
  const ids = topDown(doc.frames[0].card).map(l => l.id)
  const re = moveLayer(doc, { frame: r.frame.id, layer: ids[0] }, 1)
  assert('editor: moveLayer reorders the stack (0 = top)', topDown(re.frames[0].card)[1].id === ids[0] && topDown(re.frames[0].card)[0].id === ids[1])
  const f = doc.frames[0], hitText = hitLayer(f, 5 * 4 + 6, 6 * 4 + 6), hitPaint = hitLayer(f, 20 * 4 + 2, 12 * 4 + 2), miss = hitLayer(f, 38 * 4, 28 * 4)
  assert('editor: hit tests find the layer whose own dots are under the point', hitText?.kind === 'text' && hitPaint?.kind === 'paint' && !miss, `${hitText?.kind} ${hitPaint?.kind} ${miss?.kind}`)
  const b = layerBounds(f, f.card.layers.find(l => l.kind === 'text')!)
  assert('editor: a text layer\'s bounds wrap its glyphs only', !!b && b[0] >= 5 * 4 - 2 && b[2] < 20 * 4 && b[3] - b[1] <= 8 * 4, JSON.stringify(b))
  assert('editor: hitFrame finds frames by world point', hitFrame(doc, 110, 110)?.id === f.id && !hitFrame(doc, 50, 50))

  // share: a code layer on a share grid has a link; elsewhere a reason
  const code = seed.frames.find(x => x.source?.startsWith('program:'))!
  const ir = topDown(code.card).find(l => l.kind === 'ir')!
  const p = shareable(code, ir)
  assert('editor: a code frame on a share grid is shareable; a 40×30 frame is not', typeof p === 'object' && p.grid === 'square' && typeof shareable(f, ir) === 'string')

  // store: a gesture is one undo step; undo drops a selection that no longer exists
  const s = useEditor.getState()
  s.edit(() => doc)
  const past = useEditor.getState().h.past.length, tl = topDown(useEditor.getState().h.present.frames[0].card).find(l => l.kind === 'text')!
  s.begin()
  for (let i = 1; i <= 5; i++) s.live(x => editLayer(x, { frame: f.id, layer: tl.id }, l => ({ ...l, name: `drag ${i}` })))
  s.end()
  const after = useEditor.getState()
  assert('editor: a gesture (begin / live × 5 / end) is one undo step', after.h.past.length === past + 1 && topDown(after.h.present.frames[0].card).some(l => l.name === 'drag 5'))
  s.select({ frame: f.id, layer: tl.id }); s.edit(x => ({ ...x, frames: [] })); s.undo(); s.redo()
  assert('editor: undo / redo keep the selection valid', !useEditor.getState().sel.frame)

  e1Checks(assert)
}

/** E1: the rest of the pure editor logic (edits, paint encode, resize anchoring, camera, gestures, entries, history). */
function e1Checks(assert: Assert) {
  const empty = (): EditorDoc => ({ kind: 'dot480.editor', v: 1, name: 't', frames: [] })
  const seed = seedDoc()

  // ── doc edits: pure, untouched frames / layers keep their identity
  const d = addFrame(addFrame(empty(), blankCard(), { at: { x: 0, y: 0 } }).doc, blankCard(), { at: { x: 400, y: 0 } }).doc
  const [a, b] = d.frames
  const d2 = editFrame(d, a.id, f => ({ ...f, x: 8 }))
  assert('edit: editFrame returns a new doc; the other frame keeps its identity, the input is untouched', d2 !== d && d2.frames[1] === b && d2.frames[0].x === 8 && a.x === 0)
  const ir = irLayer('u * v + sin(t)', { lattice: 2 }), still = irLayer('u', { lattice: 2 })
  const d3 = addLayer(addLayer(d, a.id, still), b.id, ir)
  assert('edit: addLayer marks the card animated only for a code layer that reads t', !frameById(d3, a.id)!.card.animated && frameById(d3, b.id)!.card.animated)
  const t1 = textLayer('A'), t2 = textLayer('B')
  let d4 = addLayer(addLayer(d, a.id, t1), a.id, t2)
  assert('edit: a new layer goes on top of the stack', topDown(frameById(d4, a.id)!.card).map(l => l.id).join() === [t2.id, t1.id].join())
  const dup = duplicateLayer(d4, { frame: a.id, layer: t1.id })
  const order = topDown(frameById(dup.doc, a.id)!.card).map(l => l.id)
  assert('edit: duplicateLayer puts the copy right above the original, with a new id', !!dup.id && dup.id !== t1.id && order.join() === [t2.id, dup.id, t1.id].join(), order.join())
  d4 = removeLayer(dup.doc, { frame: a.id, layer: t2.id })
  const zs = frameById(d4, a.id)!.card.layers.map(l => l.z).sort()
  assert('edit: removeLayer drops it and renumbers z 0…n−1', !frameById(d4, a.id)!.card.layers.some(l => l.id === t2.id) && zs.join() === '0,1')
  const df = duplicateFrame(d4, a.id), copy = frameById(df.doc, df.id!)!
  const fresh = copy.card.layers.every(l => !frameById(df.doc, a.id)!.card.layers.some(m => m.id === l.id))
  assert('edit: duplicateFrame copies the card with new frame, card and layer ids, to its right, without its source', copy.id !== a.id && copy.card.id !== a.card.id && fresh && copy.x === a.x + frameSize(a).w + 48 && copy.source === undefined)
  assert('edit: removeFrame / raiseFrame', removeFrame(d, a.id).frames.length === 1 && raiseFrame(d, a.id).frames.at(-1)!.id === a.id && raiseFrame(d, b.id) === d)
  const st = sitesLayer({ params: { cx: 10, cy: 12, x1: 20, y1: 22 } })
  const ns = nudgeLayer(st, 2, -3) as SitesLayer, nt = nudgeLayer(textLayer('X', { params: { col: 4, row: 5 } }), -1, 1) as TextLayer
  assert('edit: nudgeLayer moves text and sites in whole cells and leaves fields alone', ns.params.cx === 12 && ns.params.cy === 9 && ns.params.x1 === 22 && ns.params.y1 === 19 && nt.params.col === 3 && nt.params.row === 6 && nudgeLayer(ir, 5, 5) === ir)
  assert('edit: only text and sites layers are movable', movable(st) && movable(t1) && !movable(ir) && !movable(paintLayer({ cols: 8, rows: 8 })) && !movable(undefined))

  // ── paint encode: cells round-trip, brushes, lines, the cell under a point
  const pl = paintLayer({ cols: 40, rows: 30, pitch: 4 }), cells = new Uint8Array(pl.cols * pl.rows)
  for (let i = 0; i < cells.length; i++) cells[i] = (i * 37) % 256
  const back = paintCells({ ...pl, cells: encodeCells(cells) })
  assert('paint: encodeCells → paintCells round-trips every byte value', back.length === cells.length && back.every((v, i) => v === cells[i]))
  const c2 = new Uint8Array(pl.cols * pl.rows), n1 = stamp(c2, pl.cols, pl.rows, 5, 5, 3, 1), again = stamp(c2, pl.cols, pl.rows, 5, 5, 3, 1), erased = stamp(c2, pl.cols, pl.rows, 5, 5, 1, 0)
  assert('paint: a brush only counts cells it changed; erase writes 0', n1 > 9 && again === 0 && erased === 1 && c2[5 * pl.cols + 5] === 0 && c2[5 * pl.cols + 6] === 255, `${n1} ${again} ${erased}`)
  const edge = new Uint8Array(pl.cols * pl.rows), clipped = stamp(edge, pl.cols, pl.rows, 0, 0, 2, .5)
  assert('paint: a brush at the edge is clipped, and ink .5 writes 128', clipped === 4 && edge[0] === 128 && edge[1] === 128 && edge[pl.cols] === 128 && edge[pl.cols + 1] === 128, `${clipped}`)
  const ln = line(0, 0, 7, 3), steps = ln.slice(1).every(([x, y], i) => Math.max(Math.abs(x - ln[i][0]), Math.abs(y - ln[i][1])) === 1)
  assert('paint: a stroke line is unbroken (8-connected) from end to end', ln.length === 8 && ln[0].join() === '0,0' && ln.at(-1)!.join() === '7,3' && steps && line(3, 3, 3, 3).length === 1)
  const fr: EditorFrame = { id: 'f', x: 0, y: 0, theme: 'dot480', card: drawingCard(40, 30, 4, 2) }, pl2 = fr.card.layers[0] as PaintLayer
  assert('paint: the cell under a point follows the lattice (2× → 8 px cells)', paintCellAt(fr, pl2, 17, 9).join() === '2,1' && paintCellAt(fr, pl2, -1, 0)[0] === -1 && pl2.cols === 20 && pl2.rows === 15)
  const mc = paintCells({ ...pl2, cells: cellsFromMatrix(pl2, [[0, 1], [1, 0]]) })
  assert('paint: a 0…1 matrix resamples onto the layer (nearest)', mc[0] === 0 && mc[19] === 255 && mc[14 * 20] === 255 && mc[14 * 20 + 19] === 0)

  // ── resize anchoring from every corner: the opposite edge stays, text / sites / paint keep their screen spot
  const base = (() => {
    const card = drawingCard(40, 30, 4, 1), p0 = card.layers[0] as PaintLayer, px = paintCells(p0).slice()
    px[10 * 40 + 12] = 255
    card.layers = [{ ...p0, cells: encodeCells(px) }, { ...textLayer('HI', { params: { col: 6, row: 7 } }), z: 1 }, { ...sitesLayer({ params: { cx: 20, cy: 15, x1: 30, y1: 25 } }), z: 2 }]
    return { id: 'r', x: 200, y: 100, theme: 'dot480', card } as EditorFrame
  })()
  const where = (f: EditorFrame) => {
    const p = f.card.layers.find(l => l.kind === 'paint') as PaintLayer, t = f.card.layers.find(l => l.kind === 'text') as TextLayer, s = f.card.layers.find(l => l.kind === 'sites') as SitesLayer
    const i = paintCells(p).indexOf(255)
    return { paint: [f.x + (i % p.cols) * 4, f.y + Math.floor(i / p.cols) * 4], text: [f.x + t.params.col * 4, f.y + t.params.row * 4], sites: [f.x + s.params.cx * 4, f.y + s.params.cy * 4] }
  }
  const home = JSON.stringify(where(base))
  const corners: [Handle, number, number][] = [['nw', -40, -20], ['ne', 40, -20], ['sw', -40, 20], ['se', 40, 20], ['nw', 24, 16], ['se', -24, -16]]
  const bad: string[] = []
  for (const [h, dx, dy] of corners) {
    const r = resizeByHandle(base, h, dx, dy), w0 = frameSize(base), w1 = frameSize(r)
    const anchored = (h.includes('w') ? r.x + w1.w === base.x + w0.w : r.x === base.x) && (h.includes('n') ? r.y + w1.h === base.y + w0.h : r.y === base.y)
    const sized = w1.w === w0.w + (h.includes('w') ? -dx : dx) && w1.h === w0.h + (h.includes('n') ? -dy : dy)
    if (!anchored || !sized || JSON.stringify(where(r)) !== home) bad.push(`${h} ${dx},${dy}: ${r.x},${r.y} ${r.card.grid.cols}×${r.card.grid.rows} ${JSON.stringify(where(r))}`)
  }
  assert('resize: every corner keeps the opposite edge fixed and text, sites and paint where they were on screen', !bad.length, bad.join(' | '))
  const snapped = resizeByHandle(base, 'se', 5, 7)
  assert('resize: drags round to whole cells (5 px, 7 px at 4 px pitch → +1, +2)', snapped.card.grid.cols === 41 && snapped.card.grid.rows === 32)
  const tiny = resizeByHandle(base, 'nw', 4000, 4000), huge = resizeByHandle(base, 'se', 1e5, 1e5)
  assert('resize: a frame stays 8…512 cells a side, and a clamped west / north drag still pins the far edge', tiny.card.grid.cols === 8 && tiny.card.grid.rows === 8 && tiny.x + 8 * 4 === base.x + 40 * 4 && tiny.y + 8 * 4 === base.y + 30 * 4 && huge.card.grid.cols === 512 && huge.card.grid.rows === 512)
  const crop = resizeFrame(base, 10, 10), cropped = crop.card.layers[0] as PaintLayer
  assert('resize: shrinking crops paint (a cell outside the frame is gone), never stretches it', cropped.cols === 10 && paintCells(cropped).every(v => v === 0))
  const l2 = drawingCard(40, 30, 4, 2).layers[0] as PaintLayer, l2c = paintCells(l2).slice()
  l2c[3 * l2.cols + 4] = 255
  const lat2: EditorFrame = { ...base, card: { ...drawingCard(40, 30, 4, 2), layers: [{ ...l2, cells: encodeCells(l2c) }] } }
  const lp = resizeByHandle(lat2, 'nw', -16, -8).card.layers[0] as PaintLayer, li = paintCells(lp).indexOf(255)
  assert('resize: a 2× lattice paint layer shifts by whole lattice cells (4 cells left, 2 up → 2, 1 lattice cells)', lp.cols === 22 && lp.rows === 16 && li % lp.cols === 6 && Math.floor(li / lp.cols) === 4, `${lp.cols}×${lp.rows} at ${li % lp.cols},${Math.floor(li / lp.cols)}`)

  // ── hit tests: hidden things are not hit; overlapping frames hit the top one
  let hd = addFrame(addFrame(empty(), blankCard(), { at: { x: 0, y: 0 } }).doc, blankCard(), { at: { x: 100, y: 100 } }).doc
  const [h0, h1] = hd.frames
  assert('hit: of two overlapping frames the one drawn last is hit; raiseFrame flips it', hitFrame(hd, 150, 150)?.id === h1.id && hitFrame(raiseFrame(hd, h0.id), 150, 150)?.id === h0.id && hitFrame(hd, 50, 50)?.id === h0.id)
  assert('hit: a hidden frame is not hit', hitFrame(editFrame(hd, h1.id, f => ({ ...f, hidden: true })), 150, 150)?.id === h0.id)
  const tx = textLayer('HI', { params: { col: 10, row: 10 } })
  hd = addLayer(hd, h0.id, tx)
  const fx = frameById(hd, h0.id)!, pitch = fx.card.grid.pitch!, px = 10 * pitch + pitch
  const on = hitLayer(fx, px, px), off = hitLayer(editLayer(hd, { frame: h0.id, layer: tx.id }, l => ({ ...l, visible: false })).frames[0], px, px)
  assert('hit: an invisible layer is not hit; an empty layer has no bounds', on?.id === tx.id && !off && !layerBounds(fx, irLayer('0')), `${on?.kind} ${off?.kind}`)
  assert('hit: boundsOf covers the visible frames (or the ones asked for)', JSON.stringify(boundsOf(hd)) === JSON.stringify([0, 0, 100 + frameSize(h1).w, 100 + frameSize(h1).h]) && JSON.stringify(boundsOf(hd, [h0.id])) === JSON.stringify([0, 0, frameSize(h0).w, frameSize(h0).h]) && !boundsOf(empty()))

  // ── camera: zoom about a point, pinch, fit
  const cam = { x: 30, y: -20, z: 1.5 }, toWorld = (c: typeof cam, sx: number, sy: number) => [(sx - c.x) / c.z, (sy - c.y) / c.z]
  const zc = zoomCam(cam, 3, 200, 120), w0 = toWorld(cam, 200, 120), w1 = toWorld(zc, 200, 120)
  assert('camera: zoom keeps the world point under the pointer fixed', zc.z === 3 && Math.abs(w0[0] - w1[0]) < 1e-9 && Math.abs(w0[1] - w1[1]) < 1e-9)
  assert('camera: zoom is clamped to 10 %…1600 %', zoomCam(cam, 1e3, 0, 0).z === ZOOM_MAX && zoomCam(cam, 1e-3, 0, 0).z === ZOOM_MIN && ZOOM_MIN === .1 && ZOOM_MAX === 16)
  const pc = pinchCam(cam, 100, 300, 200, 200, 320, 210), pw0 = toWorld(cam, 300, 200), pw1 = toWorld(pc, 320, 210)
  assert('camera: pinching apart ×2 doubles the zoom and the world point between the fingers follows them', pc.z === 3 && Math.abs(pw0[0] - pw1[0]) < 1e-9 && Math.abs(pw0[1] - pw1[1]) < 1e-9)
  const box = [100, 50, 500, 250] as const, fc = fitCam(box, 1000, 600, 8)
  const sx0 = box[0] * fc.z + fc.x, sx1 = box[2] * fc.z + fc.x, sy0 = box[1] * fc.z + fc.y, sy1 = box[3] * fc.z + fc.y
  assert('camera: fit centres the box in the viewport with padding, capped at max zoom', sx0 >= 24 - 1e-9 && sx1 <= 1000 - 24 + 1e-9 && sy0 >= 24 - 1e-9 && sy1 <= 600 - 24 + 1e-9 && Math.abs((sx0 + sx1) / 2 - 500) < 1e-9 && Math.abs((sy0 + sy1) / 2 - 300) < 1e-9 && fitCam(box, 1000, 600, 1).z === 1 && fitCam(undefined, 800, 400).x === 400, JSON.stringify(fc))

  // ── gestures: drag snapping, whole-cell layer drags, the Frame tool
  assert('gesture: a dragged frame snaps to 4 px (Shift: 1 px)', JSON.stringify(dragFramePos(100, 40, 5.9, -3.1)) === '{"x":104,"y":36}' && JSON.stringify(dragFramePos(100, 40, 5.9, -3.1, true)) === '{"x":106,"y":37}')
  assert('gesture: a dragged layer moves in whole cells', dragCells(4, 5.9, -6.1).join() === '1,-2' && dragCells(2.25, 1, 1).join() === '0,0')
  const big = draftFrame(300, 200, 120, 92), click = draftFrame(300, 200, 305, 204)
  assert('gesture: dragging out a frame (any direction) makes a card of that size at its top-left, in 2.25 px cells', big.grid?.cols === Math.round(180 / FRAME_PITCH) && big.grid?.rows === Math.round(108 / FRAME_PITCH) && big.grid.pitch === FRAME_PITCH && big.at.x === 120 && big.at.y === 92)
  assert('gesture: a click with the Frame tool makes the default tile centred on it; a small drag is still ≥ 8 cells', !click.grid && click.at.x === 300 - 162 && click.at.y === 200 - 162 && draftFrame(0, 0, 13, 13).grid?.cols === 8)

  // ── tools and entries: V H F B T C, and every old MAKE mode / link lands on its tool and panels
  const keys: Record<string, string> = { v: 'move', h: 'hand', f: 'frame', b: 'draw', t: 'text', c: 'code' }
  assert('tools: V H F B T C pick move / hand / frame / draw / text / code (P = draw)', Object.entries(keys).every(([k, t]) => KEY_TOOL[k] === t) && KEY_TOOL.p === 'draw')
  const at = (u: string) => { const x = new URL(u, 'https://x'); return viewFromUrl(x.search, x.pathname) }
  const links: [string, string, string, string][] = [
    ['/?make', 'move', 'assets', 'design'], ['/?make=tune', 'move', 'assets', 'design'], ['/?tab=workspace', 'move', 'assets', 'design'],
    ['/?make=compose', 'move', 'layers', 'design'], ['/?tab=studio', 'move', 'layers', 'design'], ['/light/?tab=STUDIO', 'move', 'layers', 'design'],
    ['/?make=draw', 'draw', 'layers', 'design'], ['/?tab=draw', 'draw', 'layers', 'design'], ['/?worker=0&tab=draw', 'draw', 'layers', 'design'],
    ['/?make=code', 'move', 'layers', 'code'], ['/?tab=dots', 'move', 'layers', 'code'], ['/?tab=dots&p=zAbC', 'move', 'layers', 'code'], ['/?p=zAbC', 'move', 'layers', 'code'],
  ]
  const off2 = links.filter(([u, tool, left, right]) => { const v = at(u), e = MODE_ENTRY[v.mode]; return v.view !== 'MAKE' || e.tool !== tool || e.left !== left || e.right !== right }).map(([u]) => `${u} → ${at(u).view}/${at(u).mode}`)
  assert('entries: every ?make= / old ?tab= link opens the editor on its tool and panels', !off2.length && MODES.every(m => MODE_ENTRY[m]), off2.join('; '))
  const codeSel = codeTarget(seed, {}), ripple = seed.frames.find(f => f.source?.startsWith('program:'))!
  assert('entries: CODE selects the top code layer (or keeps a selected one)', codeSel?.frame === ripple.id && codeSel.layer === topDown(ripple.card)[0].id && codeTarget(seed, codeSel) === undefined && codeTarget(empty(), {}) === undefined)
  const withDraw = addFrame(seed, drawingCard()), drawF = withDraw.frame, pt = paintTarget(withDraw.doc, { frame: seed.frames[0].id })
  assert('entries: DRAW selects a paint layer (the selected frame\'s, else the first frame with one); none keeps the selection', paintTarget(seed, {}) === undefined && pt?.frame === drawF.id && pt.layer === drawF.card.layers[0].id)

  // ── history: tags coalesce, gestures are one step, a cancelled or empty gesture leaves nothing
  const s = useEditor.getState(), name = () => useEditor.getState().h.present.name
  s.edit(() => seed)
  const p0 = useEditor.getState().h.past.length, rename = (n: string) => (x: EditorDoc) => ({ ...x, name: n })
  s.edit(rename('a'), 'doc:name'); s.edit(rename('ab'), 'doc:name'); s.edit(rename('abc'), 'doc:name')
  const p1 = useEditor.getState().h.past.length
  s.edit(rename('x'), 'other'); s.edit(rename('y'))
  const p2 = useEditor.getState().h.past.length
  assert('history: edits with the same tag (typing) coalesce into one step; other tags and untagged edits do not', p1 === p0 + 1 && p2 === p1 + 2 && COALESCE_MS > 0, `${p0} → ${p1} → ${p2}`)
  s.undo(); s.undo()
  const undone = name()
  s.redo()
  assert('history: undo walks back through them, redo forward', undone === 'abc' && name() === 'x', `${undone} → ${name()}`)
  const before = useEditor.getState().h
  s.begin(); s.live(rename('moving')); s.live(rename('moving more')); s.cancel()
  const afterCancel = useEditor.getState().h
  s.begin(); s.end()
  const afterEmpty = useEditor.getState().h
  assert('history: a cancelled gesture restores the document; an empty one adds no step', afterCancel.present === before.present && afterCancel.past.length === before.past.length && afterEmpty.past.length === before.past.length)
  s.begin(); s.live(rename('drawn')); s.end()
  assert('history: a finished gesture clears redo', useEditor.getState().h.future.length === 0 && name() === 'drawn')
  for (let i = 0; i < 130; i++) s.edit(rename(`n${i}`))
  assert('history: at most 100 undo steps are kept', useEditor.getState().h.past.length === 100)

  // ── storage: autosave round trip; a corrupt or foreign entry is ignored
  const mem = new Map<string, string>(), kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
  const saved = saveDoc(seed, kv), loaded = loadDoc(kv)
  mem.set(EDITOR_KEY, '{"kind":"x"}'); const foreign = loadDoc(kv)
  mem.set(EDITOR_KEY, '{'); const broken = loadDoc(kv)
  assert('storage: saveDoc / loadDoc round-trip; a corrupt or foreign entry loads nothing', saved && !!loaded && docToJSON(loaded) === docToJSON(seed) && !foreign && !broken && !loadDoc({ getItem: () => null, setItem: () => {} }))

  e2Checks(assert)
}

/** E2: selection sets, marquee, group bounds and resize, align / distribute, guides, groups, locks, clipboard, migration, undo granularity. */
function e2Checks(assert: Assert) {
  const empty = (): EditorDoc => ({ kind: 'dot480.editor', v: 2, name: 't', frames: [] })
  const row = (n: number, gap = 100) => { let d = empty(); for (let i = 0; i < n; i++) d = addFrame(d, blankCard({ cols: 20, rows: 20, pitch: 4 }), { at: { x: i * gap, y: 0 } }).doc; return d }
  const pos = (d: EditorDoc) => d.frames.map(f => `${f.x},${f.y}`).join(' ')

  // ── selection sets: ⇧-click toggles at the right level, the primary hands over, undo-proof
  const d0 = row(3), [A, B, C] = d0.frames.map(f => f.id)
  let s = toggleSel({}, { frame: A }); s = toggleSel(s, { frame: B }); s = toggleSel(s, { frame: C })
  const three = selFrames(s).join()
  s = toggleSel(s, { frame: A })
  assert('select: ⇧-click adds frames and takes one out (the next becomes primary)', three === [A, B, C].join() && s.frame === B && selFrames(s).join() === [B, C].join() && !s.layer && selCount(s) === 2)
  const t1 = textLayer('A', { params: { col: 1, row: 1 } }), t2 = textLayer('B', { params: { col: 1, row: 10 } }), t3 = textLayer('C', { params: { col: 10, row: 1 } })
  let dl = [t1, t2, t3].reduce((x, l) => addLayer(x, A, l), d0)
  let ls = toggleSel(toggleSel({ frame: A, layer: t1.id }, { frame: A, layer: t2.id }), { frame: A, layer: t3.id })
  const lsAll = selLayers(ls).join()
  ls = toggleSel(toggleSel(toggleSel(ls, { frame: A, layer: t1.id }), { frame: A, layer: t2.id }), { frame: A, layer: t3.id })
  const across = toggleSel({ frame: A, layer: t1.id }, { frame: B, layer: 'x' })
  assert('select: layers of one frame toggle as layers; the last one out leaves the frame; a layer of another frame makes it frames', lsAll === [t1.id, t2.id, t3.id].join() && ls.frame === A && !ls.layer && selFrames(across).join() === [A, B].join() && !across.layer)
  assert('select: a layer of the one selected frame starts a layer selection; with many frames it toggles the frame', toggleSel({ frame: A }, { frame: A, layer: t1.id }).layer === t1.id && selFrames(toggleSel({ frame: A, more: [B] }, { frame: A, layer: t1.id })).join() === B)
  assert('select: framesSel / layersSel dedupe and set the primary first', framesSel([B, B, A]).more?.join() === A && layersSel(A, []).layer === undefined && inSel({ frame: A, more: [B] }, { frame: B }) && !inSel({ frame: A, layer: t1.id }, { frame: A, layer: t2.id }))
  const gone = validSel(removeFrames(d0, [A]), { frame: A, more: [B, 'nope'] }), goneL = validSel(removeLayers(dl, A, [t1.id]), { frame: A, layer: t1.id, more: [t2.id] })
  assert('select: validSel drops what is gone and hands the primary over', gone.frame === B && !gone.more && goneL.layer === t2.id && !goneL.more)
  const locked = lockFrames(editFrame(d0, C, f => ({ ...f, hidden: true })), [B])
  assert('select: ⌘A takes every visible, unlocked frame (or every unlocked layer of the frame)', selFrames(selectAll(locked, {})).join() === A && selLayers(selectAll(lockLayers(dl, A, [t2.id], true), { frame: A, layer: t1.id })).sort().join() === [t1.id, t3.id].sort().join())

  // ── marquee: frames it touches (not hidden, not locked); ⇧ adds; layers by their dots
  const mq = marqueeFrames(d0, normBox(150, 90, 70, -10)), mqLocked = marqueeFrames(lockFrames(d0, [B]), [85, -10, 250, 90])
  assert('marquee: a box (any direction) selects the frames it touches; locked and hidden ones are skipped', mq.join() === [A, B].join() && mqLocked.join() === C && !marqueeFrames(d0, [81, 0, 99, 50]).length)
  assert('marquee: ⇧ adds to the selection; without it replaces it', selFrames(marqueeSel(d0, [210, 0, 220, 10], { frame: A }, true)).join() === [A, C].join() && selFrames(marqueeSel(d0, [210, 0, 220, 10], { frame: A }, false)).join() === C)
  const fa = frameById(dl, A)!
  assert('marquee: inside a frame it picks the layers whose lit dots it touches', marqueeLayers(fa, [0, 0, 20, 20]).join() === t1.id && marqueeLayers(fa, [0, 0, 80, 80]).length === 3 && !marqueeLayers(fa, [70, 70, 79, 79]).length)

  // ── groups: group / ungroup round trip, adjacency, tidy, units, a click on a member selects the group
  const lone = textLayer('D', { params: { col: 12, row: 12 } })
  dl = addLayer(dl, A, lone) // stack top → bottom: D, C, B, A
  const g = groupLayers(dl, A, [t1.id, t3.id])
  const fg = frameById(g.doc, A)!, order = topDown(fg.card).map(l => l.id)
  assert('group: grouping makes the members adjacent at the topmost member\'s place, and keeps everything else', !!g.id && order.join() === [lone.id, t3.id, t1.id, t2.id].join() && fg.groups?.[0].layers.join() === [t3.id, t1.id].join() && unitsOf(fg).length === 3)
  const ug = ungroup(g.doc, A, g.id!), fu = frameById(ug, A)!
  assert('group: ungroup dissolves it and leaves the layers where they are (round trip through JSON too)', !fu.groups && topDown(fu.card).map(l => l.id).join() === order.join() && docToJSON(docFromJSON(docToJSON(g.doc))) === docToJSON(g.doc))
  const pushed = frameById(moveLayer(g.doc, { frame: A, layer: t2.id }, 2), A)!, dropped = frameById(removeLayers(g.doc, A, [t1.id, t3.id]), A)!, half = frameById(removeLayers(g.doc, A, [t1.id]), A)!
  assert('group: a layer moved into a group\'s run is pushed below it; removed members leave; an empty group goes', topDown(pushed.card).map(l => l.id).join() === order.join() && !dropped.groups && half.groups?.[0].layers.join() === t3.id)
  const regroup = groupLayers(g.doc, A, [t1.id, t2.id]), fr2 = frameById(regroup.doc, A)!
  assert('group: a layer is in one group at most (grouping it again takes it out of the old one)', fr2.groups?.length === 2 && fr2.groups[0].layers.join() === t3.id && fr2.groups[1].layers.join() === [t1.id, t2.id].join())
  const cg = clickLayer(fg, t1.id, {}), deeper = clickLayer(fg, t1.id, cg), deep = clickLayer(fg, t1.id, {}, true)
  assert('group: a click on a member selects the whole group; a second click (or ⌘) the one layer', selLayers(cg).sort().join() === [t1.id, t3.id].sort().join() && cg.layer === t1.id && selGroup(g.doc, cg)?.id === g.id && selLayers(deeper).join() === t1.id && selLayers(deep).join() === t1.id)
  const sh = frameById(shiftLayers(g.doc, A, [t1.id, t3.id], -1), A)!, sh2 = frameById(shiftLayers(g.doc, A, [t2.id], -1), A)!
  assert('group: Ctrl+] moves a group as one unit; a layer below steps over the whole group', topDown(sh.card).map(l => l.id).join() === [t3.id, t1.id, lone.id, t2.id].join() && topDown(sh2.card).map(l => l.id).join() === [lone.id, t2.id, t3.id, t1.id].join())
  const cl = copyLayers(g.doc, A, [t1.id, t3.id]), fcl = frameById(cl.doc, A)!, part = frameById(copyLayers(g.doc, A, [t1.id]).doc, A)!
  assert('group: duplicating a whole group makes a new group; part of a group joins it', cl.ids.length === 2 && fcl.groups?.length === 2 && fcl.groups[1].layers.every(id => cl.ids.includes(id)) && part.groups?.length === 1 && part.groups[0].layers.length === 3)

  // ── locks: locked frames let a click through; locked layers are not hit
  const lk = lockFrames(d0, [B])
  assert('lock: a locked frame is passed through by hitFrame(…, skipLocked) and flips back', hitFrame(lk, 110, 10)?.id === B && !hitFrame(lk, 110, 10, true) && !frameById(lockFrames(lk, [B]), B)!.locked)
  const lkl = lockLayers(dl, A, [t1.id], true), fl = frameById(lkl, A)!
  assert('lock: a locked layer is not hit (the click finds the frame), and unlocks', hitLayer(frameById(dl, A)!, 1 * 4 + 6, 1 * 4 + 6)?.id === t1.id && !hitLayer(fl, 1 * 4 + 6, 1 * 4 + 6) && !frameById(lockLayers(lkl, A, [t1.id], false), A)!.locks)

  // ── group bounds and resize from the box, anchored at the opposite corner
  const rd = row(2, 120), fs0 = rd.frames, box0 = framesBox(rd, fs0.map(f => f.id))!
  const se = resizeGroup(fs0, 'se', 200, 80), boxSe = unionBox(se.map(frameBox))!
  const nw = resizeGroup(fs0, 'nw', -200, -80), boxNw = unionBox(nw.map(frameBox))!
  assert('group resize: the box spans the frames; SE keeps the top-left, NW keeps the bottom-right, frames scale in whole cells', JSON.stringify(box0) === '[0,0,200,80]' && boxSe[0] === 0 && boxSe[1] === 0 && se[0].card.grid.cols === 40 && se[1].x === 240 && nw[1].x + frameSize(nw[1]).w === 200 && boxNw[3] === 80 && nw.every(f => Number.isInteger(f.card.grid.cols)), `${JSON.stringify(boxSe)} ${JSON.stringify(boxNw)}`)
  const tiny = resizeGroup(fs0, 'se', -1e4, -1e4)
  assert('group resize: frames stay ≥ 8 cells; reference frames are not resizable from the box', tiny.every(f => f.card.grid.cols === 8 && f.card.grid.rows === 8) && !canResize([{ ...fs0[0], card: { ...fs0[0].card, reference: 'level-03' } }]) && canResize(fs0))

  // ── align / distribute
  const ad = editFrame(editFrame(row(3), row(3).frames[1].id, f => f), row(3).frames[0].id, f => f)
  let jag = ad; jag = editFrame(jag, jag.frames[1].id, f => ({ ...f, x: 130, y: 40 })); jag = editFrame(jag, jag.frames[2].id, f => ({ ...f, x: 300, y: 10 }))
  const ids3 = jag.frames.map(f => f.id), left = arrangeFrames(jag, ids3, 'left'), bottom = arrangeFrames(jag, ids3, 'bottom'), dist = arrangeFrames(jag, ids3, 'dist-x')
  const gaps = dist.frames.map(frameBox).sort((a, b) => a[0] - b[0]).map((b, i, all) => (i ? b[0] - all[i - 1][2] : 0)).slice(1)
  assert('align: left / bottom line the frames up on the selection box', left.frames.every(f => f.x === 0) && bottom.frames.every(f => f.y + 80 === 120) && left.frames[1].y === 40)
  assert('distribute: equal gaps, the outer frames stay', Math.abs(gaps[0] - gaps[1]) < .5 && dist.frames[0].x === 0 && dist.frames[2].x === 300 && arrangeFrames(d0, [A, B], 'dist-x') === d0)
  assert('align: raw deltas (centres; distribute needs 3)', JSON.stringify(alignDeltas([[0, 0, 10, 10], [20, 0, 40, 10]], 'hcenter')) === '[[15,0],[-10,0]]' && distributeDeltas([[0, 0, 1, 1], [5, 0, 6, 1]], 'x').every(([x]) => x === 0))
  const al = arrangeLayers(dl, A, [t1.id, t3.id], 'left'), at1 = frameById(al, A)!.card.layers.find(l => l.id === t3.id) as TextLayer
  assert('align: text layers align by their dots in whole cells', at1.params.col === 1 && Number.isInteger(at1.params.col))

  // ── smart guides and spacing
  const others: [number, number, number, number][] = [[0, 0, 100, 100], [300, 0, 400, 100]]
  const sn = snapBox([104, 150, 204, 250], others, 6), far = snapBox([120, 150, 220, 250], others, 6), mid = snapBox([147, 3, 247, 103], others, 6)
  assert('guides: a box within reach snaps its edge to another frame\'s edge and shows the guide; out of reach nothing moves', sn.dx === -4 && sn.guides.some(gd => gd.axis === 'x' && gd.at === 100) && far.dx === 0 && !far.guides.some(gd => gd.axis === 'x'))
  assert('guides: between two neighbours it snaps to equal spacing, and both gaps are measured', mid.dx === 3 && mid.gaps.filter(gp => gp.axis === 'x').map(gp => gp.b - gp.a).join() === '50,50' && mid.dy === -3, JSON.stringify(mid))

  // ── clipboard: round trip, new ids, paste offsets, cut pastes in place, layers, groups, bad clips
  const cd = g.doc
  const clipF = clipOf(cd, framesSel([A, B]))!, json = clipToJSON(clipF), back = clipFromJSON(json)
  const p1 = pasteClip(cd, back, {}), p1d = typeof p1 === 'string' ? cd : p1.doc
  const newIds = typeof p1 === 'string' ? [] : selFrames(p1.sel), copyA = frameById(p1d, newIds[0])!
  assert('clip: frames round-trip as JSON and paste with new frame, card, layer and group ids, 24 px aside', typeof p1 === 'object' && newIds.length === 2 && copyA.x === 24 && copyA.y === 24 && copyA.id !== A && copyA.card.id !== frameById(cd, A)!.card.id && copyA.card.layers.every(l => !frameById(cd, A)!.card.layers.some(m => m.id === l.id)) && copyA.groups?.[0].layers.every(id => copyA.card.layers.some(l => l.id === id)) === true)
  const p2 = pasteClip(p1d, back, {}), cut = pasteClip(removeFrames(cd, [A, B]), back, {})
  assert('clip: pasting again steps aside again; after a cut it pastes back in place', typeof p2 === 'object' && frameById(p2.doc, selFrames(p2.sel)[0])!.x === 48 && typeof cut === 'object' && frameById(cut.doc, selFrames(cut.sel)[0])!.x === 0)
  const clipL = clipOf(cd, layersSel(A, [t1.id, t3.id, lone.id]))!
  const pl1 = pasteClip(cd, clipFromJSON(clipToJSON(clipL)), { frame: A }), pl2 = pasteClip(cd, clipL, { frame: B }), pl3 = pasteClip(empty(), clipL, {})
  const fpl = typeof pl1 === 'object' ? frameById(pl1.doc, A)! : undefined, pasted = typeof pl1 === 'object' ? selLayers(pl1.sel) : []
  const movedT = fpl?.card.layers.find(l => pasted.includes(l.id) && l.kind === 'text' && l.params.text === 'A') as TextLayer | undefined
  assert('clip: layers paste on top of the frame, the group with them, text 2 cells aside when it would sit on its original', !!fpl && pasted.length === 3 && fpl.groups?.length === 2 && topDown(fpl.card).slice(0, 3).every(l => pasted.includes(l.id)) && movedT?.params.col === 3 && movedT.params.row === 3, `${movedT?.params.col},${movedT?.params.row}`)
  const into = typeof pl2 === 'object' ? frameById(pl2.doc, B)! : undefined
  assert('clip: into another frame they keep their cells; onto an empty canvas they get a frame like the one they came from', !!into && into.card.layers.length === 3 && (into.card.layers.find(l => l.kind === 'text' && l.params.text === 'D') as TextLayer).params.col === 12 && typeof pl3 === 'object' && pl3.doc.frames.length === 1 && pl3.doc.frames[0].card.grid.cols === 20)
  const bad = ['{', '{"kind":"dot480.clip","v":1,"frames":[],"layers":[],"groups":[]}', JSON.stringify({ ...clipF, frames: [{ ...clipF.frames[0], theme: 'pink' }] }), JSON.stringify({ ...clipL, src: undefined })].map(j => { try { clipFromJSON(j); return '' } catch (e) { return (e as Error).message } })
  assert('clip: broken, empty, invalid or source-less clips are rejected with a reason; foreign text is not a clip', bad.every(Boolean) && !asClip('hello') && !asClip(undefined) && !!asClip(json), bad.join(' | '))
  const full = { ...empty(), frames: Array.from({ length: MAX_FRAMES }, (_, i) => frameOf(blankCard(), { x: i * 400, y: 0 })) }
  assert('clip: a paste that would pass the frame limit is refused', typeof pasteClip(full, back, {}) === 'string')

  // ── migration: a v1 document (and a v1 autosave) loads as v2; a future version or a bad group does not
  const v1 = { ...structuredClone(seedDoc()), v: 1 }, mig = docFromJSON(JSON.stringify(v1))
  const mem = new Map<string, string>([[EDITOR_KEY, JSON.stringify(v1)]]), kv = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) }
  const loaded = loadDoc(kv)
  const future = (() => { try { docFromJSON(JSON.stringify({ ...v1, v: EDITOR_VERSION + 1 })); return '' } catch (e) { return (e as Error).message } })()
  const badGroup = (() => { try { const x = structuredClone(g.doc); (x.frames[0].groups as unknown) = [{ id: 1 }]; docFromJSON(JSON.stringify(x)); return '' } catch (e) { return (e as Error).message } })()
  const dangling = structuredClone(g.doc); dangling.frames[0].groups![0].layers.push('ghost'); dangling.frames[0].locks = ['ghost']
  const tidied = docFromJSON(JSON.stringify(dangling)).frames[0]
  assert('migrate: a v1 document and a v1 autosave load as v2 with every frame', EDITOR_VERSION === 2 && mig.v === 2 && mig.frames.length === v1.frames.length && migrateDoc(v1) !== v1 && migrateDoc(mig) === mig && loaded?.v === 2 && loaded.frames.length === v1.frames.length)
  assert('migrate: a newer version or a malformed group is rejected; ids of missing layers are dropped', /version/.test(future) && /groups/.test(badGroup) && !tidied.groups![0].layers.includes('ghost') && !tidied.locks, `${future} | ${badGroup}`)

  // ── undo granularity: every command is one step, a gesture (Alt-drag copy + move) is one step
  const st = useEditor.getState, steps = () => st().h.past.length
  useEditor.setState({ h: historyOf(g.doc) }); st().select(framesSel([A, B]))
  const runs: [string, () => void, (d: EditorDoc) => boolean][] = [
    ['duplicate', duplicateSel, d => d.frames.length === 5],
    ['delete', () => { st().select(framesSel(selFrames(st().sel))); deleteSel() }, d => d.frames.length === 3],
    ['an edit', () => { st().select(framesSel([A, B, C])); st().edit(x => editFrame(x, B, f => ({ ...f, y: 30 }))) }, d => frameById(d, B)!.y === 30],
    ['align', () => arrangeSel('top'), d => d.frames.every(f => f.y === 0)],
    ['lock', lockSel, d => d.frames.every(f => f.locked)],
    ['unlock', lockSel, d => d.frames.every(f => !f.locked)],
    ['copy + paste', () => { copySel(); paste() }, d => d.frames.length === 6],
    ['group', () => { st().select(layersSel(A, [t2.id, lone.id])); groupSel() }, d => (frameById(d, A)?.groups?.length ?? 0) === 2],
    ['ungroup', ungroupSel, d => (frameById(d, A)?.groups?.length ?? 0) === 1],
  ]
  const off: string[] = []
  for (const [name, run, ok] of runs) { const n = steps(); run(); const dd = st().h.present; if (steps() !== n + 1 || !ok(dd)) off.push(`${name}: ${steps() - n} steps`) }
  assert('undo: duplicate, delete, align, lock, paste, group, ungroup are one undo step each', !off.length, off.join(' | '))
  assert('clip: a copy offers PASTE (store state, so the phone bar re-renders)', st().hasClip)
  const n0 = steps(), base = st().h.present
  st().select(framesSel([A, C])); nudgeSel(1, 0); nudgeSel(1, 0); nudgeSel(0, 1)
  assert('undo: a run of nudges of many coalesces into one step; undo puts them all back', steps() === n0 + 1 && frameById(st().h.present, C)!.x === frameById(base, C)!.x + 2 && (st().undo(), st().h.present === base))
  const n1 = steps()
  st().begin(); const cp = copyFrames(st().h.present, [A, C], 0, 0); st().live(() => cp.doc)
  for (let i = 1; i <= 4; i++) st().live(x => ({ ...x, frames: x.frames.map(f => (cp.ids.includes(f.id) ? { ...f, y: f.y + 10 } : f)) }))
  st().end()
  const afterAlt = st().h.present
  st().undo()
  assert('undo: an Alt-drag (copies made in place, then moved) is one step, and undo takes the copies away', steps() === n1 && afterAlt.frames.length === base.frames.length + 2 && st().h.present.frames.length === base.frames.length && pos(st().h.present) === pos(base))
  st().redo()
  assert('undo: redo brings the moved copies back; the selection survives undo of a deleted selection', st().h.present === afterAlt && (st().select(framesSel(cp.ids)), st().undo(), !st().sel.frame || !cp.ids.includes(st().sel.frame!)))
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('editor.ts')) {
  let failed = 0
  editorChecks((name, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${detail && !cond ? ` — ${detail}` : ''}`); if (!cond) failed++ })
  if (failed) { console.error(`\n${failed} editor check(s) failed`); process.exit(1) }
  console.log('\nAll editor checks passed')
  process.exit(0)
}
