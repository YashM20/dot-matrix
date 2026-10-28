/**
 * The infinite canvas: a pannable, zoomable world of frames (each its card through the engine), the
 * pasteboard dot field behind them, and the selection / hover / handle overlay in screen space.
 *
 * Input: wheel pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms about the pointer; Space-drag, the
 * middle button or the Hand tool pan; with Move a mouse drag on empty canvas draws a marquee (⇧ adds),
 * ⇧-click adds to the selection, a drag moves everything selected (Alt-drag moves copies), frames snap
 * to each other's edges, centres and spacing (hold Ctrl/⌘ to stop it). On touch one finger uses the
 * tool (or pans empty canvas; in SELECT mode it draws a marquee and taps add) and two fingers
 * pinch-zoom and pan. One rAF loop draws every frame that changed, is animating or is being previewed;
 * frames off screen are skipped.
 */
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { PAINT_LIVE, paintCells, paintLayer, type PaintLayer, type StudioLayer } from '../studio/doc'
import { EXAMPLES } from '../dwitter/examples'
import { addFrame, addLayer, blankCard, copyFrames, copyLayers, drawingCard, editFrame, editLayer, encodeCells, frameById, frameSize, hitFrame, hitLayer, layerBounds, layerOf, line, movable, newIRLayer, newTextLayer, nudgeLayer, paintCellAt, pitchOf, programCard, programSource, stamp, topDown, type EditorDoc, type EditorFrame } from './doc'
import { dragCells, dragFramePos, draftFrame, pinchCam, PRESS_SLOP, resizeByHandle, type Handle } from './input'
import { drawFrame, drawPaste, isAnimated, resolutionFor } from './render'
import { canResize, clickLayer, frameBox, framesBox, framesSel, inSel, layersSel, marqueeLayers, marqueeSel, normBox, resizeGroup, selFrames, selIds, selLayers, snapBox, toggleSel, type Box, type Gap, type Guide } from './select'
import { useEditor, type Camera } from './store'

/** Probe hooks (scripts/editor-browser.ts): draw stats, the selected frame id and every selected id. */
declare global { interface Window { __editor?: { frames: number; drawn: number; maxMs: number; lastMs: number; sel?: string; layer?: string; picks?: string[] } } }

// ── render registry: one entry per mounted frame canvas ──────────────────────────────────────────
interface Drawn { card: EditorFrame['card']; theme: string; k: number; state?: string; tl: boolean; t: number }
interface Entry { canvas: HTMLCanvasElement; drawn?: Drawn; dirty: boolean; last: number; pointer?: { x: number; y: number; down: boolean } }
const entries = new Map<string, Entry>()
export const markDirty = (id: string) => { const e = entries.get(id); if (e) e.dirty = true }
/** The pointer (in card cells) for the frame under it, if that card reads `pointer`; every other frame loses it. */
function feedPointer(f: EditorFrame | undefined, wx: number, wy: number) {
  for (const [id, en] of entries) if (en.pointer && id !== f?.id) { en.pointer = undefined; en.dirty = true }
  const en = f && entries.get(f.id)
  if (f && en) { const p = pitchOf(f.card); en.pointer = { x: (wx - f.x) / p, y: (wy - f.y) / p, down: false }; en.dirty = true }
}
const readsPointer = (f: EditorFrame) => f.card.layers.some(l => (l.kind === 'ir' || l.kind === 'sites') && l.src.includes('pointer'))
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** Bring frames to the top of the canvas, keeping their order. */
const raiseFrames = (d: EditorDoc, ids: string[]): EditorDoc => {
  const up = d.frames.filter(f => ids.includes(f.id)), rest = d.frames.filter(f => !ids.includes(f.id))
  return up.every((f, i) => d.frames[rest.length + i] === f) ? d : { ...d, frames: [...rest, ...up] }
}
/** Smart-guide reach in screen px. */
const SNAP_PX = 6

const FrameView = memo(function FrameView({ f }: { f: EditorFrame }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    entries.set(f.id, { canvas: ref.current, dirty: true, last: 0 })
    return () => { entries.delete(f.id) }
  }, [f.id])
  const { w, h } = frameSize(f)
  return <canvas ref={ref} className="ed-frame" data-frame={f.id} role="img" aria-label={`Frame ${f.card.name}, ${f.card.grid.cols}×${f.card.grid.rows} dots`}
    style={{ left: f.x, top: f.y, width: w, height: h, display: f.hidden ? 'none' : undefined }} />
})

