/**
 * Motion board kit (#128): what every micro-interaction card shares. A card is a loop of `period` seconds drawn
 * by `draw(lt)`, a pure function of the loop time. The whole card is one replay button: a tap, a click or
 * Enter / Space starts the loop again from 0. Reduced motion draws the loop's `settled` moment and never moves.
 *
 * The replay start is the only state: the board-clock time of the last press, per card id. Nothing presses a
 * card in goldens or snapshots, so there the loop time is just `t mod period`.
 *
 * The drawing pieces are the components board's (outlines of fine sites, rings of sites, the press and focus
 * grammar), so these cards read as the same kit set in motion.
 */
import type { Layer, Tone } from '../../engine/types'
import { TAU, TILE, dim, layer, layoutFor, tileStyle, type LatticeField, type WidgetContext, type WidgetPreset } from '../types'
import { OUTLINE, PRESS, marching, rr, rrect, ui } from './components-kit'

export { PRESS, at, circle, dimmed, rr, rrect } from './components-kit'
export const T = layoutFor(TILE)
export type Pt = [number, number]
/** Knobs, status dots and loader dots are true circles, like the components board. */
export const style = { ...tileStyle, cornerRoundness: 0 }
export const BODY = { lattice: 1.3 }
export const LINE = OUTLINE
export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export const frac = (x: number) => x - Math.floor(x)
/** Progress of a tween from `t0` lasting `dur` seconds, clamped. */
export const span = (lt: number, t0: number, dur: number) => clamp01((lt - t0) / dur)
export const outCubic = (x: number) => 1 - (1 - clamp01(x)) ** 3
export const inCubic = (x: number) => clamp01(x) ** 3
export const inOut = (x: number) => { const k = clamp01(x); return k * k * (3 - 2 * k) }
/** A value snapped to the quantize steps the style uses (5: 0, .25, .5, .75, 1), so a fade steps like the dots do. */
export const step4 = (x: number) => Math.round(clamp01(x) * 4) / 4
/** A point at clock angle `a` (clockwise from 12) on a circle. */
export const polar = (cx: number, cy: number, r: number, a: number): Pt => [cx + r * Math.sin(a), cy - r * Math.cos(a)]

/** A layer at a quantized brightness (1 keeps it as is, 0 drops it). */
export const fade = (l: Layer, v: number): Layer[] => (v <= 0 ? [] : v >= 1 ? [l] : [{ ...l, field: dim(l.field, step4(v)) }])
/** Dotted outline of a rounded rectangle at (x,y). */
export const outline = (x: number, y: number, w: number, h: number, r: number, size = LINE.size): LatticeField => T.dots(rrect(x, y, w, h, r, LINE.spacing), size)
/** A sprite on its own coarse lattice, top-left at card cell (col,row). */
export const spriteAt = (rows: string[], col: number, row: number, k: number): LatticeField => { const L = T.lattice(k, col, row); return L.at(L.sprite(rows, 0, 0)) }
/** The first `n` columns of a sprite (a mark drawing on from left to right). */
export const cols = (rows: string[], n: number) => rows.map(r => [...r].map((ch, i) => (i < n ? ch : '.')).join(''))
/** Hero number on a smooth lattice (10×14 glyphs per character), left-aligned. */
export const hero = (s: string, x: number, top: number, lattice = 2.5) => T.big(s, x, top, { lattice, smooth: true })
/** Width in cells of hero text on `lattice`. */
export const heroW = (s: string, lattice = 2.5) => ([...s].length * 12 - 2) * lattice

// ── marks (7 × 7, lattice sprites) ──────────────────────────────────────────
export const CHECK = ['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....', '.......']
export const CROSS = ['#.....#', '.#...#.', '..#.#..', '...#...', '..#.#..', '.#...#.', '#.....#']
export const BANG = ['...#...', '...#...', '...#...', '...#...', '...#...', '.......', '...#...']

// ── the replay clock ────────────────────────────────────────────────────────
const REPLAY = 'k'
const starts = new Map<string, number>()
/**
 * Seconds since the card's loop last started: the last press on the card (the button held, or a pointer's
 * press time), else the board clock's 0. A clock that went back past the press (a fresh board) reads from 0.
 */
