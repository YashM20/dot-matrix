/**
 * Board · SURFACES — "One Field, Five Surfaces" (P5). One timer, one shared time, five displays:
 * the browser card itself, a Glyph Matrix (25×25 round LED matrix), a TRMNL e-ink panel (1-bit
 * blue-noise dither, partial refreshes that ghost, a full refresh that flashes), a flip-disc sign
 * (column-scanned discs with inertia) and a pen plotter (dots → pen strokes, plotted over time).
 *
 * Every device card is `toDevice(timer, profile)` (`src/engine/device`) → that device's simulator →
 * dot sites. Tiny grids use the timer's curated `variants` (§3.9); the e-ink and plotter resample the
 * authored TILE card area-weighted. All cards read board time `t + data.clockOffset`, and the
 * `clock` source keeps `clockOffset` in step across tabs over BroadcastChannel (`src/engine/clockSync`).
 * One red on the board: the browser timer's remaining arc (monochrome devices show it as full light).
 */
import { sharedClock } from '../../engine/clock'
import { browserChannel, createClockSync } from '../../engine/clockSync'
import {
  createEinkSim, createFlipSim, DEVICES, ledGlow, plotAt, plotPaths, previewProfile, toDevice,
  type DeviceProfile, type DeviceSpec, type PlotPlan,
} from '../../engine/device'
import { glyph } from '../../engine/fields/bitmapFont'
import { toCell } from '../../engine/layout'
import type { Field, GridConfig, Layer, Tone } from '../../engine/types'
import { createSource, type Source } from '../../data/source'
import { clackEnabled, createClack } from '../../media/clack'
import { TAU, TILE, bounded, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { dotText } from './henry'

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
      layer(T.dots([[69.5, 116.5], [74.5, 116.5], [69.5, 121.5], [74.5, 121.5]], 3.4), 'idle'),
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
const spec = (s: string): Layer => layer(T.text(s, 143, 0, { align: 'right' }), 'faint')
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

// ── 03 E-INK: TRMNL 800×480, shown at 1/6 (133×80 pixels, one per card cell) ──
const EINK = previewProfile(DEVICES['trmnl-800x480'], 1 / 6), EX = 5, EY = 24
const eink = createEinkSim(frameAt(EINK), DEVICES['trmnl-800x480'].physics, EINK.refresh)
export const surfaceEink: WidgetPreset = {
  id: 'surface-eink', name: 'Surface E-ink', label: '03  E-INK', ...tile, defaults: { clockOffset: 0 },
  layers: ctx => {
    const bt = boardTime(ctx), view = eink.at(bt), { cols, rows } = EINK, ink = view.ink
    const px = (c: number, r: number) => { const x = c - EX, y = r - EY; return x < 0 || y < 0 || x >= cols || y >= rows ? -1 : ink[y * cols + x] }
    // paper is the lit dot (e-ink grey, never white); ink is the hole; a ghost darkens the paper a step
    const panel: Layer = {
      field: bounded((u, v) => { const k = px(toCell(u, 144), toCell(v, 144)); return k < 0 || k >= .8 ? 0 : k >= .4 ? .5 : k >= .12 ? .75 : 1 }, EX, EY, EX + cols - 1, EY + rows - 1),
      toneOf: value => (value >= 1 ? 'idle' : value >= .75 ? 'mid' : 'faint'),
    }
    const k = view.k, cyc = ((k % 10) + 10) % 10, every = DEVICES['trmnl-800x480'].physics.fullEvery
    const status = view.phase === 'full' ? 'FULL REFRESH' : view.phase === 'partial' ? `PARTIAL ${String(cyc).padStart(2, '0')}/${every}` : `IDLE ${String(cyc).padStart(2, '0')}/${every}`
    let ghosts = 0; for (let i = 0; i < ink.length; i++) if (ink[i] >= .12 && ink[i] < .8) ghosts++
    return [
      spec('800X480'),
      bezel(EX - 3, EY - 3, EX + cols + 2, EY + rows + 2),
      panel,
      layer(T.text(status, EX - 3, 118), view.phase === 'full' ? 'value' : 'idle'),
      layer(T.text(`GHOST ${String(Math.min(999, ghosts)).padStart(3, '0')} PX`, 143 - 2, 118, { align: 'right' }), 'faint'),
      layer(T.text('1-BIT BLUE NOISE', EX - 3, 130), 'faint'),
    ]
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
      layer(T.text(view.moving ? `SCAN COL ${String(col + 1).padStart(2, '0')}` : 'HOLD', 0, 118), view.moving ? 'value' : 'idle'),
      layer(T.text(`${String(flips).padStart(3, '0')} FLIPS`, 143 - 2, 118, { align: 'right' }), 'faint'),
      layer(T.text('CLACK MUTED', 0, 130), 'faint'),
    ]
  },
}

