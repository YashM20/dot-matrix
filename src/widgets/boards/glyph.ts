/**
 * Board — Glyph: lock-screen experiences in the Nothing-phone spirit. An hourglass clock whose
 * grains pour into the digits on each minute and trickle through the colon into a heap as the
 * seconds run, a padlock that unlocks behind a long-press radial reveal, a metaball inbox that buds
 * off a red count badge, and a Gray–Scott coral wallpaper on a round glyph matrix. Every card is a
 * pure function of the board clock `t`, the wall clock (hourglass) or the pointer's press time.
 * The board's only red is the notify badge.
 */
import { hash01 } from '../../engine/math'
import { ease } from '../../engine/motion'
import { grayScott, simAt } from '../../engine/sim'
import type { Control } from '../../engine/context'
import type { Layer } from '../../engine/types'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { dotText } from './henry'

const T = layoutFor(TILE)
type Pt = [number, number]
const tile = { chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
/** Site layer at a fixed dot value (press = one quantize step down). */
const at = (lf: LatticeField, v: number): LatticeField => (v === 1 ? lf : { ...lf, field: () => v })

// ── 01 HOURGLASS ────────────────────────────────────────────────────────────
// The time in the sheet's 6×8 numeral face, one big dot per grain (home-clock's face, centred so
// the colon sits on cell 72). On the minute the characters that change drain: their grains drop off
// the card, bottom rows first. New grains pour in from under the label and settle bottom-up, so the
// digits are whole again ~6 s into the minute. Then the colon is the neck of the glass: one grain
// a second falls from it and slides down the flanks of a 60-grain heap, which drains with the
// digits. Falls advance in whole lattice steps (dot-native), gravity on every grain.
// `ctx.since` (seconds into the minute) overrides the wall clock for films; `data.tilt` leans the stream.
const DIG = { px: 4.3, py: 4.8, size: 4.7 }, DX = 7.5, DY = 30
const COLS = [0, 7, 14, 18, 25]
const glyphSites = (s: string, k: number): Pt[] => dotText(s[k], DX + COLS[k] * DIG.px, DY, DIG).sites ?? []
const HEAP = { rows: [11, 10, 9, 8, 7, 6, 5, 4], px: 4.3, py: 4.1, y: 133, size: 3.2 }
const heapSlots: Pt[] = HEAP.rows.flatMap((n, j) => {
  const xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * HEAP.px)
  return xs.map((dx): [number, Pt] => [j + Math.abs(dx) / HEAP.px + dx * 1e-3, [72 + dx, HEAP.y - j * HEAP.py]])
}).sort((a, b) => a[0] - b[0]).map(e => e[1]) // cone order: every grain lands on the two below it
const NECK = DY + 6 * DIG.py, TRICKLE = { from: 2.4, every: .95 }
/** Distance fallen after τ s under gravity g, in whole `step`s; null before release. */
const fallen = (tau: number, g: number, step: number) => (tau < 0 ? null : Math.floor((.5 * g * tau * tau) / step) * step)
export const glyphHourglass: WidgetPreset = {
  id: 'glyph-hourglass', name: 'Hourglass', label: '01  HOURGLASS', group: 'text', ...tile, clock: true,
  defaults: { tilt: 0 },
  layers: ({ since, data }) => {
    const now = new Date(), sec = since ?? now.getSeconds() + now.getMilliseconds() / 1000
    const next = hhmm(now), prev = hhmm(new Date(+now - 60_000)), lean = Math.max(-1, Math.min(1, data.tilt ?? 0))
    const settled: Pt[] = [], falling: Pt[] = [], draining: Pt[] = []
    for (let k = 0; k < 5; k++) {
      const changed = prev[k] !== next[k], sites = glyphSites(next, k)
      if (!changed) { settled.push(...sites); continue }
      // old grains: bottom rows let go first, then fall off the bottom of the card
      glyphSites(prev, k).forEach(([x, y], i) => {
        const row = Math.round((y - DY) / DIG.py), d = fallen(sec - (7 - row) * .1 - hash01(i, k, 3) * .2, 190, DIG.py)
        if (d === null) draining.push([x, y]); else if (y + d < 150) draining.push([x, y + d])
      })
      // new grains: released bottom row first from just under the label, falling down their own column
      sites.forEach(([x, y], i) => {
        const row = Math.round((y - DY) / DIG.py), y0 = y - Math.ceil((y - 13) / DIG.py) * DIG.py
        const d = fallen(sec - 1.2 - (7 - row) * .55 - hash01(i, k, 11) * .45, 140, DIG.py)
        if (d === null) return
        if (y0 + d >= y) settled.push([x, y]); else falling.push([x, y0 + d])
      })
    }
    // the heap: grain j leaves the neck at TRICKLE.from + j·every, drops, then slides diagonally to its slot
    const heap: Pt[] = [], stream: Pt[] = [], drop = Math.min(1, sec / .9)
    heapSlots.forEach(([sx, sy], j) => {
      const tau = sec - TRICKLE.from - j * TRICKLE.every
      if (sec < 1.2) { heap.push([sx, sy + Math.floor(drop * drop * 18 / HEAP.py) * HEAP.py]); return } // last minute's heap drains
      if (tau < 0) return
      const n = Math.round(Math.abs(sx - 72) / (HEAP.px / 2)), top = sy - n * HEAP.py, x0 = 72 + Math.round(lean * 2) * HEAP.px / 2
      const d = fallen(tau, 120, HEAP.py)!, slide = Math.floor((tau - Math.sqrt((2 * (top - NECK)) / 120)) / .07)
      if (NECK + d < top) stream.push([x0, NECK + d])
      else if (slide < n) stream.push([x0 + Math.sign(sx - x0) * Math.max(0, slide) * HEAP.px / 2, top + Math.max(0, slide) * HEAP.py])
      else heap.push([sx, sy])
    })
    return [
      layer(T.dots(draining.filter(p => p[1] < 140), DIG.size), 'mid'),
      layer(T.dots(falling, DIG.size), 'idle'),
      layer(T.dots(settled, DIG.size)),
      layer(T.dots(heap, HEAP.size), 'idle'),
      layer(T.dots(stream, HEAP.size)),
    ]
  },
}

