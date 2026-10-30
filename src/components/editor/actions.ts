/**
 * Editor commands on the selection (E2), shared by the keyboard, the inspector and the phone's selection
 * bar: duplicate, delete, copy / cut / paste, group / ungroup, lock, select all, align / distribute,
 * nudge, order, hide. Each is one `edit`, so one undo step. React-free (the Node suite runs them).
 * E5: the links SHARE and EXPORT · LINK make (a program, the selected frames, the document).
 */
import { copyLayers, duplicateFrames, editFrame, editLayer, frameById, groupLayers, groupOf, layerOf, lockFrames, lockLayers, movable, nudgeLayer, removeFrames, removeLayers, shareable, shiftLayers, ungroup, type EditorDoc } from './doc'
import { asClip, CLIP_KEY, clipFromJSON, clipOf, clipToJSON, pasteClip, type Clip } from './clip'
import { arrangeFrames, arrangeLayers, framesSel, layersSel, selCount, selectAll, selFrames, selGroup, selLayers, type Align } from './select'
import { useEditor } from './store'
import { encodeShare, programHash, shareUrl, type SharedProgram } from '../../lib/share'
import { loadGallery, recordProgram } from '../dwitter/gallery'
import { encodeLink, linkPayload, linkUrl, loadLinks, recordLink, type LinkKind } from './link'

const st = () => useEditor.getState()
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
const what = () => { const s = st().sel; return s.layer ? plural(selLayers(s).length, 'layer') : plural(selFrames(s).length, 'frame') }

export function duplicateSel() {
  const s = st(), d = s.h.present, sel = s.sel
  if (sel.layer && sel.frame) { const r = copyLayers(d, sel.frame, selLayers(sel), 0, 0); if (!r.ids.length) return; s.edit(() => r.doc); s.select(layersSel(sel.frame, r.ids)) }
  else if (sel.frame) { const r = duplicateFrames(d, selFrames(sel)); if (!r.ids.length) return; s.edit(() => r.doc); s.select(framesSel(r.ids)) }
}
export function deleteSel() {
  const s = st(), sel = s.sel
  if (!sel.frame) return
  if (sel.layer) { const ids = selLayers(sel); s.edit(d => removeLayers(d, sel.frame!, ids)); s.select({ frame: sel.frame }) }
  else { const ids = selFrames(sel); s.edit(d => removeFrames(d, ids)); s.select({}) }
}

// ── clipboard ──────────────────────────────────────────────────────────────
let memClip: string | undefined
const kv = (): Storage | undefined => { try { return globalThis.localStorage } catch { return undefined } }
/** Put the selection on the clipboards (memory, localStorage; the caller adds the system one). Returns the JSON. */
export function copySel(): string | undefined {
  const s = st(), clip = clipOf(s.h.present, s.sel)
  if (!clip) { s.setNote('select frames or layers to copy them'); return undefined }
  const json = clipToJSON(clip)
  memClip = json
  try { kv()?.setItem(CLIP_KEY, json) } catch { /* storage full: memory still has it */ }
  s.setHasClip(true); s.setNote(`copied ${what()}`)
  return json
}
/** A COPY button: this browser's clipboard, and the system one when the page may write it. */
export function copyEverywhere() {
  const json = copySel()
  if (json) void globalThis.navigator?.clipboard?.writeText(json).catch(() => { /* not allowed: this browser's copy still pastes */ })
}
export function cutSel(): string | undefined {
  const json = copySel()
  if (json) { const n = what(); deleteSel(); st().setNote(`cut ${n}`) }
  return json
}
/** The clip to paste: a dot480 clip from the system clipboard text, else the last copy in this browser (any tab). */
export function currentClip(systemText?: string | null): Clip | undefined {
  const sys = asClip(systemText)
  if (sys) return sys
  for (const json of [kv()?.getItem(CLIP_KEY), memClip]) { if (!json) continue; try { return clipFromJSON(json) } catch { /* stale or foreign: try the next */ } }
  return undefined
}
export function paste(systemText?: string | null): boolean {
  const s = st(), clip = currentClip(systemText)
  if (!clip) { s.setNote('nothing to paste: copy frames or layers first'); return false }
  const r = pasteClip(s.h.present, clip, s.sel)
  if (typeof r === 'string') { s.setNote(r); return false }
  s.edit(() => r.doc); s.select(r.sel)
  s.setNote(`pasted ${clip.frames.length ? plural(clip.frames.length, 'frame') : plural(clip.layers.length, 'layer')}`)
  return true
}

