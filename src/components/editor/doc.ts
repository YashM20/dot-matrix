/**
 * MAKE editor document (docs/EDITOR-PLAN.md §3), React-free so `scripts/editor.ts` tests it in Node.
 *
 * A document is an infinite canvas of frames. Every frame is one Dot Studio card (`../studio/doc.ts`:
 * grid + style + layers + data + states + transitions) placed at world x/y (CSS px at 100 %), plus the
 * theme it is drawn in. Frames are drawn through Field → Grid Sampler → Renderer like any preset; the
 * editor adds no rendering path of its own. Plain JSON, saved to localStorage and files.
 */
import { latticeGrid, sampleLayers } from '../../engine/sampler/gridSampler'
import { presets } from '../../engine/theme/tokens'
import type { DotInstance, GridConfig, ThemeTokens } from '../../engine/types'
import { SHARE_GRIDS, SHARE_LATTICES, SHARE_TONES, programHash, type ShareGrid, type SharedProgram, type ShareTone } from '../../lib/share'
import { toBase64 } from '../../spec/codec'
import { TILE, widgetById } from '../../widgets'
import { EXAMPLES } from '../dwitter/examples'
import { compileCard, importDots, importPreset, irLayer, newCard, newId, normalizeZ, paintCells, paintLayer, stackOrder, textLayer, validateCard, type PaintLayer, type StudioCard, type StudioLayer } from '../studio/doc'

export const EDITOR_VERSION = 1
export type ThemeName = keyof typeof presets
export const THEMES = Object.keys(presets) as ThemeName[]
export interface EditorFrame {
  id: string
  /** World position of the top-left corner, CSS px at 100 %. */
  x: number
  y: number
  theme: ThemeName
  hidden?: boolean
  /** Where it came from: `preset:<id>`, `program:<hash>` (dedupes `?make=code&p=` reloads), `draw`, `blank`. */
  source?: string
  card: StudioCard
}
export interface EditorDoc { kind: 'dot480.editor'; v: number; name: string; frames: EditorFrame[] }
/** A selection: a frame, or one layer inside it. */
export interface Sel { frame?: string; layer?: string }

export const pitchOf = (c: StudioCard) => c.grid.pitch ?? 4
/** Frame size in world px. */
export const frameSize = (f: EditorFrame) => ({ w: f.card.grid.cols * pitchOf(f.card), h: f.card.grid.rows * pitchOf(f.card) })
export const themeOf = (f: Pick<EditorFrame, 'theme'>): ThemeTokens => presets[f.theme] ?? presets.dot480
export const frameById = (d: EditorDoc, id?: string) => (id ? d.frames.find(f => f.id === id) : undefined)
export const layerOf = (d: EditorDoc, s: Sel): StudioLayer | undefined => frameById(d, s.frame)?.card.layers.find(l => l.id === s.layer)
/** Layers top → bottom (what the layers panel lists). */
export const topDown = (c: StudioCard) => [...stackOrder(c.layers)].reverse()

