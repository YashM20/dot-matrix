/**
 * Copy / cut / paste for the editor (docs/EDITOR-PLAN.md §4.1, E2), without React. A clip is plain JSON
 * (`dot480.clip`): the copied frames, or the copied layers with the groups they make and the frame they
 * came from. It travels three ways: in memory, in localStorage (so another tab or a later visit can
 * paste it) and on the system clipboard as text (another browser, another device). Pasting gives every
 * frame, card, layer and group a new id and moves the copies until none sits exactly on what is there.
 */
import type { DotStyle, GridConfig } from '../../engine/types'
import { newId, normalizeZ, stackOrder, validateCard, type StudioLayer } from '../studio/doc'
import { addFrame, blankCard, cloneFrame, editFrame, frameById, MAX_FRAMES, movable, nudgeLayer, THEMES, tidyGroups, topDown, validateDoc, type EditorDoc, type EditorFrame, type LayerGroup, type Sel, type ThemeName } from './doc'
import { framesSel, layersSel, selFrames, selLayers } from './select'

export interface Clip {
  kind: 'dot480.clip'
  v: 1
  /** Copied frames, as they were (world positions kept). */
  frames: EditorFrame[]
  /** Or copied layers, top → bottom … */
  layers: StudioLayer[]
  /** … the groups made only of them … */
  groups: LayerGroup[]
  /** … and the frame they came from (to paste back into it, or to make a frame like it on an empty canvas). */
  src?: { frame: string; grid: GridConfig; style: DotStyle; theme: ThemeName }
}
export const CLIP_KEY = 'dot480.editor.clip'
const MAX_CARD_LAYERS = 24

/** The selection as a clip (deep copies), or undefined when nothing is selected. */
export function clipOf(d: EditorDoc, s: Sel): Clip | undefined {
  const layers = selLayers(s)
  if (layers.length) {
    const f = frameById(d, s.frame)!
    const ls = topDown(f.card).filter(l => layers.includes(l.id))
    if (!ls.length) return undefined
    const groups = (f.groups ?? []).filter(g => g.layers.every(id => layers.includes(id)))
    return structuredClone({ kind: 'dot480.clip', v: 1, frames: [], layers: ls, groups, src: { frame: f.id, grid: f.card.grid, style: f.card.style, theme: f.theme } })
  }
  const frames = d.frames.filter(f => selFrames(s).includes(f.id))
  return frames.length ? structuredClone({ kind: 'dot480.clip', v: 1, frames, layers: [], groups: [] }) : undefined
}
export const clipToJSON = (c: Clip) => JSON.stringify(c)
/** Parse and check a clip (as strictly as a document); throws with a reason. */
export function clipFromJSON(json: string): Clip {
  if (json.length > 8_000_000) throw new Error('clip: too large')
  let x: Clip
  try { x = JSON.parse(json) } catch (e) { throw new Error(`clip: not JSON (${(e as Error).message})`) }
  if (!x || typeof x !== 'object' || x.kind !== 'dot480.clip' || x.v !== 1) throw new Error('clip: not a dot480.clip')
  if (!Array.isArray(x.frames) || !Array.isArray(x.layers) || !Array.isArray(x.groups)) throw new Error('clip: frames, layers and groups must be arrays')
  if (!x.frames.length && !x.layers.length) throw new Error('clip: empty')
  const frames = x.frames.length ? validateDoc({ kind: 'dot480.editor', v: 2, name: 'clip', frames: x.frames }).frames : []
  if (x.layers.length) {
    const s = x.src
    if (!s || typeof s.frame !== 'string' || !THEMES.includes(s.theme)) throw new Error('clip: layers need their source frame')
    const card = { ...blankCard(s.grid), style: s.style, layers: x.layers }
    try { validateCard(card) } catch (e) { throw new Error(`clip: ${(e as Error).message}`) }
    validateDoc({ kind: 'dot480.editor', v: 2, name: 'clip', frames: [{ id: 'c', x: 0, y: 0, theme: s.theme, card, groups: x.groups }] })
  }
  return { ...x, frames }
}
/** Text from the system clipboard as a clip, if it is one. */
export function asClip(text: string | undefined | null): Clip | undefined {
  if (!text || !text.includes('"dot480.clip"')) return undefined
  try { return clipFromJSON(text) } catch { return undefined }
}

const PASTE_STEP = 24
const samePlace = (a: StudioLayer, b: StudioLayer) => a.kind === b.kind && (
  a.kind === 'text' && b.kind === 'text' ? a.params.col === b.params.col && a.params.row === b.params.row && a.params.text === b.params.text
    : a.kind === 'sites' && b.kind === 'sites' ? a.params.cx === b.params.cx && a.params.cy === b.params.cy && a.params.shape === b.params.shape
      : false)
/**
 * Paste a clip. Frames land where they were copied from, moved 24 px down-right at a time until no
 * copy sits exactly on a frame already there (so a cut pastes back in place and a copy steps aside).
 * Layers go on top of the selected frame (else the frame they came from, else a new frame like it),
 * text and sites moved 2 cells at a time on the same rule. Returns the new document and selection, or
 * a reason it could not paste.
 */
export function pasteClip(d: EditorDoc, clip: Clip, s: Sel): { doc: EditorDoc; sel: Sel } | string {
  if (clip.frames.length) {
    if (d.frames.length + clip.frames.length > MAX_FRAMES) return `a document holds at most ${MAX_FRAMES} frames`
    const taken = new Set(d.frames.map(f => `${f.x},${f.y}`))
    let k = 0
    while (k < 64 && clip.frames.some(f => taken.has(`${f.x + k * PASTE_STEP},${f.y + k * PASTE_STEP}`))) k++
    const copies = clip.frames.map(f => cloneFrame(f, k * PASTE_STEP, k * PASTE_STEP)) // no `source`: a copy is not the frame a link made
    return { doc: { ...d, frames: [...d.frames, ...copies] }, sel: framesSel(copies.map(f => f.id)) }
  }
  let doc = d
  let target = frameById(d, s.frame) ?? frameById(d, clip.src?.frame)
  if (!target) {
    if (d.frames.length >= MAX_FRAMES) return `a document holds at most ${MAX_FRAMES} frames`
    const card = { ...blankCard(clip.src!.grid, 'pasted'), style: structuredClone(clip.src!.style) }
    const r = addFrame(d, card, { theme: clip.src!.theme, source: 'paste' })
    doc = r.doc; target = r.frame
  }
  if (target.card.layers.length + clip.layers.length > MAX_CARD_LAYERS) return `a frame holds at most ${MAX_CARD_LAYERS} layers`
  const there = target.card.layers
  let k = 0
  while (k < 64 && clip.layers.some(l => movable(l) && there.some(t => samePlace(t, nudgeLayer(l, k * 2, k * 2))))) k++
  const ids = new Map(clip.layers.map(l => [l.id, newId()] as const))
  const copies = [...clip.layers].reverse().map(l => ({ ...nudgeLayer(structuredClone(l), k * 2, k * 2), id: ids.get(l.id)! }))
  const groups = clip.groups.map(g => ({ id: newId('g'), name: g.name, layers: g.layers.map(id => ids.get(id)!).filter(Boolean) }))
  const fid = target.id
  doc = editFrame(doc, fid, f => {
    const all = [...(f.groups ?? []), ...groups], next: EditorFrame = { ...f, card: { ...f.card, layers: normalizeZ([...stackOrder(f.card.layers), ...copies]) } }
    if (all.length) next.groups = all
    return tidyGroups(next)
  })
  return { doc, sel: layersSel(fid, clip.layers.map(l => ids.get(l.id)!)) }
}