// ── groups, locks, select all ──────────────────────────────────────────────
export function groupSel() {
  const s = st(), sel = s.sel, ids = selLayers(sel)
  if (!sel.frame || !ids.length) { s.setNote('select layers of a frame to group them'); return }
  const r = groupLayers(s.h.present, sel.frame, ids)
  if (!r.id) return
  s.edit(() => r.doc); s.select(layersSel(sel.frame, ids)); s.setNote(`grouped ${plural(ids.length, 'layer')}`)
}
/** ⇧⌘G: dissolve the groups the selected layers are in. */
export function ungroupSel() {
  const s = st(), sel = s.sel, f = frameById(s.h.present, sel.frame), ids = selLayers(sel)
  const gs = [...new Set(ids.map(id => groupOf(f, id)).filter(Boolean))]
  if (!f || !gs.length) { s.setNote('nothing grouped is selected'); return }
  s.edit(d => gs.reduce((x, g) => ungroup(x, f.id, g!.id), d)); s.setNote(`ungrouped ${plural(gs.length, 'group')}`)
}
/** ⇧⌘L: lock the selection (unlock it when it is all locked already). */
export function lockSel() {
  const s = st(), sel = s.sel, d = s.h.present
  if (sel.layer && sel.frame) {
    const f = frameById(d, sel.frame)!, ids = selLayers(sel), on = !ids.every(id => f.locks?.includes(id))
    s.edit(x => lockLayers(x, f.id, ids, on)); s.setNote(`${on ? 'locked' : 'unlocked'} ${what()}`)
  } else if (sel.frame) {
    const ids = selFrames(sel), on = !ids.every(id => frameById(d, id)?.locked)
    s.edit(x => lockFrames(x, ids, on)); s.setNote(`${on ? 'locked' : 'unlocked'} ${what()}`)
  }
}
export const selectAllSel = () => { const s = st(); s.select(selectAll(s.h.present, s.sel)) }
export function arrangeSel(how: Align | 'dist-x' | 'dist-y') {
  const s = st(), sel = s.sel
  if (sel.layer && sel.frame) s.edit(d => arrangeLayers(d, sel.frame!, selLayers(sel), how))
  else if (selCount(sel) > 1) s.edit(d => arrangeFrames(d, selFrames(sel), how))
}
/** Arrows: frames by px, text / sites layers by cells (each run of key presses coalesces). */
export function nudgeSel(dx: number, dy: number) {
  const s = st(), sel = s.sel, d = s.h.present
  if (sel.layer && sel.frame) {
    const f = frameById(d, sel.frame), ids = selLayers(sel).filter(id => movable(f?.card.layers.find(l => l.id === id)) && !f?.locks?.includes(id))
    if (ids.length) s.edit(x => ids.reduce((y, id) => editLayer(y, { frame: sel.frame!, layer: id }, l => nudgeLayer(l, dx, dy)), x), `nudge:${ids.join()}`)
  } else if (sel.frame) {
    const ids = selFrames(sel).filter(id => !frameById(d, id)?.locked)
    if (ids.length) s.edit(x => ids.reduce((y, id) => editFrame(y, id, f => ({ ...f, x: f.x + dx, y: f.y + dy })), x), `nudge:${ids.join()}`)
  }
}
/** Ctrl+] / Ctrl+[: the selected layers (or their groups) one step up / down the stack. */
export function orderSel(dir: -1 | 1) {
  const s = st(), sel = s.sel
  if (sel.layer && sel.frame) s.edit(d => shiftLayers(d, sel.frame!, selLayers(sel), dir))
}
/** Ctrl+⇧H: hide / show the selection (all follow the primary). */
export function hideSel() {
  const s = st(), sel = s.sel, d = s.h.present, f = frameById(d, sel.frame)
  if (!f) return
  if (sel.layer) { const ids = selLayers(sel), on = !f.card.layers.find(l => l.id === sel.layer)?.visible; s.edit(x => ids.reduce((y, id) => editLayer(y, { frame: f.id, layer: id }, l => ({ ...l, visible: on })), x)) }
  else { const ids = selFrames(sel), hidden = !f.hidden; s.edit(x => ({ ...x, frames: x.frames.map(y => (ids.includes(y.id) ? { ...y, hidden } : y)) })) }
}
/** Esc / ⇧Enter from layers inside a group: the group; from a group (or a layer): the frame. */
export function selectParent(d: EditorDoc = st().h.present) {
  const s = st(), sel = s.sel, f = frameById(d, sel.frame)
  if (!f || !sel.layer) return false
  const g = groupOf(f, sel.layer)
  if (g && !selGroup(d, sel)) s.select(layersSel(f.id, [sel.layer, ...g.layers.filter(id => id !== sel.layer)]))
  else s.select({ frame: f.id })
  return true
}

