/**
 * Board 4 — Henry Li: 14A / 247W / Afterlight (public/images/HQLGUf3bgAA3X29.jpg).
 * TILE cards (144×144): 5×7 labels on the card pitch, body text on a 1.25–1.3 lattice,
 * hero numerals in the smooth display weight on a 2.5–3.7 lattice, rings and rays as dot sites.
 */
import { clamp, hash01, len } from '../../engine/math'
import type { Field, Tone } from '../../engine/types'
import { TAU, TILE, layer, layoutFor, tileStyle, toneRamp, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const BODY = { lattice: 1.3 }
/** Voice-like bar heights: syllable envelopes times a per-bar jitter, so neighbours differ the way real speech does. */
const chatter = (n: number, t: number, seed: number, floor = .2) => Array.from({ length: n }, (_, i) => {
  const syllable = Math.abs(Math.sin(i * .42 + seed + t * .8)) * (.6 + .4 * Math.sin(i * .13 - t * .5 + seed))
  return floor + (1 - floor) * Math.max(0, syllable) * (.3 + .7 * hash01(i + Math.floor(t * 4), seed))
})

export const boardingPass: WidgetPreset = {
  id: 'boarding-pass', name: 'Henry Li', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.big('14A', 0, 38, { lattice: 3.7, smooth: true })),
    layer(T.big('SFO — LHR', 0, 101, BODY), 'idle'),
    layer(T.dots([[4, 132]], 9), 'active'), layer(T.big('BOARDING', 14, 127.5, BODY), 'idle'),
  ],
}

// A sun on one radial lattice (dots every 7.2 cells outward from the centre): a red core, three
// concentric site rings (8, 16, 16 dots) in value then idle, and 16 spokes that continue the rings'
// dots and taper in size and tone as they leave: the on-axis/diagonal spokes run long, the others short.
const SUN: [number, number] = [71.5, 61], STEP = 7.2
// [ring k, size, tone, dots on that ring (every `skip`-th of 16 spokes), spokes that reach it]
const SUN_BANDS: [number, number, Tone, number, (i: number) => boolean][] = [
  [1, 4.4, 'value', 2, () => true], [2, 4.6, 'value', 1, () => true], [3, 5.6, 'idle', 1, () => true],
  [4, 5.2, 'idle', 1, () => true], [5, 4.4, 'idle', 1, () => true],
  [6, 3.6, 'mid', 1, i => i % 2 === 0], [7, 2.8, 'mid', 1, i => i % 2 === 0],
]
const sunSites = (k: number, skip: number, reach: (i: number) => boolean): [number, number][] =>
  Array.from({ length: 16 }, (_, i) => i).filter(i => i % skip === 0 && reach(i))
    .map(i => [SUN[0] + Math.sin((i / 16) * TAU) * STEP * k, SUN[1] - Math.cos((i / 16) * TAU) * STEP * k])
export const sunburst: WidgetPreset = {
  id: 'sunburst', name: 'Day 3 of 7', label: '', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    ...SUN_BANDS.map(([k, size, tone, skip, reach]) => layer(T.dots(sunSites(k, skip, reach), size), tone)),
    layer(T.dots([SUN], 6.5), 'active'),
    layer(T.big('DAY 3 OF 7', 71.5, 125, { lattice: 1.6, align: 'center' }), 'idle'),
  ],
}

export const powerRing: WidgetPreset = {
  id: 'power-ring', name: '247 W', label: '', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { load: 0.31 },
  layers: ({ data }) => {
    // open at the bottom: 7 o'clock → over the top → 5 o'clock; the load fills the tail end in red
    const start = TAU * (215 / 360), sweep = TAU * (290 / 360), ring = { spacing: 3.6, size: 2.3 }
    return [
      layer(T.dotRing(72, 68, 67, { ...ring, start, sweep }), 'idle'),
      layer(T.dotRing(72, 68, 67, { ...ring, start: start + sweep * (1 - data.load), sweep: sweep * data.load }), 'active'),
      layer(T.big('247', 31, 52, { lattice: 2.5, smooth: true })),
      layer(T.big('W', 120, 76, { lattice: 1.6 }), 'idle'),
    ]
  },
}

export const midnightCircuit: WidgetPreset = {
  id: 'midnight-circuit', name: "Henry's Desk", group: 'chart', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  defaults: { played: 0.47 },
  layers: ({ t, data }) => {
    const bars = T.dotBars(chatter(48, t * 0.6, 5), 1, 77, { gap: 3, pitch: 2.2, height: 22, size: 1.5, mirror: true })
    const head = Math.round(data.played * 47) * 3 + 1
    const played: Field = u => (u * (TILE.cols - 1) < head - 1 ? 1 : 0)
    return [
      layer(T.big('MIDNIGHT CIRCUIT', 0, 32, { lattice: 1.25 }), 'idle'),
      layer(bars, 'value'), layer({ ...bars, field: played }, 'active'),
      layer(T.dots([[head, 77]], 8), 'active'),
      layer(T.big('1:47 / 3:52', 0, 124, BODY), 'idle'),
    ]
  },
}

