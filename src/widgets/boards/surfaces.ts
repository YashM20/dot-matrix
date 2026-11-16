/**
 * Board · SURFACES (P5). One timer, one shared time, three displays: the browser card itself, a Glyph
 * Matrix (25×25 round LED matrix) and a flip-disc sign (column-scanned discs with inertia). The e-ink
 * and plotter cards were retired (#364); their profiles and simulators stay in `src/engine/device` for MAKE.
 * Card labels keep their original numbers (01, 02, 04) so the remaining cards' pixels don't move.
 *
 * Every device card is `toDevice(timer, profile)` (`src/engine/device`) → that device's simulator →
 * dot sites. Tiny grids use the timer's curated `variants` (§3.9). All cards read board time `t + data.clockOffset`, and the
 * `clock` source keeps `clockOffset` in step across tabs over BroadcastChannel (`src/engine/clockSync`).
 * One red on the board: the browser timer's remaining arc (monochrome devices show it as full light).
 */
import { sharedClock } from '../../engine/clock'
import { browserChannel, createClockSync } from '../../engine/clockSync'
import {
  createFlipSim, DEVICES, ledGlow, toDevice,
  type DeviceProfile, type DeviceSpec,
} from '../../engine/device'
import { glyph } from '../../engine/fields/bitmapFont'
import { toCell } from '../../engine/layout'
import type { Field, GridConfig, Layer, Tone } from '../../engine/types'
import { createSource, type Source } from '../../data/source'
import { TAU, TILE, bounded, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { dotText } from './henry'
import { caption } from '../captions'

const T = layoutFor(TILE)
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true } as const
type Pt = [number, number]

// ── the timer: one minute, counting down, looping ───────────────────────────
export const TIMER_S = 60
/** Board time: the card's clock plus the cross-tab offset. */
const boardTime = (ctx: WidgetContext) => ctx.t + (ctx.data.clockOffset ?? 0)
export function timerAt(bt: number) {
  const phase = ((bt % TIMER_S) + TIMER_S) % TIMER_S, left = Math.ceil(TIMER_S - phase - 1e-9)
  return { left, remaining: (TIMER_S - phase) / TIMER_S, mm: Math.floor(left / 60), ss: left % 60 }
}
const clockText = (bt: number, pad = true) => { const { mm, ss } = timerAt(bt); return `${pad ? String(mm).padStart(2, '0') : mm}:${String(ss).padStart(2, '0')}` }

/** A field over the cells of `grid` (fn gets integer col/row). */
const cells = (grid: GridConfig, fn: (c: number, r: number) => number): Field =>
  bounded((u, v) => fn(toCell(u, grid.cols), toCell(v, grid.rows)), 0, 0, grid.cols - 1, grid.rows - 1)
/** Clockwise angle from 12 o'clock, 0..TAU. */
const clockAngle = (dx: number, dy: number) => ((Math.atan2(dx, -dy) % TAU) + TAU) % TAU

// 3×5 digits for the 25×25 matrix (5×7 from the system font for the flip-disc)
const D3: Record<string, string[]> = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '..#', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '###'], ':': ['.', '#', '.', '#', '.'],
}
const D5 = (ch: string) => (ch === ':' ? ['.', '.', '#', '.', '#', '.', '.'] : glyph(ch).map(row => row.map(b => (b ? '#' : '.')).join('')))
/** Rows of a string set in `font`, glyphs one blank column apart. */
const setText = (str: string, font: (ch: string) => string[]) => {
  const gs = [...str].map(font), h = gs[0].length
  return Array.from({ length: h }, (_, r) => gs.map(g => g[r]).join('.'))
}
const spriteCells = (rows: string[], col: number, row: number) => (c: number, r: number) => (rows[r - row]?.[c - col] === '#' ? 1 : 0)

const G25: GridConfig = { cols: 25, rows: 25 }, F28: GridConfig = { cols: 28, rows: 14 }

