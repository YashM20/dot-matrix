/**
 * The infinite canvas: a pannable, zoomable world of frames (each its card through the engine), the
 * pasteboard dot field behind them, and the selection / hover / handle overlay in screen space.
 *
 * Input: wheel pans, Ctrl/⌘ + wheel (and trackpad pinch) zooms about the pointer; Space-drag, the
 * middle button or the Hand tool pan; on touch one finger uses the tool (or pans empty canvas) and two
 * fingers pinch-zoom and pan. One rAF loop draws every frame that changed, is animating or is being
 * previewed; frames off screen are skipped.
 */
import { memo, useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { PAINT_LIVE, paintCells, paintLayer, type PaintLayer, type StudioLayer } from '../studio/doc'
import { EXAMPLES } from '../dwitter/examples'
import { addFrame, addLayer, blankCard, drawingCard, editFrame, editLayer, encodeCells, frameById, frameSize, hitFrame, hitLayer, layerBounds, layerOf, line, movable, newIRLayer, newTextLayer, nudgeLayer, paintCellAt, pitchOf, programCard, programSource, raiseFrame, resizeFrame, stamp, topDown, type EditorFrame } from './doc'
import { drawFrame, drawPaste, isAnimated, resolutionFor } from './render'
import { useEditor, type Camera } from './store'

/** Probe hooks (scripts/studio-browser.ts, dots-browser.ts): draw stats and the selected frame id. */
declare global { interface Window { __editor?: { frames: number; drawn: number; maxMs: number; lastMs: number; sel?: string } } }

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

type Handle = 'nw' | 'ne' | 'sw' | 'se'
type Op =
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'pinch'; d: number; mx: number; my: number; cam: Camera }
  | { kind: 'press'; sx: number; sy: number; wx: number; wy: number; frame: string; layer?: string; touch: boolean; was: boolean }
  | { kind: 'drag-frame'; id: string; wx: number; wy: number; x0: number; y0: number }
  | { kind: 'drag-layer'; frame: string; layer: string; wx: number; wy: number; base: StudioLayer }
  | { kind: 'resize'; id: string; handle: Handle; wx: number; wy: number; f0: EditorFrame }
  | { kind: 'frame-draw'; wx: number; wy: number; wx1: number; wy1: number }
  | { kind: 'stroke'; frame: string; layer: string; cells: Uint8Array; last?: [number, number]; value: number }
  | { kind: 'tap'; sx: number; sy: number }