// Brutalist overhang against a bright overcast sky, a hooded figure in silhouette. Structure-aware
// halftone: smooth regions (sky, concrete, shadow) are dithered onto a 7-step size ladder with a
// blue-noise-ish hash, so gradients never band; structure (seams, the lit lip, roof edges, the figure)
// is crisp at cell resolution. The ladder then splits into tone steps, so size AND tone carry luminance.
type P = [number, number]
/** The figure, hand-masked in card cells: hood falling back to the left, shoulders widening to the bottom. */
const FIGURE: P[] = [
  [71, 83.5], [74.5, 83.2], [77.2, 85], [78.3, 88], [78, 91.5], [76.8, 94.5], [76.5, 97], [78.5, 99.5], [81.5, 101.5],
  [83.5, 104.5], [84.3, 110], [85, 118], [85.8, 126], [86.5, 135], [55.5, 135], [56.2, 126], [57, 118], [58, 111],
  [59.3, 105], [61.5, 101.5], [64, 99], [65.2, 95.5], [65.8, 91], [67.2, 87], [69, 84.6],
]
const inPoly = (pts: P[], x: number, y: number) => {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const figure = (x: number, y: number) => x > 54 && x < 88 && y > 82 && inPoly(FIGURE, x, y)
/** Blue-noise-ish threshold: a per-cell hash minus its 4 neighbours' mean (high-passed white noise). */
const cellHash = (c: number, r: number) => hash01(c * 157 + r, 31)
const blueish = (c: number, r: number) => Math.max(0, Math.min(1, .5 + cellHash(c, r) - .25 * (cellHash(c - 1, r) + cellHash(c + 1, r) + cellHash(c, r - 1) + cellHash(c, r + 1))))
const LADDER = 7
/** The facade's lower edge (the lit lip): sloping across to the column at x 112, then flat. */
const lip = (x: number) => (x < 112 ? 14 + .3 * x : 40)
/** Underside of the overhang, in shadow: flat at y 66 right of x 70, sloping down to the left. */
const soffit = (x: number) => (x >= 112 ? 40 : x >= 70 ? 66 : 66 + (70 - x) * .35)
/** [luminance, smooth]: smooth regions are dithered onto the ladder, structure stays exact. */
const scene = (x: number, y: number): [number, boolean] => {
  const c = Math.round(x), r = Math.round(y)
  // the red ring's moat (top right)
  if (Math.abs(len(c - 132, r - 11) - 5) < 1.8) return [0, false]
  // rooftops along the bottom edge: hard-edged blocks
  if (r >= 133 || (c < 51 && r >= 126) || (c >= 100 && c < 112 && r >= 123) || (c >= 112 && c < 129 && r >= 129)) return [.04, false]
  if (figure(c, r)) return [0, false]
  // facade: board-formed panels, vertical seams and seams parallel to the sloping lip
  const top = lip(c)
  if (r < top) {
    if (r >= top - 1.2) return [.95, false]
    const depth = top - r, row = Math.floor(depth / 7), col = Math.floor(c / 14)
    if (c % 14 === 0 || depth % 7 < 1) return [.12, false]
    return [.38 + .14 * hash01(col * 17 + row, 5) + .1 * (c / 143), true]
  }
  // shadowed underside: near-black, a little bounce light from the sky near its bottom edge
  const under = soffit(c)
  if (c < 112 && r < under) return [.18 * Math.exp(-(under - r) / 5), true]
  // lower-left building: a lit wall with a grid of dark windows over a dark band
  if (c < 36 && r < 106) {
    if (r >= 95) return [c < 33 ? .05 : .45, c >= 33]
    if (r >= 76) return [(c % 6 < 2 || r % 5 < 1) ? .48 : .1, false]
  }
  // sky: overcast, brightest in the glow behind the figure, cloud banks darkening to the lower right
  const glow = Math.exp(-((c - 72) ** 2 + (r - 102) ** 2) / (2 * 26 ** 2))
  const cloud = .5 + .5 * Math.sin(c * .045 + r * .03 + 1.3) * Math.cos(r * .05 - c * .022)
  let sky = .72 + .24 * glow + .08 * clamp(1 - (r - 40) / 60) - .18 * cloud * clamp((r - 40) / 90) * (1 - glow)
  // backlight: a one-cell bright rim hugging the figure
  if (figure(c - 1, r) || figure(c + 1, r) || figure(c, r - 1) || figure(c, r + 1)) sky = 1
  return [sky, true]
}
const halftone = (x: number, y: number) => {
  const [lum, smooth] = scene(x, y)
  return smooth ? Math.min(LADDER, Math.floor(lum * LADDER + blueish(Math.round(x), Math.round(y)))) / LADDER : lum
}
const dotSize = (q: number) => .25 + .75 * q
/** The scene never changes: `toneRamp` evaluates each cell once and splits the ladder into four tones. */
const SKYLINE = toneRamp((u, v) => halftone(u * 143, v * 143), [
  { at: .1, tone: 'faint', value: dotSize },
  { at: .25, tone: 'mid', value: dotSize },
  { at: .5, tone: 'idle', value: dotSize },
  { at: .7, tone: 'value', value: dotSize },
])
export const afterSilhouette: WidgetPreset = {
  id: 'silhouette', name: 'Henry', label: '', group: 'photo', chrome: 'dots', bleed: true, grid: TILE,
  // halftone: every dot fully lit, luminance carried by dot size and tone
  style: { ...tileStyle, sizeMin: 0, sizeMax: 1.2, quantizeSteps: 0, opacityMode: 'constant' },
  layers: () => [
    ...SKYLINE,
    layer(T.dotRing(132, 11, 5, { spacing: 1.2, size: 1.3 }), 'active'),
  ],
}

export const inhale: WidgetPreset = {
  id: 'inhale', name: 'Breathe', label: '', group: 'polar', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const breath = Math.sin(t * 0.8)
    return [
      ...[29, 40, 52, 64].map(r => layer(T.dotRing(71, 70, r * (1 + .035 * breath), { spacing: 3, size: 1.25 }), 'idle')),
      layer(T.big(breath >= 0 ? 'INHALE' : 'EXHALE', 71, 66, { ...BODY, align: 'center' }), 'idle'),
    ]
  },
}

