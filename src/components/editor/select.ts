/**
 * Selections of many, without React (docs/EDITOR-PLAN.md §4.1, E2): the selection set (frames, or layers
 * of one frame), toggling it (⇧-click, the phone's SELECT mode), the marquee, group selections, the box
 * of a selection, resizing many frames from that box, align / distribute, and the smart guides and
 * spacing shown while frames are dragged. `Canvas.tsx`, `actions.ts` and the panels call these;
 * `scripts/editor.ts` tests them in Node.
 */
import { frameById, frameSize, groupOf, layerBounds, movable, nudgeLayer as nudge, pitchOf, resizeFrame, topDown, type EditorDoc, type EditorFrame, type LayerGroup, type Sel } from './doc'
import type { Handle } from './input'

/** World (or frame-local) box: x0, y0, x1, y1. */
export type Box = [number, number, number, number]

// ── the selection set ──────────────────────────────────────────────────────
/** Selected frame ids (frame-level selection), primary first. */
export const selFrames = (s: Sel): string[] => (s.frame && !s.layer ? [s.frame, ...(s.more ?? [])] : [])
/** Selected layer ids (layer-level selection, all in `s.frame`), primary first. */
export const selLayers = (s: Sel): string[] => (s.frame && s.layer ? [s.layer, ...(s.more ?? [])] : [])
/** Every selected id at its level. */
export const selIds = (s: Sel): string[] => (s.layer ? selLayers(s) : selFrames(s))
export const selCount = (s: Sel) => selIds(s).length
/** A selection from a list of frame ids (the first is the primary). */
export function framesSel(ids: string[]): Sel {
  const u = [...new Set(ids)]
  return u.length ? (u.length > 1 ? { frame: u[0], more: u.slice(1) } : { frame: u[0] }) : {}
}
/** A selection of layers of `frame` (the first is the primary); none = the frame. */
export function layersSel(frame: string, ids: string[]): Sel {
  const u = [...new Set(ids)]
  return u.length ? (u.length > 1 ? { frame, layer: u[0], more: u.slice(1) } : { frame, layer: u[0] }) : { frame }
}
/**
 * ⇧-click (or a tap in SELECT mode) on `hit`: add it to the selection or take it out. A layer of the
 * frame whose layers are selected toggles at layer level (a layer of the one selected frame starts
 * that); anything else toggles its frame at frame level (a layer selection in another frame becomes
 * the two frames).
 */
export function toggleSel(s: Sel, hit: Sel): Sel {
  if (!hit.frame) return s
  if (!s.frame) return hit.layer ? layersSel(hit.frame, [hit.layer]) : framesSel([hit.frame])
  if (s.layer && hit.layer && hit.frame === s.frame) {
    const ids = selLayers(s)
    return layersSel(s.frame, ids.includes(hit.layer) ? ids.filter(x => x !== hit.layer) : [...ids, hit.layer])
  }
  if (s.layer && hit.frame === s.frame) return { frame: s.frame }
  // a layer of the one selected frame starts a selection of its layers
  if (!s.layer && !s.more?.length && hit.layer && hit.frame === s.frame) return { frame: s.frame, layer: hit.layer }
  const ids = s.layer ? [s.frame] : selFrames(s)
  const next = ids.includes(hit.frame) ? ids.filter(x => x !== hit.frame) : [...ids, hit.frame]
  return framesSel(next)
}
/** Is `hit` inside the selection (its frame at frame level, its layer at layer level)? */
export function inSel(s: Sel, hit: Sel): boolean {
  if (!hit.frame || !s.frame) return false
  if (!s.layer) return selFrames(s).includes(hit.frame)
  return hit.frame === s.frame && !!hit.layer && selLayers(s).includes(hit.layer)
}
/** Drop what the document no longer has (after undo / redo / delete); a missing primary hands over to the next. */
export function validSel(d: EditorDoc, s: Sel): Sel {
  if (!s.frame) return {}
  if (s.layer) {
    const f = frameById(d, s.frame)
    if (!f) return {}
    const ids = selLayers(s).filter(id => f.card.layers.some(l => l.id === id))
    const out = layersSel(f.id, ids)
    return sameSel(out, s) ? s : out
  }
  const out = framesSel(selFrames(s).filter(id => d.frames.some(f => f.id === id)))
  return sameSel(out, s) ? s : out
}
export const sameSel = (a: Sel, b: Sel) => a.frame === b.frame && a.layer === b.layer && (a.more ?? []).join() === (b.more ?? []).join()
/** ⌘A: every unlocked visible layer of the frame whose layers are selected, else every unlocked visible frame. */
export function selectAll(d: EditorDoc, s: Sel): Sel {
  const f = s.layer ? frameById(d, s.frame) : undefined
  if (f) return layersSel(f.id, topDown(f.card).filter(l => l.visible && !f.locks?.includes(l.id)).map(l => l.id))
  return framesSel(d.frames.filter(x => !x.hidden && !x.locked).map(x => x.id))
}

