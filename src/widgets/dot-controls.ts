/**
 * Dot-drawn controls several boards share (#357): the switch track, the scrubber and the transport glyphs. Each board
 * passes its own sizes and tones, so adopting a helper moves no dot; making the boards match is #360. TILE cards
 * (cell space, lattice 1).
 */
import type { Layer, Tone } from '../engine/types'
import { rrect, stadium } from '../engine/layout'
import { TILE, layer, layoutFor, type LatticeField } from './types'

const T = layoutFor(TILE)
type Pt = [number, number]
/** The site layer at value `v` (a press is one quantize step down); 1 leaves it as is. */
const at = (lf: LatticeField, v: number): LatticeField => (v === 1 ? lf : { ...lf, field: () => v })

// ── switch ──────────────────────────────────────────────────────────────────
/**
 * A switch: the track box (a stadium, radius h/2), the knob dot's size, and the outline's site `spacing` and `size`.
 * `outline` picks where the sites start: `stadium` on the top edge (default), `rrect` past the top-left arc.
 */
export interface SwitchSpec { x: number; y: number; w: number; h: number; knob: number; spacing: number; size: number; outline?: 'stadium' | 'rrect' }
/** The knob's centre at `k`: 0 = the left stop, 1 = the right stop, a fraction for a stop between (segmented) or a glide. */
export const switchKnob = (s: SwitchSpec, k: number): Pt => [s.x + s.h / 2 + k * (s.w - s.h), s.y + s.h / 2]
/**
 * `[track, knob]`: the stadium outline and one knob dot at `k`. `tone` is both or `[track, knob]`; `v` presses the knob
 * (a board that presses the whole switch wraps the track too).
 */
export function switchTrack(s: SwitchSpec, k: number, tone: Tone | [Tone, Tone], v = 1): [Layer, Layer] {
  const [trackTone, knobTone] = typeof tone === 'string' ? [tone, tone] : tone
  const sites = s.outline === 'rrect' ? rrect(s.x, s.y, s.w, s.h, s.h / 2, s.spacing) : stadium(s.x, s.y, s.w, s.h, s.spacing)
  return [layer(T.dots(sites, s.size), trackTone), layer(at(T.dots([switchKnob(s, k)], s.knob), v), knobTone)]
}

// ── scrubber ────────────────────────────────────────────────────────────────
/**
 * A dotted slider on row `y` from `x0` to `x1` with a knob dot of size `knob`.
 * - `index` (default): sites `spacing` apart (rounded to fit the span), the knob on the nearest site, and no site
 *   within `gap` cells of it.
 * - `lines`: two `T.dotLine`s, each from its end of the rail to `gap` cells short of the knob; the knob glides over
 *   `travel` (default the rail). `size` may differ per side: `[filled, rest]`.
 */
export interface ScrubSpec {
  x0: number; x1: number; y: number; spacing: number; size: number | [number, number]; knob: number; gap: number
  method?: 'index' | 'lines'; travel?: [number, number]
}
/** `[filled, rest, knob]` at value `v` (0..1); `tones` in that order. `p` presses the filled side and the knob. */
export function scrubber(s: ScrubSpec, v: number, tones: [Tone, Tone, Tone], p = 1): Layer[] {
  const [sizeL, sizeR] = typeof s.size === 'number' ? [s.size, s.size] : s.size
  let left: LatticeField, right: LatticeField, knob: Pt
  if (s.method === 'lines') {
    const [a, b] = s.travel ?? [s.x0, s.x1], kx = a + v * (b - a)
    left = T.dotLine(s.x0, s.y, kx - s.gap, s.y, { spacing: s.spacing, size: sizeL })
    right = T.dotLine(s.x1, s.y, kx + s.gap, s.y, { spacing: s.spacing, size: sizeR })
    knob = [kx, s.y]
  } else {
    const span = s.x1 - s.x0, n = Math.round(span / s.spacing), step = span / n, head = Math.round(Math.max(0, Math.min(1, v)) * n)
    const done: Pt[] = [], todo: Pt[] = []
    for (let i = 0; i <= n; i++) if (Math.abs(i - head) * step >= s.gap) (i < head ? done : todo).push([s.x0 + i * step, s.y])
    left = T.dots(done, sizeL); right = T.dots(todo, sizeR); knob = [s.x0 + head * step, s.y]
  }
  return [layer(at(left, p), tones[0]), layer(right, tones[1]), layer(at(T.dots([knob], s.knob), p), tones[2])]
}

// ── transport ───────────────────────────────────────────────────────────────
export type TransportGlyph = 'prev' | 'next' | 'play' | 'stop'
/**
 * One transport glyph `n` sites tall, sites `k` apart (`T.dotTri` / `T.fillOn` sizes). Prev and next are triangles
 * with the skip bar, tip at (x, y); play a triangle pointing right, tip at (x, y); stop an n × n square centred on (x, y).
 */
export function transportGlyph(g: TransportGlyph, x: number, y: number, n: number, k = 2.2): LatticeField {
  if (g === 'stop') { const h = ((n - 1) / 2) * k; return T.fillOn(k, () => true, [x - h, y - h, x + h, y + h]) }
  return T.dotTri(x, y, n, { k, dir: g === 'prev' ? 'left' : 'right', bar: g !== 'play' })
}
