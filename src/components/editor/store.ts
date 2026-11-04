/**
 * MAKE editor state: the document history (undo / redo), the selection, the active tool, the camera
 * (pan / zoom) and which panels are open. The canvas render loop reads it with `useEditor.getState()`,
 * so panning or playing never re-renders the panels faster than they need.
 *
 * Gestures (drag a frame, move a layer, resize, a paint stroke) use `begin` / `live` / `end`: live edits
 * replace the present without a history entry, and `end` commits the whole gesture as one undo step.
 */
import { create } from 'zustand'
import { IR_FRAME_MS } from '../../engine/ir'
import { userPrograms } from '../dwitter/program'
import { commit, guardKey, historyOf, loadLocal, newId, redo, undo, validateCard, type History, type StudioCard, type StudioLayer } from '../studio/doc'
import type { SharedProgram } from '../../lib/share'
import { addFrame, addLayer, boundsOf, EDITOR_KEY, frameById, frameSize, loadSaved, presetCard, programCard, programSource, saveDoc, seedDoc, topDown, type EditorDoc, type EditorFrame, type Sel } from './doc'
import { clampZ, fitCam, zoomCam, type Camera } from './input'
import { linkedFrames, openLinkIn, recordLink, type LinkPayload } from './link'
import { framesSel, validSel } from './select'

export type Tool = 'move' | 'hand' | 'frame' | 'draw' | 'text' | 'code'
export type LeftTab = 'layers' | 'assets'
export type RightTab = 'design' | 'animate' | 'code' | 'export'
/** Phone only: which bottom sheet is open. */
export type Sheet = 'layers' | 'assets' | 'inspector' | null
export { ZOOM_MAX, ZOOM_MIN, type Camera } from './input'
export interface Brush { size: number; value: number; erase: boolean }
/**
 * An import waiting for the visitor to keep it (#143): a `?make&d=` link or a `?p=` program, already decoded and
 * checked. `summary` says what it holds; `confirm` opens it (and returns what `openLink` / `insertProgram` do).
 * `already`: the document has it (a reload, Back), so `confirm` only re-selects and there is nothing to ask.
 */
export interface PendingImport<T> { kind: 'frame' | 'doc' | 'program'; name: string; frames: number; parent?: string; already: boolean; summary: string; confirm(): T }

export interface EditorStore {
  h: History<EditorDoc>
  sel: Sel
  tool: Tool
  cam: Camera
  /** Viewport size in CSS px (set by the canvas), for fit / zoom-to-selection. */
  vp: { w: number; h: number }
  left: LeftTab
  right: RightTab
  sheet: Sheet
  brush: Brush
  /** Timeline preview of the selected frame (ANIMATE tab): t seconds, playing. */
  play: { t: number; playing: boolean }
  /** Which state each frame previews (by frame id; default = its first state). */
  preview: Record<string, string>
  note: string
  shortcuts: boolean
  /** Touch: SELECT mode (the phone's selection bar). A tap adds to / takes from the selection, a drag on empty canvas draws a marquee. */
  selectMode: boolean
  /** Something was copied (this tab, another tab, an earlier visit): PASTE is offered. */
  hasClip: boolean
  /** Draw tool: the next press picks the ink from the paint under it (the eyedropper, I / Alt-click). */
  picking: boolean
  /** The text layer being typed on the canvas (E3), if any. */
  typing?: { frame: string; layer: string }
  /** The last link SHARE or EXPORT · LINK made (E5): shown in EXPORT · LINK to copy by hand when the clipboard is closed. */
  link?: { url: string; kind: 'program' | 'frame' | 'doc'; id: string; parent?: string; chars: number; deflated: boolean }
  /**
   * Phone (E6): the long-press menu, at `x`, `y` (viewport px, where the finger was). `armed` once that finger
   * lifted, so the tap that ends the long press never lands on an item. A new selection, undo / redo, another
   * tool or a sheet close it.
   */
  menu?: { x: number; y: number; armed: boolean }
  edit(fn: (d: EditorDoc) => EditorDoc, tag?: string): void
  begin(): void
  live(fn: (d: EditorDoc) => EditorDoc): void
  end(): void
  /** Abandon the gesture in flight (a second finger landed mid-stroke). */
  cancel(): void
  undo(): void
  redo(): void
  select(s: Sel): void
  setTool(t: Tool): void
  setCam(c: Camera): void
  zoomAt(z: number, sx: number, sy: number): void
  fit(ids?: string[], max?: number): void
  setVp(w: number, h: number): void
  setLeft(t: LeftTab): void
  setRight(t: RightTab): void
  setSheet(s: Sheet): void
  setBrush(b: Partial<Brush>): void
  setPlay(p: Partial<EditorStore['play']>): void
  setPreview(frame: string, state: string): void
  setNote(n: string): void
  setShortcuts(on: boolean): void
  setSelectMode(on: boolean): void
  setHasClip(on: boolean): void
  setPicking(on: boolean): void
  setTyping(t?: { frame: string; layer: string }): void
  setLink(l?: EditorStore['link']): void
  setMenu(m?: EditorStore['menu']): void
  /** Insert a card as a new frame, select it and bring it into view. Returns the frame id. */
  insertCard(card: StudioCard, o?: Partial<EditorFrame> & { at?: { x: number; y: number } }): string
  insertPreset(id: string): string | undefined
  /** A shared / example program: re-selects the frame it already made (a `?make=code&p=` reload), else adds one. */
  insertProgram(p: SharedProgram): string
  addLayerTo(frame: string, l: StudioLayer): void
  /**
   * A frame / document link (E5): its frames come in as one block (one undo step), selected and brought
   * into view; a link this document already opened re-selects its frames. Returns their ids, or why not.
   */
  openLink(p: LinkPayload): string[] | string
  /** `openLink`, held until the visitor confirms. */
  stageLink(p: LinkPayload): PendingImport<string[] | string>
  /** `insertProgram`, held until the visitor confirms. */
  stageProgram(p: SharedProgram): PendingImport<string>
}