// ── groups as selections ───────────────────────────────────────────────────
/** The group the selection is exactly (all of its layers, nothing else), if any. */
export function selGroup(d: EditorDoc, s: Sel): LayerGroup | undefined {
  const f = frameById(d, s.frame), ids = selLayers(s), g = groupOf(f, s.layer)
  return g && g.layers.length === ids.length && g.layers.every(id => ids.includes(id)) ? g : undefined
}
/**
 * A click on layer `layer` of `f`: a layer in a group selects the whole group (primary = that layer),
 * unless the selection is already inside that group, which drills in to the one layer. `deep` (⌘/Ctrl)
 * always picks the layer.
 */
export function clickLayer(f: EditorFrame, layer: string, s: Sel, deep = false): Sel {
  const g = groupOf(f, layer)
  if (!g || deep) return { frame: f.id, layer }
  const cur = s.frame === f.id ? selLayers(s) : []
  if (cur.length && cur.every(id => g.layers.includes(id))) return { frame: f.id, layer }
  return layersSel(f.id, [layer, ...g.layers.filter(id => id !== layer)])
}

// ── marquee ────────────────────────────────────────────────────────────────
export const normBox = (x0: number, y0: number, x1: number, y1: number): Box => [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
export const meets = (a: Box, b: Box) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
export const frameBox = (f: EditorFrame): Box => { const { w, h } = frameSize(f); return [f.x, f.y, f.x + w, f.y + h] }
/** Frames a marquee (world box) touches: visible and unlocked, in document order. */
export const marqueeFrames = (d: EditorDoc, b: Box) => d.frames.filter(f => !f.hidden && !f.locked && meets(frameBox(f), b)).map(f => f.id)
/** Layers of `f` whose lit dots a marquee (frame-local box) touches: visible and unlocked, top first. */
export const marqueeLayers = (f: EditorFrame, b: Box) => topDown(f.card).filter(l => { if (!l.visible || f.locks?.includes(l.id)) return false; const lb = layerBounds(f, l); return !!lb && meets(lb, b) }).map(l => l.id)
/** The selection a marquee makes: what it touches, added to `base` when ⇧ is held (frame level). */
export function marqueeSel(d: EditorDoc, b: Box, base: Sel, add: boolean): Sel {
  const hit = marqueeFrames(d, b)
  return framesSel(add ? [...selFrames(base), ...hit] : hit)
}

// ── the selection's box, many frames resized from it ───────────────────────
export const unionBox = (bs: Box[]): Box | undefined => (bs.length ? [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))] : undefined)
/** World box of frames (hidden ones included: they can be selected in LAYERS). */
export const framesBox = (d: EditorDoc, ids: string[]) => unionBox(d.frames.filter(f => ids.includes(f.id)).map(frameBox))
const q4 = (n: number) => Math.round(n * 4) / 4
/**
 * Frames `fs0` (the state when the gesture started) resized from their common box by dragging corner
 * `handle` by `dwx`, `dwy` world px: the opposite corner stays, every frame scales its place and size
 * about it, in whole cells (8…512 a side; content keeps its cells, like a single resize). A frame on the
 * anchored edge stays on it exactly. The box never goes under 16 px a side.
 */
