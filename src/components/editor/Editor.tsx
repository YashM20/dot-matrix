/**
 * MAKE: one editor (docs/EDITOR-PLAN.md). Desktop: a tool bar on top, LAYERS / ASSETS on the left, the
 * infinite canvas in the middle and a contextual inspector (DESIGN / ANIMATE / CODE / EXPORT) on the right.
 * Phone (≤ 640 px, or a phone on its side): a full-screen canvas, a floating tool bar at the bottom, and the
 * panels as bottom sheets with a drag handle (on its side: a side sheet). The old MAKE modes are entry points:
 * `mode` picks the tool and panels.
 * E6: the sheet remembers its detent per panel, the keyboard never covers the sheet or the text being typed
 * (`visualViewport`), and SHARE opens the system share sheet when there is one.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode, type PointerEvent } from 'react'
import type { Mode } from '../../site/views'
import { librarySave } from '../studio/doc'
import { Canvas } from './Canvas'
import { arrangeSel, copyEverywhere, copySel, copyText, cutSel, deleteSel, duplicateSel, groupSel, hideSel, lockSel, nudgeSel, orderSel, paste, selectAllSel, selectParent, shareSel, ungroupSel } from './actions'
import { CLIP_KEY } from './clip'
import { frameById, groupOf, layerOf, topDown } from './doc'
import { TEST_HOOKS } from '../../lib/testHooks'
import { EditorBoundary } from './EditorBoundary'
import { ImportPrompt, useLinkImports } from './imports'
import { editableText } from './direct'
import { codeTarget, KEY_TOOL, MODE_ENTRY, paintTarget } from './input'
import { InspectorBody, InspectorTabs } from './Inspector'
import { AssetsPanel, LayersPanel } from './Panels'
import { DETENTS, detentFor, isPhone, keyboardBox, LANDSCAPE_QUERY, panelOf, PHONE_QUERY, rememberDetent, rememberedDetent, shareLink, type Layout, type ShareOutcome } from './phone'
import { getEditor, revealAbove, useEditor, type Tool } from './store'
import { selCount, selFrames, selLayers, type Align } from './select'
import { keepTypingInView, startTyping } from './typing'
import { DotIcon, type IconName } from './ui'
import { Modal } from '../Modal'
import './editor.css'

const TOOLS: { id: Tool; icon: IconName; key: string; label: string; phone: boolean }[] = [
  { id: 'move', icon: 'move', key: 'V', label: 'Move and select', phone: true },
  { id: 'hand', icon: 'hand', key: 'H', label: 'Hand (or hold Space)', phone: false },
  { id: 'frame', icon: 'frame', key: 'F', label: 'Frame: drag out a new card', phone: true },
  { id: 'draw', icon: 'draw', key: 'B', label: 'Draw dots (E erases)', phone: true },
  { id: 'text', icon: 'text', key: 'T', label: 'Text: tap a frame', phone: true },
  { id: 'code', icon: 'code', key: 'C', label: 'Code: add a Field IR layer', phone: true },
]

const subscribeMQ = (cb: () => void) => {
  const ms = [matchMedia(PHONE_QUERY), matchMedia(LANDSCAPE_QUERY)]
  for (const m of ms) m.addEventListener('change', cb)
  return () => { for (const m of ms) m.removeEventListener('change', cb) }
}
const layoutNow = (): Layout => (!matchMedia(PHONE_QUERY).matches ? 'desktop' : matchMedia(LANDSCAPE_QUERY).matches ? 'landscape' : 'portrait')
const useLayout = () => useSyncExternalStore(subscribeMQ, layoutNow, (): Layout => 'desktop')
type KeyboardBox = ReturnType<typeof keyboardBox>
const sameBox = (a: KeyboardBox, b: KeyboardBox) => a?.top === b?.top && a?.height === b?.height
/**
 * Phone: the part of the screen an on-screen keyboard leaves (`visualViewport`), or undefined when none is
 * open. The editor then fills just that part, so the sheet sits on the keyboard and the canvas above it.
 */
function useKeyboard(phone: boolean): KeyboardBox {
  const [box, setBox] = useState<KeyboardBox>(undefined)
  useEffect(() => {
    const vv = window.visualViewport
    if (!phone || !vv) return
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { const b = keyboardBox(window.innerHeight, vv); setBox(p => (sameBox(p, b) ? p : b)) })
    }
    on()
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on)
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on) }
  }, [phone])
  return phone ? box : undefined
}
const editable = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

