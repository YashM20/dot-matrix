/**
 * Board 2 — DeerFlow AIoT dashboard, 12 cards (public/images/HQIig9IaEAAmC9U.jpg).
 * TILE cards (144×144): 5×7 labels on the card pitch, stat values on a 1.5–1.6 lattice, heroes on
 * 1.8–3, and every outline (car, cube, leaf, rings, chart) as evenly spaced dot sites.
 */
import { hash01 } from '../../engine/math'
import type { Field } from '../../engine/types'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
const VALUE = { lattice: 1.6 }
const deg = (d: number) => (d / 360) * TAU

/** Evenly spaced points along a polyline (spacing carried across vertices, so corners don't bunch up). */
function trace(pts: Pt[], spacing: number, closed = false): Pt[] {
  const p = closed ? [...pts, pts[0]] : pts, out: Pt[] = [p[0]]
  let carry = 0
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1], len = Math.hypot(x1 - x0, y1 - y0)
    if (!len) continue
    let d = spacing - carry
    for (; d <= len + 1e-9; d += spacing) out.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len])
    carry = len - (d - spacing)
  }
  if (closed && out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < spacing / 2) out.pop()
  return out
}
/** Points on an elliptical arc, angles clockwise from 12 o'clock. */
const arc = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const a = a0 + ((a1 - a0) * i) / n; return [cx + rx * Math.sin(a), cy - ry * Math.cos(a)] })
const path = (pts: Pt[], spacing: number, size: number, closed = false) => T.dots(trace(pts, spacing, closed), size)
/** Capsule (pill-button) outline from (x0,y0) to (x1,y1). */
const pillOutline = (x0: number, y0: number, x1: number, y1: number, spacing = 2, size = 1) => {
  const r = (y1 - y0) / 2, cy = y0 + r
  return path([...arc(x1 - r, cy, r, r, 0, Math.PI, 16), ...arc(x0 + r, cy, r, r, Math.PI, TAU, 16)], spacing, size, true)
}
/** Dots at fixed angular slots on a circle, rotated by `phase` slots (rings that interleave). */
const ringSlots = (cx: number, cy: number, r: number, n: number, phase = 0, size = 1.3): LatticeField =>
  T.dots(Array.from({ length: n }, (_, i) => { const a = ((i + phase) / n) * TAU; return [cx + r * Math.sin(a), cy - r * Math.cos(a)] as Pt }), size)
/** A 1-bit sprite on its own lattice (pixel-art drawn in bigger dots). */
const sprite = (rows: string[], col: number, row: number, k: number) => { const g = T.lattice(k, col, row); return g.at(g.sprite(rows, 0, 0)) }
/** Filled triangle on the card pitch pointing left or right inside a w×h cell box. */
const triangle = (col: number, row: number, w: number, h: number, dir: 'left' | 'right'): Field =>
  T.place((u, v) => (Math.abs(v - .5) <= .5 * (dir === 'right' ? 1 - u : u) + .02 ? 1 : 0), col, row, w, h)
const stat = (label: string, value: string, col: number, row: number, lattice = VALUE.lattice) =>
  [layer(T.text(label, col, row), 'idle'), layer(T.big(value, col, row + 11, { lattice }))]

// ── 01 ─────────────────────────────────────────────────────────────────────────────
/** Speech wave: a red burst on the left, spiky white chatter on the right, dotted baseline between. */
const agentWave = (t: number) => Array.from({ length: 48 }, (_, i) => {
  const x = 1 + 3 * i, wob = .45 + .55 * Math.abs(Math.sin(i * 1.9 + t * 3.2))
  if (x >= 20 && x <= 47) return Math.sin((Math.PI * (x - 19)) / 29) ** 1.5 * wob
  if (x >= 64) return i % 2 ? 0 : (.3 + .7 * hash01(i + 9, 1)) * wob
  return 0
})
export const agentStatus: WidgetPreset = {
  id: 'agent-status', name: '01 Agent Status', group: 'composite', animated: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const wave = agentWave(t), bars = { gap: 3, pitch: 2.2, height: 7, size: 1.3, mirror: true }
    return [
      layer(T.big('THINKING', 2, 17, { lattice: 1.8 })), layer(T.dots([[92, 29.6], [97.6, 29.6], [103.2, 29.6]], 1.9)),
      layer(T.dotRing(67, 70, 21, { spacing: 4.4, size: 1.6 })),
      layer(T.dots([[59, 67], [61.6, 67], [74.4, 67], [77, 67]], 2.1), 'active'),
      layer(T.dots([[63.5, 78], [65.8, 78.3], [68.2, 78.3], [70.5, 78]], .9), 'mid'),
      layer(T.dotBars(wave.slice(0, 6), 1, 101, bars)),
      layer(T.dotBars(wave.slice(6, 16), 19, 101, bars), 'active'),
      layer(T.dotBars(wave.slice(16), 49, 101, bars)),
      ...stat('STEPS', '128', 0, 117), layer(T.vrule(39, 121, 20), 'faint'),
      ...stat('TOOLS', '12', 52, 117), layer(T.vrule(94, 121, 20), 'faint'),
      ...stat('MEMORY', '98%', 108, 117),
    ]
  },
}