export function resizeGroup(fs0: EditorFrame[], handle: Handle, dwx: number, dwy: number): EditorFrame[] {
  const b = unionBox(fs0.map(frameBox))
  if (!b) return fs0
  const west = handle.includes('w'), north = handle.includes('n'), W = b[2] - b[0], H = b[3] - b[1]
  const nw = Math.max(16, W + (west ? -dwx : dwx)), nh = Math.max(16, H + (north ? -dwy : dwy))
  const kx = nw / W, ky = nh / H, ax = west ? b[2] : b[0], ay = north ? b[3] : b[1]
  return fs0.map(f => {
    const { w, h } = frameSize(f)
    const cols = Math.max(8, Math.min(512, Math.round(f.card.grid.cols * kx))), rows = Math.max(8, Math.min(512, Math.round(f.card.grid.rows * ky)))
    const r = f.card.reference ? f : resizeFrame(f, cols, rows)
    const s = frameSize(r)
    const x = west ? ax - (ax - (f.x + w)) * kx - s.w : ax + (f.x - ax) * kx
    const y = north ? ay - (ay - (f.y + h)) * ky - s.h : ay + (f.y - ay) * ky
    return { ...r, x: q4(x), y: q4(y) }
  })
}
export const canResize = (fs: EditorFrame[]) => fs.length > 0 && fs.every(f => !f.card.reference && !f.locked)

// ── align / distribute ─────────────────────────────────────────────────────
export type Align = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export const ALIGNS: Align[] = ['left', 'hcenter', 'right', 'top', 'vcenter', 'bottom']
/** How far each box moves to line up with `to` (default: their common box). */
export function alignDeltas(bs: Box[], how: Align, to = unionBox(bs)): [number, number][] {
  if (!to) return []
  return bs.map(b => {
    if (how === 'left') return [to[0] - b[0], 0]
    if (how === 'right') return [to[2] - b[2], 0]
    if (how === 'hcenter') return [(to[0] + to[2]) / 2 - (b[0] + b[2]) / 2, 0]
    if (how === 'top') return [0, to[1] - b[1]]
    if (how === 'bottom') return [0, to[3] - b[3]]
    return [0, (to[1] + to[3]) / 2 - (b[1] + b[3]) / 2]
  })
}
/** Equal gaps along `axis` (the first and last box by position stay); fewer than 3 boxes do not move. */
export function distributeDeltas(bs: Box[], axis: 'x' | 'y'): [number, number][] {
  const out: [number, number][] = bs.map(() => [0, 0])
  if (bs.length < 3) return out
  const a = axis === 'x' ? 0 : 1, order = bs.map((_, i) => i).sort((i, j) => bs[i][a] - bs[j][a] || i - j)
  const first = bs[order[0]], last = bs[order[order.length - 1]], span = last[a + 2] - first[a]
  const sizes = order.reduce((n, i) => n + bs[i][a + 2] - bs[i][a], 0), gap = (span - sizes) / (order.length - 1)
  let at = first[a]
  for (const i of order) { out[i][a] = at - bs[i][a]; at += bs[i][a + 2] - bs[i][a] + gap }
  return out
}
/** Align or distribute frames (world px). */
export function arrangeFrames(d: EditorDoc, ids: string[], how: Align | 'dist-x' | 'dist-y'): EditorDoc {
  const fs = d.frames.filter(f => ids.includes(f.id) && !f.locked), bs = fs.map(frameBox)
  const ds = how === 'dist-x' || how === 'dist-y' ? distributeDeltas(bs, how === 'dist-x' ? 'x' : 'y') : alignDeltas(bs, how)
  const by = new Map(fs.map((f, i) => [f.id, ds[i]] as const))
  if (![...by.values()].some(([dx, dy]) => Math.abs(dx) > 1e-9 || Math.abs(dy) > 1e-9)) return d
  return { ...d, frames: d.frames.map(f => { const m = by.get(f.id); return m && (m[0] || m[1]) ? { ...f, x: q4(f.x + m[0]), y: q4(f.y + m[1]) } : f }) }
}
/**
 * Align or distribute layers of a frame by the bounds of their lit dots, in whole cells (only text and
 * sites move; fields cover the card). One layer aligns to the frame.
 */
