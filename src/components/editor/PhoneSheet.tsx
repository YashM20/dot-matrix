/**
 * The phone's sheet: LAYERS, ASSETS or the inspector. Upright it is a bottom sheet with detents (36 / 60 /
 * 90 % of what the keyboard leaves visible): drag or tap the handle, drag down to close. It opens at the
 * detent it was last left at for that panel (E6: this session, and across reloads in localStorage). On its
 * side the phone gets a side sheet at the right instead, the full height under the top bar.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { InspectorBody, InspectorTabs } from './Inspector'
import { AssetsPanel, LayersPanel } from './Panels'
import { DETENTS, detentFor, panelOf, rememberDetent, rememberedDetent, type SheetPanel } from './phone'
import { revealAbove, useEditor, type Sheet } from './store'

/** The panel's detent: where it was last left, remembered on each change; another inspector tab adopts its own. */
function useDetent(panel: SheetPanel) {
  const [detent, setDetentNow] = useState(() => detentFor(panel))
  const setDetent = (i: number) => { setDetentNow(i); rememberDetent(panel, i) }
  // another inspector tab in the same sheet: the detent that tab was last left at, if it was
  const [shown, setShown] = useState(panel)
  if (shown !== panel) { setShown(panel); const r = rememberedDetent(panel); if (r !== undefined) setDetentNow(r) }
  return [detent, setDetent] as const
}

/** The detent nearest a dragged height `h` (px) on a sheet `vh` tall. */
const nearestDetent = (h: number, vh: number) => {
  let best = 0
  DETENTS.forEach((d, i) => { if (Math.abs(d * vh - h) < Math.abs(DETENTS[best] * vh - h)) best = i })
  return best
}

/**
 * The handle: a drag sets the height live and lets go at the nearest detent (or closes below the first); a tap
 * steps the detent; ↑ / ↓ step it from the keyboard (↓ at the first closes).
 */
function useHandle(detent: number, setDetent: (i: number) => void, vh: number, onClose: () => void) {
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; h: number } | null>(null)
  const h = drag ?? DETENTS[detent] * vh
  const onDown = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.clientY, h } }
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (start.current) setDrag(Math.max(80, Math.min(vh * .95, start.current.h - (e.clientY - start.current.y)))) }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current
    start.current = null
    if (!st) return
    const moved = Math.abs(e.clientY - st.y) > 6, now = drag ?? st.h
    setDrag(null)
    if (!moved) setDetent((detent + 1) % DETENTS.length) // a tap on the handle steps the detent
    else if (now < DETENTS[0] * vh * .7) onClose()
    else setDetent(nearestDetent(now, vh))
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowUp') setDetent(Math.min(2, detent + 1))
    else if (e.key === 'ArrowDown') { if (detent === 0) onClose(); else setDetent(detent - 1) }
  }
  return { drag, h, onDown, onMove, onUp, onKey }
}

const TITLES: Partial<Record<Exclude<Sheet, null>, string>> = { layers: 'LAYERS', assets: 'ASSETS' }
/** What the sheet holds: LAYERS, ASSETS (an insert closes the sheet), or the inspector. */
function SheetBody({ sheet, onClose }: { sheet: Sheet; onClose: () => void }) {
  if (sheet === 'layers') return <LayersPanel />
  if (sheet === 'assets') return <AssetsPanel onInserted={onClose} />
  return <InspectorBody />
}

export function PhoneSheet({ onClose, side, vh: visible }: { onClose: () => void; side: boolean; vh?: number }) {
  const sheet = useEditor(s => s.sheet), right = useEditor(s => s.right)
  const [detent, setDetent] = useDetent(panelOf(sheet ?? 'inspector', right))
  const ref = useRef<HTMLElement>(null)
  const vh = visible ?? (typeof window === 'undefined' ? 800 : (window.visualViewport?.height ?? window.innerHeight))
  const grab = useHandle(detent, setDetent, vh, onClose), dragging = grab.drag !== null
  const selFrame = useEditor(s => s.sel.frame)
  // the selection stays in view beside the sheet (after the height transition)
  useEffect(() => {
    if (dragging) return
    const t = setTimeout(() => { if (side) revealAbove(0, ref.current?.offsetWidth ?? 0); else revealAbove(DETENTS[detent] * vh) }, 240)
    return () => clearTimeout(t)
  }, [detent, dragging, selFrame, vh, side])
  const title = sheet ? TITLES[sheet] : undefined
  return (
    <section ref={ref} className={`ed-sheet${side ? ' ed-sheet--side' : ''}${dragging ? ' dragging' : ''}`} aria-label={title ?? 'Inspector'} data-detent={side ? undefined : detent} style={side ? undefined : { height: grab.h }}>
      {!side && <div className="ed-sheet-grab" onPointerDown={grab.onDown} onPointerMove={grab.onMove} onPointerUp={grab.onUp} onPointerCancel={grab.onUp}
        role="slider" aria-label="Sheet height: drag, or tap to step" aria-valuemin={0} aria-valuemax={2} aria-valuenow={detent} tabIndex={0} onKeyDown={grab.onKey}><i /></div>}
      <div className="ed-sheet-head">
        {title ? <b>{title}</b> : <InspectorTabs className="ed-tabs--sheet" />}
        <button type="button" className="ed-ibtn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="ed-sheet-body"><SheetBody sheet={sheet} onClose={onClose} /></div>
    </section>
  )
}