// ── 02 ─────────────────────────────────────────────────────────────────────────────
// 20 request columns: dots per column, and how bright the column reads (tall = white, short = grey).
const REQ: [number, 'value' | 'idle' | 'mid' | 'faint' | 'active'][] = [
  [3, 'mid'], [6, 'value'], [4, 'mid'], [2, 'faint'], [3, 'mid'], [6, 'value'], [2, 'mid'], [3, 'mid'], [6, 'value'], [3, 'mid'],
  [1, 'faint'], [2, 'mid'], [4, 'mid'], [3, 'faint'], [1, 'faint'], [2, 'mid'], [4, 'active'], [2, 'faint'], [3, 'mid'], [6, 'active'],
]
export const codexTokens: WidgetPreset = {
  id: 'codex-tokens', name: '02 Claude / Codex', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.big('12.4K', 0, 18, { lattice: 3 })),
    layer(T.text('TOKENS', 0, 47), 'idle'),
    ...REQ.map(([n, tone], i) => layer(T.dotBars([(n - 1) / 5], 5 + i * 7, 101, { pitch: 5, height: 25, size: 3.9 }), tone)),
    layer(T.text('REQUESTS', 0, 119), 'idle'), layer(T.big('24', 0, 130, { lattice: 1.6 })),
    layer(pillOutline(86, 121, 143, 141, 1.25, 1), 'mid'), layer(T.big('+18%', 114.5, 126.5, { lattice: 1.3, align: 'center' }), 'active'),
  ],
}

// ── 03 ─────────────────────────────────────────────────────────────────────────────
/** 48 radial ticks of three dots; tone by angle (clockwise from 12): white, a red alert wedge, grey. */
const TICKS = 60, RING: Pt = [45, 62]
const tickTone = (a: number) => (a >= deg(18) && a < deg(224) ? 'value' : a >= deg(224) && a < deg(248) ? 'active' : 'idle')
const ticks = (tone: string) => T.dots(Array.from({ length: TICKS }, (_, i) => (i / TICKS) * TAU).filter(a => tickTone(a) === tone)
  .flatMap(a => [33.2, 35.4, 37.6, 39.8].map(r => [RING[0] + r * Math.sin(a), RING[1] - r * Math.cos(a)] as Pt)), 1.35)
const legend = (row: number, label: string, value: string, tone: 'value' | 'active') =>
  [layer(T.dots([[94, row + 3]], 5), tone), layer(T.text(label, 101, row), 'idle'), layer(T.big(value, 101, row + 10, VALUE))]
export const deviceOverview: WidgetPreset = {
  id: 'device-overview', name: '03 Device Overview', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(ticks('idle'), 'idle'), layer(ticks('value'), 'value'), layer(ticks('active'), 'active'),
    layer(T.big('128', RING[0], 47, { lattice: 2.1, align: 'center' })),
    layer(T.text('DEVICES', RING[0], 69, { align: 'center' }), 'idle'),
    ...legend(31, 'ONLINE', '96%', 'value'), ...legend(60, 'OFFLINE', '4%', 'active'), ...legend(89, 'ALERTS', '2', 'active'),
  ],
}