export function loopAge(ctx: WidgetContext, id: string): number {
  const t = ctx.t
  let s = starts.get(id) ?? 0
  if (ctx.pressed === REPLAY || (ctx.data[REPLAY] ?? 0) >= .5) s = t
  for (const p of ctx.pointers ?? []) if (p.tDown > s && p.tDown <= t + .25) s = p.tDown
  if (s !== (starts.get(id) ?? 0)) starts.set(id, s)
  return t >= s ? t - s : Math.max(0, t)
}

// ── the footer ──────────────────────────────────────────────────────────────
const RAIL = 131, FOOT = 137
/** A dotted rail through the loop (done in mid), the state on the left, a detail on the right. */
export function footer(k: number, left: string, right: string, rightTone: Tone = 'mid'): Layer[] {
  const done: Pt[] = [], rest: Pt[] = [], end = (TILE.cols - 1) * clamp01(k)
  for (let c = 0; c < TILE.cols; c += 3) (c <= end ? done : rest).push([c, RAIL])
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    layer(T.text(left, 0, FOOT), 'idle'),
    layer(T.text(right, TILE.cols - 1, FOOT, { align: 'right' }), rightTone),
  ]
}

// ── the card ────────────────────────────────────────────────────────────────
export interface LoopSpec {
  id: string
  name: string
  /** Loop length in seconds. */
  period: number
  /** The loop time reduced motion shows (the settled state). */
  settled: number
  fps?: number
  /** The card's picture at loop time `lt` (seconds). */
  draw: (lt: number, ctx: WidgetContext) => Layer[]
  /** Footer words at loop time `lt`: [state, detail]. */
  foot: (lt: number) => [string, string]
}
/** The focus ring: marching dots around the card's picture. */
const FRAME = rr(2, 12, 140, 112, 8)
/** A looping card: a whole-card replay button, the footer rail, press = one quantize step down, focus = marching dots. */
export function loopCard(s: LoopSpec): WidgetPreset {
  return {
    id: s.id, name: s.name, group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
    ...(s.fps ? { fps: s.fps } : {}),
    defaults: { [REPLAY]: 0 },
    controls: [{ key: REPLAY, kind: 'button', box: [0, 10, 144, 134], label: `Replay ${s.name.toLowerCase()}` }],
    layers: ctx => {
      const still = !!ctx.reducedMotion, u = ui(ctx, REPLAY)
      const lt = still ? s.settled : loopAge(ctx, s.id) % s.period
      const pic = s.draw(lt, ctx), [left, right] = s.foot(lt)
      return [
        ...(u.pressed ? pic.map(l => ({ ...l, field: dim(l.field, PRESS) })) : pic),
        ...footer(lt / s.period, left, u.hover || u.focus ? 'REPLAY' : right, u.hover || u.focus ? 'value' : 'mid'),
        ...(u.focus ? [marching(FRAME, still ? 0 : ctx.t, 0)] : []),
      ]
    },
  }
}

// ── shared motion pieces ────────────────────────────────────────────────────
/**
 * Lit sites of a ring between site positions `tail` and `head` (fractional site units, head ahead clockwise):
 * the track in faint, the arc in value, the head site in `headTone`.
 */
export function arcRing(cx: number, cy: number, r: number, n: number, tail: number, head: number, o: { track?: number; arc?: number; head?: number; headTone?: Tone } = {}): Layer[] {
  const { track = 1.6, arc = 3.4, head: hs = 5.4, headTone = 'active' } = o
  const site = (i: number): Pt => polar(cx, cy, r, (((i % n) + n) % n) / n * TAU)
  const h = Math.round(head), tl = Math.round(tail), lit = new Set<number>()
  for (let i = tl; i <= h; i++) lit.add(((i % n) + n) % n)
  const all = Array.from({ length: n }, (_, i) => i)
  const hi = ((h % n) + n) % n
  return [
    layer(T.dots(all.filter(i => !lit.has(i)).map(site), track), 'faint'),
    layer(T.dots([...lit].filter(i => i !== hi).map(site), arc), 'value'),
    ...(h - tl >= 0 ? [layer(T.dots([site(hi)], hs), headTone)] : []),
  ]
}
