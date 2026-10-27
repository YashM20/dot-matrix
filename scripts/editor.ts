/**
 * MAKE editor checks (docs/EDITOR-PLAN.md): the multi-frame document round-trips, frames are placed
 * without overlap, paint layers draw exactly the cells painted (through the engine), a frame resized
 * from its left / top keeps text, sites and paint where they were, layer order, hit tests and bounds by
 * dots, share links for code layers, and one undo step per gesture. `pnpm verify` runs them through
 * `editorChecks()`; run alone with `npx tsx scripts/editor.ts`. The browser side: `scripts/studio-browser.ts`.
 */
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { compileCard, paintCells, paintLayer, textLayer, validateCard, type PaintLayer, type TextLayer } from '../src/components/studio/doc'
import { addFrame, addLayer, blankCard, docFromJSON, docToJSON, drawingCard, editLayer, encodeCells, frameSize, hitFrame, hitLayer, layerBounds, moveLayer, resizeFrame, seedDoc, shareable, stamp, topDown, type EditorDoc } from '../src/components/editor/doc'
import { useEditor } from '../src/components/editor/store'

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
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('editor.ts')) {
  let failed = 0
  editorChecks((name, cond, detail = '') => { console.log(`${cond ? '✓' : '✗'} ${name}${detail && !cond ? ` — ${detail}` : ''}`); if (!cond) failed++ })
  if (failed) { console.error(`\n${failed} editor check(s) failed`); process.exit(1) }
  console.log('\nAll editor checks passed')
  process.exit(0)
}
