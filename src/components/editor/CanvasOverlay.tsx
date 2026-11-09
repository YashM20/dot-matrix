/**
 * The editor canvas's overlay in screen space (split from Canvas.tsx): frame labels, hover and selection outlines, resize,
 * bounds and sites handles, typing in place, the marquee, smart guides and gaps, the frame being drawn, the quick bar,
 * the long-press menu and the brush ring.
 */
import type { CSSProperties } from 'react'
import type { StudioLayer } from '../studio/doc'
import { frameById, frameSize, layerOf, pitchOf, topDown, type EditorDoc, type EditorFrame, type Sel } from './doc'
import type { Camera, Handle } from './input'
import { canResize, framesBox, selCount, selFrames, selLayers, type Box, type Gap, type Guide } from './select'
import { hasBounds, layerBox, siteHandles } from './direct'
import { InText, LongPressMenu, QuickBar } from './OnCanvas'
import { getEditor, useEditor, type EditorStore } from './store'
import type { Hover } from './gestures'

const CORNERS: Handle[] = ['nw', 'ne', 'sw', 'se']
const SITE_LABEL: Record<string, string> = { r: 'Radius', sweep: 'Arc sweep', a: 'Line start' }
/** A world box on screen. */
const scr = (cam: Camera, b: Box): CSSProperties => ({ left: b[0] * cam.z + cam.x, top: b[1] * cam.z + cam.y, width: (b[2] - b[0]) * cam.z, height: (b[3] - b[1]) * cam.z })
/** A frame on screen, or a box inside it (frame px). */
const box = (cam: Camera, f: EditorFrame, b?: [number, number, number, number]): CSSProperties => {
  const { w, h } = frameSize(f), [x0, y0, x1, y1] = b ?? [0, 0, w, h]
  return scr(cam, [f.x + x0, f.y + y0, f.x + x1, f.y + y1])
}
const handles = (group: boolean, id?: string) => CORNERS.map(hd => <i key={hd} className={`ed-handle ${hd}`} data-handle={hd} data-frame-id={id} data-group={group ? '1' : undefined} />)

/** What the selection shows: its frame and layer, the frames picked, the group box, and for one layer its box and bar. */
function selectionOf(doc: EditorDoc, sel: Sel, tool: EditorStore['tool'], typing: EditorStore['typing']) {
  const selFrame = frameById(doc, sel.frame), selLayer = layerOf(doc, sel)
  const selFr = selFrames(sel), selSet = new Set(selFr) // the overlay re-renders per pointer move
  const picked = selFr.map(id => frameById(doc, id)).filter((f): f is EditorFrame => !!f && !f.hidden), many = picked.length > 1
  const groupBox = many ? framesBox(doc, picked.map(f => f.id)) : undefined
  const resizable = !many && !!selFrame && !selLayer && !selFrame.card.reference && !selFrame.locked
  const pickedLayers = selFrame && sel.layer ? selLayers(sel).map(id => selFrame.card.layers.find(l => l.id === id)).filter((l): l is StudioLayer => !!l) : []
  // E3: one layer selected → its box, its own handles (sites, spec bounds) and the quick bar
  const one = selFrame && !selFrame.hidden && selLayer && selCount(sel) === 1 ? selLayer : undefined
  const free = !!one && !!selFrame && !selFrame.locked && !selFrame.locks?.includes(one.id)
  const direct = free && !selFrame.card.reference && tool === 'move' && !typing
  const oneBox = one && selFrame ? layerBox(selFrame, one) ?? [0, 0, frameSize(selFrame).w, frameSize(selFrame).h] : undefined
  const showBar = !!oneBox && free && (tool === 'move' || (tool === 'draw' && one.kind === 'paint'))
  return { selFrame, selLayer, selSet, picked, many, groupBox, resizable, pickedLayers, one, direct, oneBox, showBar }
}

/** The brush ring's cell, in screen px: the painted layer's lattice on the frame under the pointer (or the selected one). */
function brushCellOf(doc: EditorDoc, hover: Hover, selFrame: EditorFrame | undefined, selLayer: StudioLayer | undefined, zoom: number) {
  const f = hover.frame ? frameById(doc, hover.frame) : selFrame, l = selLayer?.kind === 'paint' ? selLayer : f && topDown(f.card).find(x => x.kind === 'paint')
  return (f ? pitchOf(f.card) * (l && 'lattice' in l ? l.lattice : 1) : 4) * zoom
}