interface EditorProps { mode: Mode; onExit?: () => void }
/** The editor inside its recovery screen (#143): a crash anywhere in it (top bar, panels, inspector) offers a reset. */
export const Editor = (props: EditorProps) => <EditorBoundary area="editor"><EditorView {...props} /></EditorBoundary>

function EditorView({ mode, onExit }: EditorProps) {
  const layout = useLayout(), phone = layout !== 'desktop', landscape = layout === 'landscape', kb = useKeyboard(phone)
  const sheet = useEditor(s => s.sheet), note = useEditor(s => s.note), shortcuts = useEditor(s => s.shortcuts)
  const [banner, setBanner] = useState('')
  const prompt = useLinkImports(mode, setBanner) // `?p=` / `?make&d=` links wait for KEEP
  // probes only: a render crash on demand, to check the recovery screen around the whole editor
  if (TEST_HOOKS && (globalThis as { __editorCrash?: boolean }).__editorCrash) throw new Error('probe: the editor was asked to crash')
  const root = useRef<HTMLElement>(null)
  // desktop: fill the window below the site bar (the footer sits below the fold). Re-measured when the page
  // above changes height too: the site bar grows after mount (the lazily loaded tool dock is portaled into it),
  // and a height measured once would leave the editor's bottom edge below the window.
  useLayoutEffect(() => {
    const el = root.current
    if (!el || phone) return
    const size = () => { const top = el.getBoundingClientRect().top + window.scrollY; el.style.setProperty('--ed-h', `${Math.max(520, window.innerHeight - top)}px`) }
    size()
    window.addEventListener('resize', size)
    // next frame, not inside the callback: resizing the editor resizes the observed page (no RO loop error)
    let raf = 0
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(size) })
    ro.observe(document.documentElement)
    return () => { window.removeEventListener('resize', size); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [phone])

  // the old MAKE modes are ways in: each picks a tool and the panels it used to be
  useEffect(() => {
    const s = getEditor(), d = s.h.present, entry = MODE_ENTRY[mode]
    s.setTool(entry.tool); s.setLeft(entry.left); s.setRight(entry.right)
    if (mode === 'DRAW') { const t = paintTarget(d, s.sel); if (t) s.select(t) }
    else if (mode === 'CODE') {
      if (!new URLSearchParams(location.search).get('p')) { const t = codeTarget(d, s.sel); if (t) s.select(t) }
      if (phone) s.setSheet('inspector')
    }
  }, [mode]) // eslint-disable-line react-hooks/exhaustive-deps

  // phone: the editor is the whole screen; the page underneath must not scroll or rubber-band
  useEffect(() => {
    if (!phone) return
    document.documentElement.classList.add('ed-scroll-lock')
    return () => document.documentElement.classList.remove('ed-scroll-lock')
  }, [phone])

  useEffect(() => { if (!note) return; const h = setTimeout(() => getEditor().setNote(''), 4200); return () => clearTimeout(h) }, [note])
  useShortcuts(phone)

  // the keyboard opened or closed: once the canvas has its new size, the text being typed and the field
  // with focus in the sheet move back into view (the caret stays visible)
  const kbH = kb?.height
  useEffect(() => {
    if (!phone) return
    const t = setTimeout(() => {
      keepTypingInView()
      const a = document.activeElement
      if (a instanceof HTMLElement && a.closest('.ed-sheet')) a.scrollIntoView({ block: 'nearest' })
    }, 120)
    return () => clearTimeout(t)
  }, [kbH, phone])

  return (
    <section ref={root} className={`ed-root${phone ? ' is-phone' : ''}${landscape ? ' is-landscape' : ''}${kb ? ' has-kb' : ''}`} aria-label="Editor"
      style={kb ? { top: kb.top, height: kb.height } : undefined}>
      <TopBar phone={phone} onExit={onExit} />
      <div className="ed-body">
        {!phone && <LeftPanel />}
        <div className="ed-stage">
          <Canvas phone={phone} landscape={landscape} />
          {banner && <p className="ed-banner" role="alert">{banner}<button type="button" aria-label="Dismiss" onClick={() => setBanner('')}>×</button></p>}
          {prompt && <ImportPrompt prompt={prompt} />}
          <p className="ed-note" role="status" aria-live="polite">{note}</p>
          {phone && !sheet && <SelBar />}
          {phone && !sheet && <PhoneTools />}
        </div>
        {!phone && <aside className="ed-right" aria-label="Inspector"><InspectorTabs /><InspectorBody /></aside>}
      </div>
      {phone && sheet && <Sheet key={sheet} side={landscape} vh={kb?.height} onClose={() => getEditor().setSheet(null)} />}
      {shortcuts && <Shortcuts onClose={() => getEditor().setShortcuts(false)} />}
    </section>
  )
}