// ── 04 ─────────────────────────────────────────────────────────────────────────────
// Side-view coupe traced from the reference (cells): roofline, rocker, nose, tail box, glass line.
const CAR_BODY: Pt[] = [
  [14, 58], [4, 57], [2, 52], [4, 48], [10, 45], [20, 43], [30, 41], [40, 39], [48, 36], [56, 33], [64, 31], [72, 30], [82, 30],
  [94, 32], [106, 35], [118, 39], [128, 42], [135, 44], [136, 50], [137, 56], [134, 59], [122, 60], [112, 62],
]
const CAR_SILL: Pt[] = [[33, 60], [60, 61], [91, 62]]
const CAR_GLASS: Pt[] = [[96, 34], [110, 39], [122, 44]]
const CAR_TAIL: Pt[] = [[128, 49], [137, 49], [137, 57], [129, 57]]
const TAIL_LIGHT = Array.from({ length: 13 }, (_, i) => 117 + i * 1.5).flatMap(x => [[x, 46], ...(x > 123 ? [[x, 44.5] as Pt] : []), ...(x > 126 ? [[x, 47.5] as Pt] : [])] as Pt[])
const LOCK = ['..#####..', '.##...##.', '.#.....#.', '.#.....#.', '.#.....#.', '#########', '#.......#', '#...#...#', '#...#...#', '#.......#', '#.......#', '.#######.']
export const teslaStatus: WidgetPreset = {
  id: 'tesla-status', name: '04 Tesla Status', group: 'icon', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(path(CAR_BODY, 2.1, 1)), layer(path(CAR_SILL, 2.1, 1)), layer(path(CAR_GLASS, 2.1, 1), 'idle'), layer(path(CAR_TAIL, 2.1, 1), 'idle'),
    layer(T.dotRing(24, 55, 9, { spacing: 2.1, size: 1.1 }), 'idle'), layer(T.dotRing(101, 57, 9, { spacing: 2.1, size: 1.1 }), 'idle'),
    layer(T.dots(TAIL_LIGHT, 1.4), 'active'),
    ...stat('BATTERY', '78%', 0, 90), layer(T.hrule(44, 107, 19), 'value'),
    ...stat('RANGE', '312KM', 97, 94, 1.5),
    layer(T.text('PARKED', 0, 131), 'active'), layer(T.dots([[41, 134]], 4.8), 'active'),
    layer(T.sprite(LOCK, 132, 128)),
  ],
}

// ── 05 ─────────────────────────────────────────────────────────────────────────────
/** Capsule on a lattice rotated with its axis: lower-left half red, upper-right half white. */
const PILL_C: Pt = [84, 59], PILL_A = deg(54), PILL_HALF = 37, PILL_R = 14, PILL_S = 2.35
const pillSites = (() => {
  const ax: Pt = [Math.sin(PILL_A), -Math.cos(PILL_A)], px: Pt = [Math.cos(PILL_A), Math.sin(PILL_A)], red: Pt[] = [], white: Pt[] = []
  for (let i = -20; i <= 20; i++) for (let j = -8; j <= 8; j++) {
    const u = i * PILL_S, v = j * PILL_S, core = PILL_HALF - PILL_R
    if (Math.abs(v) > PILL_R || (Math.abs(u) > core && Math.hypot(Math.abs(u) - core, v) > PILL_R)) continue
    ;(u < 0 ? red : white).push([PILL_C[0] + u * ax[0] + v * px[0], PILL_C[1] + u * ax[1] + v * px[1]])
  }
  return { red, white }
})()
const NODES = [12, 51, 90, 129], NODE_Y = 101
const doneNode = (x: number) => [
  layer(T.disc(x, NODE_Y, 7.4), 'active'), layer(T.dotRing(x, NODE_Y, 8.6, { spacing: 1.7, size: 1.1 })),
  layer(path([[x - 4, NODE_Y + .3], [x - 1.2, NODE_Y + 3.1], [x + 4.2, NODE_Y - 2.6]], 1.25, 1.5)),
]
export const pharmaTrack: WidgetPreset = {
  id: 'pharma-track', name: '05 Pharma Track', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.text('COMPOUND AI-07', 2, 20), 'idle'), layer(T.text('PHASE II', 2, 32), 'idle'),
    layer(T.dots(pillSites.red, 1.35), 'active'), layer(T.dots(pillSites.white, 1.35)),
    layer(T.hrule(NODES[0] + 9, NODE_Y, NODES[1] - NODES[0] - 18), 'idle'),
    layer(T.hrule(NODES[1] + 9, NODE_Y, NODES[2] - NODES[1] - 18), 'mid'), layer(T.hrule(NODES[2] + 9, NODE_Y, NODES[3] - NODES[2] - 18), 'mid'),
    ...doneNode(NODES[0]), ...doneNode(NODES[1]),
    ...NODES.slice(2).map(x => layer(T.dotRing(x, NODE_Y, 8.6, { spacing: 1.5, size: 1.1 }), 'idle')),
    layer(T.text('PROGRESS', 2, 130), 'idle'), layer(T.big('66%', 143, 127, { lattice: 1.6, align: 'right' }), 'active'),
  ],
}