/** The one timer every surface shows: authored on TILE, with curated layouts for the 25×25 and 28×14 grids. */
export const timerSpec: DeviceSpec = {
  grid: TILE, style: tileStyle,
  layers: ctx => {
    const bt = boardTime(ctx), ring = { spacing: (TAU * 60) / 104, size: 3.1 }
    return [
      layer(T.dotRing(72, 78, 60, ring), 'mid'),
      layer(T.dotRing(72, 78, 60, { ...ring, sweep: TAU * timerAt(bt).remaining - 1e-6 }), 'active'),
      layer(dotText(clockText(bt), 72, 62, { px: 2.9, py: 3.4, size: 3.2, align: 'center' })),
      layer(T.dotRing(72, 119, 14.5, { spacing: 1.8, size: .75 }), 'idle'),
      // stop: a full 5 × 5 square of big dots, as on the MICRO UI timer
      layer(T.fillOn(2, () => true, [67.5, 114.5, 76.5, 123.5]), 'idle'),
    ]
  },
  variants: {
    // Glyph Matrix: a two-LED ring at the rim (remaining = full, spent = dim track), M:SS in 3×5
    '25x25': {
      layers: ctx => {
        const bt = boardTime(ctx), sweep = TAU * timerAt(bt).remaining, digits = setText(clockText(bt, false), ch => D3[ch])
        const w = digits[0].length, txt = spriteCells(digits, Math.floor((25 - w) / 2), 10)
        return [
          { field: cells(G25, (c, r) => { const d = Math.hypot(c - 12, r - 12); return d >= 11.1 && d <= 12.5 ? (clockAngle(c - 12, r - 12) <= sweep ? 1 : .07) : 0 }), tone: 'value' },
          { field: cells(G25, txt), tone: 'value' },
        ]
      },
    },
    // Flip-disc: M:SS in 5×7, a two-row bar of the time left over a dotted rail of the time spent
    '28x14': {
      layers: ctx => {
        const bt = boardTime(ctx), lit = Math.round(28 * timerAt(bt).remaining), digits = setText(clockText(bt, false), D5)
        const txt = spriteCells(digits, Math.floor((28 - digits[0].length) / 2), 2)
        return [{ field: cells(F28, (c, r) => txt(c, r) || (r === 11 || r === 12 ? (c < lit ? 1 : r === 12 && c % 2 === 0 ? 1 : 0) : 0)), tone: 'value' }]
      },
    },
  },
}
/** The frame a device is sent at its refresh k (board time k / refresh). */
const frameAt = (profile: DeviceProfile) => (k: number) => toDevice(timerSpec, profile, { ctx: { t: k / (profile.refresh || 1), data: {} } })

/** Chrome shared by the device cards: the device grid, right-aligned in the label row. */
const spec = (s: string): Layer => caption(s)
/** The device housing: a dotted faint outline (sites every 2 cells). */
const bezel = (x0: number, y0: number, x1: number, y1: number): Layer => {
  const sites: Pt[] = []
  for (let x = x0; x <= x1 + 1e-9; x += 2) sites.push([x, y0], [x, y1])
  for (let y = y0 + 2; y < y1 - 1e-9; y += 2) sites.push([x0, y], [x1, y])
  return { field: () => 1, sites, size: 1, tone: 'faint' }
}
/** A dot-site layer per (tone, size) band. */
function bands(list: { at: Pt; tone: Tone; size: number }[]): Layer[] {
  const groups = new Map<string, { tone: Tone; size: number; sites: Pt[] }>()
  for (const d of list) {
    const key = `${d.tone}|${d.size}`
    let g = groups.get(key)
    if (!g) groups.set(key, (g = { tone: d.tone, size: d.size, sites: [] }))
    g.sites.push(d.at)
  }
  return [...groups.values()].map(g => ({ field: () => 1, sites: g.sites, size: g.size, tone: g.tone }))
}

// ── 01 BROWSER: the card itself ─────────────────────────────────────────────
export const surfaceBrowser: WidgetPreset = {
  id: 'surface-browser', name: 'Surface Browser', label: '01  BROWSER', ...tile, defaults: { clockOffset: 0 },
  layers: ctx => [spec('144X144'), ...timerSpec.layers(ctx)],
}

// ── 02 GLYPH MATRIX: 489 LEDs behind a round window ─────────────────────────
const GLYPH = DEVICES['glyph-matrix-25'], GP = 5.2, GX = 72 - 12 * GP, GY = 76 - 12 * GP
export const surfaceGlyph: WidgetPreset = {
  id: 'surface-glyph', name: 'Surface Glyph Matrix', label: '02  GLYPH MATRIX', ...tile, defaults: { clockOffset: 0 },
  credit: { by: ['Nothing'], title: 'Glyph Matrix Developer Kit', source: 'https://github.com/Nothing-Developer-Programme/GlyphMatrix-Developer-Kit', note: 'the 25 × 25 round LED matrix this simulates' },
  layers: ctx => {
    const f = toDevice(timerSpec, GLYPH, { ctx: { t: boardTime(ctx), data: {} } }), { lit, halo } = ledGlow(f, GLYPH.physics)
    const leds: { at: Pt; tone: Tone; size: number }[] = []
    for (let r = 0; r < 25; r++) for (let c = 0; c < 25; c++) {
      const i = r * 25 + c, L = lit[i], at: Pt = [GX + c * GP, GY + r * GP]
      if (L < 0) continue
      // the LED itself in brightness bands; an unlit LED shows its lens, brighter where a neighbour's bloom lands
      if (L >= .8) leds.push({ at, tone: 'value', size: 4.7 })
      else if (L >= .45) leds.push({ at, tone: 'idle', size: 4.3 })
      else if (L > 0) leds.push({ at, tone: 'mid', size: 3.6 })
      else if (halo[i] >= .3) leds.push({ at, tone: 'mid', size: 1.9 })
      else leds.push({ at, tone: 'faint', size: halo[i] >= .15 ? 1.9 : 1.3 })
    }
    return [spec('25X25'), ...bands(leds)]
  },
}