function FrameLabels({ frames, sel, selSet, cam }: { frames: EditorFrame[]; sel: Sel; selSet: Set<string>; cam: Camera }) {
  return frames.filter(f => !f.hidden).map(f => {
    const b = box(cam, f), on = selSet.has(f.id) || sel.frame === f.id
    return <button key={f.id} type="button" tabIndex={-1} data-frame-label={f.id} className={`ed-flabel${on ? ' on' : ''}${f.locked ? ' locked' : ''}`} style={{ left: b.left, top: (b.top as number) - 22, maxWidth: Math.max(48, b.width as number) }}
      onClick={e => { if (e.detail === 0) getEditor().select({ frame: f.id }) /* keyboard / script: pointer clicks select on press and release */ }}>{f.card.name}<small>{f.card.grid.cols}×{f.card.grid.rows}</small>{f.locked && <i className="ed-flock">LOCKED</i>}</button>
  })
}

/** Smart guides and the gaps they keep, while a drag snaps. */
function SnapGuides({ snaps, cam }: { snaps: { guides: Guide[]; gaps: Gap[] }; cam: Camera }) {
  return <>
    {snaps.guides.map((g, i) => <div key={`g${i}`} className={`ed-guide ed-guide--${g.axis}`} style={g.axis === 'x' ? { left: g.at * cam.z + cam.x, top: g.from * cam.z + cam.y, height: (g.to - g.from) * cam.z } : { top: g.at * cam.z + cam.y, left: g.from * cam.z + cam.x, width: (g.to - g.from) * cam.z }} />)}
    {snaps.gaps.map((g, i) => <div key={`p${i}`} className={`ed-gap ed-gap--${g.axis}`} style={g.axis === 'x' ? { left: g.a * cam.z + cam.x, top: g.at * cam.z + cam.y, width: (g.b - g.a) * cam.z } : { top: g.a * cam.z + cam.y, left: g.at * cam.z + cam.x, height: (g.b - g.a) * cam.z }}><small>{Math.round(g.b - g.a)}</small></div>)}
  </>
}

type Selection = ReturnType<typeof selectionOf>

/** The outline under the pointer: a frame, or a layer of it (not over a frame already selected as a whole). */
function HoverOutline({ doc, hover, selSet, cam }: { doc: EditorDoc; hover: Hover | undefined; selSet: Set<string>; cam: Camera }) {
  const f = hover?.frame ? frameById(doc, hover.frame) : undefined, l = f && hover?.layer ? f.card.layers.find(x => x.id === hover.layer) : undefined
  if (!f || (selSet.has(f.id) && !l)) return null
  return <div className="ed-hover" style={box(cam, f, l && layerBox(f, l))} />
}

/** The selected frame (with its resize handles), the frames picked, and the group box around many. */
function FrameMarks({ s, cam }: { s: Selection; cam: Camera }) {
  const { selFrame, selLayer, many, picked, groupBox, resizable } = s
  return <>
    {selFrame && !selFrame.hidden && !many && <div className={`ed-sel${selLayer ? ' ed-sel--parent' : ''}`} style={box(cam, selFrame)}>
      {resizable && handles(false, selFrame.id)}
    </div>}
    {many && picked.map(f => <div key={f.id} className="ed-sel ed-sel--pick" style={box(cam, f)} />)}
    {groupBox && <div className="ed-sel ed-sel--group" style={scr(cam, groupBox)}>{canResize(picked) && handles(true)}</div>}
  </>
}