let gestureBase: EditorDoc | undefined
/**
 * Frames holding a program from a link, an example or the gallery, by frame id → the program's guard key. They stay
 * out of the autosave until the program has drawn one frame within the user-program budget, so a link to a program
 * too slow for this device is never saved and a reload does not bring it back. Editing the program releases the hold.
 */
const held = new Map<string, string>()
const keysOf = (f: EditorFrame) => f.card.layers.flatMap(l => (l.kind === 'ir' ? [guardKey(f.card.grid, l.lattice, l.src || '1')] : []))
/**
 * Frames that came in from a link, a shared program or a card file and have not drawn yet (#143). They were checked like any
 * document, and they stay out of the autosave until the canvas draws each once (`drew`), so a frame that breaks
 * the editor is never saved and a reload starts without it.
 */
const unseen = new Set<string>()
/** Keep these frames out of the autosave until each has drawn once. */
export function holdUntilDrawn(ids: string[]) { for (const id of ids) unseen.add(id) }
/** The canvas drew this frame without an error: it may be saved now. */
export function drew(id: string) { if (unseen.delete(id)) scheduleSave() }
/** The document as the autosave writes it: without the held frames whose program has not drawn in budget yet, nor frames not drawn once. */
export function saveable(d: EditorDoc): EditorDoc {
  for (const [id, key] of held) {
    const f = frameById(d, id)
    if (!f || userPrograms.state(key) === 'ok' || !keysOf(f).includes(key)) held.delete(id)
  }
  for (const id of unseen) if (!frameById(d, id)) unseen.delete(id)
  return held.size || unseen.size ? { ...d, frames: d.frames.filter(f => !held.has(f.id) && !unseen.has(f.id)) } : d
}
/** The saved document, or a fresh one and why the saved one could not be opened. */
const boot = (() => {
  const { doc, error } = loadSaved()
  if (doc) return { doc }
  const studio = loadLocal()
  return { doc: seedDoc(studio && studio.layers.length ? studio : undefined), error }
})()
const first = boot.doc
type ResetKV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const localKV = (): ResetKV | undefined => { try { return globalThis.localStorage } catch { return undefined } }
/** No autosave after `resetEditorDoc` (the page is about to reload). */
let resetting = false
/**
 * The recovery screen's action (#143): replace the saved document with the first one a visitor sees (the seed,
 * without the last Studio card, which may be what broke) and drop the pending save. The caller reloads the page.
 */
export function resetEditorDoc(kv: ResetKV | undefined = localKV()): boolean {
  resetting = true
  clearTimeout(saveTimer)
  if (saveDoc(seedDoc(), kv)) return true
  try { kv?.removeItem(EDITOR_KEY); return !!kv } catch { return false }
}