export function Canvas({ phone }: { phone: boolean }) {
  const vp = useRef<HTMLDivElement>(null), paste = useRef<HTMLCanvasElement>(null)
  const frames = useEditor(s => s.h.present.frames), cam = useEditor(s => s.cam), tool = useEditor(s => s.tool), sel = useEditor(s => s.sel)
  const brush = useEditor(s => s.brush)
  const [space, setSpace] = useState(false)
  const [hover, setHover] = useState<{ frame?: string; layer?: string; sx: number; sy: number } | undefined>()
  const [draft, setDraft] = useState<[number, number, number, number] | undefined>()
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
      stats.frames = d.frames.length; stats.sel = s.sel.frame
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
    if (!o) return
    if (o.kind === 'stroke') {
      if (commitIt) s.live(d => editLayer(d, { frame: o.frame, layer: o.layer }, l => ({ ...l, cells: encodeCells(o.cells) }) as PaintLayer))
      PAINT_LIVE.delete(o.layer); markDirty(o.frame)
      if (commitIt) s.end(); else s.cancel()
    } else if (o.kind === 'drag-frame' || o.kind === 'drag-layer' || o.kind === 'resize') {
      if (commitIt) s.end(); else s.cancel()
    } else if (o.kind === 'frame-draw') {
      setDraft(undefined)
      if (!commitIt) return
      const x0 = Math.min(o.wx, o.wx1), y0 = Math.min(o.wy, o.wy1), w = Math.abs(o.wx1 - o.wx), h = Math.abs(o.wy1 - o.wy), pitch = 2.25
      const big = w > 12 && h > 12
      const card = blankCard(big ? { cols: Math.max(8, Math.round(w / pitch)), rows: Math.max(8, Math.round(h / pitch)), pitch } : undefined)
      const id = s.insertCard(card, { at: big ? { x: x0, y: y0 } : { x: o.wx - 162, y: o.wy - 162 }, source: 'blank' })
      s.select({ frame: id }); s.setTool('move')
    }
  }, [])

  const startStroke = (wx: number, wy: number, erase: boolean) => {
    const s = useEditor.getState()
    s.begin()
    let f = hitFrame(s.h.present, wx, wy)
    if (!f) {
      const card = drawingCard()
      const { doc, frame } = addFrame(s.h.present, card, { at: { x: wx - 160, y: wy - 160 }, source: 'draw' })
      s.live(() => doc); f = frame
    }
    const cur = layerOf(s.h.present, s.sel)
    let l: StudioLayer | undefined = s.sel.frame === f.id && cur?.kind === 'paint' ? cur : topDown(f.card).find(x => x.kind === 'paint' && x.visible)
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
    if (e.button === 1 || space || s.tool === 'hand') { e.preventDefault(); op.current = { kind: 'pan', sx, sy, cam: s.cam }; return }
    if (e.button !== 0 && !(e.button === 2 && s.tool === 'draw')) return
    if (handle) {
      const f = frameById(s.h.present, handle.dataset.frameId)
      if (f) { s.begin(); op.current = { kind: 'resize', id: f.id, handle: handle.dataset.handle as Handle, wx, wy, f0: f } }
      return
    }
    if (label) {
      const id = label.dataset.frameLabel!
      s.select({ frame: id })
      op.current = { kind: 'press', sx, sy, wx, wy, frame: id, touch: false, was: true }
      return
    }
    if (s.tool === 'draw') { startStroke(wx, wy, s.brush.erase || e.button === 2); return }
    if (s.tool === 'frame') { op.current = { kind: 'frame-draw', wx, wy, wx1: wx, wy1: wy }; return }
    if (s.tool === 'text' || s.tool === 'code') { op.current = { kind: 'tap', sx, sy }; return }
    // move / select
    const f = hitFrame(s.h.present, wx, wy)
    if (!f) {
      if (e.pointerType !== 'touch') s.select({})
      op.current = { kind: 'pan', sx, sy, cam: s.cam }
      // a tap on empty canvas (not a pan) deselects on touch too: decided on pointer up
      ;(op.current as Op & { tapClear?: boolean }).tapClear = e.pointerType === 'touch'
      return
    }
    const was = s.sel.frame === f.id
    const l = hitLayer(f, wx - f.x, wy - f.y)
    const touch = e.pointerType === 'touch'
    if (!touch) s.select(l ? { frame: f.id, layer: l.id } : { frame: f.id })
    op.current = { kind: 'press', sx, sy, wx, wy, frame: f.id, layer: l?.id, touch, was }
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
      const f = hitFrame(s.h.present, wx, wy)
      const l = f && s.tool === 'move' ? hitLayer(f, wx - f.x, wy - f.y) : undefined
      feedPointer(f && readsPointer(f) ? f : undefined, wx, wy)
      setHover(h => (h?.frame === f?.id && h?.layer === l?.id && s.tool !== 'draw' ? h : { frame: f?.id, layer: l?.id, sx, sy }))
      return
    }
    if (o.kind === 'pinch') {
      const ps = [...pointers.current.values()]
      if (ps.length < 2) return
      const [a, b] = ps, d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2
      const z = Math.min(16, Math.max(.1, o.cam.z * d / Math.max(1, o.d))), k = z / o.cam.z
      s.setCam({ z, x: mx - (o.mx - o.cam.x) * k, y: my - (o.my - o.cam.y) * k })
      return
    }
    if (o.kind === 'pan') { s.setCam({ ...o.cam, x: o.cam.x + sx - o.sx, y: o.cam.y + sy - o.sy }); return }
    if (o.kind === 'tap') return
    if (o.kind === 'stroke') { strokeTo(wx, wy); setHover({ sx, sy }); return }
    if (o.kind === 'frame-draw') { o.wx1 = wx; o.wy1 = wy; setDraft([Math.min(o.wx, wx), Math.min(o.wy, wy), Math.abs(wx - o.wx), Math.abs(wy - o.wy)]); return }
    if (o.kind === 'press') {
      if (Math.hypot(sx - o.sx, sy - o.sy) < (o.touch ? 8 : 3)) return
      // touch: dragging a frame that was not selected pans instead (no accidental moves while scrolling around)
      if (o.touch && !o.was) { op.current = { kind: 'pan', sx: o.sx, sy: o.sy, cam: s.cam }; return }
      const f = frameById(s.h.present, o.frame)!
      const l = o.layer ? f.card.layers.find(x => x.id === o.layer) : undefined
      s.begin()
      if (l && movable(l)) { s.select({ frame: f.id, layer: l.id }); op.current = { kind: 'drag-layer', frame: f.id, layer: l.id, wx: o.wx, wy: o.wy, base: l } }
      else { s.live(d => raiseFrame(d, f.id)); if (!o.layer) s.select({ frame: f.id }); op.current = { kind: 'drag-frame', id: f.id, wx: o.wx, wy: o.wy, x0: f.x, y0: f.y } }
      return onMove(e)
    }
    if (o.kind === 'drag-frame') {
      const snap = e.shiftKey ? 1 : 4
      s.live(d => editFrame(d, o.id, f => ({ ...f, x: Math.round((o.x0 + wx - o.wx) / snap) * snap, y: Math.round((o.y0 + wy - o.wy) / snap) * snap })))
      return
    }
    if (o.kind === 'drag-layer') {
      const f = frameById(s.h.present, o.frame)!, p = pitchOf(f.card)
      const dc = Math.round((wx - o.wx) / p), dr = Math.round((wy - o.wy) / p) // whole cells: dots stay on the grid
      s.live(d => editLayer(d, { frame: o.frame, layer: o.layer }, () => nudgeLayer(o.base, dc, dr)))
      return
    }
    if (o.kind === 'resize') {
      const f0 = o.f0, p = pitchOf(f0.card), dx = Math.round((wx - o.wx) / p), dy = Math.round((wy - o.wy) / p)
      const west = o.handle.includes('w'), north = o.handle.includes('n')
      const cols = f0.card.grid.cols + (west ? -dx : dx), rows = f0.card.grid.rows + (north ? -dy : dy)
      const cc = Math.max(8, Math.min(512, cols)), rr = Math.max(8, Math.min(512, rows))
      s.live(d => editFrame(d, o.id, () => resizeFrame(f0, cc, rr, west ? cc - f0.card.grid.cols : 0, north ? rr - f0.card.grid.rows : 0)))
    }
  }

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId)
    const o = op.current, s = useEditor.getState()
    if (o?.kind === 'pinch') { if (pointers.current.size < 2) op.current = undefined; return }
    if (!o) return
    if (o.kind === 'press') {
      op.current = undefined
      // a tap (no drag): select what is under it (touch selects on release, so a pan never changes the selection)
      if (o.touch) s.select(o.layer ? { frame: o.frame, layer: o.layer } : { frame: o.frame })
      return
    }
    if (o.kind === 'pan') {
      op.current = undefined
      const { sx, sy } = local(e)
      if ((o as Op & { tapClear?: boolean }).tapClear && Math.hypot(sx - o.sx, sy - o.sy) < 8) s.select({})
      return
    }
    if (o.kind === 'tap') {
      op.current = undefined
      const { sx, sy } = local(e), { wx, wy } = world(sx, sy)
      if (Math.hypot(sx - o.sx, sy - o.sy) > 10) return
      const f = hitFrame(s.h.present, wx, wy), p = f ? pitchOf(f.card) : 1
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
  const box = (f: EditorFrame, b?: [number, number, number, number]): CSSProperties => {
    const { w, h } = frameSize(f), [x0, y0, x1, y1] = b ?? [0, 0, w, h]
    return { left: (f.x + x0) * cam.z + cam.x, top: (f.y + y0) * cam.z + cam.y, width: (x1 - x0) * cam.z, height: (y1 - y0) * cam.z }
  }
  const hoverFrame = hover?.frame && frameById(doc, hover.frame), hoverLayer = hoverFrame && hover?.layer ? hoverFrame.card.layers.find(l => l.id === hover.layer) : undefined
  const brushCell = (() => {
    if (tool !== 'draw' || !hover) return 0
    const f = hover.frame ? frameById(doc, hover.frame) : selFrame, l = selLayer?.kind === 'paint' ? selLayer : f && topDown(f.card).find(x => x.kind === 'paint')
    return (f ? pitchOf(f.card) * (l && 'lattice' in l ? l.lattice : 1) : 4) * cam.z
  })()
  const resizable = selFrame && !selLayer && !selFrame.card.reference
  return (
    <div ref={vp} className={`ed-viewport tool-${tool}`} style={{ cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onPointerLeave={onLeave}
      onContextMenu={e => e.preventDefault()} role="application" aria-label="Canvas: frames of dot cards. Arrow keys nudge the selection, Shift+1 fits everything.">
      <canvas ref={paste} className="ed-paste" aria-hidden="true" />
      <div className="ed-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
        {frames.map(f => <FrameView key={f.id} f={f} />)}
      </div>
      <div className="ed-overlay">
        {frames.filter(f => !f.hidden).map(f => {
          const b = box(f), on = sel.frame === f.id
          return <button key={f.id} type="button" tabIndex={-1} data-frame-label={f.id} className={`ed-flabel${on ? ' on' : ''}`} style={{ left: b.left, top: (b.top as number) - 22, maxWidth: Math.max(48, b.width as number) }}
            onClick={() => useEditor.getState().select({ frame: f.id })}>{f.card.name}<small>{f.card.grid.cols}×{f.card.grid.rows}</small></button>
        })}
        {hoverFrame && !(sel.frame === hoverFrame.id && !sel.layer && !hoverLayer) && <div className="ed-hover" style={box(hoverFrame, hoverLayer && layerBounds(hoverFrame, hoverLayer))} />}
        {selFrame && !selFrame.hidden && <div className={`ed-sel${selLayer ? ' ed-sel--parent' : ''}`} style={box(selFrame)}>
          {resizable && (['nw', 'ne', 'sw', 'se'] as Handle[]).map(hd => <i key={hd} className={`ed-handle ${hd}`} data-handle={hd} data-frame-id={selFrame.id} />)}
        </div>}
        {selFrame && selLayer && <div className="ed-sel ed-sel--layer" style={box(selFrame, layerBounds(selFrame, selLayer) ?? [0, 0, frameSize(selFrame).w, frameSize(selFrame).h])} />}
        {draft && <div className="ed-sel ed-sel--draft" style={{ left: draft[0] * cam.z + cam.x, top: draft[1] * cam.z + cam.y, width: draft[2] * cam.z, height: draft[3] * cam.z }}><small>{Math.round(draft[2] / 2.25)}×{Math.round(draft[3] / 2.25)}</small></div>}
        {tool === 'draw' && hover && <div className={`ed-brush${brush.erase ? ' erase' : ''}`} style={{ left: hover.sx, top: hover.sy, width: Math.max(6, (brush.size * 2 - 1) * brushCell), height: Math.max(6, (brush.size * 2 - 1) * brushCell) }} />}
      </div>
    </div>
  )
}