// ── construction ───────────────────────────────────────────────────────────
export const GAP = 48
/** A free spot for a `w`×`h` frame: right of the frames in the top row, wrapping after ~4 frames wide. */
export function placeFor(d: EditorDoc, w: number, _h?: number): { x: number; y: number } {
  const shown = d.frames.filter(f => !f.hidden)
  if (!shown.length) return { x: 0, y: 0 }
  const boxes = shown.map(f => ({ ...frameSize(f), x: f.x, y: f.y }))
  const left = Math.min(...boxes.map(b => b.x)), right = Math.max(...boxes.map(b => b.x + b.w)), top = Math.min(...boxes.map(b => b.y))
  const rowW = Math.max(1400, (boxes[0]?.w ?? 400) * 4)
  if (right + GAP + w - left <= rowW) return { x: snap(right + GAP), y: top }
  return { x: left, y: snap(Math.max(...boxes.map(b => b.y + b.h)) + GAP * 1.5) }
}
const snap = (n: number, k = 4) => Math.round(n / k) * k
export const frameOf = (card: StudioCard, at: { x: number; y: number }, o: Partial<EditorFrame> = {}): EditorFrame => ({ id: newId('f'), x: snap(at.x), y: snap(at.y), theme: 'dot480', card, ...o })
export function addFrame(d: EditorDoc, card: StudioCard, o: Partial<EditorFrame> & { at?: { x: number; y: number } } = {}): { doc: EditorDoc; frame: EditorFrame } {
  const { at, ...rest } = o, pitch = pitchOf(card)
  const frame = frameOf(card, at ?? placeFor(d, card.grid.cols * pitch, card.grid.rows * pitch), rest)
  return { doc: { ...d, frames: [...d.frames, frame] }, frame }
}
/** A preset as a frame: its layers as a live, read-only reference stack (the same pixels as on its board). */
export const presetCard = (id: string): StudioCard => importPreset(id)
/** A Field IR program (an example, a `?make=code&p=` link) as a one-layer frame on its grid; `data.*` it reads start at .5. */
export function programCard(p: SharedProgram): StudioCard {
  const c = importDots(p), prog = compileCard(c)
  c.data = Object.fromEntries(prog.keys.map(k => [k, .5]))
  c.bindings = prog.keys.map(key => ({ key, kind: 'slider', min: 0, max: 1, step: .01 }))
  return c
}
export const programSource = (p: SharedProgram) => `program:${programHash(p)}`
/** An empty frame on a share grid (tile / wide / tall) or any size. */
export function blankCard(grid: GridConfig = TILE, name = 'frame'): StudioCard {
  const c = newCard(name)
  c.grid = { ...grid, pitch: grid.pitch ?? 4 }
  c.animated = false
  return c
}
/** A drawing frame: one empty paint layer, like the old DRAW board (80×80 dots at 4 px). */
export function drawingCard(cols = 80, rows = 80, pitch = 4, lattice = 1): StudioCard {
  const c = blankCard({ cols, rows, pitch }, 'drawing')
  c.style = { shape: 'squircle', sizeMin: .3, sizeMax: 1.6, cornerRoundness: .72, opacityMode: 'fromValue', quantizeSteps: 5 }
  c.layers = [paintLayer(c.grid, { name: 'paint', lattice })]
  return c
}
export const newIRLayer = (n: number, src = '// field\n.5 + .5 * sin(u * 12 + v * 4 - t * 2)') => irLayer(src, { name: `code ${n}`, lattice: 2 })
export const newTextLayer = (n: number, col: number, row: number) => textLayer('TEXT', { name: `text ${n}`, lattice: 2, params: { col, row } })

/** The first document a visitor sees: two reference cards and a code frame in a row (plus the last Studio card, if any). */
export function seedDoc(extra?: StudioCard): EditorDoc {
  let d: EditorDoc = { kind: 'dot480.editor', v: EDITOR_VERSION, name: 'untitled', frames: [] }
  const add = (card: StudioCard, o: Partial<EditorFrame> = {}) => { d = addFrame(d, card, o).doc }
  for (const id of ['level-03', 'afterlight']) if (widgetById(id)) add(presetCard(id), { source: `preset:${id}` })
  const ripple = EXAMPLES[0]
  if (ripple) add(programCard(ripple), { source: programSource(ripple) })
  if (extra) add(extra, { source: 'studio' })
  return d
}

// ── edits (pure: each returns a new document; untouched frames and layers keep their identity) ──
export const editFrame = (d: EditorDoc, id: string, fn: (f: EditorFrame) => EditorFrame): EditorDoc => ({ ...d, frames: d.frames.map(f => (f.id === id ? fn(f) : f)) })
export const editCard = (d: EditorDoc, id: string, fn: (c: StudioCard) => StudioCard): EditorDoc => editFrame(d, id, f => ({ ...f, card: fn(f.card) }))
export const editLayer = (d: EditorDoc, s: Required<Sel>, fn: (l: StudioLayer) => StudioLayer): EditorDoc =>
  editCard(d, s.frame, c => ({ ...c, layers: c.layers.map(l => (l.id === s.layer ? fn(l) : l)) }))
