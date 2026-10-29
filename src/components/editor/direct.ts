/**
 * Editing on the canvas (docs/EDITOR-PLAN.md E3), React-free so `scripts/editor.ts` tests it in Node:
 * the handles of a sites layer (ring radius and sweep, disc radius, line ends), the bounds of a spec
 * layer (the declared box of a placed IR field, resized by its corners), the geometry of text typed in
 * place (where the caret goes between 5×7 / `T.big` glyphs, in whole cells), the quick toggles (tone,
 * lattice, site size) and the paint eyedropper. Every result is a plain layer edit: the canvas still
 * draws it through Field → Sampler → Renderer, and text still goes through `textAt` / `T.big`.
 */
import { scaleOf, textSize } from '../../engine/layout'
import { glyphMetrics } from '../../engine/fields/bitmapFont'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { LayerSpec } from '../../spec/types'
import { LATTICES, paintCells, SITE_SIZES, TONES, type LayerTone, type PaintLayer, type SitesLayer, type SpecLayer, type StudioLayer, type TextLayer } from '../studio/doc'
import { layerBounds, pitchOf, topDown, type EditorFrame } from './doc'
import type { Handle } from './input'

const TAU = Math.PI * 2
/** Frame-local box in px: x0, y0, x1, y1. */
export type FBox = [number, number, number, number]
/** A handle on the canvas: its id and where it sits, frame px. */
export interface Spot { id: SiteHandle; x: number; y: number }

// ── sites: ring radius / sweep, disc radius, line ends ────────────────────────
export type SiteHandle = 'r' | 'sweep' | 'a' | 'b'
/** A site at card cell (x, y) is drawn centred at ((x + .5) pitch, (y + .5) pitch) (the sampler's rule). */
const cellPx = (c: number, pitch: number) => (c + .5) * pitch
const pxCell = (x: number, pitch: number) => x / pitch - .5
/** How many sites a full ring of radius `r` has (`dotRing`'s count). */
export const ringCount = (r: number, spacing: number) => Math.max(3, Math.round((TAU * r) / spacing))

/** The handles of a sites layer, frame px: `a`/`b` the ends of a line; `r` the radius; `sweep` where a ring's arc ends. */
export function siteHandles(f: EditorFrame, l: SitesLayer): Spot[] {
  const p = pitchOf(f.card), { shape, cx, cy, r, x1, y1, start, sweep } = l.params
  if (shape === 'line') return [{ id: 'a', x: cellPx(cx, p), y: cellPx(cy, p) }, { id: 'b', x: cellPx(x1, p), y: cellPx(y1, p) }]
  if (shape === 'disc') return [{ id: 'r', x: cellPx(cx + r, p), y: cellPx(cy, p) }]
  const at = (a: number) => ({ x: cellPx(cx + r * Math.sin(a), p), y: cellPx(cy - r * Math.cos(a), p) })
  const full = sweep >= TAU - 1e-6
  return [{ id: 'r', ...at(start + (full ? Math.PI : sweep / 2)) }, { id: 'sweep', ...at(start + Math.min(sweep, TAU)) }]
}
/**
 * A sites layer with handle `id` dragged to frame px `x`, `y` (from `l0`, the layer when the drag began):
 * line ends and radii land on whole cells (1…512); a ring's sweep snaps to its own sites (`TAU / n`
 * steps, so the arc ends on a dot of its full-ring track), from one step to the full ring.
 */
export function dragSiteHandle(f: EditorFrame, l0: SitesLayer, id: SiteHandle, x: number, y: number): SitesLayer {
  const p = pitchOf(f.card), c = pxCell(x, p), r = pxCell(y, p), q = l0.params
  if (id === 'a') return { ...l0, params: { ...q, cx: Math.round(c), cy: Math.round(r) } }
  if (id === 'b') return { ...l0, params: { ...q, x1: Math.round(c), y1: Math.round(r) } }
  if (id === 'r') return { ...l0, params: { ...q, r: Math.max(1, Math.min(512, Math.round(Math.hypot(c - q.cx, r - q.cy)))) } }
  const a = Math.atan2(c - q.cx, -(r - q.cy)), rel = (((a - q.start) % TAU) + TAU) % TAU
  const n = ringCount(q.r, q.spacing), k = Math.max(1, Math.round(rel / (TAU / n)))
  return { ...l0, params: { ...q, sweep: k >= n ? TAU : (k * TAU) / n } }
}