// ── 02 LONG PRESS ───────────────────────────────────────────────────────────
// A padlock on a dotted ring. Hold it: the ring fills clockwise from 12 o'clock (age = t - tDown of
// the pressing pointer; keyboard holds loop the same reveal), the lock drops one quantize step, and
// at HOLD s the ring closes, the shackle lifts and swings its left leg free: UNLOCKED. Hover lights the
// lock and haloes the ring, focus marches outside it (the components-board grammar, one ring each).
const HOLD = 1.6, CX = 72, CY = 72, RING = 50
const LP = .75, GLOW = { d: 3.5, v: .45 }, FOCUS = { d: 7, size: 1.3, on: 3, period: 5, rate: 10 }
const BODY = { x0: CX - 15, y0: CY - 4, cols: 11, rows: 9, pitch: 3, size: 2.5 }
const KEYHOLE: Pt[] = [[0, 2], [-1, 3], [0, 3], [1, 3], [0, 4], [0, 5]]
const lockBody: Pt[] = []
for (let r = 0; r < BODY.rows; r++) for (let c = 0; c < BODY.cols; c++) {
  const corner = (r === 0 || r === BODY.rows - 1) && (c === 0 || c === BODY.cols - 1)
  if (!corner && !KEYHOLE.some(([dc, dr]) => c === 5 + dc && r === dr)) lockBody.push([BODY.x0 + c * BODY.pitch, BODY.y0 + r * BODY.pitch])
}
/** Shackle: a semicircle over two legs, sites at equal arc length; `lift` raises it, `free` shortens the left leg. */
function shackle(lift: number, free: number): Pt[] {
  const r = 10.5, cx = CX, cy = BODY.y0 - 12 - lift, pts: Pt[] = [], sp = 3
  const n = Math.round((Math.PI * r) / sp)
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (Math.PI * i) / n; pts.push([cx + r * Math.sin(a), cy - r * Math.cos(a)]) }
  const legs = Math.floor((BODY.y0 - 2 - cy) / sp)
  for (let k = 1; k <= legs; k++) {
    pts.push([cx + r, cy + k * sp])
    if (k <= legs - free) pts.push([cx - r, cy + k * sp])
  }
  return pts
}
/** Rings share the track's site count, so halo and focus dots sit on the track's spokes (no moiré). */
const ring = (r: number, o: { size?: number; sweep?: number } = {}) => T.dotRing(CX, CY, r, { spacing: (4.4 * r) / RING, size: 1.6, ...o })
export const glyphLongpress: WidgetPreset = {
  id: 'glyph-longpress', name: 'Long Press', label: '02  LONG PRESS', group: 'composite', ...tile,
  style: { ...tileStyle, cornerRoundness: 0 },
  defaults: { hold: 0 },
  controls: [{ key: 'hold', kind: 'button', box: [CX - RING - 4, CY - RING - 4, 2 * RING + 8, 2 * RING + 8], label: 'Hold to unlock' } satisfies Control],
  layers: ctx => {
    const down = ctx.pressed === 'hold' || ctx.data.hold >= .5, p = ctx.pointers?.find(q => q.down && !q.up)
    const age = down ? (p ? ctx.t - p.tDown : ctx.t % (HOLD + 1.2)) : 0
    const f = clamp01(age / HOLD), open = down && f >= 1, u = open ? ease.emphasized(clamp01((age - HOLD) / .3)) : 0
    const v = down && !open ? LP : 1, a = f * TAU, lit = down || ctx.hover === 'hold'
    const out: Layer[] = [
      layer(ring(RING), down ? 'mid' : 'faint'),
      ...(down && f > 0 ? [layer(ring(RING, { size: 2.4, sweep: open ? TAU : a }), 'value')] : []),
      ...(down && !open && f > 0 ? [layer(T.dots([[CX + RING * Math.sin(a), CY - RING * Math.cos(a)]], 4.4), 'value')] : []),
      layer(at(T.dots(lockBody, BODY.size), v), lit ? 'value' : 'idle'),
      layer(at(T.dots(shackle(Math.round(u * 3) * 3, Math.round(u * 3)), 2.6), v), lit ? 'value' : 'idle'),
      layer(T.big(open ? 'UNLOCKED' : down ? `${Math.round(f * 100)}%` : 'HOLD TO UNLOCK', 72, 132, { lattice: 1.1, align: 'center' }), open ? 'value' : down ? 'value' : 'idle'),
    ]
    if (ctx.hover === 'hold' && !down) out.push(layer(at(ring(RING + GLOW.d), GLOW.v), 'value'))
    if (ctx.focus === 'hold') {
      const ph = Math.floor(ctx.t * FOCUS.rate), P = FOCUS.period, rr = ring(RING + FOCUS.d, { size: FOCUS.size })
      out.push(layer({ ...rr, sites: rr.sites!.filter((_, i) => (((i - ph) % P) + P) % P < FOCUS.on) }, 'idle'))
    }
    return out
  },
}

