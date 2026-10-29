/**
 * Chrome that sits on the canvas over the selected layer (docs/EDITOR-PLAN.md E3): the quick bar (tone,
 * lattice or site size, EDIT for text, INK and PICK for paint) and the input for text typed in place,
 * with its caret drawn between glyphs. Neither draws the layer: every edit goes back into the card and
 * the frame redraws through the engine. Grey chrome; the accent only for the caret and an active PICK.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type ReactNode } from 'react'
import type { PaintLayer, SitesLayer, StudioLayer } from '../studio/doc'
import { editLayer, pitchOf, type EditorFrame } from './doc'
import { editableText, inkStep, latticeOf, nextRung, stepLattice, stepSize, stepTone, textGeo, tonesFor, type FBox } from './direct'
import { LATTICES, SITE_SIZES } from '../studio/doc'
import { useEditor, type Camera } from './store'
import { bindTypingInput, cancelTyping, commitTyping, startTyping, typeText } from './typing'

const KIND: Record<StudioLayer['kind'], string> = { ir: 'CODE', text: 'TEXT', sites: 'SITES', 'preset-layer': 'REF', spec: 'SPEC', paint: 'PAINT' }
const num = (k: number) => `${+k.toFixed(2)}×`

/** A button of the quick bar: it never takes focus from the text being typed. */
function Q({ q, label, disabled, pressed, onClick, children }: { q: string; label: string; disabled?: boolean; pressed?: boolean; onClick: (e: RMouseEvent) => void; children: ReactNode }) {
  return <button type="button" data-q={q} aria-label={label} title={label} disabled={disabled} aria-pressed={pressed} onPointerDown={e => e.preventDefault()} onClick={onClick}>{children}</button>
}

/**
 * The quick bar above the selected layer (below it when there is no room). Each toggle is one edit, so
 * one undo step. `box` is the layer's box in screen px.
 */
export function QuickBar({ f, l, box, phone, vp }: { f: EditorFrame; l: StudioLayer; box: FBox; phone: boolean; vp: { w: number; h: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  const typing = useEditor(s => s.typing?.layer === l.id), brush = useEditor(s => s.brush), picking = useEditor(s => s.picking)
  const { edit } = useEditor.getState(), at = { frame: f.id, layer: l.id }
  const set = (fn: (x: StudioLayer) => StudioLayer) => edit(d => editLayer(d, at, fn))
  const k = latticeOf(l)
  // place it: centred over the box, above it (below if it would leave the canvas), inside the viewport
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const w = el.offsetWidth, h = el.offsetHeight, gap = 10, low = phone ? 150 : 8
    let y = box[1] - h - gap
    if (y < 8) y = box[3] + gap
    y = Math.max(8, Math.min(vp.h - h - low, y))
    const x = Math.max(8, Math.min(vp.w - w - 8, (box[0] + box[2]) / 2 - w / 2))
    setPos({ left: x, top: y })
  }, [box[0], box[1], box[2], box[3], vp.w, vp.h, phone, l, typing, brush, picking]) // eslint-disable-line react-hooks/exhaustive-deps
  const tone = l.tone === 'preset' ? 'OWN' : l.tone.toUpperCase()
  return <div ref={ref} className="ed-qbar" role="toolbar" aria-label={`Quick edits: ${l.name}`} style={pos}>
    <span className="ed-qbar-kind" aria-hidden="true">{KIND[l.kind]}</span>
    <Q q="tone" label={`Tone: ${tone.toLowerCase()} (tap for the next one of ${tonesFor(l).length}, ⇧ for the one before)`} onClick={e => set(x => stepTone(x, e.shiftKey ? -1 : 1))}>TONE <b>{tone}</b></Q>
    {k !== undefined && <span className="ed-qbar-step" role="group" aria-label={`Lattice ${num(k)}`}>
      <Q q="lattice-" label="Finer lattice (smaller dots)" disabled={nextRung(LATTICES, k, -1) === undefined} onClick={() => set(x => stepLattice(x, -1))}>−</Q>
      <b>{num(k)}</b>
      <Q q="lattice+" label="Coarser lattice (bigger dots)" disabled={nextRung(LATTICES, k, 1) === undefined} onClick={() => set(x => stepLattice(x, 1))}>+</Q>
    </span>}
    {l.kind === 'sites' && <span className="ed-qbar-step" role="group" aria-label={`Dot size ${num(l.size)}`}>
      <Q q="size-" label="Smaller site dots" disabled={nextRung(SITE_SIZES, l.size, -1) === undefined} onClick={() => set(x => stepSize(x as SitesLayer, -1))}>−</Q>
      <b>{num(l.size)}</b>
      <Q q="size+" label="Bigger site dots" disabled={nextRung(SITE_SIZES, l.size, 1) === undefined} onClick={() => set(x => stepSize(x as SitesLayer, 1))}>+</Q>
    </span>}
    {editableText(l) && (typing
      ? <Q q="done" label="Done typing (Enter)" onClick={() => commitTyping()}>DONE</Q>
      : <Q q="edit" label="Type on the canvas (Enter, double-click)" onClick={() => startTyping(f.id, l.id)}>EDIT</Q>)}
    {l.kind === 'paint' && <PaintQ l={l} />}
  </div>
}
function PaintQ({ l }: { l: PaintLayer }) {
  const brush = useEditor(s => s.brush), picking = useEditor(s => s.picking), { setBrush, setPicking, setNote } = useEditor.getState()
  return <>
    <span className="ed-qbar-step" role="group" aria-label={`Ink ${brush.value.toFixed(1)}`}>
      <Q q="ink-" label="Lighter ink" disabled={brush.value <= .2} onClick={() => setBrush({ value: inkStep(brush.value - .2), erase: false })}>−</Q>
      <b>INK {brush.value.toFixed(1)}</b>
      <Q q="ink+" label="Stronger ink" disabled={brush.value >= 1} onClick={() => setBrush({ value: inkStep(brush.value + .2), erase: false })}>+</Q>
    </span>
    <Q q="pick" label={`Eyedropper (I): pick the ink from a dot of ${l.name}`} pressed={picking} onClick={() => { setPicking(!picking); if (!picking) setNote('PICK: tap a painted dot to take its ink') }}>PICK</Q>
  </>
}