// ── 05 PLOTTER: the timer as pen strokes, one sheet every 20 s ───────────────
const PLOT = DEVICES.plotter, SHEET_S = 20, PP = 2.5, PX = 72 - 23.5 * PP, PY = 14
const plans = new Map<number, PlotPlan>()
const planOf = (sheet: number) => {
  let p = plans.get(sheet)
  if (!p) { p = plotPaths(toDevice(timerSpec, PLOT, { ctx: { t: sheet * SHEET_S, data: {} } }), PLOT.physics); plans.set(sheet, p); if (plans.size > 4) plans.delete(plans.keys().next().value!) }
  return p
}
export const surfacePlotter: WidgetPreset = {
  id: 'surface-plotter', name: 'Surface Plotter', label: '05  PLOTTER', ...tile, defaults: { clockOffset: 0 },
  layers: ctx => {
    const bt = boardTime(ctx), sheet = Math.floor(bt / SHEET_S), plan = planOf(sheet), tau = bt - sheet * SHEET_S, st = plotAt(plan, tau)
    const at = (x: number, y: number): Pt => [PX + (x - .5) * PP, PY + (y - .5) * PP]
    const marks: { at: Pt; tone: Tone; size: number }[] = []
    plan.strokes.forEach((s, i) => {
      const k = s.loops.length, full = k === 1 ? 1.3 : k === 2 ? 2.1 : 2.8
      // plotted ink (k loops = a heavier mark), the stroke under the pen growing, the rest planned in faint
      if (i < st.done) marks.push({ at: at(s.col + .5, s.row + .5), tone: 'value', size: full })
      else if (i === st.done && st.partial > 0) marks.push({ at: at(s.col + .5, s.row + .5), tone: 'value', size: st.partial > .5 ? full : 1.3 })
      else marks.push({ at: at(s.col + .5, s.row + .5), tone: 'mid', size: .8 })
    })
    const [hx, hy] = at(st.head[0], st.head[1]), next = plan.strokes[st.done]
    const pct = Math.min(100, Math.floor((st.done / Math.max(1, plan.strokes.length)) * 100))
    return [
      spec('A6 PEN'),
      ...bands(marks),
      ...(next && !st.down ? [layer(T.dotLine(hx, hy, ...at(next.col + .5, next.row + .5), { spacing: 2, size: .7 }), 'mid')] : []),
      layer(T.dotRing(hx, hy, 2.6, { spacing: 1.4, size: .7 }), 'idle'),
      layer(T.text(`SHEET ${String(sheet + 1).padStart(2, '0')}`, PX - 1.25, 134), 'idle'),
      layer(T.text(`${String(pct).padStart(3, ' ')}%`, 143 - 2, 134, { align: 'right' }), pct >= 100 ? 'value' : 'faint'),
    ]
  },
}

// ── clock sync (and the optional clack) ─────────────────────────────────────
/**
 * `clockOffset` for every card: board time = master clock + offset, the same in every tab (see
 * `createClockSync`). Re-emitted when a peer with an earlier epoch is heard, on visibility changes and
 * every 2 s if it drifted > 20 ms. With `?clack=1` the flip-disc's column writes also tick.
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
      // flip-disc clack, muted unless asked for
      const clack = clackEnabled() ? createClack() : null
      let prev = NaN
      const sub = { fps: 60, onFrame: (t: number) => {
        const bt = t + sync.offset()
        if (clack && bt > prev && bt - prev < .5) for (const e of flip.events(prev, bt)) clack.play(e.t - bt, e.count)
        prev = bt
      } }
      const unsub = clack ? clock.subscribe(sub) : () => {}
      return {
        close() { off(); sync.close(); unsub(); clack?.close(); if (timer !== null) link.env.clearTimeout(timer) },
        pause() { if (timer !== null) link.env.clearTimeout(timer); timer = null },
        resume() { if (timer === null) tick() },
      }
    },
  }],
})
export const surfacesSources = [clockSource]
export const surfacesBoard: WidgetPreset[] = [surfaceBrowser, surfaceGlyph, surfaceEink, surfaceFlipdisc, surfacePlotter]