// ── spec layers: the declared bounds of a placed field ─────────────────────────
type Placed = { lattice?: number; origin?: [number, number] }
const placedOf = (s: Placed) => ({ k: s.lattice ?? 1, ox: s.origin?.[0] ?? 0, oy: s.origin?.[1] ?? 0 })
/** A spec layer whose box is its own (an IR field, bounded or over its whole lattice grid): `bounds` handles resize it. */
export const hasBounds = (l?: StudioLayer): l is SpecLayer & { spec: Extract<LayerSpec, { kind: 'ir' }> } => l?.kind === 'spec' && l.spec.kind === 'ir'
/** The layer-cell bounds [col, row, w, h] of an IR spec layer (its whole lattice grid when it has none). */
export function specBounds(f: EditorFrame, s: Extract<LayerSpec, { kind: 'ir' }>): [number, number, number, number] {
  if (s.bounds) return s.bounds
  const { k, ox, oy } = placedOf(s), sub = latticeGrid(f.card.grid, k, [ox, oy])
  return [0, 0, sub.cols, sub.rows]
}
/** The box an IR spec layer is placed into, frame px. */
export function specBox(f: EditorFrame, s: Extract<LayerSpec, { kind: 'ir' }>): FBox {
  const p = pitchOf(f.card), { k, ox, oy } = placedOf(s), [c, r, w, h] = specBounds(f, s)
  return [(ox + c * k) * p, (oy + r * k) * p, (ox + (c + w) * k) * p, (oy + (r + h) * k) * p]
}
/** An IR spec layer's bounds dragged by corner `handle` by `dwx`, `dwy` px: whole layer cells, ≥ 1 a side; the opposite corner stays. */
export function resizeSpecBounds(f: EditorFrame, l0: SpecLayer & { spec: Extract<LayerSpec, { kind: 'ir' }> }, handle: Handle, dwx: number, dwy: number): SpecLayer {
  const s = l0.spec, step = pitchOf(f.card) * placedOf(s).k, dx = Math.round(dwx / step), dy = Math.round(dwy / step)
  let [c, r, w, h] = specBounds(f, s)
  if (handle.includes('w')) { const d = Math.min(dx, w - 1); c += d; w -= d } else w = Math.max(1, w + dx)
  if (handle.includes('n')) { const d = Math.min(dy, h - 1); r += d; h -= d } else h = Math.max(1, h + dy)
  return { ...l0, spec: { ...s, bounds: [c, r, w, h] } }
}
/** The box a layer shows when selected, frame px: a spec field's declared bounds, else the bounds of its lit dots. */
export const layerBox = (f: EditorFrame, l: StudioLayer): FBox | undefined => (hasBounds(l) ? specBox(f, l.spec) : layerBounds(f, l))

// ── text in place ─────────────────────────────────────────────────────────────
/** A layer whose text can be typed on the canvas: a text layer, or a spec text layer with literal `text` (not `bind`). */
export const editableText = (l?: StudioLayer): l is TextLayer | (SpecLayer & { spec: Extract<LayerSpec, { kind: 'text' }> & { text: string } }) =>
  l?.kind === 'text' || (l?.kind === 'spec' && l.spec.kind === 'text' && typeof l.spec.text === 'string')
export const textOf = (l: StudioLayer): string => (l.kind === 'text' ? l.params.text : l.kind === 'spec' && l.spec.kind === 'text' ? l.spec.text ?? '' : '')
/** The layer with its text replaced (upper case: the 5×7 font's letters), at most 64 characters. */
export function withText(l: StudioLayer, text: string): StudioLayer {
  const s = text.toUpperCase().slice(0, 64)
  if (l.kind === 'text') return { ...l, params: { ...l.params, text: s } }
  if (l.kind === 'spec' && l.spec.kind === 'text' && typeof l.spec.text === 'string') return { ...l, spec: { ...l.spec, text: s } }
  return l
}
/**
 * Where text typed in place sits, in card cells: its left and top edge, its height, and the caret's x
 * before each character (`carets[i]`, `carets.length` = characters + 1). Carets sit in the middle of the
 * gap between two glyphs, so they never cut a glyph; the layout is `textAt`'s (5×7, `align` rounded the
 * same way) or `T.big`'s (one glyph cell = `lattice` card cells).
 */
export interface TextGeo { left: number; top: number; h: number; k: number; carets: number[] }
export function textGeo(l: StudioLayer): TextGeo | undefined {
  if (!editableText(l)) return undefined
  const str = textOf(l).slice(0, 64)
  let k: number, ox: number, oy: number, col: number, row: number, align: 'left' | 'center' | 'right', opts: { scale?: number | [number, number]; smooth?: boolean }, big: boolean
  if (l.kind === 'text') {
    k = l.lattice > 1 ? l.lattice : 1; big = l.lattice > 1; ox = 0; oy = 0; col = l.params.col; row = l.params.row; align = l.params.align
    opts = { scale: l.params.scale, smooth: l.params.smooth }
  } else {
    const s = l.spec; ({ k, ox, oy } = placedOf(s)); big = false; col = s.at[0]; row = s.at[1]; align = s.align ?? 'left'
    opts = { scale: s.scale, smooth: s.smooth }
  }
  const [w, h] = textSize(str, opts), [sx] = scaleOf(opts), m = glyphMetrics(opts)
  // T.big anchors in card cells (no rounding); textAt in its own grid's cells (centre rounded)
  const left = big
    ? (align === 'center' ? col - (w * k) / 2 : align === 'right' ? col - w * k : col)
    : ox + (align === 'center' ? Math.round(col - w / 2) : align === 'right' ? col - w + 1 : col) * k
  const n = [...str].length, half = ((m.advance - m.w) * sx) / 2
  const carets = Array.from({ length: n + 1 }, (_, i) => left + (i === 0 ? 0 : i === n ? w : i * m.advance * sx - half) * k)
  return { left, top: (big ? row : oy + row * k), h: h * k, k, carets }
}
/** The caret index nearest to card-cell x `c`. */
export const caretAt = (g: TextGeo, c: number) => g.carets.reduce((best, x, i) => (Math.abs(x - c) < Math.abs(g.carets[best] - c) ? i : best), 0)