/**
 * The input behind text typed in place. Always mounted and focusable (a tap focuses it in its own
 * handler, so phones open the keyboard); invisible, with the caret and the selected range drawn over
 * the frame between glyph cells. The letters themselves are the frame's own dots.
 */
export function InText({ f, l, cam }: { f?: EditorFrame; l?: StudioLayer; cam: Camera }) {
  const ref = useRef<HTMLInputElement>(null)
  const [range, setRange] = useState<[number, number]>([0, 0])
  const sync = () => { const el = ref.current; if (el) setRange([el.selectionStart ?? 0, el.selectionEnd ?? 0]) }
  useEffect(() => { bindTypingInput(ref.current, sync); return () => bindTypingInput(null) }, [])
  const g = f && l ? textGeo(l) : undefined
  useEffect(() => { if (g) sync() }, [!!g, l]) // eslint-disable-line react-hooks/exhaustive-deps
  const p = f ? pitchOf(f.card) : 1
  const sx = (c: number) => ((f?.x ?? 0) + c * p) * cam.z + cam.x
  const top = g && f ? (f.y + g.top * p) * cam.z + cam.y : 0, h = g ? g.h * p * cam.z : 0
  const box: CSSProperties | undefined = g ? { left: sx(g.left), top, width: Math.max(8, sx(g.carets[g.carets.length - 1]) - sx(g.left)), height: Math.max(8, h) } : undefined
  const [a, b] = g ? [Math.min(range[0], g.carets.length - 1), Math.min(range[1], g.carets.length - 1)] : [0, 0]
  return <>
    <input ref={ref} className={`ed-intext${g ? ' on' : ''}`} style={box} aria-label="Text on the canvas: type, Enter to finish, Esc to cancel" aria-hidden={!g} tabIndex={g ? 0 : -1}
      autoCapitalize="characters" autoComplete="off" autoCorrect="off" spellCheck={false} maxLength={64} enterKeyHint="done"
      onChange={e => { typeText(e.currentTarget.value); sync() }} onSelect={sync} onKeyUp={sync}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commitTyping() } else if (e.key === 'Escape') { e.preventDefault(); cancelTyping() } }}
      onBlur={() => commitTyping()} />
    {g && (a === b
      ? <i className="ed-caret" aria-hidden="true" style={{ left: sx(g.carets[a]), top, height: Math.max(6, h) }} />
      : <i className="ed-textsel" aria-hidden="true" style={{ left: sx(g.carets[a]), top, width: sx(g.carets[b]) - sx(g.carets[a]), height: Math.max(6, h) }} />)}
  </>
}
