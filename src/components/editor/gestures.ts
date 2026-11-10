/**
 * The editor canvas's pointer input (split from Canvas.tsx): one gesture at a time (`Op`), started on pointer down
 * and ended on up or cancel. Press, marquee, drag (frames or layers, with smart guides and the snap cue), resize,
 * site and bounds handles, draw strokes, frame drawing, taps for text and code, pan and pinch, the long-press menu.
 */
import { useCallback, useRef, type Dispatch, type PointerEvent as RPointerEvent, type RefObject, type SetStateAction } from 'react'
import { PAINT_LIVE, paintCells, paintLayer, type PaintLayer, type SitesLayer, type SpecLayer, type StudioLayer } from '../studio/doc'
import { EXAMPLES } from '../dwitter/examples'
import { addFrame, addLayer, blankCard, copyFrames, copyLayers, drawingCard, editFrame, editLayer, encodeCells, frameById, hitFrame, hitLayer, layerOf, line, movable, newIRLayer, newTextLayer, nudgeLayer, paintCellAt, pitchOf, programCard, programSource, stamp, topDown, type EditorDoc, type EditorFrame } from './doc'
import { dragCells, dragFramePos, draftFrame, pinchCam, PRESS_SLOP, resizeByHandle, type Handle } from './input'
import { canResize, clickLayer, frameBox, framesBox, framesSel, inSel, layersSel, marqueeLayers, marqueeSel, normBox, resizeGroup, selCount, selFrames, selLayers, snapBox, toggleSel, type Box, type Gap, type Guide } from './select'
import { caretAt, dragSiteHandle, editableText, hasBounds, inkAt, inkStep, resizeSpecBounds, textGeo, type SiteHandle } from './direct'
import { LONG_PRESS_MS, snappedGuides } from './phone'
import { commitTyping, placeCaret, startTyping } from './typing'
import { getEditor, type Camera } from './store'
import { feedPointer, markDirty, readsPointer, type Cue } from './frameLoop'

/** Bring frames to the top of the canvas, keeping their order. */
const raiseFrames = (d: EditorDoc, ids: string[]): EditorDoc => {
  const up = d.frames.filter(f => ids.includes(f.id)), rest = d.frames.filter(f => !ids.includes(f.id))
  return up.every((f, i) => d.frames[rest.length + i] === f) ? d : { ...d, frames: [...rest, ...up] }
}
/** Smart-guide reach in screen px. */
const SNAP_PX = 6
/** The site's accent (the theme's `--red`), for the snap cue's dots. */
const accentOf = (el: Element | null) => { const v = el ? getComputedStyle(el).getPropertyValue('--red').trim() : ''; return /^#[0-9a-f]{6}$/i.test(v) ? v : undefined }

export type Op =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; tapClear?: boolean }
  | { kind: 'pinch'; d: number; mx: number; my: number; cam: Camera }
  /** Pressed a frame (or its label): a click selects on release (touch) or narrows the selection; a drag moves. */
  | { kind: 'press'; sx: number; sy: number; wx: number; wy: number; frame: string; layer?: string; touch: boolean; was: boolean; toggle: boolean; inside: boolean; already?: boolean }
  /** A marquee: over frames (world box), or over the layers of `frame` (Ctrl/⌘-drag on it; a click picks `pick`). */
  | { kind: 'marquee'; sx: number; sy: number; wx: number; wy: number; add: boolean; base: { frame?: string; layer?: string; more?: string[] }; frame?: string; pick?: string; moved: boolean; touch: boolean }
  | { kind: 'drag-frames'; ids: string[]; wx: number; wy: number; at0: Map<string, { x: number; y: number }>; box0: Box }
  | { kind: 'drag-layers'; frame: string; base: StudioLayer[]; wx: number; wy: number }
  | { kind: 'resize'; id: string; handle: Handle; wx: number; wy: number; f0: EditorFrame }
  | { kind: 'resize-group'; handle: Handle; wx: number; wy: number; f0s: EditorFrame[] }
  | { kind: 'frame-draw'; wx: number; wy: number; wx1: number; wy1: number }
  | { kind: 'stroke'; frame: string; layer: string; cells: Uint8Array; last?: [number, number]; value: number }
  | { kind: 'tap'; sx: number; sy: number }
  /** A sites handle (E3): ring radius / sweep, disc radius, line ends. */
  | { kind: 'site'; frame: string; l0: SitesLayer; handle: SiteHandle }
  /** A corner of a spec field's bounds (E3). */
  | { kind: 'bounds'; frame: string; l0: SpecLayer & { spec: Extract<SpecLayer['spec'], { kind: 'ir' }> }; handle: Handle; wx: number; wy: number }

