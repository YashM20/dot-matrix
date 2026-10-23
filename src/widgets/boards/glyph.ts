/**
 * Board — Glyph: lock-screen experiences in the Nothing-phone spirit, v0. An hourglass clock whose
 * grains fall into the digits over each minute, a long-press ring that reveals a glyph as you hold,
 * a metaball notification that splits off and rejoins, and a slow reaction-diffusion-looking idle
 * wallpaper. Every card is a pure function of the board clock `t`, the wall clock (hourglass) or
 * the pointer's press time. None of them is `live`: the board's only red is the notify badge dot.
 */
import { hash01 } from '../../engine/math'
import { ease } from '../../engine/motion'
import type { Control } from '../../engine/context'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { dotText } from './henry'

const T = layoutFor(TILE)
type Pt = [number, number]
const tile = { chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

// ── 01 HOURGLASS ────────────────────────────────────────────────────────────
// Each minute the previous digits shed their grains (they drop off the card), then the new digits
// are poured: grains leave a dotted hopper at the top, fall under gravity down their own column
// and settle, bottom rows first, so the shape fills from the floor up before the minute is out.
const HOPPER_Y = 20, DIGITS = { px: 4.3, py: 4.8, size: 4.7 }
const POUR = { from: 3, span: 33, shed: 2.2 }
const sitesOf = (s: string): Pt[] => dotText(s, 3, 35.5, DIGITS).sites ?? []
export const glyphHourglass: WidgetPreset = {
  id: 'glyph-hourglass', name: 'Hourglass', label: '01  HOURGLASS', group: 'text', ...tile, clock: true,
  layers: () => {
    const now = new Date(), sec = now.getSeconds() + now.getMilliseconds() / 1000
    const next = sitesOf(hhmm(now)), prev = sitesOf(hhmm(new Date(+now - 60_000)))
    const y0 = Math.min(...next.map(p => p[1])), y1 = Math.max(...next.map(p => p[1]))
    const settled: Pt[] = [], falling: Pt[] = [], shed: Pt[] = []
    // old grains drop out of their shape, staggered, with a little gravity
    if (sec < POUR.shed + 1) prev.forEach(([x, y], i) => {
      const tau = sec - hash01(i, 3) * POUR.shed, yy = y + 90 * tau * tau
      if (tau > 0 && yy < 140) shed.push([x, yy]); else if (tau <= 0) shed.push([x, y])
    })
    next.forEach(([x, y], i) => {
      const rank = (y - y0) / (y1 - y0 || 1), release = POUR.from + (1 - rank) * POUR.span * .85 + hash01(i, 11) * POUR.span * .15
      const d = .5 + .5 * (y - HOPPER_Y) / 100, tau = sec - release
      if (tau >= d) settled.push([x, y])
      else if (tau > 0) falling.push([x, HOPPER_Y + (y - HOPPER_Y) * (tau / d) ** 2])
    })
    const secs = Array.from({ length: 30 }, (_, i): Pt => [8 + i * 4.4, 128]), lit = Math.floor(sec / 2)
    return [
      layer(T.dotLine(3, HOPPER_Y - 3, 141, HOPPER_Y - 3, { spacing: 4.4, size: 1.2 }), 'faint'),
      layer(T.dots(shed, DIGITS.size), 'mid'),
      layer(T.dots(falling, 3.2), 'mid'),
      layer(T.dots(settled, DIGITS.size)),
      layer(T.dots(secs.slice(lit), 1.6), 'faint'),
      layer(T.dots(secs.slice(0, lit), 1.9), 'idle'),
    ]
  },
}

// ── 02 LONG PRESS ───────────────────────────────────────────────────────────
// Hold the ring: a wedge of the inner glyph is revealed clockwise from 12 as the press ages, the
// ring fills in step, and at HOLD seconds the whole glyph lights and the card says UNLOCKED.
const HOLD = 1.4, CX = 72, CY = 74, RING = 52, INNER = 40
const disc = T.dotDisc(CX, CY, INNER, { spacing: 5.2, size: 2.6 }).sites ?? []
const clock = (x: number, y: number) => ((Math.atan2(x - CX, -(y - CY)) % TAU) + TAU) % TAU
export const glyphLongpress: WidgetPreset = {
  id: 'glyph-longpress', name: 'Long Press', label: '02  LONG PRESS', group: 'composite', ...tile,
  defaults: { hold: 0 },
  controls: [{ key: 'hold', kind: 'button', box: [CX - RING - 4, CY - RING - 4, 2 * RING + 8, 2 * RING + 8], label: 'Hold to unlock' } satisfies Control],
  layers: ctx => {
    const down = ctx.pressed === 'hold', p = ctx.pointers?.[0]
    const age = down ? (p?.tDown !== undefined && p.down ? ctx.t - p.tDown : ctx.t % HOLD) : 0
    const f = clamp01(age / HOLD), full = down && f >= 1, a = f * TAU
    const lit = disc.filter(([x, y]) => full || (down && clock(x, y) <= a)), dark = disc.filter(p2 => !lit.includes(p2))
    return [
      layer(T.dotRing(CX, CY, RING, { spacing: 4.4, size: 1.8 }), 'faint'),
      ...(down && !full ? [layer(T.dotRing(CX, CY, RING, { spacing: 4.4, size: 2.4, sweep: a }), 'idle')] : []),
      ...(full ? [layer(T.dotRing(CX, CY, RING, { spacing: 4.4, size: 2.8 }))] : []),
      layer(T.dots(dark, down ? 1.6 : 2), down ? 'faint' : 'mid'),
      layer(T.dots(lit, full ? 3.4 : 2.9)),
      ...(down && !full ? [layer(T.dotRing(CX, CY, RING + 6, { spacing: 4.4, size: 1.2, start: a - .3, sweep: .3 }), 'mid')] : []),
      layer(T.big(full ? 'UNLOCKED' : down ? 'HOLD' : 'PRESS AND HOLD', 72, 134, { lattice: 1.1, align: 'center' }), full ? 'value' : 'idle'),
    ]
  },
}

// ── 03 NOTIFY ───────────────────────────────────────────────────────────────
// A metaball: sum of r²/d² over two bodies, thresholded on a 3.6-cell dot lattice in three bands
// (core, skin, halo). Every 7 s a small drop is pinched off the big one, drifts out carrying the
// badge — the board's one red dot — then is drawn back in and merges.
const PERIOD = 7, PITCH = 3.6, BIG: Pt = [66, 62]
const lattice: Pt[] = []
for (let y = 16; y < 120; y += PITCH) for (let x = 6; x < 140; x += PITCH) lattice.push([x, y])
const away = (t: number) => { const tau = t % PERIOD; return tau < 1 ? 0 : tau < 2.6 ? ease.emphasized((tau - 1) / 1.6) : tau < 4.2 ? 1 : tau < 5.8 ? 1 - ease.emphasized((tau - 4.2) / 1.6) : 0 }
export const glyphNotify: WidgetPreset = {
  id: 'glyph-notify', name: 'Notify', label: '03  NOTIFY', group: 'composite', ...tile,
  layers: ({ t }) => {
    const s = away(t), wob = Math.sin(t * 2.1) * .5 * (1 - s)
    // the drop leaves down and to the right; the parent gives up some body as it goes
    const drop: Pt = [BIG[0] + 4 + s * 48, BIG[1] + 6 + s * 38], rBig = 21 - 3 * s + wob, rDrop = 7 + 2 * s
    const core: Pt[] = [], skin: Pt[] = [], halo: Pt[] = []
    for (const [x, y] of lattice) {
      const f = rBig ** 2 / ((x - BIG[0]) ** 2 + (y - BIG[1]) ** 2 + .01) + rDrop ** 2 / ((x - drop[0]) ** 2 + (y - drop[1]) ** 2 + .01)
      if (f >= 1.6) core.push([x, y]); else if (f >= 1) skin.push([x, y]); else if (f >= .62) halo.push([x, y])
    }
    return [
      layer(T.dots(halo, 1.2), 'faint'),
      layer(T.dots(skin, 2.2), 'mid'),
      layer(T.dots(core, 2.9)),
      ...(s > .85 ? [layer(T.dots([drop], 5.6), 'active')] : []),
      layer(T.big(s > .85 ? '1 NEW' : 'ALL CLEAR', 6, 132, { lattice: 1.1 }), s > .85 ? 'value' : 'idle'),
    ]
  },
}

// ── 04 IDLE ─────────────────────────────────────────────────────────────────
// A wallpaper that looks like a slow Turing pattern: two layered sines warp each other, the labyrinth
// is where their sum crosses zero, a little hash grain breaks the contour. Not a simulation.
const wall = (t: number, bright: number) => {
  const k = t * .32
  return (u: number, v: number) => {
    // three plane waves at 60 degrees (spots / labyrinth), each domain-warped by a slow sine of the others
    const x = u * 47 + Math.sin(v * 19 + k) * 1.6, y = v * 43 + Math.sin(u * 17 - k * .8) * 1.6
    const s = Math.cos(.62 * x + k) + Math.cos(.62 * (x * .5 + y * .866) - k * .7) + Math.cos(.62 * (x * -.5 + y * .866) + k * .5) + (hash01(Math.round(x), Math.round(y)) - .5) * .12
    const val = (s + 1.5) / 4.5
    return val >= bright ? val : 0
  }
}
const wallLayer = (field: (u: number, v: number) => number): LatticeField => ({ field, lattice: 3, origin: [0, 14] })
export const glyphIdle: WidgetPreset = {
  id: 'glyph-idle', name: 'Idle', label: '04  IDLE', group: 'scatter', ...tile,
  layers: ({ t }) => [layer(wallLayer(wall(t, .4)), 'faint'), layer(wallLayer(wall(t, .55)), 'idle'), layer(wallLayer(wall(t, .7)), 'value')],
}

export const glyphBoard: WidgetPreset[] = [glyphHourglass, glyphLongpress, glyphNotify, glyphIdle]
