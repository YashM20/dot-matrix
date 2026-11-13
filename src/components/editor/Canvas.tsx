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
 * E6: a long press (touch, Move) on a frame or layer opens the long-press menu; a drag that snaps to a
 * guide lights the pasteboard's dots along it for a moment (the snap cue, in the accent).
 */
import { memo, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { Box, Gap, Guide } from './select'
import { getEditor, useEditor, type Tool } from './store'
import { EditorBoundary } from './EditorBoundary'
import { registerFrame, useFrameLoop } from './frameLoop'
import { frameSize, type EditorFrame } from './doc'
import { useGestures, type Hover } from './gestures'
import { CanvasOverlay } from './CanvasOverlay'

const FrameView = memo(function FrameView({ f }: { f: EditorFrame }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => (ref.current ? registerFrame(f.id, ref.current) : undefined), [f.id])
  const { w, h } = frameSize(f)
  return <canvas ref={ref} className="ed-frame" data-frame={f.id} role="img" aria-label={`Frame ${f.card.name}, ${f.card.grid.cols}×${f.card.grid.rows} dots`}
    style={{ left: f.x, top: f.y, width: w, height: h, display: f.hidden ? 'none' : undefined }} />
})

/** The viewport's cursor: the hand while panning, none while the brush ring stands in for it. */
const TOOL_CURSOR: Record<Tool, string> = { move: 'default', hand: 'grab', frame: 'crosshair', code: 'crosshair', text: 'text', draw: 'none' }
const cursorFor = (tool: Tool, space: boolean, picking: boolean) => space ? 'grab' : tool === 'draw' && picking ? 'crosshair' : TOOL_CURSOR[tool]

/** The canvas inside the editor's recovery screen: a render crash shows RESET EDITOR DOCUMENT, not a blank page. */
export function Canvas(props: { phone: boolean; landscape?: boolean }) {
  return <EditorBoundary area="canvas"><CanvasView {...props} /></EditorBoundary>
}

function CanvasView({ phone, landscape = false }: { phone: boolean; landscape?: boolean }) {
  const vp = useRef<HTMLDivElement>(null)
  const frames = useEditor(s => s.h.present.frames), cam = useEditor(s => s.cam), tool = useEditor(s => s.tool), selectMode = useEditor(s => s.selectMode)
  const picking = useEditor(s => s.picking)
  const [space, setSpace] = useState(false)
  const [hover, setHover] = useState<Hover | undefined>()
  const [draft, setDraft] = useState<[number, number, number, number] | undefined>()
  const [marq, setMarq] = useState<Box | undefined>()
  const [snaps, setSnaps] = useState<{ guides: Guide[]; gaps: Gap[] } | undefined>()
  // the render loop (frameLoop.ts) owns the pasteboard; pointer input (gestures.ts) lights it
  const { pasteRef, pasteDirtyRef, glowRef, cueRef } = useFrameLoop(phone)

  // viewport size → store (fit / reveal), and the first fit (for the layout at that moment)
  const firstFit = useEffectEvent(() => { const s = getEditor(), first = s.h.present.frames.find(f => !f.hidden); if (s.sel.frame) s.fit([s.sel.frame], 1.5); else if (phone && first) s.fit([first.id], 1.25); else s.fit([], 1.25) })
  useEffect(() => {
    const el = vp.current
    if (!el) return
    let fitted = false
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      getEditor().setVp(r.width, r.height); pasteDirtyRef.current = true
      if (!fitted && r.width > 0) { fitted = true; firstFit() }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pasteDirtyRef])

  // Space = temporary hand
  useEffect(() => {
    const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName))
    const down = (e: KeyboardEvent) => { if (e.key === ' ' && !editable(e.target)) { e.preventDefault(); if (!e.repeat) setSpace(true) } }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') setSpace(false) }
    const blur = () => setSpace(false)
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur) }
  }, [])

  // wheel: pan; Ctrl/⌘ + wheel or a trackpad pinch: zoom about the pointer
  useEffect(() => {
    const el = vp.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect(), s = getEditor(), k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? r.height : 1
      if (e.ctrlKey || e.metaKey) s.zoomAt(s.cam.z * Math.exp(-e.deltaY * k * .0045), e.clientX - r.left, e.clientY - r.top)
      else { const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY; s.setCam({ ...s.cam, x: s.cam.x - dx * k, y: s.cam.y - dy * k }) }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const { onDown, onMove, onUp, onDouble, onCancel, onLeave } = useGestures(phone, space, { vpRef: vp, glowRef, pasteDirtyRef, cueRef }, { setHover, setDraft, setMarq, setSnaps })

  const cursor = cursorFor(tool, space, picking)
  return (
    <div ref={vp} className={`ed-viewport tool-${tool}${selectMode ? ' is-selecting' : ''}`} style={{ cursor }} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onCancel} onPointerLeave={onLeave}
      onDoubleClick={onDouble} onContextMenu={e => e.preventDefault()} role="application" aria-label="Canvas: frames of dot cards. Drag on empty canvas to select, arrow keys nudge the selection, Shift+1 fits everything.">
      <canvas ref={pasteRef} className="ed-paste" aria-hidden="true" />
      <div className="ed-world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})` }}>
        {frames.map(f => <FrameView key={f.id} f={f} />)}
      </div>
      <CanvasOverlay phone={phone} landscape={landscape} hover={hover} draft={draft} marq={marq} snaps={snaps} />
    </div>
  )
}