export const useEditor = create<EditorStore>((set, get) => ({
  h: historyOf(first),
  sel: {},
  tool: 'move',
  cam: { x: 40, y: 40, z: 1 },
  vp: { w: 1200, h: 800 },
  left: 'layers', right: 'design', sheet: null,
  brush: { size: 2, value: 1, erase: false },
  play: { t: 1, playing: false },
  preview: {},
  note: boot.error ? `The saved document could not be opened, so this is a new one (${boot.error.slice(0, 160)})` : '', shortcuts: false, selectMode: false, picking: false, hasClip: (() => { try { return !!globalThis.localStorage?.getItem('dot480.editor.clip') } catch { return false } })(),
  edit: (fn, tag) => set(s => ({ h: commit(s.h, fn(s.h.present), tag) })),
  begin: () => { gestureBase = get().h.present },
  live: fn => set(s => ({ h: { ...s.h, present: fn(s.h.present) } })),
  end: () => {
    const base = gestureBase
    gestureBase = undefined
    if (!base) return
    set(s => (s.h.present === base ? {} : { h: { past: [...s.h.past, base].slice(-100), present: s.h.present, future: [], at: 0 } }))
  },
  cancel: () => { const base = gestureBase; gestureBase = undefined; if (base) set(s => ({ h: { ...s.h, present: base } })) },
  undo: () => set(s => { const h = undo(s.h); return { h, sel: validSel(h.present, s.sel), menu: undefined } }),
  redo: () => set(s => { const h = redo(s.h); return { h, sel: validSel(h.present, s.sel), menu: undefined } }),
  select: sel => set({ sel: sel.more?.length ? sel : sel.more ? { frame: sel.frame, layer: sel.layer } : sel, menu: undefined }),
  setTool: tool => set({ tool, picking: false, menu: undefined }),
  setCam: cam => set({ cam: { ...cam, z: clampZ(cam.z) } }),
  zoomAt: (z, sx, sy) => set({ cam: zoomCam(get().cam, z, sx, sy) }),
  fit: (ids = [], max = 2) => { const { w, h } = get().vp; set({ cam: fitCam(boundsOf(get().h.present, ids), w, h, max) }) },
  setVp: (w, h) => set({ vp: { w, h } }),
  setLeft: left => set({ left }),
  setRight: right => set({ right }),
  setSheet: sheet => set({ sheet, menu: undefined }),
  setBrush: b => set(s => ({ brush: { ...s.brush, ...b } })),
  setPlay: p => set(s => ({ play: { ...s.play, ...p } })),
  setPreview: (frame, state) => set(s => ({ preview: { ...s.preview, [frame]: state } })),
  setNote: note => set({ note }),
  setShortcuts: shortcuts => set({ shortcuts }),
  setSelectMode: selectMode => set({ selectMode }),
  setHasClip: hasClip => set({ hasClip }),
  setPicking: picking => set(picking ? { picking, tool: 'draw' } : { picking }),
  setTyping: typing => set({ typing }),
  setLink: link => set({ link }),
  setMenu: menu => set({ menu }),
  insertCard: (card, o) => {
    if (o?.source === 'file') validateCard(JSON.parse(JSON.stringify(card))) // a card from a file meets the document checks (throws with the reason)
    const { doc, frame } = addFrame(get().h.present, card, o)
    if (o?.source === 'file') holdUntilDrawn([frame.id]) // a card from a file waits to draw once, like a link
    set(s => ({ h: commit(s.h, doc), sel: { frame: frame.id } }))
    reveal(frame.id)
    return frame.id
  },
  insertPreset: id => {
    try { return get().insertCard(presetCard(id), { source: `preset:${id}` }) } catch (e) { get().setNote((e as Error).message); return undefined }
  },
  insertProgram: p => get().stageProgram(p).confirm(),
  stageProgram: p => {
    const src = programSource(p), already = get().h.present.frames.some(f => f.source === src), name = programCard(p).name
    return {
      kind: 'program', name, frames: 1, ...(p.parent && { parent: p.parent }), already,
      summary: already ? `program "${name}" is open already` : `Open program "${name}" from a link as a new frame${p.parent ? `, a remix of #${p.parent}` : ''}`,
      confirm: () => {
        const had = get().h.present.frames.find(f => f.source === src)
        if (had) { const l = topDown(had.card).find(x => x.kind === 'ir'); set({ sel: { frame: had.id, layer: l?.id } }); reveal(had.id); return had.id }
        const id = get().insertCard(programCard(p), { source: src })
        const f = frameById(get().h.present, id)!, l = topDown(f.card)[0], key = keysOf(f)[0]
        if (key && userPrograms.state(key) !== 'ok') held.set(id, key)
        holdUntilDrawn([id])
        set({ sel: { frame: id, layer: l?.id } })
        return id
      },
    }
  },
  addLayerTo: (frame, l) => { get().edit(d => addLayer(d, frame, l)); set({ sel: { frame, layer: l.id } }) },
  openLink: p => get().stageLink(p).confirm(),
  stageLink: p => {
    const already = linkedFrames(get().h.present, p.id).length > 0, n = p.frames.length
    const what = p.kind === 'frame' ? `frame "${p.name}"` : `${n} frame${n === 1 ? '' : 's'} of "${p.name}"`
    return {
      kind: p.kind, name: p.name, frames: n, ...(p.parent && { parent: p.parent }), already,
      summary: already ? `${what} from this link is open already` : `Open ${what} from a link${p.parent ? `, a remix of #${p.parent}` : ''}`,
      confirm: () => {
        const r = openLinkIn(get().h.present, p, () => newId('f'))
        if (typeof r === 'string') return r
        if (r.opened) holdUntilDrawn(r.ids)
        set(s => ({ ...(r.opened && { h: commit(s.h, r.doc) }), sel: framesSel(r.ids) }))
        recordLink(p)
        if (r.ids.length === 1) reveal(r.ids[0]); else get().fit(r.ids)
        return r.ids
      },
    }
  },
}))