const sameHover = (h: { frame?: string; layer?: string } | undefined, frame?: string, layer?: string) => h?.frame === frame && h?.layer === layer

/** What the overlay shows of a gesture: the hover (and brush ring), the frame being drawn, the marquee, the guides. */
export interface GestureView {
  setHover: Dispatch<SetStateAction<Hover | undefined>>
  setDraft: Dispatch<SetStateAction<[number, number, number, number] | undefined>>
  setMarq: Dispatch<SetStateAction<Box | undefined>>
  setSnaps: Dispatch<SetStateAction<{ guides: Guide[]; gaps: Gap[] } | undefined>>
}
export type Hover = { frame?: string; layer?: string; sx: number; sy: number }
/** What a gesture shares with the canvas (frameLoop.ts): the viewport, the pasteboard's glow, repaint flag and snap cue. */
export interface GestureRefs {
  vpRef: RefObject<HTMLDivElement | null>
  glowRef: RefObject<{ x: number; y: number } | undefined>
  pasteDirtyRef: RefObject<boolean>
  cueRef: RefObject<Cue | undefined>
}

/** The canvas's pointer handlers; `space` (held Space) pans like the Hand tool. */
export function useGestures(phone: boolean, space: boolean, refs: GestureRefs, view: GestureView) {
  const { vpRef, glowRef, pasteDirtyRef, cueRef } = refs, { setHover, setDraft, setMarq, setSnaps } = view
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>())
  const op = useRef<Op | undefined>(undefined)
  /** E6: the long press in wait, and the guides engaged at the last drag step. */
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const engaged = useRef<Guide[] | undefined>(undefined)
  const local = (e: { clientX: number; clientY: number }) => { const r = vpRef.current!.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top } }
  const world = (sx: number, sy: number) => { const c = getEditor().cam; return { wx: (sx - c.x) / c.z, wy: (sy - c.y) / c.z } }

  /** End whatever the pointer was doing; `commit` false abandons it. */
  const finish = useCallback((commitIt: boolean) => {
    const o = op.current, s = getEditor()
    op.current = undefined
    setSnaps(undefined); engaged.current = undefined
    if (!o) return
    if (o.kind === 'stroke') {
      if (commitIt) s.live(d => editLayer(d, { frame: o.frame, layer: o.layer }, l => ({ ...l, cells: encodeCells(o.cells) }) as PaintLayer))
      PAINT_LIVE.delete(o.layer); markDirty(o.frame)
      if (commitIt) s.end(); else s.cancel()
    } else if (o.kind === 'drag-frames' || o.kind === 'drag-layers' || o.kind === 'resize' || o.kind === 'resize-group' || o.kind === 'site' || o.kind === 'bounds') {
      if (commitIt) s.end(); else s.cancel()
    } else if (o.kind === 'marquee') {
      setMarq(undefined)
      if (!commitIt) s.select(o.base)
    } else if (o.kind === 'frame-draw') {
      setDraft(undefined)
      if (!commitIt) return
      const { grid, at } = draftFrame(o.wx, o.wy, o.wx1, o.wy1)
      const id = s.insertCard(blankCard(grid), { at, source: 'blank' })
      s.select({ frame: id }); s.setTool('move')
    }
  }, [setSnaps, setMarq, setDraft])

  const startStroke = (wx: number, wy: number, erase: boolean) => {
    const s = getEditor()
    let f = hitFrame(s.h.present, wx, wy)
    if (f?.locked) { s.setNote(`${f.card.name} is locked (Ctrl+⇧L unlocks it)`); return }
    s.begin()
    if (!f) {
      const card = drawingCard()
      const { doc, frame } = addFrame(s.h.present, card, { at: { x: wx - 160, y: wy - 160 }, source: 'draw' })
      s.live(() => doc); f = frame
    }
    const cur = layerOf(s.h.present, s.sel)
    let l: StudioLayer | undefined = s.sel.frame === f.id && cur?.kind === 'paint' ? cur : topDown(f.card).find(x => x.kind === 'paint' && x.visible && !f!.locks?.includes(x.id))
    if (!l) {
      const nl = paintLayer(f.card.grid, { name: `paint ${f.card.layers.length + 1}`, lattice: pitchOf(f.card) < 3 ? 2 : 1 })
      const fid = f.id
      s.live(d => addLayer(d, fid, nl)); l = nl
      f = frameById(s.h.present, fid)!
    }
    s.select({ frame: f.id, layer: l.id })
    const pl = l as PaintLayer, cells = paintCells(pl).slice()
    PAINT_LIVE.set(pl.id, cells)
    op.current = { kind: 'stroke', frame: f.id, layer: pl.id, cells, value: erase ? 0 : s.brush.value }
    strokeTo(wx, wy)
  }
  const strokeTo = (wx: number, wy: number) => {
    const o = op.current
    if (o?.kind !== 'stroke') return
    const s = getEditor(), f = frameById(s.h.present, o.frame), l = f?.card.layers.find(x => x.id === o.layer)
    if (!f || l?.kind !== 'paint') return
    const [c, r] = paintCellAt(f, l, wx - f.x, wy - f.y)
    const pts = o.last ? line(o.last[0], o.last[1], c, r) : [[c, r] as [number, number]]
    let n = 0
    for (const [x, y] of pts) n += stamp(o.cells, l.cols, l.rows, x, y, s.brush.size, o.value)
    o.last = [c, r]
    if (n) markDirty(f.id)
  }

  /** The eyedropper: the ink of the painted dot under the pointer becomes the brush's (one of its .2 steps). */
  const pickInk = (wx: number, wy: number) => {
    const s = getEditor(), f = hitFrame(s.h.present, wx, wy)
    s.setPicking(false)
    const hit = f && inkAt(f, wx - f.x, wy - f.y, s.sel.frame === f.id ? s.sel.layer : undefined)
    if (!f || !hit) { s.setNote('no paint there: the eyedropper takes the ink of a painted dot'); return }
    s.select({ frame: f.id, layer: hit.layer.id })
    if (hit.value <= 0) { s.setNote(`that cell of ${hit.layer.name} is empty: the ink stays ${s.brush.value.toFixed(1)}`); return }
    const v = inkStep(hit.value)
    s.setBrush({ value: v, erase: false }); s.setNote(`ink ${v.toFixed(1)} from ${hit.layer.name}`)
  }

  /** Start moving frames (Alt: copies of them, made in place first; the whole gesture is one undo step). */
  const dragFrames = (ids: string[], wx: number, wy: number, alt: boolean) => {
    const s = getEditor()
    ids = ids.filter(id => !frameById(s.h.present, id)?.locked)
    if (!ids.length) { op.current = undefined; return }
    s.begin()
    if (alt) { const r = copyFrames(s.h.present, ids, 0, 0); s.live(() => r.doc); ids = r.ids; s.select(framesSel(ids)) }
    else s.live(d => raiseFrames(d, ids))
    const d = getEditor().h.present, box0 = framesBox(d, ids)!
    // guides it already sits on are not a snap: the cue is for the ones a drag reaches
    engaged.current = snapBox(box0, d.frames.filter(f => !f.hidden && !ids.includes(f.id)).map(frameBox), 0).guides
    op.current = { kind: 'drag-frames', ids, wx, wy, at0: new Map(d.frames.filter(f => ids.includes(f.id)).map(f => [f.id, { x: f.x, y: f.y }])), box0 }
  }
  /** Start moving text / sites layers of a frame in whole cells (Alt: copies). */
  const dragLayers = (frame: string, ids: string[], wx: number, wy: number, alt: boolean) => {
    const s = getEditor()
    s.begin()
    if (alt) { const r = copyLayers(s.h.present, frame, ids); s.live(() => r.doc); ids = r.ids; s.select(layersSel(frame, ids)) }
    const f = frameById(getEditor().h.present, frame)!
    op.current = { kind: 'drag-layers', frame, wx, wy, base: f.card.layers.filter(l => ids.includes(l.id)) }
  }

  /** The snap cue: the pasteboard's dots along the guides a drag just reached light up in the accent, then fade. */
  const snapCue = (guides: Guide[]) => {
    cueRef.current = { guides, t0: performance.now(), accent: cueRef.current?.accent ?? accentOf(vpRef.current) }
    pasteDirtyRef.current = true
    if (window.__editor) window.__editor.cues = (window.__editor.cues ?? 0) + 1
  }
  /** A finger held still on a frame or layer (Move): select it unless it is in the selection, then the menu. */
  const longPress = (o: Extract<Op, { kind: 'press' }>) => {
    hold.current = undefined
    if (op.current !== o || pointers.current.size !== 1) return
    op.current = undefined
    const s = getEditor(), f = frameById(s.h.present, o.frame)
    if (!f) return
    const hit = o.layer ? { frame: f.id, layer: o.layer } : { frame: f.id }
    if (!inSel(s.sel, hit)) s.select(o.layer ? clickLayer(f, o.layer, s.sel) : hit)
    getEditor().setMenu({ x: o.sx, y: o.sy, armed: false })
  }
  const holdFor = (o: Op | undefined, touch: boolean) => {
    clearTimeout(hold.current); hold.current = undefined
    // decided on the next frame: moves queued behind a busy main thread are handled first, and a finger that moved never opens it
    if (touch && o?.kind === 'press' && getEditor().tool === 'move') hold.current = setTimeout(() => requestAnimationFrame(() => longPress(o)), LONG_PRESS_MS)
  }
  /** The finger that opened the menu lifted: its items take taps from now on (the lift itself never picks one). */
  const arm = () => { const m = getEditor().menu; if (m && !m.armed) setTimeout(() => { const n = getEditor().menu; if (n === m) getEditor().setMenu({ ...m, armed: true }) }, 60) }

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const el = vpRef.current!
    // the quick bar's and the menu's buttons are buttons: no canvas gesture, no capture (their click must land)
    if ((e.target as HTMLElement).closest('.ed-qbar, .ed-cmenu')) return
    const { sx, sy } = local(e), { wx, wy } = world(sx, sy), s = getEditor()
    // a touch must not fire the compatibility mousedown: it would blur the text being typed in place
    if (e.pointerType === 'touch') e.preventDefault()
    // the long-press menu is open: a press anywhere else only closes it
    if (s.menu) { s.setMenu(undefined); return }
    if (s.typing && !pointers.current.size) {
      // typing in place: a press on the text moves the caret; anywhere else finishes the text first
      const f = frameById(s.h.present, s.typing.frame), l = f?.card.layers.find(x => x.id === s.typing!.layer), g = l && textGeo(l)
      if (f && g && e.button === 0) {
        const p = pitchOf(f.card), c = (wx - f.x) / p, r = (wy - f.y) / p
        if (c >= g.left - 1 && c <= g.carets[g.carets.length - 1] + 1 && r >= g.top - 1 && r <= g.top + g.h + 1) { e.preventDefault(); placeCaret(caretAt(g, c)); return }
      }
      commitTyping()
    }
    pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType })
    try { el.setPointerCapture(e.pointerId) } catch { /* synthetic */ }
    if (pointers.current.size === 2) {
      // a second finger: whatever the first one started is abandoned; pinch-zoom + pan from here
      clearTimeout(hold.current); hold.current = undefined
      if (op.current?.kind !== 'pan') finish(false)
      const [a, b] = [...pointers.current.values()]
      op.current = { kind: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, cam: s.cam }
      return
    }
    if (pointers.current.size > 2) return
    const target = e.target as HTMLElement, handle = target.closest<HTMLElement>('[data-handle]'), label = target.closest<HTMLElement>('[data-frame-label]')
    const touch = e.pointerType === 'touch', toggle = e.shiftKey || (touch && s.selectMode)
    if (e.button === 1 || space || s.tool === 'hand') { e.preventDefault(); op.current = { kind: 'pan', sx, sy, cam: s.cam }; return }
    if (e.button !== 0 && !(e.button === 2 && s.tool === 'draw')) return
    const site = target.closest<HTMLElement>('[data-site]'), bnd = target.closest<HTMLElement>('[data-bounds]')
    if (site || bnd) {
      const f = frameById(s.h.present, s.sel.frame), l = layerOf(s.h.present, s.sel)
      if (f && site && l?.kind === 'sites') { s.begin(); op.current = { kind: 'site', frame: f.id, l0: l, handle: site.dataset.site as SiteHandle } }
      else if (f && bnd && hasBounds(l)) { s.begin(); op.current = { kind: 'bounds', frame: f.id, l0: l, handle: bnd.dataset.bounds as Handle, wx, wy } }
      return
    }
    if (handle) {
      if (handle.dataset.group) {
        const f0s = selFrames(s.sel).map(id => frameById(s.h.present, id)).filter((f): f is EditorFrame => !!f)
        if (canResize(f0s)) { s.begin(); op.current = { kind: 'resize-group', handle: handle.dataset.handle as Handle, wx, wy, f0s } }
        return
      }
      const f = frameById(s.h.present, handle.dataset.frameId)
      if (f) { s.begin(); op.current = { kind: 'resize', id: f.id, handle: handle.dataset.handle as Handle, wx, wy, f0: f } }
      return
    }
    if (label) {
      const id = label.dataset.frameLabel!, inside = selFrames(s.sel).length > 1 && selFrames(s.sel).includes(id)
      if (toggle) { if (!inside) s.select(toggleSel(s.sel, { frame: id })) } else if (!inside) s.select({ frame: id })
      op.current = { kind: 'press', sx, sy, wx, wy, frame: id, touch: false, was: true, toggle, inside }
      holdFor(op.current, touch)
      return
    }
    if (s.tool === 'draw') { if (s.picking || (e.altKey && e.button === 0)) pickInk(wx, wy); else startStroke(wx, wy, s.brush.erase || e.button === 2); return }
    if (s.tool === 'frame') { op.current = { kind: 'frame-draw', wx, wy, wx1: wx, wy1: wy }; return }
    if (s.tool === 'text' || s.tool === 'code') { op.current = { kind: 'tap', sx, sy }; return }
    // move / select (locked frames let the press through to the canvas under them)
    const f = hitFrame(s.h.present, wx, wy, true)
    if (!f) {
      if (!touch || s.selectMode) {
        // empty canvas: a marquee (a mouse drag, or one finger in SELECT mode); a click deselects
        if (!toggle) s.select({})
        op.current = { kind: 'marquee', sx, sy, wx, wy, add: toggle, base: toggle ? s.sel : {}, moved: false, touch }
        return
      }
      // touch: pan; a tap on empty canvas (not a pan) deselects, decided on pointer up
      op.current = { kind: 'pan', sx, sy, cam: s.cam, tapClear: true }
      return
    }
    const l = hitLayer(f, wx - f.x, wy - f.y)
    if ((e.ctrlKey || e.metaKey) && !touch) {
      // Ctrl/⌘ on a frame: a drag marquees its layers; a click picks the layer under the pointer, even inside a group
      op.current = { kind: 'marquee', sx, sy, wx, wy, add: e.shiftKey, base: s.sel, frame: f.id, pick: l?.id, moved: false, touch }
      return
    }
    const hit = l ? { frame: f.id, layer: l.id } : { frame: f.id }
    const inside = s.sel.layer ? inSel(s.sel, hit) : selFrames(s.sel).length > 1 && selFrames(s.sel).includes(f.id)
    const was = s.sel.frame === f.id || inside
    // a tap on the one selected text layer types into it (touch; a mouse double-clicks)
    const already = !!l && s.sel.layer === l.id && selCount(s.sel) === 1 && editableText(l)
    if (!touch && !inside) s.select(toggle ? toggleSel(s.sel, hit) : l ? clickLayer(f, l.id, s.sel) : { frame: f.id })
    op.current = { kind: 'press', sx, sy, wx, wy, frame: f.id, layer: l?.id, touch, was, toggle, inside, already }
    holdFor(op.current, touch)
  }

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const { sx, sy } = local(e), { wx, wy } = world(sx, sy), s = getEditor()
    const pt = pointers.current.get(e.pointerId)
    if (pt) { pt.x = sx; pt.y = sy }
    const o = op.current
    if (!o) {
      // hover: outline, pasteboard glow, the pointer for cards that read it, the brush ring
      if (e.pointerType === 'touch') return
      glowRef.current = { x: sx, y: sy }; pasteDirtyRef.current = true
      const f = hitFrame(s.h.present, wx, wy, s.tool === 'move')
      const l = f && s.tool === 'move' ? hitLayer(f, wx - f.x, wy - f.y) : undefined
      feedPointer(f && readsPointer(f) ? f : undefined, wx, wy)
      const frame = f?.id, layer = l?.id, keep = s.tool !== 'draw'
      setHover(h => (keep && sameHover(h, frame, layer) ? h : { frame, layer, sx, sy }))
      return
    }
    if (o.kind === 'pinch') {
      const ps = [...pointers.current.values()]
      if (ps.length < 2) return
      const [a, b] = ps
      s.setCam(pinchCam(o.cam, o.d, o.mx, o.my, Math.hypot(a.x - b.x, a.y - b.y), (a.x + b.x) / 2, (a.y + b.y) / 2))
      return
    }
    if (o.kind === 'pan') { s.setCam({ ...o.cam, x: o.cam.x + sx - o.sx, y: o.cam.y + sy - o.sy }); return }
    if (o.kind === 'tap') return
    if (o.kind === 'stroke') { strokeTo(wx, wy); setHover({ sx, sy }); return }
    if (o.kind === 'frame-draw') { o.wx1 = wx; o.wy1 = wy; setDraft([Math.min(o.wx, wx), Math.min(o.wy, wy), Math.abs(wx - o.wx), Math.abs(wy - o.wy)]); return }
    if (o.kind === 'marquee') {
      if (!o.moved && Math.hypot(sx - o.sx, sy - o.sy) < (o.touch ? PRESS_SLOP.touch : PRESS_SLOP.mouse)) return
      o.moved = true
      const b = normBox(o.wx, o.wy, wx, wy), d = s.h.present
      setMarq(b)
      if (o.frame) {
        const f = frameById(d, o.frame)
        if (!f) return
        const ids = marqueeLayers(f, [b[0] - f.x, b[1] - f.y, b[2] - f.x, b[3] - f.y])
        s.select(layersSel(f.id, o.add && o.base.frame === f.id ? [...selLayers(o.base), ...ids] : ids))
      } else s.select(marqueeSel(d, b, o.base, o.add))
      return
    }
    if (o.kind === 'press') {
      if (Math.hypot(sx - o.sx, sy - o.sy) < (o.touch ? PRESS_SLOP.touch : PRESS_SLOP.mouse)) return
      // touch: dragging a frame that was not selected pans instead (no accidental moves while scrolling around)
      if (o.touch && !o.was) { op.current = { kind: 'pan', sx: o.sx, sy: o.sy, cam: s.cam }; return }
      const d = s.h.present, f = frameById(d, o.frame)!, cur = s.sel
      const l = o.layer ? f.card.layers.find(x => x.id === o.layer) : undefined, hit = l ? { frame: f.id, layer: l.id } : { frame: f.id }
      const free = (id: string) => movable(f.card.layers.find(x => x.id === id)) && !f.locks?.includes(id)
      if (cur.layer && cur.frame === f.id && inSel(cur, hit)) {
        // pressed inside a layer selection: its text / sites layers move; a field layer drags the frame
        const ids = selLayers(cur).filter(free)
        if (l && free(l.id) && ids.length) dragLayers(f.id, ids, o.wx, o.wy, e.altKey)
        else dragFrames([f.id], o.wx, o.wy, e.altKey)
      } else if (!cur.layer && selFrames(cur).includes(f.id) && (o.inside || o.toggle || !o.touch)) {
        dragFrames(selFrames(cur), o.wx, o.wy, e.altKey)
      } else if (l && free(l.id)) {
        s.select({ frame: f.id, layer: l.id }); dragLayers(f.id, [l.id], o.wx, o.wy, e.altKey)
      } else {
        if (!o.layer) s.select({ frame: f.id })
        dragFrames([f.id], o.wx, o.wy, e.altKey)
      }
      if (op.current) return onMove(e)
      return
    }
    if (o.kind === 'drag-frames') {
      const d = s.h.present, raw: Box = [o.box0[0] + wx - o.wx, o.box0[1] + wy - o.wy, o.box0[2] + wx - o.wx, o.box0[3] + wy - o.wy]
      const grid = dragFramePos(o.box0[0], o.box0[1], wx - o.wx, wy - o.wy, e.shiftKey)
      let dx = grid.x - o.box0[0], dy = grid.y - o.box0[1]
      if (!(e.ctrlKey || e.metaKey)) {
        const moving = new Set(o.ids), others = d.frames.filter(f => !f.hidden && !moving.has(f.id)).map(frameBox) // per pointer move
        const sn = snapBox(raw, others, SNAP_PX / s.cam.z)
        if (sn.dx || sn.guides.some(g => g.axis === 'x')) dx = raw[0] - o.box0[0] + sn.dx
        if (sn.dy || sn.guides.some(g => g.axis === 'y')) dy = raw[1] - o.box0[1] + sn.dy
        const fin: Box = [o.box0[0] + dx, o.box0[1] + dy, o.box0[2] + dx, o.box0[3] + dy], shown = snapBox(fin, others, 0)
        setSnaps({ guides: shown.guides, gaps: shown.gaps })
        const fresh = snappedGuides(engaged.current, shown.guides)
        engaged.current = shown.guides
        if (fresh.length) snapCue(fresh)
      } else { setSnaps(undefined); engaged.current = [] }
      s.live(x => ({ ...x, frames: x.frames.map(f => { const a = o.at0.get(f.id); return a ? { ...f, x: a.x + dx, y: a.y + dy } : f }) }))
      return
    }
    if (o.kind === 'drag-layers') {
      const f = frameById(s.h.present, o.frame)!
      const [dc, dr] = dragCells(pitchOf(f.card), wx - o.wx, wy - o.wy) // whole cells: dots stay on the grid
      s.live(d => o.base.reduce((x, b) => editLayer(x, { frame: o.frame, layer: b.id }, () => nudgeLayer(b, dc, dr)), d))
      return
    }
    if (o.kind === 'site' || o.kind === 'bounds') {
      const f = frameById(s.h.present, o.frame)
      if (!f) return
      const next = o.kind === 'site' ? dragSiteHandle(f, o.l0, o.handle, wx - f.x, wy - f.y) : resizeSpecBounds(f, o.l0, o.handle, wx - o.wx, wy - o.wy)
      s.live(d => editLayer(d, { frame: o.frame, layer: o.l0.id }, () => next))
      return
    }
    if (o.kind === 'resize') {
      const next = resizeByHandle(o.f0, o.handle, wx - o.wx, wy - o.wy)
      s.live(d => editFrame(d, o.id, () => next))
      return
    }
    if (o.kind === 'resize-group') {
      const next = new Map(resizeGroup(o.f0s, o.handle, wx - o.wx, wy - o.wy).map(f => [f.id, f]))
      s.live(d => ({ ...d, frames: d.frames.map(f => next.get(f.id) ?? f) }))
    }
  }

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    clearTimeout(hold.current); hold.current = undefined
    arm()
    const o = op.current, s = getEditor()
    if (o?.kind === 'pinch') { if (pointers.current.size < 2) op.current = undefined; return }
    if (!o) return
    if (o.kind === 'press') {
      op.current = undefined
      const f = frameById(s.h.present, o.frame), hit = o.layer ? { frame: o.frame, layer: o.layer } : { frame: o.frame }
      if (!f) return
      if (o.touch && o.already && !o.toggle && o.layer && startTyping(o.frame, o.layer)) return
      // a click (no drag). Touch selects on release, so a pan never changes the selection; a click inside
      // a selection of many narrows it to what is under the pointer (⇧: takes it out)
      if (o.toggle) { if (o.touch || o.inside) s.select(toggleSel(s.sel, hit)) }
      else if (o.touch || o.inside) s.select(o.layer ? clickLayer(f, o.layer, s.sel) : { frame: o.frame })
      return
    }
    if (o.kind === 'pan') {
      op.current = undefined
      const { sx, sy } = local(e)
      if (o.tapClear && Math.hypot(sx - o.sx, sy - o.sy) < 8) s.select({})
      return
    }
    if (o.kind === 'marquee') {
      op.current = undefined
      setMarq(undefined)
      // a Ctrl/⌘-click on a frame: the layer under the pointer (even inside a group), or the frame
      if (!o.moved && o.frame) s.select(o.pick ? (o.add ? toggleSel(s.sel, { frame: o.frame, layer: o.pick }) : { frame: o.frame, layer: o.pick }) : { frame: o.frame })
      return
    }
    if (o.kind === 'tap') {
      op.current = undefined
      const { sx, sy } = local(e), { wx, wy } = world(sx, sy)
      if (Math.hypot(sx - o.sx, sy - o.sy) > 10) return
      const f = hitFrame(s.h.present, wx, wy), p = f ? pitchOf(f.card) : 1
      if (f?.locked) { s.setNote(`${f.card.name} is locked (Ctrl+⇧L unlocks it)`); return }
      if (s.tool === 'text') {
        if (!f) { s.setNote('Tap inside a frame to add text'); return }
        // the new layer and what is typed into it on the canvas are one undo step
        const nl = newTextLayer(f.card.layers.length + 1, Math.round((wx - f.x) / p), Math.round((wy - f.y) / p)), fid = f.id
        s.begin(); s.live(d => addLayer(d, fid, nl))
        s.setTool('move'); s.setRight('design')
        startTyping(fid, nl.id, { begun: true, created: true })
      } else {
        if (f) s.addLayerTo(f.id, newIRLayer(f.card.layers.length + 1))
        else { const ex = EXAMPLES[0]; const id = s.insertCard(programCard(ex), { at: { x: wx - 162, y: wy - 162 }, source: programSource(ex) }); s.select({ frame: id, layer: topDown(frameById(s.h.present, id)!.card)[0]?.id }) }
        s.setTool('move'); s.setRight('code'); if (phone) s.setSheet('inspector')
      }
      return
    }
    finish(true)
  }
  /** A double-click on a text layer types into it on the canvas (all of its text selected). */
  const onDouble = (e: { clientX: number; clientY: number }) => {
    const s = getEditor()
    if (s.tool !== 'move' || s.typing) return
    const { sx, sy } = local(e), { wx, wy } = world(sx, sy), f = hitFrame(s.h.present, wx, wy, true)
    const l = f && !f.locked ? hitLayer(f, wx - f.x, wy - f.y) : undefined
    if (f && l && editableText(l)) startTyping(f.id, l.id)
  }
  const onCancel = (e: RPointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId); clearTimeout(hold.current); hold.current = undefined; arm(); if (op.current?.kind !== 'pinch') finish(false); else if (pointers.current.size < 2) op.current = undefined }
  const onLeave = () => { glowRef.current = undefined; pasteDirtyRef.current = true; if (!op.current) setHover(undefined); feedPointer(undefined, 0, 0) }
  return { onDown, onMove, onUp, onDouble, onCancel, onLeave }
}