function LeftPanel() {
  const left = useEditor(s => s.left), setLeft = useEditor(s => s.setLeft)
  return <aside className="ed-left" aria-label="Layers and assets">
    <div className="ed-tabs" role="tablist" aria-label="Left panel">
      <button type="button" role="tab" aria-selected={left === 'layers'} onClick={() => setLeft('layers')}>LAYERS</button>
      <button type="button" role="tab" aria-selected={left === 'assets'} onClick={() => setLeft('assets')}>ASSETS</button>
    </div>
    {left === 'layers' ? <LayersPanel /> : <AssetsPanel />}
  </aside>
}

function ToolButton({ t, phone }: { t: typeof TOOLS[number]; phone: boolean }) {
  const tool = useEditor(s => s.tool), on = tool === t.id
  return <button type="button" className={`ed-tool${on ? ' on' : ''}`} aria-pressed={on} aria-label={`${t.label} (${t.key})`} title={`${t.label} · ${t.key}`}
    onClick={() => getEditor().setTool(t.id)}><DotIcon name={t.icon} tone={on ? 'active' : 'value'} px={phone ? 3 : 2.6} />{!phone && <kbd>{t.key}</kbd>}</button>
}

const LINK_WHAT = { program: 'this program', frame: 'this frame', doc: 'these frames' } as const
/** The probe's view of the last SHARE (test hooks only): what the share sheet, the clipboard or EXPORT · LINK did with it. */
declare global { interface Window { __editorShared?: ShareOutcome } }
/**
 * SHARE (E5): a selected code layer → its program link; selected frames → a frame link (one) or a link of
 * them; nothing selected → the document. On a phone with a share sheet (E6) the link goes to
 * `navigator.share`; else (or when the share is refused) it is copied when the page may; else EXPORT · LINK
 * opens with it to copy by hand. A share the visitor cancels is not an error. A link too big for a URL opens
 * EXPORT with the reason (DOWNLOAD JSON still works).
 */
async function share() {
  const s = getEditor(), toExport = () => { s.setRight('export'); if (s.sheet !== null || isPhone()) s.setSheet('inspector') }
  try {
    const m = await shareSel(), what = m.kind === 'doc' && !s.sel.frame ? 'the whole document' : LINK_WHAT[m.kind]
    s.setLink(m)
    const name = m.kind === 'program' ? 'a dot program' : m.kind === 'frame' ? (frameById(s.h.present, s.sel.frame)?.card.name ?? 'a frame') : s.h.present.name
    const out: ShareOutcome = isPhone() ? await shareLink({ url: m.url, title: `${name} · MATRIX`, text: `Open ${what} in the Matrix editor` }, copyText) : (await copyText(m.url)) ? 'copied' : 'manual'
    if (TEST_HOOKS) window.__editorShared = out
    if (out === 'shared') s.setNote(`Link shared (${m.chars} chars): it opens ${what} in the editor`)
    else if (out === 'copied') s.setNote(`Link copied (${m.chars} chars): it opens ${what} in the editor`)
    else if (out === 'manual') { toExport(); s.setNote('Link ready: copy it from EXPORT · LINK') }
    // cancelled: the visitor closed the share sheet; nothing to say (EXPORT · LINK still has the link)
  } catch (e) {
    toExport()
    s.setNote(`No link: ${(e as Error).message}`)
  }
}