// ── quick toggles: tone, lattice, site size ────────────────────────────────────
/** The tones a layer may take (`preset` keeps a reference / spec layer's own). */
export const tonesFor = (l: StudioLayer): LayerTone[] => (l.kind === 'preset-layer' || l.kind === 'spec' ? ['preset', ...TONES] : TONES)
const step = <T>(list: readonly T[], cur: T, dir: 1 | -1): T => { const i = list.indexOf(cur); return list[(((i < 0 ? 0 : i + dir) % list.length) + list.length) % list.length] }
export const stepTone = (l: StudioLayer, dir: 1 | -1 = 1): StudioLayer => ({ ...l, tone: step(tonesFor(l), l.tone, dir) })
/** The lattice a layer samples on, when the quick bar may change it (code and text layers; spec IR, text and generators). */
export function latticeOf(l: StudioLayer): number | undefined {
  if (l.kind === 'ir' || l.kind === 'text') return l.lattice
  if (l.kind === 'spec' && (l.spec.kind === 'ir' || l.spec.kind === 'text' || l.spec.kind === 'generator')) return l.spec.lattice ?? 1
  return undefined
}
/** The next rung of the lattice ladder (`LATTICES`) up or down; undefined at either end. */
export function nextRung(ladder: readonly number[], cur: number, dir: 1 | -1): number | undefined {
  const up = ladder.filter(x => x > cur + 1e-9), down = ladder.filter(x => x < cur - 1e-9)
  return dir > 0 ? up[0] : down[down.length - 1]
}
/**
 * One rung coarser (`dir` 1) or finer (-1) on the lattice ladder. A spec text anchor or an IR field's
 * bounds are rescaled so the layer stays where it was on the card (to the nearest new cell).
 */
export function stepLattice(l: StudioLayer, dir: 1 | -1): StudioLayer {
  const k0 = latticeOf(l), k1 = k0 === undefined ? undefined : nextRung(LATTICES, k0, dir)
  if (k0 === undefined || k1 === undefined) return l
  if (l.kind === 'ir' || l.kind === 'text') return { ...l, lattice: k1 }
  if (l.kind !== 'spec') return l
  const s = l.spec as Extract<LayerSpec, { kind: 'ir' | 'text' | 'generator' }>, r = (x: number) => Math.round((x * k0) / k1)
  if (s.kind === 'text') return { ...l, spec: { ...s, lattice: k1, at: [r(s.at[0]), r(s.at[1])] } }
  if (s.kind === 'ir' && s.bounds) { const [c, rw, w, h] = s.bounds; return { ...l, spec: { ...s, lattice: k1, bounds: [r(c), r(rw), Math.max(1, r(w)), Math.max(1, r(h))] } } }
  return { ...l, spec: { ...s, lattice: k1 } }
}
/** A sites layer one dot size up or down (`SITE_SIZES`); unchanged at either end. */
export function stepSize(l: SitesLayer, dir: 1 | -1): SitesLayer {
  const next = nextRung(SITE_SIZES, l.size, dir)
  return next === undefined ? l : { ...l, size: next }
}

// ── the paint eyedropper ─────────────────────────────────────────────────────
/** Ink values the brush offers (INK slider): .2 … 1 in steps of .2. */
export const inkStep = (v: number) => Math.min(1, Math.max(.2, Math.round(v * 5) / 5))
/**
 * The paint under frame px `x`, `y`: the `prefer`red paint layer (the selected one) if it is visible,
 * else the topmost visible paint layer with a lit cell there, else the topmost visible one. `value` is
 * that cell's 0…1 value (0 = empty).
 */
export function inkAt(f: EditorFrame, x: number, y: number, prefer?: string): { layer: PaintLayer; value: number } | undefined {
  const p = pitchOf(f.card), paints = topDown(f.card).filter((l): l is PaintLayer => l.kind === 'paint' && l.visible)
  const read = (l: PaintLayer) => {
    const c = Math.floor(x / (p * l.lattice)), r = Math.floor(y / (p * l.lattice))
    return c < 0 || r < 0 || c >= l.cols || r >= l.rows ? 0 : paintCells(l)[r * l.cols + c] / 255
  }
  const l = paints.find(x => x.id === prefer) ?? paints.find(x => read(x) > 0) ?? paints[0]
  return l && { layer: l, value: read(l) }
}