export function addLayer(d: EditorDoc, frame: string, l: StudioLayer): EditorDoc {
  return editCard(d, frame, c => ({ ...c, layers: normalizeZ([...stackOrder(c.layers), l]), animated: c.animated || l.kind === 'ir' && /\bt\b/.test(l.src) }))
}
export const removeLayer = (d: EditorDoc, s: Required<Sel>): EditorDoc => editCard(d, s.frame, c => ({ ...c, layers: normalizeZ(stackOrder(c.layers).filter(l => l.id !== s.layer)) }))
export const removeFrame = (d: EditorDoc, id: string): EditorDoc => ({ ...d, frames: d.frames.filter(f => f.id !== id) })
export function duplicateLayer(d: EditorDoc, s: Required<Sel>): { doc: EditorDoc; id?: string } {
  const l = layerOf(d, s)
  if (!l) return { doc: d }
  const c = { ...structuredClone(l), id: newId(), name: `${l.name} copy` }
  return { doc: editCard(d, s.frame, card => { const list = stackOrder(card.layers), i = list.findIndex(x => x.id === l.id); list.splice(i + 1, 0, c); return { ...card, layers: normalizeZ(list) } }), id: c.id }
}
export function duplicateFrame(d: EditorDoc, id: string): { doc: EditorDoc; id?: string } {
  const f = frameById(d, id)
  if (!f) return { doc: d }
  const card = { ...structuredClone(f.card), id: newId('c'), layers: f.card.layers.map(l => ({ ...structuredClone(l), id: newId() })) }
  const copy = { ...f, id: newId('f'), x: f.x + frameSize(f).w + GAP, card, source: undefined }
  return { doc: { ...d, frames: [...d.frames, copy] }, id: copy.id }
}
/** Move a layer to list position `to` (0 = top of the stack). */
export function moveLayer(d: EditorDoc, s: Required<Sel>, to: number): EditorDoc {
  return editCard(d, s.frame, c => {
    const list = topDown(c), from = list.findIndex(l => l.id === s.layer)
    if (from < 0 || to < 0 || to >= list.length || from === to) return c
    const [l] = list.splice(from, 1); list.splice(to, 0, l)
    return { ...c, layers: normalizeZ(list.reverse()) }
  })
}
/** Bring a frame to the top of the canvas (drawn last, hit first). */
export const raiseFrame = (d: EditorDoc, id: string): EditorDoc => { const f = frameById(d, id); return f && d.frames[d.frames.length - 1] !== f ? { ...d, frames: [...d.frames.filter(x => x !== f), f] } : d }

/** Shift a layer that has a position (text, sites) by whole cells. Others are fields over the whole card. */
export function nudgeLayer(l: StudioLayer, dc: number, dr: number): StudioLayer {
  if (l.kind === 'text') return { ...l, params: { ...l.params, col: l.params.col + dc, row: l.params.row + dr } }
  if (l.kind === 'sites') return { ...l, params: { ...l.params, cx: l.params.cx + dc, cy: l.params.cy + dr, x1: l.params.x1 + dc, y1: l.params.y1 + dr } }
  return l
}
export const movable = (l?: StudioLayer) => l?.kind === 'text' || l?.kind === 'sites'

/**
 * Resize a frame to `cols`×`rows` cells, `dc`/`dr` cells added on the left/top (negative = removed).
 * Text, sites and painted cells stay where they are on screen; fields over the whole card (IR, spec,
 * reference layers) re-sample at the new size.
 */
export function resizeFrame(f: EditorFrame, cols: number, rows: number, dc = 0, dr = 0): EditorFrame {
  cols = Math.max(8, Math.min(512, Math.round(cols))); rows = Math.max(8, Math.min(512, Math.round(rows)))
  const pitch = pitchOf(f.card), grid = { ...f.card.grid, cols, rows }
  const layers = f.card.layers.map((l): StudioLayer => {
    if (l.kind === 'paint') return repaint(l, grid, dc, dr)
    return dc || dr ? nudgeLayer(l, dc, dr) : l
  })
  return { ...f, x: f.x - dc * pitch, y: f.y - dr * pitch, card: { ...f.card, grid, layers } }
}
function repaint(l: PaintLayer, grid: GridConfig, dc: number, dr: number): PaintLayer {
  const sub = latticeGrid(grid, l.lattice), a = paintCells(l), out = new Uint8Array(sub.cols * sub.rows)
  const oc = Math.round(dc / l.lattice), or = Math.round(dr / l.lattice)
  for (let r = 0; r < sub.rows; r++) for (let c = 0; c < sub.cols; c++) {
    const sc = c - oc, sr = r - or
    if (sc >= 0 && sr >= 0 && sc < l.cols && sr < l.rows) out[r * sub.cols + c] = a[sr * l.cols + sc]
  }
  return { ...l, cols: sub.cols, rows: sub.rows, cells: toBase64(out) }
}