// ── 06 ─────────────────────────────────────────────────────────────────────────────
// Three ECG complexes on a flat baseline; the middle R-wave is the red one.
const ECG_A: Pt[] = [[4, 47], [17, 47], [19, 44], [21, 40], [23, 50], [26, 30], [28.5, 57], [31, 31], [34, 58], [37, 42], [40, 52], [42, 45], [45, 48], [48, 46], [52, 47], [64, 47], [66, 48]]
const ECG_R: Pt[] = [[66, 48], [69.5, 28], [73, 52]]
const ECG_B: Pt[] = [[73, 52], [75, 62], [78, 47], [80, 58], [83, 45], [86, 52], [88, 46], [91, 48], [94, 47], [108, 48], [111, 44], [114, 57], [117, 46], [119, 36], [121, 50], [123, 47], [140, 48]]
export const medicalMonitor: WidgetPreset = {
  id: 'medical-monitor', name: '06 Medical Monitor', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(path(ECG_A, 2, 1.25)), layer(path(ECG_B, 2, 1.25)), layer(path(ECG_R, 1.8, 1.25), 'active'),
    ...stat('HR', '72', 0, 84), layer(T.text('BPM', 0, 109), 'idle'),
    ...stat('SPO2', '98%', 46, 84),
    ...stat('TEMP', '36.6', 92, 84), layer(T.text('°C', 131, 100), 'idle'),
    layer(pillOutline(0, 123, 58, 142, 1.25, 1), 'mid'), layer(T.text('STABLE', 9, 129)), layer(T.dots([[50, 132.5]], 5), 'active'),
  ],
}

// ── 07 ─────────────────────────────────────────────────────────────────────────────
const BIO: Pt = [66, 62]
/** Leaf: round base lower-left, sharp tip upper-right, a midrib and a short stem. */
const LEAF = (() => {
  const a: Pt = [56, 70], b: Pt = [81, 49], d: Pt = [b[0] - a[0], b[1] - a[1]], len = Math.hypot(...d), n: Pt = [-d[1] / len, d[0] / len]
  const side = (sgn: number) => Array.from({ length: 25 }, (_, i) => { const s = i / 24, w = 24 * Math.sqrt(s) * (1 - s) ** 1.1; return [a[0] + d[0] * s + n[0] * w * sgn, a[1] + d[1] * s + n[1] * w * sgn] as Pt })
  return { outline: [...side(1), ...side(-1).reverse()], rib: [a, [a[0] + d[0] * .62, a[1] + d[1] * .62]] as Pt[], stem: [a, [52, 76]] as Pt[] }
})()
export const bioSensor: WidgetPreset = {
  id: 'bio-sensor', name: '07 Bio Sensor', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { moisture: .14 },
  layers: ({ data }) => {
    const inner = { spacing: 4.4, size: 2 }
    return [
      layer(T.dotRing(BIO[0], BIO[1], 41, { spacing: 4.9, size: 1.9 }), 'mid'),
      layer(T.dotRing(BIO[0], BIO[1], 33, inner), 'idle'),
      layer(T.dotRing(BIO[0], BIO[1], 33, { ...inner, start: deg(62), sweep: deg(190) })),
      layer(T.dotRing(BIO[0], BIO[1], 33, { ...inner, start: 0, sweep: TAU * data.moisture }), 'active'),
      layer(path(LEAF.outline, 2, 1.35, true)), layer(path(LEAF.rib, 2.6, 1.1), 'idle'), layer(path(LEAF.stem, 2, 1.35)),
      layer(T.text('MOISTURE', 0, 110), 'idle'), layer(T.big('64%', 0, 121, { lattice: 1.6 })),
      layer(T.text('LIGHT', 106, 110), 'idle'), layer(T.big('420', 106, 121, { lattice: 1.6 })), layer(T.text('LUX', 106, 135), 'idle'),
    ]
  },
}

