/**
 * Board 8 — primitive components strip (bottom row of public/images/henry-example-interface-system.png):
 * TOGGLE / PILL / SLIDER / ICON BUTTON / STATUS DOT. TILE cards (144×144): outlines are dotted
 * stadiums and rings of fine dot sites, knobs and status dots are single big sites, button text
 * sits on a 1.3 lattice. Red (`active`) is the board's one accent: the destructive pill, the
 * second slider and the live status dot.
 */
import type { Control } from '../../engine/context'
import { clamp } from '../../engine/math'
import type { Layer, Tone } from '../../engine/types'
import { TAU, TILE, dim, layer, layoutFor, tileStyle, type LatticeField, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
/** Knobs and status dots are true circles at this size, so roundness drops to 0 (n = 2). */
const style = { ...tileStyle, cornerRoundness: 0 }
const BODY = { lattice: 1.3 }
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
const outline = (x: number, y: number, w: number, h: number) => T.dots(stadium(x, y, w, h, OUTLINE.spacing), OUTLINE.size)

// ── TOGGLE ──────────────────────────────────────────────────────────────────
const TRACK = { x: 22, w: 100, h: 46 }
const toggle = (top: number, on: boolean) => {
  const r = TRACK.h / 2, knob: Pt = [on ? TRACK.x + TRACK.w - r : TRACK.x + r, top + r]
  const tone: Tone = on ? 'value' : 'mid'
  return [layer(outline(TRACK.x, top, TRACK.w, TRACK.h), tone), layer(T.dots([knob], 30), tone)]
}
export const toggleCard: WidgetPreset = {
  id: 'ui-toggle', name: 'Toggle', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { on: 1 },
  controls: [{ key: 'on', kind: 'toggle', box: [TRACK.x, 28, TRACK.w, TRACK.h], label: 'Toggle' }],
  // the top switch follows `on`; the bottom one always shows the opposite state
  layers: ctx => [
    ...toggle(28, ctx.data.on >= .5), ...toggle(86, ctx.data.on < .5),
    ...states(ui(ctx, 'on'), ctx.t, rr(TRACK.x, 28, TRACK.w, TRACK.h, TRACK.h / 2)),
  ],
}

// ── PILL ────────────────────────────────────────────────────────────────────
const PILL = { x: 6, w: 132, h: 34 }
const pill = (top: number, text: string, tone: Tone, textTone: Tone) => [
  layer(outline(PILL.x, top, PILL.w, PILL.h), tone),
  layer(T.big(text, 72, top + PILL.h / 2 - 4.2, { ...BODY, align: 'center' }), textTone),
]
export const pillCard: WidgetPreset = {
  id: 'ui-pill', name: 'Pill', group: 'composite', chrome: 'dots', grid: TILE, style,
  layers: () => [...pill(34, 'ACTION', 'value', 'idle'), ...pill(88, 'DESTRUCTIVE', 'active', 'active')],
}

// ── SLIDER ──────────────────────────────────────────────────────────────────
const RAIL = { x0: 6, x1: 138, spacing: 4.4, size: 2.1, knob: 18, gap: 11 }
/** Dotted rail with a knob at `value`; the filled side takes `fill`, the rest stays dim. */
const slider = (y: number, value: number, fill: Tone, knobTone: Tone) => {
  const span = RAIL.x1 - RAIL.x0, n = Math.round(span / RAIL.spacing), step = span / n
  const at = Math.round(Math.max(0, Math.min(1, value)) * n), kx = RAIL.x0 + at * step
  const left: Pt[] = [], right: Pt[] = []
  for (let i = 0; i <= n; i++) { const x = RAIL.x0 + i * step; if (Math.abs(x - kx) >= RAIL.gap) (x < kx ? left : right).push([x, y]) }
  return [layer(T.dots(left, RAIL.size), fill), layer(T.dots(right, RAIL.size), 'mid'), layer(T.dots([[kx, y]], RAIL.knob), knobTone)]
}
export const sliderCard: WidgetPreset = {
  id: 'ui-slider', name: 'Slider', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { value: .55, level: .4 },
  // P2-A test hook: both rails are draggable (detents match the 30 rail dots)
  controls: [
    { key: 'value', kind: 'slider', box: [RAIL.x0, 51 - RAIL.knob / 2, RAIL.x1 - RAIL.x0, RAIL.knob], step: 1 / 30, label: 'Value' },
    { key: 'level', kind: 'slider', box: [RAIL.x0, 105 - RAIL.knob / 2, RAIL.x1 - RAIL.x0, RAIL.knob], step: 1 / 30, label: 'Level' },
  ],
  layers: ctx => {
    const ring = (y: number) => rr(RAIL.x0 + 2, y - 6, RAIL.x1 - RAIL.x0 - 4, 12, 6)
    return [
      ...slider(51, ctx.data.value, 'idle', 'value'), ...slider(105, ctx.data.level, 'active', 'active'),
      ...states(ui(ctx, 'value'), ctx.t, ring(51), ring(51), 4), ...states(ui(ctx, 'level'), ctx.t, ring(105), ring(105), 4),
    ]
  },
}

// ── ICON BUTTON ─────────────────────────────────────────────────────────────
const BTN = { y: 76, r: 21, xs: [24, 72, 120] }
/** Heart outline: the classic parametric curve (~19 cells wide), resampled to dot sites `spacing` cells apart. */
const heart = (cx: number, cy: number, s = .58, spacing = 1.2): Pt[] => {
  const curve: Pt[] = Array.from({ length: 721 }, (_, i) => {
    const t = (i / 720) * TAU
    return [cx + s * 16 * Math.sin(t) ** 3, cy - s * (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) - 1]
  })
  const sites: Pt[] = [curve[0]]; let acc = 0
  for (let i = 1; i < curve.length; i++) {
    acc += Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1])
    if (acc >= spacing) { sites.push(curve[i]); acc = 0 }
  }
  return sites
}
export const iconButtonCard: WidgetPreset = {
  id: 'ui-icon-button', name: 'Icon Button', group: 'icon', chrome: 'dots', grid: TILE, style,
  layers: () => {
    const [a, b, c] = BTN.xs, y = BTN.y
    return [
      ...BTN.xs.map(x => layer(T.dotRing(x, y, BTN.r, { spacing: 2.6, size: 1.3 }), 'value')),
      layer(T.hrule(a - 8, y, 17)), layer(T.vrule(a, y - 8, 17)),
      layer(T.dots(heart(b, y), 1.1)),
      layer(T.dots([[c - 6, y], [c, y], [c + 6, y]], 3.4)),
    ]
  },
}