function Zoom({ phone }: { phone: boolean }) {
  const z = useEditor(s => s.cam.z), vp = useEditor(s => s.vp), sel = useEditor(s => s.sel)
  const [open, setOpen] = useState(false)
  const s = getEditor(), at = (k: number) => { s.zoomAt(k, vp.w / 2, vp.h / 2); setOpen(false) }
  return <div className="ed-zoom">
    {!phone && <button type="button" aria-label="Zoom out (−)" onClick={() => s.zoomAt(z / 1.25, vp.w / 2, vp.h / 2)}>−</button>}
    <button type="button" className="ed-zoom-pct" aria-haspopup="menu" aria-expanded={open} aria-label={`Zoom ${Math.round(z * 100)} %`} onClick={() => setOpen(!open)}>{Math.round(z * 100)}%</button>
    {!phone && <button type="button" aria-label="Zoom in (+)" onClick={() => s.zoomAt(z * 1.25, vp.w / 2, vp.h / 2)}>+</button>}
    {open && <div className="ed-menu" role="menu" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <button type="button" role="menuitem" autoFocus onClick={() => { s.fit(); setOpen(false) }}>Zoom to fit <kbd>⇧1</kbd></button>
      <button type="button" role="menuitem" disabled={!sel.frame} onClick={() => { if (sel.frame) s.fit([sel.frame], 8); setOpen(false) }}>Zoom to selection <kbd>⇧2</kbd></button>
      {[.5, 1, 2, 4].map(k => <button key={k} type="button" role="menuitem" onClick={() => at(k)}>{k * 100}%{k === 1 && <kbd>⇧0</kbd>}</button>)}
    </div>}
  </div>
}

function TopBar({ phone, onExit }: { phone: boolean; onExit?: () => void }) {
  const canUndo = useEditor(s => s.h.past.length > 0), canRedo = useEditor(s => s.h.future.length > 0), name = useEditor(s => s.h.present.name)
  const { undo, redo } = getEditor()
  if (phone) return (
    <header className="ed-top" role="toolbar" aria-label="Editor">
      {onExit && <button type="button" className="ed-ibtn" aria-label="Leave the editor" onClick={onExit}><DotIcon name="back" px={3} /></button>}
      <span className="ed-docname">{name}</span>
      <button type="button" className="ed-ibtn" aria-label="Undo" disabled={!canUndo} onClick={undo}><DotIcon name="undo" px={3} tone={canUndo ? 'value' : 'faint'} /></button>
      <button type="button" className="ed-ibtn" aria-label="Redo" disabled={!canRedo} onClick={redo}><DotIcon name="redo" px={3} tone={canRedo ? 'value' : 'faint'} /></button>
      <Zoom phone />
      <button type="button" className="ed-ibtn" aria-label="Share or export" onClick={share}><DotIcon name="share" px={3} /></button>
      <button type="button" className="ed-ibtn" aria-label="Insert from assets" onClick={() => getEditor().setSheet('assets')}><DotIcon name="plus" px={3} /></button>
    </header>
  )
  return (
    <header className="ed-top" role="toolbar" aria-label="Editor">
      <div className="ed-toolgroup" role="group" aria-label="Tools">{TOOLS.map(t => <ToolButton key={t.id} t={t} phone={false} />)}</div>
      <div className="ed-toolgroup" role="group" aria-label="History">
        <button type="button" className="ed-ibtn" aria-label="Undo (Ctrl+Z)" title="Undo · Ctrl+Z" disabled={!canUndo} onClick={undo}><DotIcon name="undo" tone={canUndo ? 'value' : 'faint'} /></button>
        <button type="button" className="ed-ibtn" aria-label="Redo (Ctrl+Shift+Z)" title="Redo · Ctrl+Shift+Z" disabled={!canRedo} onClick={redo}><DotIcon name="redo" tone={canRedo ? 'value' : 'faint'} /></button>
      </div>
      <span className="ed-docname" title="Document name (DESIGN tab with nothing selected)">{name}</span>
      <button type="button" className="ed-textbtn" onClick={() => getEditor().setShortcuts(true)} aria-label="Keyboard shortcuts (?)">?</button>
      <Zoom phone={false} />
      <button type="button" className="ed-textbtn" onClick={share}>SHARE</button>
      <button type="button" className="ed-textbtn ed-primary" onClick={() => getEditor().setRight('export')}>EXPORT</button>
    </header>
  )
}

function PhoneTools() {
  const { setSheet } = getEditor()
  return <nav className="ed-dock" aria-label="Tools">
    <button type="button" className="ed-tool" aria-label="Layers" onClick={() => setSheet('layers')}><DotIcon name="layers" px={3} /></button>
    <span className="ed-dock-sep" aria-hidden="true" />
    {TOOLS.filter(t => t.phone).map(t => <ToolButton key={t.id} t={t} phone />)}
    <span className="ed-dock-sep" aria-hidden="true" />
    <button type="button" className="ed-tool" aria-label="Inspector: design, animate, code, export" onClick={() => setSheet('inspector')}><DotIcon name="inspect" px={3} /></button>
  </nav>
}