// ── 08 ─────────────────────────────────────────────────────────────────────────────
export const wordPlay: WidgetPreset = {
  id: 'word-play', name: '08 Word Play', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.text('FILL IN THE BLANK', 8, 29), 'idle'),
    layer(T.big('C   D E', 8, 47, { lattice: 2 })),
    layer(T.dotLine(31, 62.5, 45, 62.5, { spacing: 1.75, size: 1.5 }), 'active'),
    layer(T.text('GREAT JOB!', 8, 76), 'idle'),
    layer(T.text('SCORE', 3, 110), 'idle'), layer(T.big('720', 3, 121, { lattice: 1.6 })),
    layer(T.text('STREAK', 64, 110), 'idle'), layer(T.big('12', 64, 121, { lattice: 1.6 })),
    // smiley on a raised dark disc
    layer(T.disc(126, 124, 12.5, .7), 'faint'),
    layer(T.dots([[122, 117.5], [122, 119.5], [130, 117.5], [130, 119.5]], 1.3)),
    layer(T.dotRing(126, 121.5, 7.5, { spacing: 1.7, size: 1.3, start: deg(116), sweep: deg(128) })),
  ],
}

// ── 09 ─────────────────────────────────────────────────────────────────────────────
const SALES: Pt[] = [[5, 93], [10, 89], [15, 88], [19, 84], [25, 88], [29, 86], [34, 82], [40, 74], [45, 78], [53, 88], [58, 86], [64, 79], [71, 71], [78, 75], [86, 79], [92, 73], [100, 67], [105, 62], [110, 57], [115, 63], [121, 72], [126, 77], [131, 80], [135, 78], [139, 72]]
const PEAK = 18, SALES_KNOTS = [3, 7, 9, 12, 14, 21, 23, 24]
export const retailAnalytics: WidgetPreset = {
  id: 'retail-analytics', name: '09 Retail Analytics', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { peak: 56 },
  layers: ({ data }) => {
    const pts = SALES.map(([x, y], i) => [x, i === PEAK ? 77 - data.peak * .36 : y] as Pt), [px, py] = pts[PEAK]
    return [
      layer(T.big('1.28K', 0, 18, { lattice: 2 })), layer(T.text('LIVE', 140, 24, { align: 'right' }), 'active'),
      layer(T.text('VISITORS', 0, 44), 'idle'),
      layer(path(pts, 3.3, 1.5)), layer(T.dots(SALES_KNOTS.map(i => pts[i]), 2.2)),
      layer(T.dotRing(px, py, 4.6, { spacing: 1, size: 1.1 }), 'active'), layer(T.dots([[px, py]], 3.6), 'active'),
      layer(T.text('SALES', 4, 126), 'idle'), layer(T.big('+$23%', 143, 123, { ...VALUE, align: 'right' }), 'active'),
    ]
  },
}

// ── 10 ─────────────────────────────────────────────────────────────────────────────
const SPEAKER = ['....#.....', '...##..#..', '####.#..#.', '#...#.#.#.', '#...#.#.#.', '####.#..#.', '...##..#..', '....#.....']
const VINYL: Pt = [69, 62]
const GROOVES: [number, number, 'value' | 'idle' | 'mid', number][] = [[15, 32, 'value', 1.5], [19.3, 30, 'value', 1.45], [23.6, 36, 'value', 1.45], [27.9, 41, 'idle', 1.4], [32.2, 47, 'idle', 1.35], [36.5, 52, 'mid', 1.35], [40.8, 57, 'mid', 1.3]]
export const entertainment: WidgetPreset = {
  id: 'entertainment', name: '10 Entertainment', group: 'polar', animated: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: ({ t }) => [
    layer(T.sprite(SPEAKER, 133, 0)),
    ...GROOVES.map(([r, n, tone, size], i) => layer(ringSlots(VINYL[0], VINYL[1], r * (1 + .025 * Math.sin(t * 1.6 - i * .7)), n, i * .5 + t * .15 * (i % 2 ? 1 : -1), size), tone)),
    layer(T.dots([VINYL], 5), 'active'),
    layer(T.vrule(25, 121, 11), 'value'), layer(triangle(27, 121, 8, 11, 'left'), 'value'),
    layer(T.dotRing(69, 126.5, 14.5, { spacing: 1.2, size: 1.1 }), 'active'), layer(triangle(66, 121, 9, 11, 'right'), 'active'),
    layer(triangle(105, 121, 8, 11, 'right'), 'value'), layer(T.vrule(113, 121, 11), 'value'),
  ],
}