// ── STATUS DOT ──────────────────────────────────────────────────────────────
export const statusDotCard: WidgetPreset = {
  id: 'ui-status-dot', name: 'Status Dot', group: 'icon', chrome: 'dots', grid: TILE, style,
  layers: () => [
    layer(T.dots([[24, 76]], 18), 'active'),
    layer(T.dotRing(72, 76, 7, { spacing: 1.2, size: 1.4 }), 'value'),
    layer(T.dots([[120, 76]], 18), 'mid'),
  ],
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTS v2 (P2): interactive cards in the same vocabulary. Each declares `controls` (hit
// boxes in card cells bound to data keys) and is a pure function of ctx: `data`, `hover`,
// `pressed`, `focus` and `t`. Interaction grammar:
//   hover — a two-step glow halo just outside the control, in `value` at low values (never red);
//   press — the control's own dots drop one quantize step (PRESS: dimmer and smaller);
//   focus — marching dots on an outline around the control, phase advancing with `t`;
//   red   — only the one live element of a card (caret, progress head, spinner head).
// ════════════════════════════════════════════════════════════════════════════

type Ctx = WidgetContext
/** One quantize step down at quantizeSteps 5 (1 → .75). */
const PRESS = .75
interface UiState { hover: boolean; pressed: boolean; focus: boolean }
const ui = (ctx: Ctx, key: string): UiState => ({ hover: ctx.hover === key, pressed: ctx.pressed === key, focus: ctx.focus === key })
/** Site layer drawn at value `v` (press = PRESS). */
const at = (lf: LatticeField, v: number): LatticeField => (v === 1 ? lf : { ...lf, field: () => v })
/** Text / lattice layer scaled by `v`. */
const dimmed = (lf: LatticeField, v: number): LatticeField => (v === 1 ? lf : { ...lf, field: dim(lf.field, v) })
const int = (x: number, lo: number, hi: number) => Math.round(clamp(Number.isFinite(x) ? x : lo, lo, hi))
const frac = (x: number) => x - Math.floor(x)

/** Evenly spaced dot sites around a rounded rectangle (corner radius r; r = h/2 is a stadium, w = h = 2r a circle). */
function rrect(x: number, y: number, w: number, h: number, r: number, spacing: number): Pt[] {
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
type Shape = (d: number, spacing: number) => Pt[]
const rr = (x: number, y: number, w: number, h: number, r: number): Shape => (d, sp) => rrect(x - d, y - d, w + 2 * d, h + 2 * d, r + d, sp)
const circle = (cx: number, cy: number, r: number): Shape => rr(cx - r, cy - r, 2 * r, 2 * r, r)

/** Hover glow: two halo outlines fading outward. */
const GLOW = [{ d: 2.6, v: .5 }, { d: 5.2, v: .25 }]
/** Focus: `on` of every `period` sites lit, marching `rate` sites per second, `d` cells outside the control. */
const FOCUS = { d: 7, spacing: 2.4, size: 1.3, on: 3, period: 5, rate: 10 }
const glow = (shape: Shape): Layer[] => GLOW.map(g => layer(at(T.dots(shape(g.d, OUTLINE.spacing), OUTLINE.size), g.v), 'value'))
const marching = (shape: Shape, t: number, d = FOCUS.d): Layer => {
  const ph = Math.floor(t * FOCUS.rate), P = FOCUS.period
  return layer(T.dots(shape(d, FOCUS.spacing).filter((_, i) => (((i - ph) % P) + P) % P < FOCUS.on), FOCUS.size), 'idle')
}
/** Hover glow around `hover`, marching focus ring around `focus` (defaults to the same outline). */
const states = (s: UiState, t: number, hover: Shape, focus: Shape = hover, focusD = FOCUS.d): Layer[] =>
  [...(s.hover ? glow(hover) : []), ...(s.focus ? [marching(focus, t, focusD)] : [])]
/** Primary pointer (card cells), when the input layer provides one. */
const ptr = (ctx: Ctx) => ctx.pointers?.find(q => !q.up)

// ── SEGMENTED ───────────────────────────────────────────────────────────────
/** A three-stop switch: the toggle's track and knob, mid detents at the free stops, labels below. */
const SEG = { x: 6, y: 44, w: 132, h: 40, knob: 30, labels: ['LOW', 'MID', 'HIGH'] }
const segX = (i: number) => SEG.x + SEG.h / 2 + (i * (SEG.w - SEG.h)) / 2
export const segmentedCard: WidgetPreset = {
  id: 'ui-segmented', name: 'Segmented', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { seg: 1 },
  controls: [{ key: 'seg', kind: 'segmented', options: 3, optionLabels: SEG.labels, box: [SEG.x, SEG.y, SEG.w, SEG.h + 28], label: 'Fan speed' }],
  layers: ctx => {
    const s = ui(ctx, 'seg'), sel = int(ctx.data.seg, 0, 2), cy = SEG.y + SEG.h / 2, track = rr(SEG.x, SEG.y, SEG.w, SEG.h, SEG.h / 2)
    return [
      layer(T.dots(track(0, OUTLINE.spacing), OUTLINE.size), 'mid'),
      layer(T.dots([0, 1, 2].filter(i => i !== sel).map((i): Pt => [segX(i), cy]), 4), 'mid'),
      layer(at(T.dots([[segX(sel), cy]], SEG.knob), s.pressed ? PRESS : 1), 'value'),
      ...SEG.labels.map((l, i) => layer(T.big(l, segX(i), SEG.y + SEG.h + 14, { ...BODY, align: 'center' }), i === sel ? 'value' : 'mid')),
      ...states(s, ctx.t, track),
    ]
  },
}

// ── STEPPED SLIDER ──────────────────────────────────────────────────────────
/** Slider with 9 detents: big detent dots, fine dots between, the value as the hero above. */
const DET = { x0: 12, x1: 132, y: 100, n: 8, sub: 4, knob: 18, gap: 10 }
export const steppedSliderCard: WidgetPreset = {
  id: 'ui-stepped-slider', name: 'Stepped Slider', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { step: .625 },
  controls: [{ key: 'step', kind: 'slider', step: 1 / DET.n, box: [DET.x0 - 8, DET.y - 12, DET.x1 - DET.x0 + 16, 24], label: 'Level' }],
  layers: ctx => {
    const s = ui(ctx, 'step'), k = int(ctx.data.step * DET.n, 0, DET.n), pitch = (DET.x1 - DET.x0) / (DET.n * DET.sub), kx = DET.x0 + k * DET.sub * pitch
    const fine: Pt[][] = [[], []], det: Pt[][] = [[], []]
    for (let i = 0; i <= DET.n * DET.sub; i++) {
      const x = DET.x0 + i * pitch
      if (Math.abs(x - kx) >= DET.gap) (i % DET.sub ? fine : det)[x < kx ? 0 : 1].push([x, DET.y])
    }
    return [
      layer(T.big(String(k), 72, 34, { lattice: 2.5, smooth: true, align: 'center' }), 'value'),
      layer(T.dots(fine[0], 1.5), 'idle'), layer(T.dots(fine[1], 1.5), 'faint'),
      layer(T.dots(det[0], 3.4), 'idle'), layer(T.dots(det[1], 3.4), 'mid'),
      layer(at(T.dots([[kx, DET.y]], DET.knob), s.pressed ? PRESS : 1), 'value'),
      ...[0, DET.n / 2, DET.n].map(i => layer(T.text(String(i), DET.x0 + i * DET.sub * pitch, DET.y + 12, { align: 'center' }), 'mid')),
      ...states(s, ctx.t, circle(kx, DET.y, 7.5)),
    ]
  },
}

// ── KNOB ────────────────────────────────────────────────────────────────────
/** 270° dotted track with the value arc on its sites, one huge site as the knob, readout in the gap. */
const KNOB = { cx: 72, cy: 78, r: 46, body: 50, bodyR: 21, start: (TAU * 5) / 8, sweep: (TAU * 3) / 4 }
export const knobCard: WidgetPreset = {
  id: 'ui-knob', name: 'Knob', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { gain: .64 },
  controls: [{ key: 'gain', kind: 'knob', box: [KNOB.cx - KNOB.r - 4, KNOB.cy - KNOB.r - 4, 2 * KNOB.r + 8, 2 * KNOB.r + 8], label: 'Gain' }],
  layers: ctx => {
    const { cx, cy, r } = KNOB, s = ui(ctx, 'gain'), v = clamp(ctx.data.gain), a = KNOB.start + v * KNOB.sweep, pv = s.pressed ? PRESS : 1
    const ring = { spacing: OUTLINE.spacing, size: OUTLINE.size, start: KNOB.start }
    return [
      layer(T.dotRing(cx, cy, r, { ...ring, sweep: KNOB.sweep }), 'mid'),
      layer(T.dotRing(cx, cy, r, { ...ring, sweep: v * KNOB.sweep, size: 2.2 }), 'value'),
      layer(at(T.dots([[cx, cy]], KNOB.body), pv), 'mid'),
      layer(at(T.dots([[cx + 13 * Math.sin(a), cy - 13 * Math.cos(a)]], 6), pv), 'value'),
      layer(T.big(String(Math.round(v * 100)), cx, cy + r - 8, { ...BODY, align: 'center' }), 'idle'),
      ...states(s, ctx.t, circle(cx, cy, KNOB.bodyR), circle(cx, cy, r)),
    ]
  },
}

// ── STEPPER ─────────────────────────────────────────────────────────────────
/** − value +: icon-button rings either side of a hero count; a button at its limit drops to mid. */
const STEPPER = { y: 70, r: 17, xs: [22, 122] as const, min: 0, max: 20 }
export const stepperCard: WidgetPreset = {
  id: 'ui-stepper', name: 'Stepper', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { guests: 12 },
  controls: [{ key: 'guests', kind: 'stepper', min: STEPPER.min, max: STEPPER.max, step: 1, box: [2, STEPPER.y - 20, 140, 40], label: 'Guests' }],
  layers: ctx => {
    const { y, r, min, max } = STEPPER, s = ui(ctx, 'guests'), n = int(ctx.data.guests, min, max)
    // with a pointer, only the half under it reacts; without one (keyboard, snapshots) both do
    const p = ptr(ctx), over = (i: number) => !p || (p.x < 72 ? 0 : 1) === i
    const button = (i: number): Layer[] => {
      const x = STEPPER.xs[i], tone: Tone = (i ? n >= max : n <= min) ? 'mid' : 'value', v = s.pressed && over(i) ? PRESS : 1
      return [
        layer(at(T.dotRing(x, y, r, { spacing: 2.6, size: 1.3 }), v), tone),
        layer(dim(T.hrule(x - 7, y, 15), v), tone),
        ...(i ? [layer(dim(T.vrule(x, y - 7, 15), v), tone)] : []),
        ...(s.hover && over(i) ? glow(circle(x, y, r)) : []),
      ]
    }
    return [
      ...button(0), ...button(1),
      layer(T.big(String(n), 72, y - 10, { lattice: 3, align: 'center' }), 'value'),
      layer(T.text('GUESTS', 72, y + 30, { align: 'center' }), 'mid'),
      ...(s.focus ? [marching(rr(2, y - r - 4, 140, 2 * r + 8, r + 4), ctx.t, 0)] : []),
    ]
  },
}

// ── CHECKBOX + RADIO ────────────────────────────────────────────────────────
/** A checkbox row over a two-option radio group; checked/selected parts go to `value`. */
const CHK = { x: 25, labelX: 46, box: 22, rows: [36, 84, 114], labels: ['NOTIFY', 'DAILY', 'WEEKLY'] }
const checkMark = (cx: number, cy: number): Pt[] => {
  const path: Pt[] = [[cx - 6, cy], [cx - 2, cy + 4.5], [cx + 6, cy - 5]], pts: Pt[] = []
  for (let k = 0; k < path.length - 1; k++) {
    const [x0, y0] = path[k], [x1, y1] = path[k + 1], n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 2.2)
    for (let i = k ? 1 : 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])
  }
  return pts
}
export const checkCard: WidgetPreset = {
  id: 'ui-check', name: 'Checkbox', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { notify: 1, period: 0 },
  controls: [
    { key: 'notify', kind: 'toggle', box: [10, CHK.rows[0] - 14, 124, 28], label: 'Notify' },
    { key: 'period', kind: 'segmented', options: 2, optionLabels: CHK.labels.slice(1), orientation: 'vertical', box: [10, CHK.rows[1] - 14, 124, CHK.rows[2] - CHK.rows[1] + 28], label: 'Period' },
  ],
  layers: ctx => {
    const c = ui(ctx, 'notify'), g = ui(ctx, 'period'), on = ctx.data.notify >= .5, sel = int(ctx.data.period, 0, 1)
    const [y0, y1, y2] = CHK.rows, half = CHK.box / 2, box = rr(CHK.x - half, y0 - half, CHK.box, CHK.box, 5)
    const p = ptr(ctx), hot = p ? (p.y < (y1 + y2) / 2 ? 0 : 1) : sel // radio under the pointer
    const radio = (i: number): Layer[] => {
      const y = i ? y2 : y1, chosen = i === sel, v = g.pressed && hot === i ? PRESS : 1
      return [
        layer(at(T.dotRing(CHK.x, y, 11, { spacing: 2.6, size: 1.3 }), v), chosen ? 'value' : 'idle'),
        ...(chosen ? [layer(at(T.dots([[CHK.x, y]], 12), v), 'value')] : []),
        layer(T.big(CHK.labels[i + 1], CHK.labelX, y - 4.5, BODY), chosen ? 'value' : 'mid'),
        ...(g.hover && hot === i ? glow(circle(CHK.x, y, 11)) : []),
      ]
    }
    const cv = c.pressed ? PRESS : 1
    return [
      layer(at(T.dots(box(0, OUTLINE.spacing), OUTLINE.size), cv), on ? 'value' : 'mid'),
      ...(on ? [layer(at(T.dots(checkMark(CHK.x, y0), 2.4), cv), 'value')] : []),
      layer(T.big(CHK.labels[0], CHK.labelX, y0 - 4.5, BODY), on ? 'value' : 'mid'),
      ...states(c, ctx.t, box, rr(10, y0 - 14, 124, 28, 8), 0),
      layer(T.dotLine(CHK.x - half, 60, 134, 60, { spacing: 3.3, size: 1 }), 'faint'),
      ...radio(0), ...radio(1),
      ...(g.focus ? [marching(rr(10, y1 - 14, 124, y2 - y1 + 28, 8), ctx.t, 0)] : []),
    ]
  },
}

// ── TABS ────────────────────────────────────────────────────────────────────
/** Three tabs over a dotted rule; the selected tab's stretch of the rule thickens. The panel is a bar chart per tab. */
const TABS = { y: 22, rule: 40, xs: [26, 72, 118], half: 20, names: ['DAY', 'WEEK', 'YEAR'] }
const TAB_DATA = [
  [.18, .12, .1, .22, .46, .72, .58, .64, .8, .66, .52, .7, .44, .3],
  [.42, .55, .5, .68, .6, .74, .9, .62, .58, .7, .76, .64, .82, .7],
  [.3, .34, .4, .38, .5, .56, .62, .6, .7, .74, .72, .84, .9, .96],
]
export const tabsCard: WidgetPreset = {
  id: 'ui-tabs', name: 'Tabs', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { tab: 1 },
  controls: [{ key: 'tab', kind: 'segmented', options: 3, optionLabels: TABS.names, box: [4, TABS.y - 6, 136, TABS.rule - TABS.y + 10], label: 'Range' }],
  layers: ctx => {
    const s = ui(ctx, 'tab'), sel = int(ctx.data.tab, 0, 2), p = ptr(ctx), hot = p ? int(p.x / 48 - .5, 0, 2) : sel
    const thin: Pt[] = [], thick: Pt[] = []
    for (let x = 6; x <= 138 + 1e-9; x += 3.3) (Math.abs(x - TABS.xs[sel]) <= TABS.half ? thick : thin).push([x, TABS.rule])
    const bars = TAB_DATA[sel], last = bars.length - 1
    const col = { gap: 9, pitch: 3.3, height: 70, size: 2.2 }, x0 = 14, base = 132
    return [
      ...TABS.names.map((name, i) => layer(dimmed(T.big(name, TABS.xs[i], TABS.y, { ...BODY, align: 'center' }), s.pressed && i === hot ? PRESS : 1), i === sel ? 'value' : 'mid')),
      layer(T.dots(thin, 1.2), 'faint'), layer(T.dots(thick, 2.4), 'value'),
      ...(s.hover ? glow(rr(TABS.xs[hot] - TABS.half, TABS.y - 4, 2 * TABS.half, 17, 8.5)) : []),
      ...(s.focus ? [marching(rr(3, TABS.y - 6, 138, TABS.rule - TABS.y + 10, 6), ctx.t, 0)] : []),
      layer(T.dotBars(bars.slice(0, last), x0, base, col), 'mid'),
      layer(T.dotBars([bars[last]], x0 + last * col.gap, base, col), 'value'),
    ]
  },
}

// ── PROGRESS ────────────────────────────────────────────────────────────────
/** Determinate progress: percentage hero, the slider's dot rail filled to a red live head, a caption row. */
const PROG = { x0: 6, x1: 138, y: 98, top: 38, spacing: 4.4, size: 2.1, head: 8, gap: 6, total: 3.2 }
export const progressCard: WidgetPreset = {
  id: 'ui-progress', name: 'Progress', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { progress: .64 },
  controls: [{ key: 'progress', kind: 'slider', box: [PROG.x0 - 4, PROG.y - 10, PROG.x1 - PROG.x0 + 8, 20], label: 'Sync progress' }],
  layers: ctx => {
    const s = ui(ctx, 'progress'), v = clamp(ctx.data.progress), pct = Math.round(v * 100)
    const span = PROG.x1 - PROG.x0, n = Math.round(span / PROG.spacing), step = span / n, head = Math.round(v * n)
    const done: Pt[] = [], todo: Pt[] = []
    for (let i = 0; i <= n; i++) if (Math.abs(i - head) * step >= PROG.gap) (i < head ? done : todo).push([PROG.x0 + i * step, PROG.y])
    const hw = (String(pct).length * 12 - 2) * 2.5, pw = 5 * 1.6, left = 72 - (hw + 3 + pw) / 2, pv = s.pressed ? PRESS : 1
    const bar = rr(PROG.x0 - 3, PROG.y - 3, span + 6, 6, 3)
    return [
      layer(T.big(String(pct), left, PROG.top, { lattice: 2.5, smooth: true }), 'value'),
      layer(T.big('%', left + hw + 3, PROG.top + 35 - 11.2, { lattice: 1.6 }), 'idle'),
      layer(at(T.dots(done, PROG.size), pv), 'value'), layer(T.dots(todo, PROG.size), 'faint'),
      layer(at(T.dots([[PROG.x0 + head * step, PROG.y]], PROG.head), pv), 'active'),
      layer(T.text('SYNC', PROG.x0, PROG.y + 12), 'idle'),
      layer(T.text(`${(PROG.total * v).toFixed(1)}/${PROG.total} GB`, PROG.x1, PROG.y + 12, { align: 'right' }), 'mid'),
      ...states(s, ctx.t, bar, bar, 5),
    ]
  },
}

// ── LOADERS ─────────────────────────────────────────────────────────────────
/** Three indeterminate loaders, pure in t: a tone-stepping spinner (red head), a bounce, a pulse. `run` 0 parks them. */
const LOAD = { y: 72, xs: [26, 72, 118] as const, names: ['SPIN', 'BOUNCE', 'PULSE'] }
const SPIN_TONES: Tone[] = ['active', 'value', 'idle', 'mid']
const spinner = (cx: number, cy: number, t: number, run: boolean): Layer[] => {
  const n = 12, head = Math.floor(t * 10) % n
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU, age = (head - i + n) % n
    return layer(T.dots([[cx + 16 * Math.sin(a), cy - 16 * Math.cos(a)]], 4.4), run ? SPIN_TONES[age] ?? 'faint' : 'faint')
  })
}
const bounce = (cx: number, cy: number, t: number, run: boolean): Layer[] => [-1, 0, 1].map(k => {
  const lift = run ? Math.round(Math.max(0, Math.sin(t * 1.6 * TAU - (k + 1) * .9)) * 9) : 0
  return layer(T.dots([[cx + k * 12, cy + 4 - lift]], 7), lift > 4 ? 'value' : 'idle')
})
const pulse = (cx: number, cy: number, t: number, run: boolean): Layer[] => [
  layer(T.dots([[cx, cy]], 7), 'value'),
  ...(run ? [0, 1, 2].map(k => {
    const age = frac(t * .8 + k / 3), r = Math.round(6 + age * 14)
    return layer(T.dotRing(cx, cy, r, { spacing: 3.3, size: 1.5 }), age < .34 ? 'value' : age < .67 ? 'idle' : 'mid')
  }) : []),
]
export const loadersCard: WidgetPreset = {
  id: 'ui-loaders', name: 'Loaders', group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
  defaults: { run: 1 },
  controls: [{ key: 'run', kind: 'toggle', box: [2, LOAD.y - 24, 140, 48], label: 'Loading' }],
  layers: ctx => {
    const s = ui(ctx, 'run'), run = ctx.data.run >= .5, [a, b, c] = LOAD.xs, y = LOAD.y
    const all = [...spinner(a, y, ctx.t, run), ...bounce(b, y, ctx.t, run), ...pulse(c, y, ctx.t, run)]
    const area = rr(2, y - 24, 140, 48, 24)
    return [
      ...(s.pressed ? all.map(l => ({ ...l, field: dim(l.field, PRESS) })) : all),
      ...LOAD.names.map((name, i) => layer(T.text(name, LOAD.xs[i], y + 32, { align: 'center' }), 'mid')),
      ...states(s, ctx.t, area, area, 0),
    ]
  },
}