export function arrangeLayers(d: EditorDoc, frame: string, ids: string[], how: Align | 'dist-x' | 'dist-y'): EditorDoc {
  const f = frameById(d, frame)
  if (!f) return d
  const ls = topDown(f.card).filter(l => ids.includes(l.id) && !f.locks?.includes(l.id)), boxes = ls.map(l => layerBounds(f, l))
  const have = ls.filter((_, i) => boxes[i]), bs = boxes.filter((b): b is Box => !!b), { w, h } = frameSize(f), p = pitchOf(f.card)
  const ds = how === 'dist-x' || how === 'dist-y' ? distributeDeltas(bs, how === 'dist-x' ? 'x' : 'y') : alignDeltas(bs, how, bs.length === 1 ? [0, 0, w, h] : undefined)
  const by = new Map(have.map((l, i) => [l.id, [Math.round(ds[i][0] / p), Math.round(ds[i][1] / p)] as const]))
  if (![...by.entries()].some(([id, [dc, dr]]) => (dc || dr) && movable(ls.find(l => l.id === id)))) return d
  return { ...d, frames: d.frames.map(x => x.id !== frame ? x : { ...x, card: { ...x.card, layers: x.card.layers.map(l => { const m = by.get(l.id); return m && movable(l) ? nudge(l, m[0], m[1]) : l }) } }) }
}

// ── smart guides and spacing ───────────────────────────────────────────────
/** A guide line: `axis` x = a vertical line at x = `at` from y `from` to `to` (world px). */
export interface Guide { axis: 'x' | 'y'; at: number; from: number; to: number }
/** A measured gap between the moving box and a neighbour: along `axis` from `a` to `b`, drawn at `at`. */
export interface Gap { axis: 'x' | 'y'; a: number; b: number; at: number }
const span = (b: Box, a: 0 | 1) => [b[a], (b[a] + b[a + 2]) / 2, b[a + 2]]
/**
 * Snap a moving box to the other frames (`others`) within `tol` world px: its left / centre / right to
 * theirs (and top / middle / bottom), or to the middle of two neighbours (equal spacing). Returns the
 * extra move, the guides to draw and the gaps to the nearest neighbour on each side.
 */
export function snapBox(b: Box, others: Box[], tol: number): { dx: number; dy: number; guides: Guide[]; gaps: Gap[] } {
  const best = (a: 0 | 1): number => {
    let d = Infinity
    const mine = span(b, a)
    for (const o of others) for (const t of span(o, a)) for (const m of mine) if (Math.abs(t - m) < Math.abs(d)) d = t - m
    // equal spacing: centred between the nearest neighbours before and after it (that overlap it across)
    const c = a === 0 ? 1 : 0, across = others.filter(o => o[c] < b[c + 2] && b[c] < o[c + 2])
    const before = across.filter(o => o[a + 2] <= b[a] + tol).sort((x, y) => y[a + 2] - x[a + 2])[0], after = across.filter(o => o[a] >= b[a + 2] - tol).sort((x, y) => x[a] - y[a])[0]
    if (before && after) { const room = after[a] - before[a + 2], size = b[a + 2] - b[a]; if (room > size) { const e = before[a + 2] + (room - size) / 2 - b[a]; if (Math.abs(e) < Math.abs(d)) d = e } }
    return Math.abs(d) <= tol ? d : 0
  }
  const dx = best(0), dy = best(1), m: Box = [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]
  const guides: Guide[] = []
  for (const a of [0, 1] as const) {
    const c = a === 0 ? 1 : 0
    for (const v of span(m, a)) {
      const hit = others.filter(o => span(o, a).some(t => Math.abs(t - v) < .01))
      if (hit.length) guides.push({ axis: a === 0 ? 'x' : 'y', at: v, from: Math.min(m[c], ...hit.map(o => o[c])), to: Math.max(m[c + 2], ...hit.map(o => o[c + 2])) })
    }
  }
  const gaps: Gap[] = []
  for (const a of [0, 1] as const) {
    const c = a === 0 ? 1 : 0, across = others.filter(o => o[c] < m[c + 2] && m[c] < o[c + 2])
    const before = across.filter(o => o[a + 2] <= m[a]).sort((x, y) => y[a + 2] - x[a + 2])[0], after = across.filter(o => o[a] >= m[a + 2]).sort((x, y) => x[a] - y[a])[0]
    const mid = (o: Box) => (Math.max(m[c], o[c]) + Math.min(m[c + 2], o[c + 2])) / 2
    if (before) gaps.push({ axis: a === 0 ? 'x' : 'y', a: before[a + 2], b: m[a], at: mid(before) })
    if (after) gaps.push({ axis: a === 0 ? 'x' : 'y', a: m[a + 2], b: after[a], at: mid(after) })
  }
  return { dx, dy, guides, gaps }
}