// ── 11 ─────────────────────────────────────────────────────────────────────────────
const ROCKET = [
  '.......#.......',
  '......###......',
  '.....#####.....',
  '.....#...#.....',
  '.....#...#.....',
  '.....#####.....',
  '.#...#####...#.',
  '.#..#######..#.',
  '.##.#######.##.',
  '###############',
  '###.#######.###',
  '#.#.#######.#.#',
  '#...##.#.##...#',
]
const HEART = ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....']
const ALIEN = ['.....#.....', '....###....', '.#.#####.#.', '##.#.#.#.##', '###########', '..##...##..', '.#.......#.']
const STARS: Pt[] = [[66, 38], [51, 53], [82, 63], [120, 82], [87, 93], [51, 98], [76, 109], [130, 113], [140, 70]]
export const gameZone: WidgetPreset = {
  id: 'game-zone', name: '11 Game Zone', group: 'scatter', animated: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: ({ t }) => [
    layer(T.dots(STARS, .9), 'mid'),
    layer(sprite(ROCKET, 13, 43, 2.4)),
    layer(T.dotLine(31, 77.5, 31, 81.5, { spacing: 2, size: 1.2 }), 'active'),
    ...([[82, 21], [107, 21], [95, 35]] as Pt[]).map(([c, r], i) => layer(sprite(ALIEN, c, r + Math.round(Math.sin(t * 2 + i * 2)) * 1, 1.6))),
    ...[0, 1, 2].map(k => { const y = 52 + ((k * 20 + t * 12) % 60); return layer(T.dotLine(102, y, 102, y + 5, { spacing: 2.5, size: 1.6 }), 'active') }),
    layer(T.text('SCORE', 2, 119), 'idle'), layer(T.big('08920', 2, 130, { lattice: 1.6 })),
    layer(sprite(HEART, 84, 129, 1.5), 'active'), layer(sprite(HEART, 104, 129, 1.5), 'active'), layer(sprite(HEART, 124, 129, 1.5), 'mid'),
  ],
}

// ── 12 ─────────────────────────────────────────────────────────────────────────────
// Wireframe cube seen from slightly above: top face, bottom face, four verticals (back ones dimmer).
const TOP_F: Pt[] = [[46, 37], [74, 32], [103, 38], [73, 45]], BOT_F: Pt[] = [[48, 73], [74, 66], [104, 74], [74, 82]]
const CUBE_FRONT: Pt[][] = [[TOP_F[0], TOP_F[3], TOP_F[2]], [TOP_F[0], TOP_F[1], TOP_F[2]], [BOT_F[0], BOT_F[3], BOT_F[2]], [TOP_F[0], BOT_F[0]], [TOP_F[3], BOT_F[3]], [TOP_F[2], BOT_F[2]]]
const CUBE_BACK: Pt[][] = [[BOT_F[0], BOT_F[1], BOT_F[2]], [TOP_F[1], BOT_F[1]]]
const bracket = (x: number, y: number, dx: number, dy: number) => [T.hrule(dx > 0 ? x : x - 13, y, 14), T.vrule(x, dy > 0 ? y : y - 13, 14)]
export const visionAI: WidgetPreset = {
  id: 'vision-ai', name: '12 Vision AI', group: 'icon', animated: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: ({ t }) => [
    layer(T.dots([[118, 3]], 5), Math.sin(t * 3) > -.9 ? 'active' : 'faint'), layer(T.text('REC', 125, 0)),
    ...[...bracket(2, 24, 1, 1), ...bracket(141, 24, -1, 1), ...bracket(2, 99, 1, -1), ...bracket(141, 99, -1, -1)].map(f => layer(f)),
    ...CUBE_FRONT.map(e => layer(path(e, 2.4, 1.15))), ...CUBE_BACK.map(e => layer(path(e, 2.4, 1), 'idle')),
    layer(T.text('OBJECTS', 4, 117), 'idle'), layer(T.big('3', 4, 128, { lattice: 1.6 })),
    layer(T.text('CONFIDENCE', 84, 117), 'idle'), layer(T.big('92%', 84, 128, { lattice: 1.6 })),
  ],
}

export const deerflow12Board = [agentStatus, codexTokens, deviceOverview, teslaStatus, pharmaTrack, medicalMonitor, bioSensor, wordPlay, retailAnalytics, entertainment, gameZone, visionAI]