/** The selected layers' boxes, a spec field's bounds corners and a sites layer's handles (E3). */
function LayerMarks({ s, cam }: { s: Selection; cam: Camera }) {
  const { selFrame, pickedLayers, one, direct } = s
  if (!selFrame) return null
  const whole: [number, number, number, number] = [0, 0, frameSize(selFrame).w, frameSize(selFrame).h]
  return <>
    {pickedLayers.map(l => <div key={l.id} className={`ed-sel ed-sel--layer${hasBounds(l) ? ' ed-sel--bounds' : ''}`} data-layer-box={l.id} style={box(cam, selFrame, layerBox(selFrame, l) ?? whole)}>
      {direct && hasBounds(l) && CORNERS.map(hd => <i key={hd} className={`ed-handle ${hd}`} data-bounds={hd} aria-label={`Bounds corner ${hd}`} />)}
    </div>)}
    {direct && one?.kind === 'sites' && siteHandles(selFrame, one).map(hd => <i key={hd.id} className={`ed-handle ed-handle--site is-${hd.id}`} data-site={hd.id} aria-label={SITE_LABEL[hd.id] ?? 'Line end'}
      style={{ left: (selFrame.x + hd.x) * cam.z + cam.x, top: (selFrame.y + hd.y) * cam.z + cam.y }} />)}
  </>
}

/** The draw tool's brush ring at the pointer (not while the eyedropper picks). */
function BrushRing({ doc, hover, s, cam }: { doc: EditorDoc; hover: Hover | undefined; s: Selection; cam: Camera }) {
  const tool = useEditor(x => x.tool), picking = useEditor(x => x.picking), brush = useEditor(x => x.brush)
  if (tool !== 'draw' || picking || !hover) return null
  const d = Math.max(6, (brush.size * 2 - 1) * brushCellOf(doc, hover, s.selFrame, s.selLayer, cam.z))
  return <div className={`ed-brush${brush.erase ? ' erase' : ''}`} style={{ left: hover.sx, top: hover.sy, width: d, height: d }} />
}

/** On the selection: the quick bar over one layer (E3) and the long-press menu (E6), which hides the bar while open. */
function SelectionTools({ s, cam, phone, landscape }: { s: Selection; cam: Camera; phone: boolean; landscape: boolean }) {
  const vpSize = useEditor(x => x.vp), menu = useEditor(x => x.menu), { selFrame, one, oneBox, showBar } = s
  if (menu) return <LongPressMenu at={menu} vp={vpSize} f={showBar ? selFrame : undefined} l={showBar ? one : undefined} phone={phone} />
  if (!showBar || !one || !selFrame || !oneBox) return null
  const [x0, y0, x1, y1] = [selFrame.x + oneBox[0], selFrame.y + oneBox[1], selFrame.x + oneBox[2], selFrame.y + oneBox[3]]
  return <QuickBar key={one.id} f={selFrame} l={one} phone={phone} landscape={landscape} vp={vpSize} box={[x0 * cam.z + cam.x, y0 * cam.z + cam.y, x1 * cam.z + cam.x, y1 * cam.z + cam.y]} />
}

export function CanvasOverlay({ phone, landscape, hover, draft, marq, snaps }: { phone: boolean; landscape: boolean; hover: Hover | undefined
  draft: [number, number, number, number] | undefined; marq: Box | undefined; snaps: { guides: Guide[]; gaps: Gap[] } | undefined }) {
  const doc = useEditor(x => x.h.present), cam = useEditor(x => x.cam), tool = useEditor(x => x.tool), sel = useEditor(x => x.sel)
  const typing = useEditor(x => x.typing)
  const s = selectionOf(doc, sel, tool, typing)
  const typingFrame = typing ? frameById(doc, typing.frame) : undefined, typingLayer = typingFrame?.card.layers.find(l => l.id === typing?.layer)
  return (
    <div className="ed-overlay">
      <FrameLabels frames={doc.frames} sel={sel} selSet={s.selSet} cam={cam} />
      <HoverOutline doc={doc} hover={hover} selSet={s.selSet} cam={cam} />
      <FrameMarks s={s} cam={cam} />
      <LayerMarks s={s} cam={cam} />
      <InText f={typingFrame} l={typingLayer} cam={cam} />
      {marq && <div className="ed-marquee" style={scr(cam, marq)} />}
      {snaps && <SnapGuides snaps={snaps} cam={cam} />}
      {draft && <div className="ed-sel ed-sel--draft" style={{ left: draft[0] * cam.z + cam.x, top: draft[1] * cam.z + cam.y, width: draft[2] * cam.z, height: draft[3] * cam.z }}><small>{Math.round(draft[2] / 2.25)}×{Math.round(draft[3] / 2.25)}</small></div>}
      <SelectionTools s={s} cam={cam} phone={phone} landscape={landscape} />
      <BrushRing doc={doc} hover={hover} s={s} cam={cam} />
    </div>
  )
}