// ── paint ──────────────────────────────────────────────────────────────────
/** The paint cell under frame-local px `x`, `y` (may be outside the layer). */
export const paintCellAt = (f: EditorFrame, l: PaintLayer, x: number, y: number) => {
  const k = pitchOf(f.card) * l.lattice
  return [Math.floor(x / k), Math.floor(y / k)] as const
}
/** Stamp a round brush of `size` cells (1 = one cell) at `c`,`r`; returns how many cells changed. */
export function stamp(a: Uint8Array, cols: number, rows: number, c: number, r: number, size: number, value: number): number {
  let n = 0
  const v = Math.round(Math.max(0, Math.min(1, value)) * 255)
  for (let dy = -size + 1; dy < size; dy++) for (let dx = -size + 1; dx < size; dx++) {
    if (Math.hypot(dx, dy) > size - .5) continue
    const x = c + dx, y = r + dy
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue
    const i = y * cols + x
    if (a[i] !== v) { a[i] = v; n++ }
  }
  return n
}
/** Whole-cell line between two cells (Bresenham), for strokes faster than one cell per event. */
export function line(c0: number, r0: number, c1: number, r1: number): [number, number][] {
  const out: [number, number][] = [], dx = Math.abs(c1 - c0), dy = -Math.abs(r1 - r0), sx = c0 < c1 ? 1 : -1, sy = r0 < r1 ? 1 : -1
  let err = dx + dy, x = c0, y = r0
  for (let i = 0; i < 4096; i++) {
    out.push([x, y])
    if (x === c1 && y === r1) break
    const e2 = 2 * err
    if (e2 >= dy) { err += dy; x += sx }
    if (e2 <= dx) { err += dx; y += sy }
  }
  return out
}
export const encodeCells = (a: Uint8Array) => toBase64(a)
/** A 0..1 matrix (an auto-traced photo, an old DRAW JSON) into a paint layer's cells, resampled nearest. */
export function cellsFromMatrix(l: PaintLayer, m: number[][]): string {
  const rows = m.length, cols = m[0]?.length ?? 0, out = new Uint8Array(l.cols * l.rows)
  if (!rows || !cols) return toBase64(out)
  for (let r = 0; r < l.rows; r++) for (let c = 0; c < l.cols; c++) {
    const v = m[Math.min(rows - 1, Math.floor((r * rows) / l.rows))]?.[Math.min(cols - 1, Math.floor((c * cols) / l.cols))] ?? 0
    out[r * l.cols + c] = Math.round(Math.max(0, Math.min(1, v)) * 255)
  }
  return toBase64(out)
}

// ── hit testing + bounds (one layer sampled alone, memoised per layer + card geometry) ─────────
const soloMemo = new WeakMap<StudioLayer, { grid: GridConfig; style: StudioCard['style']; theme: string; data: StudioCard['data']; dots: DotInstance[] }>()
/** The dots one layer draws on its own (t = 0, the card's data), in frame px. */
export function layerDots(f: EditorFrame, l: StudioLayer): DotInstance[] {
  const m = soloMemo.get(l), c = f.card
  if (m && m.grid === c.grid && m.style === c.style && m.theme === f.theme && m.data === c.data) return m.dots
  const solo = { ...c, layers: [{ ...l, visible: true, blend: 'normal' as const }] }
  let dots: DotInstance[] = []
  try { dots = sampleLayers(compileCard(solo).layers({ t: 0, data: { ...c.data } }), { ...c.grid, pitch: pitchOf(c) }, c.style, themeOf(f)) } catch { /* a broken layer has no dots */ }
  soloMemo.set(l, { grid: c.grid, style: c.style, theme: f.theme, data: c.data, dots })
  return dots
}
export const lit = (d: DotInstance) => d.r > .2 && d.opacity > .06
/** Bounding box of a layer's lit dots in frame px, or undefined when it draws nothing. */
export function layerBounds(f: EditorFrame, l: StudioLayer): [number, number, number, number] | undefined {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const d of layerDots(f, l)) if (lit(d)) { x0 = Math.min(x0, d.x - d.r); y0 = Math.min(y0, d.y - d.r); x1 = Math.max(x1, d.x + d.r); y1 = Math.max(y1, d.y + d.r) }
  return x0 <= x1 ? [x0, y0, x1, y1] : undefined
}
/** The topmost visible layer with a lit dot under frame px `x`, `y` (within half a lattice cell). */
export function hitLayer(f: EditorFrame, x: number, y: number): StudioLayer | undefined {
  const pitch = pitchOf(f.card)
  for (const l of topDown(f.card)) {
    if (!l.visible) continue
    const reach = Math.max(pitch * ('lattice' in l ? l.lattice : 1) * .75, pitch)
    if (layerDots(f, l).some(d => lit(d) && Math.abs(d.x - x) <= Math.max(reach, d.r) && Math.abs(d.y - y) <= Math.max(reach, d.r))) return l
  }
  return undefined
}
/** The topmost visible frame containing world point `x`, `y`. */
export function hitFrame(d: EditorDoc, x: number, y: number): EditorFrame | undefined {
  for (let i = d.frames.length - 1; i >= 0; i--) {
    const f = d.frames[i], { w, h } = frameSize(f)
    if (!f.hidden && x >= f.x && y >= f.y && x <= f.x + w && y <= f.y + h) return f
  }
  return undefined
}
/** World bounds of frames (all visible ones when `ids` is empty). */
export function boundsOf(d: EditorDoc, ids: string[] = []): [number, number, number, number] | undefined {
  const fs = d.frames.filter(f => !f.hidden && (!ids.length || ids.includes(f.id)))
  if (!fs.length) return undefined
  return [Math.min(...fs.map(f => f.x)), Math.min(...fs.map(f => f.y)), Math.max(...fs.map(f => f.x + frameSize(f).w)), Math.max(...fs.map(f => f.y + frameSize(f).h))]
}