/**
 * Phone: the selection bar above the dock. SELECT is a mode, not a long press, so it never fights a pan:
 * while it is on, a tap adds to (or takes from) the selection and a one-finger drag on empty canvas
 * draws a marquee; two fingers still pan and zoom.
 */
function SelBar() {
  const sel = useEditor(s => s.sel), mode = useEditor(s => s.selectMode), doc = useEditor(s => s.h.present), clip = useEditor(s => s.hasClip)
  const n = selCount(sel), f = frameById(doc, sel.frame), grouped = !!sel.layer && selLayers(sel).some(id => groupOf(f, id))
  return <div className="ed-selbar" role="toolbar" aria-label={`Selection: ${n} selected`}>
    <button type="button" className={mode ? 'on' : ''} aria-pressed={mode} aria-label="Select mode: taps add to the selection, a drag on empty canvas draws a marquee" onClick={() => getEditor().setSelectMode(!mode)}>SELECT</button>
    <button type="button" aria-label="Select all" disabled={!doc.frames.length} onClick={selectAllSel}>ALL</button>
    <button type="button" aria-label="Duplicate the selection" disabled={!n} onClick={duplicateSel}>DUP</button>
    {grouped ? <button type="button" aria-label="Ungroup" onClick={ungroupSel}>UNGRP</button> : <button type="button" aria-label="Group the selected layers" disabled={!sel.layer} onClick={groupSel}>GROUP</button>}
    <button type="button" aria-label="Copy the selection" disabled={!n} onClick={copyEverywhere}>COPY</button>
    <button type="button" aria-label="Paste" disabled={!clip} onClick={() => paste()}>PASTE</button>
    <button type="button" className="ed-danger" aria-label="Delete the selection" disabled={!n} onClick={deleteSel}>DEL</button>
  </div>
}

// ── phone bottom sheet (on its side: a side sheet) ─────────────────────────
/**
 * The phone's sheet: LAYERS, ASSETS or the inspector. Upright it is a bottom sheet with detents (36 / 60 /
 * 90 % of what the keyboard leaves visible): drag or tap the handle, drag down to close. It opens at the
 * detent it was last left at for that panel (E6: this session, and across reloads in localStorage). On its
 * side the phone gets a side sheet at the right instead, the full height under the top bar.
 */
function Sheet({ onClose, side, vh: visible }: { onClose: () => void; side: boolean; vh?: number }) {
  const sheet = useEditor(s => s.sheet), right = useEditor(s => s.right)
  const panel = panelOf(sheet ?? 'inspector', right)
  const [detent, setDetentNow] = useState(() => detentFor(panel))
  const setDetent = (i: number) => { setDetentNow(i); rememberDetent(panel, i) }
  // another inspector tab in the same sheet: the detent that tab was last left at, if it was
  const [shown, setShown] = useState(panel)
  if (shown !== panel) { setShown(panel); const r = rememberedDetent(panel); if (r !== undefined) setDetentNow(r) }
  const [drag, setDrag] = useState<number | null>(null)
  const start = useRef<{ y: number; h: number } | null>(null), ref = useRef<HTMLElement>(null)
  const vh = visible ?? (typeof window === 'undefined' ? 800 : (window.visualViewport?.height ?? window.innerHeight))
  const h = drag ?? DETENTS[detent] * vh
  const selFrame = useEditor(s => s.sel.frame)
  // the selection stays in view beside the sheet (after the height transition)
  useEffect(() => {
    if (drag !== null) return
    const t = setTimeout(() => { if (side) revealAbove(0, ref.current?.offsetWidth ?? 0); else revealAbove(DETENTS[detent] * vh) }, 240)
    return () => clearTimeout(t)
  }, [detent, drag, selFrame, vh, side])
  const onDown = (e: PointerEvent<HTMLDivElement>) => { e.currentTarget.setPointerCapture(e.pointerId); start.current = { y: e.clientY, h } }
  const onMove = (e: PointerEvent<HTMLDivElement>) => { if (start.current) setDrag(Math.max(80, Math.min(vh * .95, start.current.h - (e.clientY - start.current.y)))) }
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const st = start.current
    start.current = null
    if (!st) return
    const moved = Math.abs(e.clientY - st.y) > 6, now = drag ?? st.h
    setDrag(null)
    if (!moved) { setDetent((detent + 1) % DETENTS.length); return } // a tap on the handle steps the detent
    if (now < DETENTS[0] * vh * .7) { onClose(); return }
    let best = 0
    DETENTS.forEach((d, i) => { if (Math.abs(d * vh - now) < Math.abs(DETENTS[best] * vh - now)) best = i })
    setDetent(best)
  }
  const title = sheet === 'layers' ? 'LAYERS' : sheet === 'assets' ? 'ASSETS' : null
  let body: ReactNode = null
  if (sheet === 'layers') body = <LayersPanel />
  else if (sheet === 'assets') body = <AssetsPanel onInserted={onClose} />
  else body = <InspectorBody />
  return (
    <section ref={ref} className={`ed-sheet${side ? ' ed-sheet--side' : ''}${drag !== null ? ' dragging' : ''}`} aria-label={title ?? 'Inspector'} data-detent={side ? undefined : detent} style={side ? undefined : { height: h }}>
      {!side && <div className="ed-sheet-grab" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        role="slider" aria-label="Sheet height: drag, or tap to step" aria-valuemin={0} aria-valuemax={2} aria-valuenow={detent} tabIndex={0}
        onKeyDown={e => { if (e.key === 'ArrowUp') setDetent(Math.min(2, detent + 1)); else if (e.key === 'ArrowDown') { if (detent === 0) onClose(); else setDetent(detent - 1) } }}><i /></div>}
      <div className="ed-sheet-head">
        {title ? <b>{title}</b> : <InspectorTabs className="ed-tabs--sheet" />}
        <button type="button" className="ed-ibtn" aria-label="Close" onClick={onClose}>×</button>
      </div>
      <div className="ed-sheet-body">{body}</div>
    </section>
  )
}