// Hypnogram in chart-lattice dots (2.8 cells apart): levels 12 / 16 / 19, REM spikes rise to row 5.
const HYPNO: [number, number][] = [[0, 19], [1, 18], [1, 16], [4, 16], [4, 12], [15, 12], [15, 16], [22, 16], [22, 12], [26, 12], [26, 16], [29, 16], [29, 19], [34, 19], [34, 16], [35, 16], [35, 12], [43, 12], [43, 16], [48, 16], [48, 19], [50, 19], [50, 13]]
const SPIKES = [7, 8, 39, 40]
export const goodMorning: WidgetPreset = {
  id: 'good-morning', name: 'Good Morning, Henry', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    const chart = T.lattice(2.8, 0, 80)
    return [
      layer(T.big('7', 1, 24, { lattice: 2.5, smooth: true })), layer(T.big('H', 31, 46.4, { lattice: 1.8 })),
      layer(T.big('42', 64, 24, { lattice: 2.5, smooth: true })), layer(T.big('M', 124, 46.4, { lattice: 1.8 })),
      // dotted grid behind the chart: tiny dots on the card pitch
      ...[0, 11, 22, 33, 44, 55].map(r => layer(T.hrule(0, 80 + r, 144, 1, .45), 'idle')),
      ...Array.from({ length: 11 }, (_, i) => layer(T.vrule(i * 14, 80, 56, 1, .45), 'idle')),
      layer(chart.at(chart.line(HYPNO))),
      ...SPIKES.map(c => layer(chart.at(chart.vrule(c, 10, 2)))),
      ...SPIKES.map(c => layer(chart.at(chart.vrule(c, 5, 5)), 'active')),
    ]
  },
}

export const cardiology: WidgetPreset = {
  id: 'cardiology', name: 'Henry Li · Cardiology', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { position: 0.4 },
  layers: ({ data }) => {
    const knob = Math.round(data.position * 143)
    return [
      layer(T.big('A-07', 0, 37, { lattice: 3.05, smooth: true })),
      layer(T.big('03 AHEAD', 0, 91, BODY), 'idle'),
      layer(T.dotLine(0, 140, knob - 7, 140, { spacing: 4.2, size: 2.3 }), 'idle'),
      layer(T.dotLine(knob + 7, 140, 143, 140, { spacing: 4.2, size: 2.3 }), 'idle'),
      layer(T.dots([[knob, 140]], 8.5), 'active'),
    ]
  },
}

export const listening: WidgetPreset = {
  id: 'listening', name: 'DeerFlow', group: 'chart', chrome: 'dots', live: true, animated: true, grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    return [
      layer(T.dotBars(chatter(36, t * 1.5, 8, .15).map(v => Math.min(1, v * 1.25)), 1, 68, { gap: 4, pitch: 2.5, height: 30, size: 1.6, mirror: true }), 'idle'),
      layer(T.big('LISTENING', 72, 133, { ...BODY, align: 'center' }), 'idle'),
    ]
  },
}

export const henry3Board = [boardingPass, sunburst, powerRing, midnightCircuit, afterSilhouette, inhale, goodMorning, cardiology, listening]