// ── 04 FLIP-DISC: 28×14 discs, column-scanned, with inertia ──────────────────
const FLIP = DEVICES['flipdisc-28x14'], FP = 5, FX = 72 - 13.5 * FP, FY = 36
export const flip = createFlipSim(frameAt(FLIP), FLIP.physics, FLIP.refresh)
export const surfaceFlipdisc: WidgetPreset = {
  id: 'surface-flipdisc', name: 'Surface Flip-disc', label: '04  FLIP-DISC', ...tile, defaults: { clockOffset: 0 },
  layers: ctx => {
    const bt = boardTime(ctx), view = flip.at(bt), discs: { at: Pt; tone: Tone; size: number }[] = []
    for (let r = 0; r < 14; r++) for (let c = 0; c < 28; c++) {
      const i = r * 28 + c, w = view.tilt[i], on = view.face[i] === 1
      // apparent width |cos θ| in four steps: flat, turned, steep, edge-on
      const size = w >= .85 ? 4.3 : w >= .55 ? 3.3 : w >= .25 ? 2.2 : 1
      discs.push({ at: [FX + c * FP, FY + r * FP], tone: on ? 'value' : w < .85 ? 'mid' : 'faint', size: on || w < .85 ? size : 3.9 })
    }
    const evs = flip.events(Math.floor(bt), Math.floor(bt) + 1).filter(e => e.t <= bt), col = evs.length ? evs[evs.length - 1].col : -1
    const flips = evs.reduce((s, e) => s + e.count, 0)
    return [
      spec('28X14'),
      bezel(FX - 4, FY - 4, FX + 27 * FP + 4, FY + 13 * FP + 4),
      ...bands(discs),
      // the status row sits on the plotter card's bottom row (134): the same margin to the card edge across the board
      layer(T.text(view.moving ? `SCAN COL ${String(col + 1).padStart(2, '0')}` : 'HOLD', 0, 134), view.moving ? 'value' : 'idle'),
      layer(T.text(`${String(flips).padStart(3, '0')} FLIPS`, 143 - 2, 134, { align: 'right' }), 'mid'),
    ]
  },
}

// ── clock sync ──────────────────────────────────────────────────────────────
/**
 * `clockOffset` for every card: board time = master clock + offset, the same in every tab (see
 * `createClockSync`). Re-emitted when a peer with an earlier epoch is heard, on visibility changes and
 * every 2 s if it drifted > 20 ms.
 */
export const clockSource: Source<number> = createSource<number>({
  id: 'surfaces-clock', fixture: { clockOffset: 0 }, statusKey: 'clockSync', cacheMaxAgeMs: 0,
  map: offset => ({ clockOffset: offset }),
  transports: [{
    kind: 'push',
    open(link) {
      const clock = sharedClock(), sync = createClockSync({ time: () => clock.time(), now: () => link.env.now(), channel: browserChannel() })
      let last = NaN, timer: unknown = null
      const emit = () => { const o = sync.offset(); if (!(Math.abs(o - last) < .02)) { last = o; link.emit(o) } }
      const tick = () => { emit(); timer = link.env.setTimeout(tick, 2000) }
      const off = sync.onChange(emit)
      tick()
      return {
        close() { off(); sync.close(); if (timer !== null) link.env.clearTimeout(timer) },
        pause() { if (timer !== null) link.env.clearTimeout(timer); timer = null },
        resume() { if (timer === null) tick() },
      }
    },
  }],
})
export const surfacesSources = [clockSource]
export const surfacesBoard: WidgetPreset[] = [surfaceBrowser, surfaceGlyph, surfaceFlipdisc]