// ── keyboard ───────────────────────────────────────────────────────────────
export const EDITOR_KEYS: [string, string][] = [
  ['V', 'move / select'], ['H · hold Space', 'hand (pan)'], ['F', 'frame: drag out a new card'], ['B', 'draw dots'], ['E', 'eraser'], ['[ ]', 'brush size'],
  ['T', 'text: click a frame, then type on the canvas'], ['Enter · double-click a text layer', 'type into it on the canvas (Enter finishes, Esc cancels)'], ['I · Alt-click (draw)', 'eyedropper: take the ink of a painted dot'], ['C', 'code: add a Field IR layer'], ['Esc', 'back to move · select the parent · deselect'], ['Enter / ⇧Enter', 'into the frame\'s layers / up to the group or the frame'],
  ['⇧-click · drag on empty canvas', 'add to the selection · marquee (⇧ adds)'], ['Ctrl-drag on a frame', 'marquee its layers'], ['Ctrl+A', 'select all (frames, or the frame\'s layers)'],
  ['Ctrl+Z · Ctrl+⇧Z / Ctrl+Y', 'undo · redo'], ['Delete', 'delete the selection'], ['Ctrl+D · Alt-drag', 'duplicate'],
  ['Ctrl+C · Ctrl+X · Ctrl+V', 'copy · cut · paste (any tab of this browser; the system clipboard as JSON)'], ['Ctrl+G · Ctrl+⇧G', 'group layers · ungroup'], ['Ctrl+⇧L', 'lock / unlock'],
  ['Alt+A D · W S · H V', 'align left right · top bottom · centres'], ['Alt+⇧H · Alt+⇧V', 'distribute horizontally · vertically'], ['Ctrl+] / Ctrl+[', 'bring forward / send backward'],
  ['Ctrl+⇧H', 'hide / show'], ['arrows (⇧ ×10)', 'nudge frames (px) or text / sites / placed spec layers (cells)'], ['handles on a selected layer', 'ring radius and sweep, line ends, a spec field\'s bounds (whole cells)'], ['quick bar over a layer', 'tone, lattice or dot size, EDIT, ink and PICK: one undo step each'], ['drag (hold Ctrl: no snapping)', 'frames snap to the edges, centres and spacing of the others'],
  ['Ctrl+S', 'save the frame to this browser (ASSETS · SAVED)'], ['⇧1 · ⇧2 · ⇧0', 'zoom to fit · to selection · 100 %'], ['Ctrl + / Ctrl − · wheel', 'zoom · pan (Ctrl+wheel or pinch zooms)'], ['?', 'this list'],
]
const ALIGN_KEYS: Record<string, Align> = { KeyA: 'left', KeyD: 'right', KeyW: 'top', KeyS: 'bottom', KeyH: 'hcenter', KeyV: 'vcenter' }
/** Text is selected on the page (a copy then copies the text, not the editor's selection). */
const textSelected = () => !!globalThis.getSelection?.()?.toString()
function useShortcuts(phone: boolean) {
  useEffect(() => {
    // the system clipboard: copy / cut / paste events carry the clip as JSON text (no permission needed);
    // keys that raise no event (synthetic ones) fall back to navigator.clipboard and this browser's last copy
    let raised = false
    const onClip = (e: ClipboardEvent) => {
      if (editable(e.target) || textSelected() || document.querySelector('.pal-backdrop, .pal-shell')) return
      raised = true
      if (e.type === 'paste') { e.preventDefault(); paste(e.clipboardData?.getData('text/plain')); return }
      const json = e.type === 'cut' ? cutSel() : copySel()
      if (json) { e.clipboardData?.setData('text/plain', json); e.preventDefault() }
    }
    const later = (fn: () => void) => { raised = false; setTimeout(() => { if (!raised) fn() }, 0) }
    const toSystem = (json?: string) => { if (json) void navigator.clipboard?.writeText(json).catch(() => { /* not allowed: this browser's copy still pastes */ }) }
    const onKey = (e: KeyboardEvent) => {
      if (editable(e.target) || (e.target instanceof Element && e.target.closest('.ed-confirm')) || document.querySelector('.pal-backdrop, .pal-shell')) return
      const s = getEditor(), d = s.h.present, mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
      const f = frameById(d, s.sel.frame), l = layerOf(d, s.sel)
      const used = () => { e.preventDefault(); e.stopImmediatePropagation() }
      if (mod) {
        // copy / cut / paste: the browser's own event goes first (the system clipboard); only the board's keys are stopped
        if ((k === 'c' || k === 'x') && !e.shiftKey && !e.altKey) { if (textSelected()) return; e.stopImmediatePropagation(); later(() => toSystem(k === 'x' ? cutSel() : copySel())); return }
        if (k === 'v' && !e.shiftKey && !e.altKey) { e.stopImmediatePropagation(); later(() => paste()); return }
        if (k === 'z' && !e.shiftKey) { used(); s.undo() }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { used(); s.redo() }
        else if (k === 'a') { used(); selectAllSel() }
        else if (k === 'g') { used(); if (e.shiftKey) ungroupSel(); else groupSel() }
        else if (k === 'l' && e.shiftKey) { used(); lockSel() }
        else if (k === 'd') { used(); duplicateSel() }
        else if (k === 's') { used(); if (f) { try { librarySave(f.card); s.setNote(`saved "${f.card.name}" to this browser (ASSETS · SAVED)`) } catch (err) { s.setNote((err as Error).message) } } else s.setNote('select a frame to save it') }
        else if (k === '=' || k === '+') { used(); s.zoomAt(s.cam.z * 1.25, s.vp.w / 2, s.vp.h / 2) }
        else if (k === '-') { used(); s.zoomAt(s.cam.z / 1.25, s.vp.w / 2, s.vp.h / 2) }
        else if (k === '0') { used(); s.zoomAt(1, s.vp.w / 2, s.vp.h / 2) }
        else if ((k === ']' || k === '[') && f) { used(); orderSel(k === ']' ? 'forward' : 'backward') }
        else if (k === 'h' && e.shiftKey && f) { used(); hideSel() }
        return
      }
      if (e.altKey) {
        const how = e.shiftKey ? (e.code === 'KeyH' ? 'dist-x' : e.code === 'KeyV' ? 'dist-y' : undefined) : ALIGN_KEYS[e.code]
        if (how && f) { used(); arrangeSel(how) }
        return
      }
      if (e.shiftKey && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit0')) {
        used()
        if (e.code === 'Digit1') s.fit(); else if (e.code === 'Digit2') { if (f) s.fit(l ? [f.id] : selFrames(s.sel), 8) } else s.zoomAt(1, s.vp.w / 2, s.vp.h / 2)
        return
      }
      if (e.key === '?') { used(); s.setShortcuts(!s.shortcuts); return }
      if (e.key === 'Escape') {
        if (s.menu) { used(); s.setMenu(undefined); return }
        if (s.shortcuts) { used(); s.setShortcuts(false); return }
        if (s.picking) { used(); s.setPicking(false); return }
        if (s.tool !== 'move') { used(); s.setTool('move'); return }
        if (s.selectMode) { used(); s.setSelectMode(false); return }
        if (l && f) { used(); selectParent(); return }
        if (f) { used(); s.select({}); return }
        if (phone && s.sheet) { used(); s.setSheet(null) }
        return
      }
      if (e.key === 'Enter' && f) {
        used()
        if (e.shiftKey) { if (!selectParent()) s.select({ frame: f.id }) }
        else if (!l) { const first = topDown(f.card)[0]; if (first) s.select({ frame: f.id, layer: first.id }) }
        else if (selCount(s.sel) === 1 && editableText(l) && !f.locked) startTyping(f.id, l.id) // type into the text on the canvas
        else if (selCount(s.sel) > 1) s.select({ frame: f.id, layer: l.id }) // into a group: its first layer
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && f) { used(); deleteSel(); return }
      if (e.key.startsWith('Arrow') && f) {
        used()
        const n = e.shiftKey ? 10 : 1, dx = e.key === 'ArrowLeft' ? -n : e.key === 'ArrowRight' ? n : 0, dy = e.key === 'ArrowUp' ? -n : e.key === 'ArrowDown' ? n : 0
        nudgeSel(dx, dy)
        return
      }
      if (e.repeat) return
      if (KEY_TOOL[k] && !e.shiftKey) { used(); s.setTool(KEY_TOOL[k]); if (k === 'b' || k === 'p') s.setBrush({ erase: false }); return }
      if (k === 'i' && !e.shiftKey) { used(); s.setPicking(true); s.setNote('PICK: click a painted dot to take its ink'); return }
      if (k === 'e' && !e.shiftKey) { used(); s.setTool('draw'); s.setBrush({ erase: !(s.tool === 'draw' && s.brush.erase) }); return }
      if (e.key === '[' || e.key === ']') { used(); s.setBrush({ size: Math.max(1, Math.min(8, s.brush.size + (e.key === ']' ? 1 : -1))) }); return }
      if (e.key === '+' || e.key === '=') { used(); s.zoomAt(s.cam.z * 1.25, s.vp.w / 2, s.vp.h / 2); return }
      if (e.key === '-') { used(); s.zoomAt(s.cam.z / 1.25, s.vp.w / 2, s.vp.h / 2) }
    }
    // capture: the editor's letters (T text, …) must not also reach the board's global keys (hold T = time machine)
    // a copy in another tab of this browser offers PASTE here too
    const onStorage = (e: StorageEvent) => { if (e.key === CLIP_KEY) getEditor().setHasClip(!!e.newValue) }
    window.addEventListener('storage', onStorage)
    window.addEventListener('keydown', onKey, true)
    for (const t of ['copy', 'cut', 'paste'] as const) document.addEventListener(t, onClip)
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('keydown', onKey, true); for (const t of ['copy', 'cut', 'paste'] as const) document.removeEventListener(t, onClip) }
  }, [phone])
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  return <Modal className="ed-modal" aria-labelledby="ed-keys-title" onClose={onClose}>
    <div className="ed-modal-card">
      <h2><span id="ed-keys-title">SHORTCUTS</span> <button type="button" className="ed-ibtn" aria-label="Close" data-autofocus onClick={onClose}>×</button></h2>
      <dl className="ed-keys">{EDITOR_KEYS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <h3>TOUCH</h3>
      <dl className="ed-keys"><div><dt>one finger</dt><dd>use the tool · drag empty canvas to pan · tap to select</dd></div><div><dt>two fingers</dt><dd>pinch to zoom · drag to pan</dd></div><div><dt>tap a selected text layer</dt><dd>type into it on the canvas · DONE or return finishes</dd></div><div><dt>quick bar · handles</dt><dd>over the selected layer: tone, lattice, size, EDIT, INK, PICK · drag a handle for the radius, sweep, ends or bounds</dd></div><div><dt>SELECT (bar above the tools)</dt><dd>taps add to the selection · one finger on empty canvas draws a marquee · DUP, GROUP, COPY, PASTE, DEL act on it</dd></div><div><dt>long press a frame or layer</dt><dd>its menu: duplicate, forward, backward, to front, to back, delete (a layer brings its quick bar)</dd></div><div><dt>sheet handle</dt><dd>drag or tap to resize, drag down to close; each panel opens where you left it</dd></div></dl>
    </div>
  </Modal>
}
