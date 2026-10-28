/**
 * MAKE editor state: the document history (undo / redo), the selection, the active tool, the camera
 * (pan / zoom) and which panels are open. The canvas render loop reads it with `useEditor.getState()`,
 * so panning or playing never re-renders the panels faster than they need.
 *
 * Gestures (drag a frame, move a layer, resize, a paint stroke) use `begin` / `live` / `end`: live edits
 * replace the present without a history entry, and `end` commits the whole gesture as one undo step.
 */
import { create } from 'zustand'
import { commit, historyOf, loadLocal, redo, undo, type History, type StudioCard, type StudioLayer } from '../studio/doc'
import type { SharedProgram } from '../../lib/share'
import { addFrame, addLayer, boundsOf, frameById, frameSize, loadDoc, presetCard, programCard, programSource, saveDoc, seedDoc, topDown, type EditorDoc, type EditorFrame, type Sel } from './doc'
import { clampZ, fitCam, zoomCam, type Camera } from './input'
import { validSel } from './select'

export type Tool = 'move' | 'hand' | 'frame' | 'draw' | 'text' | 'code'
export type LeftTab = 'layers' | 'assets'
export type RightTab = 'design' | 'animate' | 'code' | 'export'
/** Phone only: which bottom sheet is open. */
export type Sheet = 'layers' | 'assets' | 'inspector' | null
export { ZOOM_MAX, ZOOM_MIN, type Camera } from './input'
export interface Brush { size: number; value: number; erase: boolean }

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
  /** Insert a card as a new frame, select it and bring it into view. Returns the frame id. */
  insertCard(card: StudioCard, o?: Partial<EditorFrame> & { at?: { x: number; y: number } }): string
  insertPreset(id: string): string | undefined
  /** A shared / example program: re-selects the frame it already made (a `?make=code&p=` reload), else adds one. */
  insertProgram(p: SharedProgram): string
  addLayerTo(frame: string, l: StudioLayer): void
}

let gestureBase: EditorDoc | undefined
const first = (() => { const d = loadDoc(); if (d) return d; const studio = loadLocal(); return seedDoc(studio && studio.layers.length ? studio : undefined) })()

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
  note: '', shortcuts: false, selectMode: false,
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
  undo: () => set(s => { const h = undo(s.h); return { h, sel: validSel(h.present, s.sel) } }),
  redo: () => set(s => { const h = redo(s.h); return { h, sel: validSel(h.present, s.sel) } }),
  select: sel => set({ sel: sel.more?.length ? sel : sel.more ? { frame: sel.frame, layer: sel.layer } : sel }),
  setTool: tool => set({ tool }),
  setCam: cam => set({ cam: { ...cam, z: clampZ(cam.z) } }),
  zoomAt: (z, sx, sy) => set({ cam: zoomCam(get().cam, z, sx, sy) }),
  fit: (ids = [], max = 2) => { const { w, h } = get().vp; set({ cam: fitCam(boundsOf(get().h.present, ids), w, h, max) }) },
  setVp: (w, h) => set({ vp: { w, h } }),
  setLeft: left => set({ left }),
  setRight: right => set({ right }),
  setSheet: sheet => set({ sheet }),
  setBrush: b => set(s => ({ brush: { ...s.brush, ...b } })),
  setPlay: p => set(s => ({ play: { ...s.play, ...p } })),
  setPreview: (frame, state) => set(s => ({ preview: { ...s.preview, [frame]: state } })),
  setNote: note => set({ note }),
  setShortcuts: shortcuts => set({ shortcuts }),
  setSelectMode: selectMode => set({ selectMode }),
  insertCard: (card, o) => {
    const { doc, frame } = addFrame(get().h.present, card, o)
    set(s => ({ h: commit(s.h, doc), sel: { frame: frame.id } }))
    reveal(frame.id)
    return frame.id
  },
  insertPreset: id => {
    try { return get().insertCard(presetCard(id), { source: `preset:${id}` }) } catch (e) { get().setNote((e as Error).message); return undefined }
  },
  insertProgram: p => {
    const src = programSource(p), had = get().h.present.frames.find(f => f.source === src)
    if (had) { const l = topDown(had.card).find(x => x.kind === 'ir'); set({ sel: { frame: had.id, layer: l?.id } }); reveal(had.id); return had.id }
    const id = get().insertCard(programCard(p), { source: src })
    const l = topDown(frameById(get().h.present, id)!.card)[0]
    set({ sel: { frame: id, layer: l?.id } })
    return id
  },
  addLayerTo: (frame, l) => { get().edit(d => addLayer(d, frame, l)); set({ sel: { frame, layer: l.id } }) },
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
 * of the viewport): pan it up, and zoom out only when it cannot fit.
 */
export function revealAbove(cover: number) {
  const { h, cam, vp, sel, setCam } = useEditor.getState(), f = frameById(h.present, sel.frame)
  if (!f) return
  const room = vp.h - cover, pad = 12, { w, h: fh } = frameSize(f)
  if (room < 80) return
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
useEditor.subscribe((s, prev) => {
  if (s.h.present === prev.h.present) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => { if (!saveDoc(useEditor.getState().h.present)) useEditor.getState().setNote('browser storage is full: download the document as JSON') }, 500)
})