// ── links (E5) ─────────────────────────────────────────────────────────────
export interface MadeLink { url: string; kind: LinkKind | 'program'; id: string; parent?: string; chars: number; deflated: boolean }
const made = (url: string, packed: string, kind: MadeLink['kind'], id: string, parent?: string): MadeLink => {
  ;(globalThis as { __editorLink?: string }).__editorLink = url
  return { url, kind, id, ...(parent && { parent }), chars: url.length, deflated: packed[0] === 'z' }
}
/** The program's parent as this browser's gallery knows it (a program shared again unchanged keeps its parent). */
export const knownParent = (hash: string) => loadGallery().find(e => e.id === hash)?.parent
/** A program link; the program goes into the remix gallery (with its parent), so CODE draws its lineage. */
export async function programLink(p: SharedProgram): Promise<MadeLink> {
  const packed = await encodeShare(p)
  recordProgram(loadGallery(), p)
  return made(shareUrl(packed), packed, 'program', programHash(p), p.parent)
}
/** A link of frames (one: a frame link; none: the whole document). Throws with the reason (too big, empty). */
export async function framesLink(ids: string[]): Promise<MadeLink> {
  const p = linkPayload(st().h.present, ids, loadLinks())
  if (typeof p === 'string') throw new Error(p)
  const packed = await encodeLink(p)
  recordLink(p)
  return made(linkUrl(packed), packed, p.kind, p.id, p.parent)
}
/**
 * SHARE: a selected code layer that fits a program link → that; else the selected frames (a frame link for
 * one) → a frame link; nothing selected → the document. Throws with the reason a link could not be made.
 */
export async function shareSel(): Promise<MadeLink> {
  const s = st(), d = s.h.present, sel = s.sel, f = frameById(d, sel.frame), l = layerOf(d, sel)
  if (f && l && l.kind === 'ir' && selLayers(sel).length === 1) {
    const p = shareable(f, l, knownParent)
    if (typeof p !== 'string') return programLink(p)
  }
  return framesLink(f ? (sel.layer ? [f.id] : selFrames(sel)) : [])
}
/**
 * Copy text to the system clipboard; false when the page may not (the caller shows the link instead). A
 * write left pending (an unfocused page, a permission prompt nobody answers) counts as not copied after 1.5 s.
 */
export async function copyText(text: string, ms = 1500): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<boolean>(r => { timer = setTimeout(() => r(false), ms) })
  try { return await Promise.race([navigator.clipboard.writeText(text).then(() => true, () => false), late]) } catch { return false } finally { clearTimeout(timer) }
}