type Op =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera; tapClear?: boolean }
  | { kind: 'pinch'; d: number; mx: number; my: number; cam: Camera }
  /** Pressed a frame (or its label): a click selects on release (touch) or narrows the selection; a drag moves. */
  | { kind: 'press'; sx: number; sy: number; wx: number; wy: number; frame: string; layer?: string; touch: boolean; was: boolean; toggle: boolean; inside: boolean }
  /** A marquee: over frames (world box), or over the layers of `frame` (Ctrl/⌘-drag on it; a click picks `pick`). */
  | { kind: 'marquee'; sx: number; sy: number; wx: number; wy: number; add: boolean; base: { frame?: string; layer?: string; more?: string[] }; frame?: string; pick?: string; moved: boolean; touch: boolean }
  | { kind: 'drag-frames'; ids: string[]; wx: number; wy: number; at0: Map<string, { x: number; y: number }>; box0: Box }
  | { kind: 'drag-layers'; frame: string; base: StudioLayer[]; wx: number; wy: number }
  | { kind: 'resize'; id: string; handle: Handle; wx: number; wy: number; f0: EditorFrame }
  | { kind: 'resize-group'; handle: Handle; wx: number; wy: number; f0s: EditorFrame[] }
  | { kind: 'frame-draw'; wx: number; wy: number; wx1: number; wy1: number }
  | { kind: 'stroke'; frame: string; layer: string; cells: Uint8Array; last?: [number, number]; value: number }
  | { kind: 'tap'; sx: number; sy: number }