/** Bring a frame into view if it is (mostly) off screen; zooms out if it does not fit. */
export function reveal(id: string) {
  const { h, cam, vp, fit } = useEditor.getState(), f = frameById(h.present, id)
  if (!f) return
  const { w, h: fh } = frameSize(f), x0 = f.x * cam.z + cam.x, y0 = f.y * cam.z + cam.y, x1 = x0 + w * cam.z, y1 = y0 + fh * cam.z
  const inView = x0 >= 0 && y0 >= 0 && x1 <= vp.w && y1 <= vp.h
  if (!inView) fit([id], Math.min(2, Math.max(cam.z, .25)))
}

/**
 * Phone: keep the selected frame in the strip of canvas a bottom sheet leaves (`cover` px at the bottom
 * of the viewport; a side sheet, E6: `right` px at its right): pan it, and zoom out only when it cannot fit.
 */
export function revealAbove(cover: number, right = 0) {
  const { h, cam, vp: full, sel, setCam } = useEditor.getState(), f = frameById(h.present, sel.frame)
  if (!f) return
  const vp = { w: full.w - right, h: full.h }
  const room = vp.h - cover, pad = 12, { w, h: fh } = frameSize(f)
  if (room < 80 || vp.w < 80) return
  let z = cam.z
  if (fh * z > room - pad * 2 || w * z > vp.w - pad * 2) z = Math.max(.1, Math.min((room - pad * 2) / fh, (vp.w - pad * 2) / w))
  const x0 = f.x * z + (z === cam.z ? cam.x : 0), y0 = f.y * z + (z === cam.z ? cam.y : 0)
  let x = z === cam.z ? cam.x : (vp.w - w * z) / 2 - f.x * z, y = z === cam.z ? cam.y : pad - f.y * z
  if (z === cam.z) {
    if (y0 + fh * z > room - pad) y -= y0 + fh * z - (room - pad)
    if (y0 < pad) y += pad - y0
    if (x0 < pad || x0 + w * z > vp.w - pad) x = (vp.w - w * z) / 2 - f.x * z
  }
  if (x !== cam.x || y !== cam.y || z !== cam.z) setCam({ x, y, z })
}

// autosave (debounced)
let saveTimer: ReturnType<typeof setTimeout> | undefined
const scheduleSave = () => {
  clearTimeout(saveTimer)
  if (resetting) return
  saveTimer = setTimeout(() => { if (!resetting && !saveDoc(saveable(useEditor.getState().h.present))) useEditor.getState().setNote('browser storage is full: download the document as JSON') }, 500)
}
useEditor.subscribe((s, prev) => { if (s.h.present !== prev.h.present) scheduleSave() })
// a held program that drew in budget can be saved now; a paused one says why it stopped
userPrograms.watch((key, state) => {
  if (state === 'ok' && [...held.values()].includes(key)) scheduleSave()
  if (state === 'paused') useEditor.getState().setNote(`A program is paused: one frame took longer than ${IR_FRAME_MS} ms to draw on this device. Edit its code or pick a larger lattice to try again.`)
})