// ── KEYPAD ──────────────────────────────────────────────────────────────────
/** PIN pad: four entry dots over a 3×4 grid of keys. A press dims the key and sends a ripple ring out from it. */
const PAD = { xs: [32, 72, 112], ys: [50, 76, 102, 128], keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'], pinY: 26, ripple: .5 }
const padId = (k: string) => `k${k === '*' ? 'star' : k === '#' ? 'hash' : k}`
const padKeys = PAD.keys.map((k, i) => ({ k, id: padId(k), x: PAD.xs[i % 3], y: PAD.ys[Math.floor(i / 3)] }))
export const keypadCard: WidgetPreset = {
  id: 'ui-keypad', name: 'Keypad', group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
  defaults: { pin: 2, ...Object.fromEntries(padKeys.map(k => [k.id, 0])) },
  controls: padKeys.map(({ k, id, x, y }): Control => ({ key: id, kind: 'button', box: [x - 18, y - 13, 36, 26], label: k === '*' ? 'Star' : k === '#' ? 'Hash' : k })),
  layers: ctx => {
    const pin = int(ctx.data.pin, 0, 4), p = ptr(ctx), out: Layer[] = []
    out.push(layer(T.dots([0, 1, 2, 3].filter(i => i < pin).map((i): Pt => [72 + (i - 1.5) * 12, PAD.pinY]), 5), 'value'))
    out.push(layer(T.dots([0, 1, 2, 3].filter(i => i >= pin).map((i): Pt => [72 + (i - 1.5) * 12, PAD.pinY]), 3), 'mid'))
    for (const { k, id, x, y } of padKeys) {
      const s = ui(ctx, id)
      out.push(layer(dimmed(T.big(k, x, y - 5.6, { lattice: 1.6, align: 'center' }), s.pressed ? PRESS : 1), 'value'))
      if (s.pressed) out.push(layer(at(T.dotRing(x, y, 11, { spacing: 2.6, size: 1.3 }), PRESS), 'idle'))
      out.push(...states(s, ctx.t, circle(x, y, 9), circle(x, y, 11), 0))
      // ripple: from the pointer's press time; a pressed key without pointer data shows an early frame
      // (a released touch lingers in `pointers` as `up`, so the ripple finishes on the key it was released over)
      const rel = ctx.pointers?.find(q => q.up && Math.abs(q.x - x) <= 18 && Math.abs(q.y - y) <= 13)
      const age = p && (s.pressed || s.hover) ? ctx.t - p.tDown : s.pressed ? .12 : rel ? ctx.t - rel.tDown : -1
      if (age >= 0 && age < PAD.ripple) {
        const f = age / PAD.ripple
        out.push(layer(T.dotRing(x, y, Math.round(12 + f * 14), { spacing: 3.3, size: 1.5 }), f < .34 ? 'value' : f < .67 ? 'idle' : 'mid'))
      }
    }
    return out
  },
}

// ── TEXT FIELD ──────────────────────────────────────────────────────────────
/** Dotted field with a caption, typed text, a blinking red caret and a character counter. */
const FIELD = { x: 6, y: 56, w: 132, h: 34, r: 8, pad: 10, text: 'DOT/480 NODE', blink: 1.06 }
export const textFieldCard: WidgetPreset = {
  id: 'ui-text-field', name: 'Text Field', group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
  defaults: { len: 7 },
  controls: [{ key: 'len', kind: 'stepper', min: 0, max: FIELD.text.length, step: 1, box: [FIELD.x, FIELD.y, FIELD.w, FIELD.h], label: 'Callsign' }],
  layers: ctx => {
    const s = ui(ctx, 'len'), len = int(ctx.data.len, 0, FIELD.text.length), cy = FIELD.y + FIELD.h / 2, tx = FIELD.x + FIELD.pad
    const box = rr(FIELD.x, FIELD.y, FIELD.w, FIELD.h, FIELD.r), cx = tx + len * 6 * BODY.lattice + 1
    const caret = frac(ctx.t / FIELD.blink) < .5
    return [
      layer(T.text('CALLSIGN', FIELD.x + 2, FIELD.y - 14), 'idle'),
      layer(at(T.dots(box(0, OUTLINE.spacing), OUTLINE.size), s.pressed ? PRESS : 1), s.focus ? 'value' : 'mid'),
      ...(len ? [layer(T.big(FIELD.text.slice(0, len), tx, cy - 4.5, BODY), 'value')] : []),
      ...(caret ? [layer(T.dotLine(cx, cy - 7, cx, cy + 7, { spacing: 2.33, size: 1.6 }), 'active')] : []),
      layer(T.text(`${String(len).padStart(2, '0')}/${FIELD.text.length}`, FIELD.x + FIELD.w - 2, FIELD.y + FIELD.h + 8, { align: 'right' }), 'mid'),
      ...states(s, ctx.t, box, box, 5),
    ]
  },
}

// ── CHIPS ───────────────────────────────────────────────────────────────────
/** Four stadium filter chips, each its own toggle: on = value outline + label, off = mid. */
const CHIPS = { w: 62, h: 24, xs: [6, 76], ys: [46, 84], items: [{ key: 'all', label: 'ALL' }, { key: 'live', label: 'LIVE' }, { key: 'saved', label: 'SAVED' }, { key: 'muted', label: 'MUTED' }] }
const chipBox = (i: number) => [CHIPS.xs[i % 2], CHIPS.ys[Math.floor(i / 2)]] as const
export const chipsCard: WidgetPreset = {
  id: 'ui-chips', name: 'Chips', group: 'composite', chrome: 'dots', grid: TILE, style,
  defaults: { all: 0, live: 1, saved: 1, muted: 0 },
  controls: CHIPS.items.map(({ key, label }, i): Control => {
    const [x, y] = chipBox(i)
    return { key, kind: 'toggle', box: [x, y, CHIPS.w, CHIPS.h], label }
  }),
  layers: ctx => {
    const out: Layer[] = [layer(T.text('FILTERS', 6, 24), 'idle')]
    const n = CHIPS.items.reduce((a, { key }) => a + (ctx.data[key] >= .5 ? 1 : 0), 0)
    CHIPS.items.forEach(({ key, label }, i) => {
      const s = ui(ctx, key), on = ctx.data[key] >= .5, [x, y] = chipBox(i), v = s.pressed ? PRESS : 1, shape = rr(x, y, CHIPS.w, CHIPS.h, CHIPS.h / 2)
      out.push(
        layer(at(T.dots(shape(0, OUTLINE.spacing), OUTLINE.size), v), on ? 'value' : 'mid'),
        layer(dimmed(T.big(label, x + CHIPS.w / 2, y + CHIPS.h / 2 - 4.5, { ...BODY, align: 'center' }), v), on ? 'value' : 'mid'),
        ...states(s, ctx.t, shape, shape, 5),
      )
    })
    out.push(layer(T.text(`${n} ACTIVE`, 138, 132, { align: 'right' }), 'mid'))
    return out
  },
}

// ── TOAST ───────────────────────────────────────────────────────────────────
/** Notification pill that slides in from the top over `reveal` seconds, holds, then repeats; the × button dims on press. */
const TOAST = { x: 6, y: 52, w: 132, h: 38, text: 'SYNC DONE', bx: 118, reveal: .6, period: 4.2, dist: 70 }
export const toastCard: WidgetPreset = {
  id: 'ui-toast', name: 'Toast', group: 'composite', chrome: 'dots', grid: TILE, style, animated: true,
  defaults: { dismiss: 0 },
  controls: [{ key: 'dismiss', kind: 'button', box: [TOAST.bx - 12, TOAST.y + TOAST.h / 2 - 12, 24, 24], label: 'Dismiss' }],
  layers: ctx => {
    const s = ui(ctx, 'dismiss'), age = ctx.t % TOAST.period, k = clamp(age / TOAST.reveal), e = 1 - (1 - k) ** 3
    const dy = -(1 - e) * TOAST.dist, cy = TOAST.y + TOAST.h / 2 + dy, v = s.pressed ? PRESS : 1
    const pill = rr(TOAST.x, TOAST.y + dy, TOAST.w, TOAST.h, TOAST.h / 2), cross = TOAST.bx
    const x = (d: number): Pt[] => [-2, -1, 0, 1, 2].map((i): Pt => [cross + i * d, cy + i * d]), x2 = (d: number): Pt[] => [-2, -1, 0, 1, 2].map((i): Pt => [cross + i * d, cy - i * d])
    return [
      layer(T.text('NOTICE', TOAST.x + 2, 30), 'idle'),
      layer(dimmed(T.dots(pill(0, OUTLINE.spacing), OUTLINE.size), e), 'value'),
      layer(dimmed(T.big(TOAST.text, TOAST.x + 16, cy - 4.5, BODY), e), 'value'),
      layer(at(T.dotRing(cross, cy, 10, { spacing: 2.6, size: 1.3 }), v * e), 'mid'),
      layer(at(T.dots([...x(2.2), ...x2(2.2)], 2), v * e), 'mid'),
      ...(e > .99 ? states(s, ctx.t, circle(cross, cy, 10), circle(cross, cy, 10), 7) : []),
    ]
  },
}

export const componentsBoard = [
  toggleCard, pillCard, sliderCard, iconButtonCard, statusDotCard,
  segmentedCard, steppedSliderCard, knobCard, stepperCard, checkCard,
  tabsCard, progressCard, loadersCard, keypadCard, textFieldCard,
  chipsCard, toastCard,
]