export function Canvas({ phone }: { phone: boolean }) {
  const vp = useRef<HTMLDivElement>(null), paste = useRef<HTMLCanvasElement>(null)
  const frames = useEditor(s => s.h.present.frames), cam = useEditor(s => s.cam), tool = useEditor(s => s.tool), sel = useEditor(s => s.sel)
  const brush = useEditor(s => s.brush), selectMode = useEditor(s => s.selectMode)
  const [space, setSpace] = useState(false)
  const [hover, setHover] = useState<{ frame?: string; layer?: string; sx: number; sy: number } | undefined>()
  const [draft, setDraft] = useState<[number, number, number, number] | undefined>()
  const [marq, setMarq] = useState<Box | undefined>()
  const [snaps, setSnaps] = useState<{ guides: Guide[]; gaps: Gap[] } | undefined>()
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>())
  const op = useRef<Op | undefined>(undefined)
  const glow = useRef<{ x: number; y: number } | undefined>(undefined)
  const pasteDirty = useRef(true)

  // viewport size → store (fit / reveal), and the first fit
  useEffect(() => {
    const el = vp.current
    if (!el) return
    let fitted = false
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      useEditor.getState().setVp(r.width, r.height); pasteDirty.current = true
      if (!fitted && r.width > 0) { fitted = true; const s = useEditor.getState(), first = s.h.present.frames.find(f => !f.hidden); if (s.sel.frame) s.fit([s.sel.frame], 1.5); else if (phone && first) s.fit([first.id], 1.25); else s.fit([], 1.25) }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Space = temporary hand
  useEffect(() => {
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))
    const down = (e: KeyboardEvent) => { if (e.key === ' ' && !editable(e.target)) { e.preventDefault(); if (!e.repeat) setSpace(true) } }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false) }
    const blur = () => setSpace(false)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])

  // the render loop
  useEffect(() => {
    let raf = 0, lastCam: Camera | undefined, lastVp = '', lastPublish = 0, lastTick = performance.now()
    const wall0 = performance.now(), still = reduced()
    const stats: NonNullable<Window["__editor"]> = (window.__editor = { frames: 0, drawn: 0, maxMs: 0, lastMs: 0 })
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const s = useEditor.getState(), d = s.h.present, c = s.cam, dpr = Math.min(2, window.devicePixelRatio || 1), dt = Math.min(.1, (now - lastTick) / 1000)
      lastTick = now
      const selFrame = frameById(d, s.sel.frame), timeline = !!selFrame && s.right === 'animate' && (!phone || s.sheet === 'inspector')
      if (timeline && s.play.playing) {
        const t = (s.play.t + dt) % selFrame!.card.timeline.length
        s.play.t = t
        if (now - lastPublish > 66) { lastPublish = now; useEditor.setState({ play: { t, playing: true } }) }
      }
      let budget = 0
      for (const f of d.frames) {
        const e = entries.get(f.id)
        if (!e || f.hidden) continue
        const { w, h } = frameSize(f), x0 = f.x * c.z + c.x, y0 = f.y * c.z + c.y
        if (x0 > s.vp.w || y0 > s.vp.h || x0 + w * c.z < 0 || y0 + h * c.z < 0) continue
        const k = resolutionFor(c.z, dpr, w, h), tl = timeline && f.id === selFrame!.id, anim = !still && isAnimated(f.card)
        const t = tl ? s.play.t : anim ? (now - wall0) / 1000 : 0, state = s.preview[f.id], p = e.drawn
        const due = e.dirty || !p || p.card !== f.card || p.theme !== f.theme || p.k !== k || p.state !== state || p.tl !== tl || (tl && p.t !== t) || (!tl && anim && now - e.last > 33)
        if (!due || budget > 24) continue // past ~24 ms this tick: the rest draw next frame
        const ms = drawFrame(e.canvas, f, k, { timeline: tl, t, state, pointer: e.pointer })
        budget += ms
        stats.lastMs = ms; stats.maxMs = Math.max(stats.maxMs, ms); stats.drawn++
        e.drawn = { card: f.card, theme: f.theme, k, state, tl, t }; e.dirty = false; e.last = now
      }
      stats.frames = d.frames.length; stats.sel = s.sel.frame; stats.layer = s.sel.layer; stats.picks = selIds(s.sel)
      const vpKey = `${s.vp.w}x${s.vp.h}x${dpr}`
      if (paste.current && (pasteDirty.current || c !== lastCam || vpKey !== lastVp)) {
        drawPaste(paste.current, c, s.vp.w, s.vp.h, dpr, glow.current)
        lastCam = c; lastVp = vpKey; pasteDirty.current = false
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phone])

  // wheel: pan; Ctrl/⌘ + wheel or a trackpad pinch: zoom about the pointer
  useEffect(() => {
    const el = vp.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), s = useEditor.getState(), k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1
      if (e.ctrlKey || e.metaKey) s.zoomAt(s.cam.z * Math.exp(-e.deltaY * k * .0045), e.clientX - r.left, e.clientY - r.top)
      else { const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY; s.setCam({ ...s.cam, x: s.cam.x - dx * k, y: s.cam.y - dy * k }) }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const local = (e: { clientX: number; clientY: number }) => { const r = vp.current!.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top } }
  const world = (sx: number, sy: number) => { const c = useEditor.getState().cam; return { wx: (sx - c.x) / c.z, wy: (sy - c.y) / c.z } }

  /** End whatever the pointer was doing; `commit` false abandons it. */
  const finish = useCallback((commitIt: boolean) => {
    const o = op.current, s = useEditor.getState()
    op.current = undefined
    setSnaps(undefined)
    if (!o) return
    if (o.kind === 'stroke') {
      if (commitIt) s.live(d => editLayer(d, { frame: o.frame, layer: o.layer }, l => ({ ...l, cells: encodeCells(o.cells) }) as PaintLayer))
      PAINT_LIVE.delete(o.layer); markDirty(o.frame)
      if (commitIt) s.end(); else s.cancel()
    } else if (o.kind === 'drag-frames' || o.kind === 'drag-layers' || o.kind === 'resize' || o.kind === 'resize-group') {
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
  }, [])

  const startStroke = (wx: number, wy: number, erase: boolean) => {
    const s = useEditor.getState()
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
    const s = useEditor.getState(), f = frameById(s.h.present, o.frame), l = f?.card.layers.find(x => x.id === o.layer)
    if (!f || l?.kind !== 'paint') return
    const [c, r] = paintCellAt(f, l, wx - f.x, wy - f.y)
    const pts = o.last ? line(o.last[0], o.last[1], c, r) : [[c, r] as [number, number]]
    let n = 0
    for (const [x, y] of pts) n += stamp(o.cells, l.cols, l.rows, x, y, s.brush.size, o.value)
    o.last = [c, r]
    if (n) markDirty(f.id)
  }

  /** Start moving frames (Alt: copies of them, made in place first; the whole gesture is one undo step). */
  const dragFrames = (ids: string[], wx: number, wy: number, alt: boolean) => {
    const s = useEditor.getState()
    ids = ids.filter(id => !frameById(s.h.present, id)?.locked)
    if (!ids.length) { op.current = undefined; return }
    s.begin()
    if (alt) { const r = copyFrames(s.h.present, ids, 0, 0); s.live(() => r.doc); ids = r.ids; s.select(framesSel(ids)) }
    else s.live(d => raiseFrames(d, ids))
    const d = useEditor.getState().h.present
    op.current = { kind: 'drag-frames', ids, wx, wy, at0: new Map(d.frames.filter(f => ids.includes(f.id)).map(f => [f.id, { x: f.x, y: f.y }])), box0: framesBox(d, ids)! }
  }
  /** Start moving text / sites layers of a frame in whole cells (Alt: copies). */
  const dragLayers = (frame: string, ids: string[], wx: number, wy: number, alt: boolean) => {
    const s = useEditor.getState()
    s.begin()
    if (alt) { const r = copyLayers(s.h.present, frame, ids); s.live(() => r.doc); ids = r.ids; s.select(layersSel(frame, ids)) }
    const f = frameById(useEditor.getState().h.present, frame)!
    op.current = { kind: 'drag-layers', frame, wx, wy, base: f.card.layers.filter(l => ids.includes(l.id)) }
  }

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    const el = vp.current!
    const { sx, sy } = local(e), { wx, wy } = world(sx, sy), s = useEditor.getState()
    pointers.current.set(e.pointerId, { x: sx, y: sy, type: e.pointerType })
    try { el.setPointerCapture(e.pointerId) } catch { /* synthetic */ }
    if (pointers.current.size === 2) {
      // a second finger: whatever the first one started is abandoned; pinch-zoom + pan from here
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
      return
    }
    if (s.tool === 'draw') { startStroke(wx, wy, s.brush.erase || e.button === 2); return }
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
    if (!touch && !inside) s.select(toggle ? toggleSel(s.sel, hit) : l ? clickLayer(f, l.id, s.sel) : { frame: f.id })
    op.current = { kind: 'press', sx, sy, wx, wy, frame: f.id, layer: l?.id, touch, was, toggle, inside }
  }

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const { sx, sy } = local(e), { wx, wy } = world(sx, sy), s = useEditor.getState()
    const pt = pointers.current.get(e.pointerId)
    if (pt) { pt.x = sx; pt.y = sy }
    const o = op.current
    if (!o) {
      // hover: outline, pasteboard glow, the pointer for cards that read it, the brush ring
      if (e.pointerType === 'touch') return
      glow.current = { x: sx, y: sy }; pasteDirty.current = true
      const f = hitFrame(s.h.present, wx, wy, s.tool === 'move')
      const l = f && s.tool === 'move' ? hitLayer(f, wx - f.x, wy - f.y) : undefined
      feedPointer(f && readsPointer(f) ? f : undefined, wx, wy)
      setHover(h => (h?.frame === f?.id && h?.layer === l?.id && s.tool !== 'draw' ? h : { frame: f?.id, layer: l?.id, sx, sy }))
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
        const others = d.frames.filter(f => !f.hidden && !o.ids.includes(f.id)).map(frameBox)
        const sn = snapBox(raw, others, SNAP_PX / s.cam.z)
        if (sn.dx || sn.guides.some(g => g.axis === 'x')) dx = raw[0] - o.box0[0] + sn.dx
        if (sn.dy || sn.guides.some(g => g.axis === 'y')) dy = raw[1] - o.box0[1] + sn.dy
        const fin: Box = [o.box0[0] + dx, o.box0[1] + dy, o.box0[2] + dx, o.box0[3] + dy], shown = snapBox(fin, others, 0)
        setSnaps({ guides: shown.guides, gaps: shown.gaps })
      } else setSnaps(undefined)
      s.live(x => ({ ...x, frames: x.frames.map(f => { const a = o.at0.get(f.id); return a ? { ...f, x: a.x + dx, y: a.y + dy } : f }) }))
      return
    }
    if (o.kind === 'drag-layers') {
      const f = frameById(s.h.present, o.frame)!
      const [dc, dr] = dragCells(pitchOf(f.card), wx - o.wx, wy - o.wy) // whole cells: dots stay on the grid
      s.live(d => o.base.reduce((x, b) => editLayer(x, { frame: o.frame, layer: b.id }, () => nudgeLayer(b, dc, dr)), d))
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
    const o = op.current, s = useEditor.getState()
    if (o?.kind === 'pinch') { if (pointers.current.size < 2) op.current = undefined; return }
    if (!o) return
    if (o.kind === 'press') {
      op.current = undefined
      const f = frameById(s.h.present, o.frame), hit = o.layer ? { frame: o.frame, layer: o.layer } : { frame: o.frame }
      if (!f) return
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
        s.addLayerTo(f.id, newTextLayer(f.card.layers.length + 1, Math.round((wx - f.x) / p), Math.round((wy - f.y) / p)))
        s.setTool('move'); s.setRight('design'); if (phone) s.setSheet('inspector')
        window.setTimeout(() => document.querySelector<HTMLInputElement>('.ed-insp [data-focus="text"]')?.select(), 60)
      } else {
        if (f) s.addLayerTo(f.id, newIRLayer(f.card.layers.length + 1))
        else { const ex = EXAMPLES[0]; const id = s.insertCard(programCard(ex), { at: { x: wx - 162, y: wy - 162 }, source: programSource(ex) }); s.select({ frame: id, layer: topDown(frameById(s.h.present, id)!.card)[0]?.id }) }
        s.setTool('move'); s.setRight('code'); if (phone) s.setSheet('inspector')
      }
      return
    }
    finish(true)
  }
  const onCancel = (e: RPointerEvent<HTMLDivElement>) => { pointers.current.delete(e.pointerId); if (op.current?.kind !== 'pinch') finish(false); else if (pointers.current.size < 2) op.current = undefined }
  const onLeave = () => { glow.current = undefined; pasteDirty.current = true; if (!op.current) setHover(undefined); feedPointer(undefined, 0, 0) }

  const cursor = space || tool === 'hand' ? 'grab' : tool === 'draw' ? 'none' : tool === 'frame' || tool === 'code' ? 'crosshair' : tool === 'text' ? 'text' : 'default'
  const doc = useEditor(s => s.h.present)
  const selFrame = frameById(doc, sel.frame), selLayer = layerOf(doc, sel)
  const scr = (b: Box): CSSProperties => ({ left: b[0] * cam.z + cam.x, top: b[1] * cam.z + cam.y, width: (b[2] - b[0]) * cam.z, height: (b[3] - b[1]) * cam.z })
  const box = (f: EditorFrame, b?: [number, number, number, number]): CSSProperties => {
    const { w, h } = frameSize(f), [x0, y0, x1, y1] = b ?? [0, 0, w, h]
    return scr([f.x + x0, f.y + y0, f.x + x1, f.y + y1])
  }
  const hoverFrame = hover?.frame && frameById(doc, hover.frame), hoverLayer = hoverFrame && hover?.layer ? hoverFrame.card.layers.find(l => l.id === hover.layer) : undefined
  const brushCell = (() => {
    if (tool !== 'draw' || !hover) return 0
    const f = hover.frame ? frameById(doc, hover.frame) : selFrame, l = selLayer?.kind === 'paint' ? selLayer : f && topDown(f.card).find(x => x.kind === 'paint')
    return (f ? pitchOf(f.card) * (l && 'lattice' in l ? l.lattice : 1) : 4) * cam.z
  })()
  const picked = selFrames(sel).map(id => frameById(doc, id)).filter((f): f is EditorFrame => !!f && !f.hidden), many = picked.length > 1
  const groupBox = many ? framesBox(doc, picked.map(f => f.id)) : undefined
  const resizable = !many && selFrame && !selLayer && !selFrame.card.reference && !selFrame.locked
  const pickedLayers = selFrame && sel.layer ? selLayers(sel).map(id => selFrame.card.layers.find(l => l.id === id)).filter((l): l is StudioLayer => !!l) : []
  const handles = (group: boolean, id?: string) => (['nw', 'ne', 'sw', 'se'] as Handle[]).map(hd => <i key={hd} className={`ed-handle ${hd}`} data-handle={hd} data-frame-id={id} data-group={group ? '1' : undefined} />)
  return (
    <div ref={vp} className={`ed-viewport tool-${tool}${selectMode ? ' is-selecting' : ''}`} style={{ cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onPointerLeave={onLeave}
      onContextMenu={e => e.preventDefault()} role="application" aria-label="Canvas: frames of dot cards. Drag on empty canvas to select, arrow keys nudge the selection, Shift+1 fits everything.">
      <canvas ref={paste} className="ed-paste" aria-hidden="true" />
      <div className="ed-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
        {frames.map(f => <FrameView key={f.id} f={f} />)}
      </div>
      <div className="ed-overlay">
        {frames.filter(f => !f.hidden).map(f => {
          const b = box(f), on = selFrames(sel).includes(f.id) || sel.frame === f.id
          return <button key={f.id} type="button" tabIndex={-1} data-frame-label={f.id} className={`ed-flabel${on ? ' on' : ''}${f.locked ? ' locked' : ''}`} style={{ left: b.left, top: (b.top as number) - 22, maxWidth: Math.max(48, b.width as number) }}
            onClick={e => { if (e.detail === 0) useEditor.getState().select({ frame: f.id }) /* keyboard / script: pointer clicks select on press and release */ }}>{f.card.name}<small>{f.card.grid.cols}×{f.card.grid.rows}</small>{f.locked && <i className="ed-flock">LOCKED</i>}</button>
        })}
        {hoverFrame && !(selFrames(sel).includes(hoverFrame.id) && !hoverLayer) && <div className="ed-hover" style={box(hoverFrame, hoverLayer && layerBounds(hoverFrame, hoverLayer))} />}
        {selFrame && !selFrame.hidden && !many && <div className={`ed-sel${selLayer ? ' ed-sel--parent' : ''}`} style={box(selFrame)}>
          {resizable && handles(false, selFrame.id)}
        </div>}
        {many && picked.map(f => <div key={f.id} className="ed-sel ed-sel--pick" style={box(f)} />)}
        {groupBox && <div className="ed-sel ed-sel--group" style={scr(groupBox)}>{canResize(picked) && handles(true)}</div>}
        {selFrame && pickedLayers.map(l => <div key={l.id} className="ed-sel ed-sel--layer" style={box(selFrame, layerBounds(selFrame, l) ?? [0, 0, frameSize(selFrame).w, frameSize(selFrame).h])} />)}
        {marq && <div className="ed-marquee" style={scr(marq)} />}
        {snaps?.guides.map((g, i) => <div key={`g${i}`} className={`ed-guide ed-guide--${g.axis}`} style={g.axis === 'x' ? { left: g.at * cam.z + cam.x, top: g.from * cam.z + cam.y, height: (g.to - g.from) * cam.z } : { top: g.at * cam.z + cam.y, left: g.from * cam.z + cam.x, width: (g.to - g.from) * cam.z }} />)}
        {snaps?.gaps.map((g, i) => <div key={`p${i}`} className={`ed-gap ed-gap--${g.axis}`} style={g.axis === 'x' ? { left: g.a * cam.z + cam.x, top: g.at * cam.z + cam.y, width: (g.b - g.a) * cam.z } : { top: g.a * cam.z + cam.y, left: g.at * cam.z + cam.x, height: (g.b - g.a) * cam.z }}><small>{Math.round(g.b - g.a)}</small></div>)}
        {draft && <div className="ed-sel ed-sel--draft" style={{ left: draft[0] * cam.z + cam.x, top: draft[1] * cam.z + cam.y, width: draft[2] * cam.z, height: draft[3] * cam.z }}><small>{Math.round(draft[2] / 2.25)}×{Math.round(draft[3] / 2.25)}</small></div>}
        {tool === 'draw' && hover && <div className={`ed-brush${brush.erase ? ' erase' : ''}`} style={{ left: hover.sx, top: hover.sy, width: Math.max(6, (brush.size * 2 - 1) * brushCell), height: Math.max(6, (brush.size * 2 - 1) * brushCell) }} />}
      </div>
    </div>
  )
}