// ── share (CODE): an IR layer as a `?make=code&p=` program, when its frame and settings fit a share link ──
export function shareable(f: EditorFrame, l: StudioLayer): SharedProgram | string {
  if (l.kind !== 'ir') return 'only a code (Field IR) layer has a share link'
  const g = (Object.keys(SHARE_GRIDS) as ShareGrid[]).find(k => SHARE_GRIDS[k].cols === f.card.grid.cols && SHARE_GRIDS[k].rows === f.card.grid.rows)
  if (!g) return 'share links need a tile 144×144, wide 216×108 or tall 108×162 frame'
  if (!(SHARE_LATTICES as readonly number[]).includes(l.lattice)) return `share links use lattice ${SHARE_LATTICES.join(', ')}`
  const tone = (SHARE_TONES as readonly string[]).includes(l.tone) ? l.tone as ShareTone : 'auto'
  return { src: l.src, grid: g, lattice: l.lattice, tone }
}

// ── validation, JSON, storage ──────────────────────────────────────────────
const MAX_FRAMES = 48
export function validateDoc(x: unknown): EditorDoc {
  const d = x as EditorDoc
  if (!d || typeof d !== 'object' || d.kind !== 'dot480.editor') throw new Error('editor document: not a dot480.editor document')
  if (typeof d.v !== 'number' || d.v < 1 || d.v > EDITOR_VERSION) throw new Error('editor document: unknown version')
  if (typeof d.name !== 'string' || d.name.length > 64) throw new Error('editor document: name must be a string of ≤ 64 chars')
  if (!Array.isArray(d.frames) || d.frames.length > MAX_FRAMES) throw new Error(`editor document: frames must be an array of ≤ ${MAX_FRAMES}`)
  const ids = new Set<string>()
  d.frames.forEach((f, i) => {
    if (!f || typeof f.id !== 'string' || ids.has(f.id)) throw new Error(`editor document: frames[${i}].id missing or duplicate`)
    ids.add(f.id)
    if (![f.x, f.y].every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 1e7)) throw new Error(`editor document: frames[${i}] position`)
    if (!THEMES.includes(f.theme)) throw new Error(`editor document: frames[${i}].theme must be one of ${THEMES.join(', ')}`)
    try { validateCard(f.card) } catch (e) { throw new Error(`editor document: frames[${i}]: ${(e as Error).message}`) }
  })
  return d
}
export const docToJSON = (d: EditorDoc) => JSON.stringify(d)
export function docFromJSON(json: string): EditorDoc {
  if (json.length > 8_000_000) throw new Error('editor document: file too large')
  let x: unknown
  try { x = JSON.parse(json) } catch (e) { throw new Error(`editor document: not JSON (${(e as Error).message})`) }
  return validateDoc(x)
}
export const EDITOR_KEY = 'dot480.editor.v1'
type KV = Pick<Storage, 'getItem' | 'setItem'>
const kvOf = (): KV | undefined => { try { return globalThis.localStorage } catch { return undefined } }
export function saveDoc(d: EditorDoc, kv = kvOf()): boolean { try { kv?.setItem(EDITOR_KEY, docToJSON(d)); return !!kv } catch { return false } }
export function loadDoc(kv = kvOf()): EditorDoc | undefined {
  const s = kv?.getItem(EDITOR_KEY)
  if (!s) return undefined
  try { return docFromJSON(s) } catch { return undefined }
}
