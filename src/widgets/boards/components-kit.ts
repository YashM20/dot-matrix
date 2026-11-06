/**
 * The components board's drawing primitives, shared by the boards that borrow them (charts, dash, heartbeat,
 * motion, watch): dotted outlines, press and hover states, the marching focus ring. Their own module, so a board
 * that uses them loads this and not the whole components board (#214).
 */
import type { Layer } from '../../engine/types'
import { TAU, TILE, dim, layer, layoutFor, type LatticeField, type WidgetContext } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]

/** Evenly spaced dot sites around a stadium (pill) outline, top-left corner at (x,y). */
export function stadium(x: number, y: number, w: number, h: number, spacing: number): Pt[] {
  const r = h / 2, straight = Math.max(0, w - h), perimeter = 2 * straight + TAU * r
  const n = Math.max(8, Math.round(perimeter / spacing)), step = perimeter / n, pts: Pt[] = []
  const lx = x + r, rx = x + r + straight, cy = y + r
  for (let i = 0; i < n; i++) {
    let d = i * step
    if (d < straight) { pts.push([lx + d, y]); continue }                                 // top edge →
    d -= straight
    if (d < Math.PI * r) { const a = d / r; pts.push([rx + r * Math.sin(a), cy - r * Math.cos(a)]); continue } // right cap
    d -= Math.PI * r
    if (d < straight) { pts.push([rx - d, y + h]); continue }                              // bottom edge ←
    d -= straight
    const a = d / r; pts.push([lx - r * Math.sin(a), cy + r * Math.cos(a)])                 // left cap
  }
  return pts
}
export const OUTLINE = { spacing: 3.3, size: 1.5 }

// ── interaction states (COMPONENTS v2: see components.ts) ──
type Ctx = WidgetContext
/** One quantize step down at quantizeSteps 5 (1 → .75). */
export const PRESS = .75
export interface UiState { hover: boolean; pressed: boolean; focus: boolean }
export const ui = (ctx: Ctx, key: string): UiState => ({ hover: ctx.hover === key, pressed: ctx.pressed === key, focus: ctx.focus === key })
/** Site layer drawn at value `v` (press = PRESS). */
export const at = (lf: LatticeField, v: number): LatticeField => (v === 1 ? lf : { ...lf, field: () => v })
/** Text / lattice layer scaled by `v`. */
export const dimmed = (lf: LatticeField, v: number): LatticeField => (v === 1 ? lf : { ...lf, field: dim(lf.field, v) })

/** Evenly spaced dot sites around a rounded rectangle (corner radius r; r = h/2 is a stadium, w = h = 2r a circle). */
export function rrect(x: number, y: number, w: number, h: number, r: number, spacing: number): Pt[] {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  const sw = w - 2 * r, sh = h - 2 * r, arc = (Math.PI / 2) * r, perimeter = 2 * sw + 2 * sh + 4 * arc
  const n = Math.max(8, Math.round(perimeter / spacing)), step = perimeter / n, pts: Pt[] = []
  for (let i = 0; i < n; i++) {
    let d = i * step, a = 0
    if (d < sw) { pts.push([x + r + d, y]); continue }                                       // top →
    d -= sw
    if (d < arc) { a = d / r; pts.push([x + w - r + r * Math.sin(a), y + r - r * Math.cos(a)]); continue }
    d -= arc
    if (d < sh) { pts.push([x + w, y + r + d]); continue }                                   // right ↓
    d -= sh
    if (d < arc) { a = d / r; pts.push([x + w - r + r * Math.cos(a), y + h - r + r * Math.sin(a)]); continue }
    d -= arc
    if (d < sw) { pts.push([x + w - r - d, y + h]); continue }                               // bottom ←
    d -= sw
    if (d < arc) { a = d / r; pts.push([x + r - r * Math.sin(a), y + h - r + r * Math.cos(a)]); continue }
    d -= arc
    if (d < sh || r === 0) { pts.push([x, y + h - r - d]); continue }                        // left ↑
    d -= sh; a = d / r; pts.push([x + r - r * Math.cos(a), y + r - r * Math.sin(a)])
  }
  return pts
}
/** A control's outline grown by `d` cells, as sites `spacing` apart. */
export type Shape = (d: number, spacing: number) => Pt[]
export const rr = (x: number, y: number, w: number, h: number, r: number): Shape => (d, sp) => rrect(x - d, y - d, w + 2 * d, h + 2 * d, r + d, sp)
export const circle = (cx: number, cy: number, r: number): Shape => rr(cx - r, cy - r, 2 * r, 2 * r, r)

/** Hover glow: two halo outlines fading outward. */
const GLOW = [{ d: 2.6, v: .5 }, { d: 5.2, v: .25 }]
/** Focus: `on` of every `period` sites lit, marching `rate` sites per second, `d` cells outside the control. */
const FOCUS = { d: 7, spacing: 2.4, size: 1.3, on: 3, period: 5, rate: 10 }
export const glow = (shape: Shape): Layer[] => GLOW.map(g => layer(at(T.dots(shape(g.d, OUTLINE.spacing), OUTLINE.size), g.v), 'value'))
export const marching = (shape: Shape, t: number, d = FOCUS.d): Layer => {
  const ph = Math.floor(t * FOCUS.rate), P = FOCUS.period
  return layer(T.dots(shape(d, FOCUS.spacing).filter((_, i) => (((i - ph) % P) + P) % P < FOCUS.on), FOCUS.size), 'idle')
}
/** Hover glow around `hover`, marching focus ring around `focus` (defaults to the same outline). */
export const states = (s: UiState, t: number, hover: Shape, focus: Shape = hover, focusD = FOCUS.d): Layer[] =>
  [...(s.hover ? glow(hover) : []), ...(s.focus ? [marching(focus, t, focusD)] : [])]