// ── 03 NOTIFY ───────────────────────────────────────────────────────────────
// A metaball inbox: Σ r²/d² over two bodies, thresholded on a 3.6-cell lattice into core, skin and
// halo. Every PERIOD s a bud pinches off the top-right of the body, and once it is free it turns
// into the badge — red sites (the board's one red: a *live* count) with the count in white 3×5
// numerals on the same lattice. Then it is drawn back in, read, and merges grey.
const PERIOD = 7, PITCH = 3.6, BIG: Pt = [58.8, 77.4], OFF: Pt = [41.4, -36]
const lattice: Pt[] = []
for (let y = 16.2; y < 122; y += PITCH) for (let x = 5.4; x < 140; x += PITCH) lattice.push([x, y])
const MINI: Record<string, string[]> = {
  '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['##.', '..#', '.#.', '#..', '###'], '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '##.', '..#', '##.'], '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '.#.', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '##.'],
}
const away = (t: number) => { const tau = t % PERIOD; return tau < 1 ? 0 : tau < 2.6 ? ease.emphasized((tau - 1) / 1.6) : tau < 4.6 ? 1 : tau < 6.2 ? 1 - ease.emphasized((tau - 4.6) / 1.6) : 0 }
const snap = (x: number) => Math.round(x / PITCH) * PITCH
export const glyphNotify: WidgetPreset = {
  id: 'glyph-notify', name: 'Notify', label: '03  NOTIFY', group: 'composite', ...tile,
  layers: ({ t }) => {
    const tt = t + 2.4, s = away(tt), wob = Math.sin(t * 2.1) * .6 * (1 - s), n = 2 + (Math.floor(tt / PERIOD) % 8) // stills land on the badge
    const drop: Pt = [BIG[0] + 8 + s * (OFF[0] - 8), BIG[1] - 8 + s * (OFF[1] + 8)], rBig = 24 - 2 * s + wob, rDrop = 8 + 8 * s
    const badge = s > .8, core: Pt[] = [], skin: Pt[] = [], halo: Pt[] = [], red: Pt[] = [], ink: Pt[] = []
    // the count's 3×5 cells, on lattice sites around the bud's nearest site
    const gx = snap(drop[0] + 2 - 5.4) + 5.4, gy = snap(drop[1] - 1 - 16.2) + 16.2, glyph = MINI[String(n)] // the free bud bulges away from the body
    const isInk = (x: number, y: number) => {
      const c = Math.round((x - gx) / PITCH) + 1, r = Math.round((y - gy) / PITCH) + 2
      return glyph[r]?.[c] === '#'
    }
    for (const [x, y] of lattice) {
      const fb = rBig ** 2 / ((x - BIG[0]) ** 2 + (y - BIG[1]) ** 2 + .01), fd = rDrop ** 2 / ((x - drop[0]) ** 2 + (y - drop[1]) ** 2 + .01), f = fb + fd
      if (badge && fd > fb && f >= 1) (isInk(x, y) ? ink : red).push([x, y])
      else if (f >= 1.6) core.push([x, y]); else if (f >= 1) skin.push([x, y]); else if (f >= .62) halo.push([x, y])
    }
    return [
      layer(T.dots(halo, 1.2), 'faint'),
      layer(T.dots(skin, 2.2), 'mid'),
      layer(T.dots(core, 2.9)),
      layer(T.dots(red, 2.6), 'active'),
      layer(T.dots(ink, 3.3)),
      layer(T.big(badge ? `${n} NEW` : 'ALL CLEAR', 6, 132, { lattice: 1.1 }), badge ? 'value' : 'idle'),
    ]
  },
}

