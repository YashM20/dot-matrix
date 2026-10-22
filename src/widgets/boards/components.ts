/**
 * Board 8 — primitive components strip (bottom row of public/images/henry-example-interface-system.png):
 * TOGGLE / PILL / SLIDER / ICON BUTTON / STATUS DOT. TILE cards (144×144): outlines are dotted
 * stadiums and rings of fine dot sites, knobs and status dots are single big sites, button text
 * sits on a 1.3 lattice. Red (`active`) is the board's one accent: the destructive pill, the
 * second slider and the live status dot.
 */
import type { Tone } from '../../engine/types'
import { TAU, TILE, layer, layoutFor, tileStyle, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
/** Knobs and status dots are true circles at this size, so roundness drops to 0 (n = 2). */
const style = { ...tileStyle, cornerRoundness: 0 }
const BODY = { lattice: 1.3 }
type Pt = [number, number]

/** Evenly spaced dot sites around a stadium (pill) outline, top-left corner at (x,y). */
function stadium(x: number, y: number, w: number, h: number, spacing: number): Pt[] {
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
const OUTLINE = { spacing: 3.3, size: 1.5 }
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
  layers: ({ data }) => [...toggle(28, data.on >= .5), ...toggle(86, data.on < .5)],
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
  layers: ({ data }) => [...slider(51, data.value, 'idle', 'value'), ...slider(105, data.level, 'active', 'active')],
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

export const componentsBoard = [toggleCard, pillCard, sliderCard, iconButtonCard, statusDotCard]