// ── 04 IDLE ─────────────────────────────────────────────────────────────────
// Gray–Scott labyrinth (src/engine/sim) on a round 46-site glyph matrix: four seeds grow into a thin labyrinth
// that fills the disc, then it dims out and regrows. The sim is sampled at a bounded, looped time
// (lead + t·RATE mod LOOP), so a still is already a pattern and large t never replays far.
// V maps to four tone/size steps; the disc edge ramps one site.
const N = 46, K = 2.76, R = 63, OX = 72, OY = 78
const rd = grayScott({ w: N, h: N, feed: .037, kill: .06, du: .12, dv: .06, seed: 7, blobs: 6, sub: 8, every: 12 })
/** Sim seconds: LEAD of head start, then LOOP on repeat at RATE sim-s per board second (150 s per regrowth). */
const LEAD = 1, LOOP = 9, RATE = .06
const BANDS = [{ at: .3, size: 2.3, tone: 'value' }, { at: .22, size: 1.95, tone: 'idle' }, { at: .13, size: 1.5, tone: 'mid' }, { at: .06, size: 1, tone: 'faint' }] as const
export const glyphIdle: WidgetPreset = {
  id: 'glyph-idle', name: 'Idle', label: '04  IDLE', group: 'scatter', ...tile,
  layers: ({ t }) => {
    const ph = (((t * RATE + 3) % LOOP) + LOOP) % LOOP, g = simAt(rd, LEAD + ph)
    const fade = clamp01(2 * Math.min(ph, LOOP - ph)) // dims in over the first half sim-second, out over the last
    const bands: Pt[][] = BANDS.map(() => [])
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = OX + (i - (N - 1) / 2) * K, y = OY + (j - (N - 1) / 2) * K, edge = clamp01((R - Math.hypot(x - OX, y - OY)) / K)
      if (edge <= 0) continue
      const v = g[(j * N + i) * 2 + 1] * edge * fade, b = BANDS.findIndex(q => v >= q.at)
      if (b >= 0) bands[b].push([x, y])
    }
    return BANDS.map((q, b) => layer(T.dots(bands[b], q.size), q.tone))
  },
}

export const glyphBoard: WidgetPreset[] = [glyphHourglass, glyphLongpress, glyphNotify, glyphIdle]
