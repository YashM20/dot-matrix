/**
 * Board 3 — DeerFlow Mosaic AIoT command center (public/images/HQIky8PaoAEHCij.jpg).
 * TILE cards (144×144): "NN  TITLE" labels with the card number in red, a small grey glyph top-right,
 * 5×7 captions on the card pitch, values on a 1–1.3 lattice, heroes as big single dots on a 2–3 lattice.
 * Photo-like content (thermal mug, car, desk scene) is a procedural luminance field in cell space.
 */
import { clamp, hash01, len, smoothstep } from '../../engine/math'
import type { Field } from '../../engine/types'
import { TAU, TILE, baked, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { HEART, INVADER } from '../sprites'

const T = layoutFor(TILE)
type Pt = [number, number]
const N = TILE.cols - 1
/** Photo-like cards: continuous dot sizes, no quantization (luminance in, halftone out). */
const photoStyle = { ...tileStyle, sizeMin: 0, sizeMax: 1.05, quantizeSteps: 0 }
/**
 * A field written in card cells (x,y ∈ 0..143), limited to a cell box: it reads 0 outside the box (so it
 * renders the same with or without `bounds`) and carries the box as `bounds` so the sampler skips the rest.
 */
const cells = (f: (x: number, y: number) => number, box: [number, number, number, number] = [0, 0, N, N]): Field => {
  // the sampler visits whole cells floor(c0)…ceil(c1); clip to exactly those
  const c0 = Math.floor(box[0]), r0 = Math.floor(box[1]), c1 = Math.ceil(box[2]), r1 = Math.ceil(box[3])
  // a fresh closure, so the bounds go straight on it (no `bounded()` wrapper call per cell)
  const field: Field = (u, v) => {
    const x = u * N, y = v * N, c = Math.round(x), r = Math.round(y)
    return c < c0 || c > c1 || r < r0 || r > r1 ? 0 : f(x, y)
  }
  field.bounds = [box[0], box[1], box[2], box[3]]
  return field
}
type Box = [number, number, number, number]
const bbox = (pts: Pt[]): Box => [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))]
/** Point in polygon (even-odd). `box` is the polygon's bbox: a point outside it is never inside, so most cells skip the edge walk. */
const inPoly = (pts: Pt[], x: number, y: number, box?: Box) => {
  if (box && (x < box[0] || x > box[2] || y < box[1] || y > box[3])) return false
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j]
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}
const segDist = (x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))
  return len(x - ax - t * dx, y - ay - t * dy)
}

/** Evenly spaced dot sites along a polyline (spacing carried across corners). */
const dotPath = (pts: Pt[], spacing: number, size: number): LatticeField => {
  const sites: Pt[] = []; let carry = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], len = Math.hypot(x1 - x0, y1 - y0)
    let d = carry
    for (; d <= len + 1e-9; d += spacing) sites.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len])
    carry = d - len
  }
  return T.dots(sites, size)
}
/** One-dot outline of a rounded rectangle on the card pitch (pills, stat panels). */
const frame = (x: number, y: number, w: number, h: number, r: number): Field => {
  const mx = x + (w - 1) / 2, my = y + (h - 1) / 2, hw = (w - 1) / 2 - r, hh = (h - 1) / 2 - r
  return cells((c, rr) => {
    c = Math.round(c); rr = Math.round(rr)
    const qx = Math.abs(c - mx) - hw, qy = Math.abs(rr - my) - hh
    const sd = len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
    return sd <= 0 && sd > -1 ? 1 : 0
  }, [x, y, x + w - 1, y + h - 1])
}
/**
 * Caption tier: the 5×7 font on a 0.72 lattice (glyph ≈ 5 cells tall, advance ≈ 4.3 cells). The
 * reference captions sit a step below the card label, so long secondary lines use this, not `T.text`.
 */
const CAP = .72
const cap = (s: string, col: number, row: number, align?: 'left' | 'center' | 'right') => T.big(s, col, row, { lattice: CAP, align })
const capW = (s: string) => T.size(s)[0] * CAP
/** Dashed tag box with its caption (vision camera detections). */
const TAG_H = 11
const tagW = (text: string) => Math.round(capW(text)) + 8
const tag = (x: number, y: number, text: string) => [layer(T.box(x, y, tagW(text), TAG_H, 2), 'idle'), layer(cap(text, x + 4, y + 3), 'value')]

// ── header: "NN  TITLE" label (number in red over the chrome label) + a grey glyph top-right ──────
const num = (n: string) => layer(T.text(n, 0, 0), 'active')
/** The ⁘ menu glyph: two columns of three dots with two small dots between the rows. */
const menuGlyph = [layer(T.dots([[137, .5], [142, .5], [137, 3.5], [142, 3.5], [137, 6.5], [142, 6.5]], 1.35), 'idle'), layer(T.dots([[139.5, 2], [139.5, 5]], 1), 'idle')]
const BOLT = ['...###', '..###.', '.###..', '######', '..###.', '.###..', '.##...', '##....', '#.....']
const boltGlyph = [layer(T.sprite(BOLT, 137, 0), 'idle')]
const waveGlyph = [layer(T.dots([[131, 3]], 1.3), 'idle'), layer(T.dotLine(134, 1.5, 134, 4.5, { spacing: 1, size: 1.1 }), 'idle'), layer(T.dotLine(137, 0, 137, 6, { spacing: 1, size: 1.1 }), 'idle'), layer(T.dotLine(140, 1.5, 140, 4.5, { spacing: 1, size: 1.1 }), 'idle'), layer(T.dots([[143, 3]], 1.3), 'idle')]

// ── 01 thermal monitor ──────────────────────────────────────────────────────────────────────────
// Mug in a thermal camera: hot core white, body red, cool halo grey (one accent, no false colour).
const MUG_X = 68.5
const mugHeat = (x: number, y: number) => {
  const ty = clamp((y - 43) / 57), half = 27.5 - 4.5 * ty
  const e = len((x - MUG_X) / 27.5, (y - 43) / 6.5), be = len((x - MUG_X) / 23, (y - 100) / 4.5)
  const body = (y >= 43 && y <= 100 && Math.abs(x - MUG_X) <= half) || e <= 1 || be <= 1
  const ho = len((x - 43) / 18, (y - 68) / 15.5), hi = len((x - 41) / 10, (y - 68) / 9.5)
  const handle = x < 44 && ho <= 1 && hi >= 1
  const grain = .09 * Math.sin(x * 1.3 + y * .7) * Math.cos(y * 1.1 - x * .4) + .12 * (hash01(Math.round(x) * 151 + Math.round(y), 3) - .5)
  let h = 0
  if (body) {
    const core = Math.exp(-((x - 62) ** 2 + (y - 68) ** 2) / (2 * 12 ** 2))
    const edge = Math.min(half - Math.abs(x - MUG_X), 104.5 - y)
    h = (.52 + .5 * core + grain) * (.8 + .2 * smoothstep(0, 4, edge))
    if (e < .86) h = .5 + grain
  }
  if (Math.abs(e - 1) < .13) h = Math.max(h, .7 + grain)
  if (handle) h = Math.max(h, .58 + grain)
  if (h > 0) return h
  // halo: distance to the nearest warm edge
  const d = Math.min(Math.max(Math.abs(x - MUG_X) - half, 36.5 - y, y - 104.5, 0) + (y < 36.5 || y > 104.5 ? Math.max(0, Math.abs(x - MUG_X) - half) : 0), x < 46 ? Math.max(0, ho - 1) * 15 : 99)
  return .34 * Math.exp(-d / 2.2)
}
/** The mug is static: bake its heat once per card cell, shared by the three tone layers below. */
const HEAT = new Float64Array(TILE.cols * TILE.rows).fill(NaN)
const heatAt = (x: number, y: number) => {
  const c = Math.round(x), r = Math.round(y)
  if (Math.abs(x - c) > 1e-6 || Math.abs(y - r) > 1e-6 || c < 0 || r < 0 || c > N || r > N) return mugHeat(x, y)
  const i = r * TILE.cols + c, h = HEAT[i]
  return h === h ? h : (HEAT[i] = mugHeat(x, y))
}
const PANEL: [number, number, number, number] = [0, 16, 117, 110]
/** Red → white is dithered: the hotter a cell, the likelier it is a white dot. */
const hot = (x: number, y: number, h: number) => hash01(Math.round(x) * 151 + Math.round(y), 7) < clamp((h - .76) / .2)
// the heat split into its three tones: cool halo grey, warm body red, hot core white (dot size = heat), each baked per cell
const HEAT_MID = baked(TILE, cells((x, y) => { const h = heatAt(x, y); return h >= .05 && h < .42 ? .25 + h * 1.2 : 0 }, PANEL))
const HEAT_WARM = baked(TILE, cells((x, y) => { const h = heatAt(x, y); return h >= .42 && !hot(x, y, h) ? .45 + .55 * clamp((h - .42) / .3) : 0 }, PANEL))
const HEAT_HOT = baked(TILE, cells((x, y) => { const h = heatAt(x, y); return hot(x, y, h) ? .7 + .3 * clamp((h - .9) / .1) : 0 }, PANEL))
export const thermalMonitor: WidgetPreset = {
  id: 'thermal-monitor', name: '01 Thermal Monitor', label: '01  THERMAL MONITOR', group: 'photo', chrome: 'dots', grid: TILE, style: photoStyle,
  layers: () => [
    num('01'), ...menuGlyph,
    // sensor frame, then the heat
    layer(frame(0, 16, 118, 95, 6), 'faint'),
    layer(HEAT_MID, 'mid'), layer(HEAT_WARM, 'active'), layer(HEAT_HOT, 'value'),
    // colour scale: hot (red) at the top fading to cool grey
    layer(cap('55°C', 143, 20, 'right'), 'value'),
    ...[138, 141].flatMap(x => [
      layer({ ...T.dotLine(x, 30, x, 102, { spacing: 2.4, size: 2.2 }), field: cells((_, y) => (y < 62 ? 1 : 0)) }, 'active'),
      layer({ ...T.dotLine(x, 30, x, 102, { spacing: 2.4, size: 2.2 }), field: cells((_, y) => (y >= 62 ? 1 - (y - 62) / 50 : 0)) }, 'idle'),
    ]),
    layer(cap('18°C', 143, 106, 'right'), 'value'),
    // min / center / max: small caption over a 1.1-lattice value
    layer(cap('MIN', 1, 121), 'idle'), layer(T.big('20.3°C', 1, 131, { lattice: 1.1 })),
    layer(T.vrule(46, 120, 22), 'faint'),
    layer(cap('CENTER', 53, 121), 'idle'), layer(T.big('46.7°C', 53, 131, { lattice: 1.1 }), 'active'),
    layer(T.vrule(98, 120, 22), 'faint'),
    layer(cap('MAX', 104, 121), 'idle'), layer(T.big('52.1°C', 104, 131, { lattice: 1.1 })),
  ],
}

// ── 02 EV charge ────────────────────────────────────────────────────────────────────────────────
const ROOF: Pt[] = [[0, 80], [6, 75], [22, 71], [44, 66], [52, 61], [62, 55], [76, 51], [96, 49.5], [114, 51], [130, 55], [143, 59]]
const along = (pts: Pt[], x: number) => {
  for (let i = 0; i < pts.length - 1; i++) if (x <= pts[i + 1][0]) { const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) }
  return pts[pts.length - 1][1]
}
const WHEELS: Pt[] = [[31, 88], [126, 87]]
/** Dark sedan in profile: dim body, darker glass, highlights on the roofline, crease and rims. */
const car = (x: number, y: number) => {
  for (const [wx, wy] of WHEELS) {
    const d = len(x - wx, y - wy)
    if (d <= 11.5) {
      if (d > 8.8) return .18
      if (d < 2.2) return .7
      const a = Math.atan2(y - wy, x - wx)
      return d > 7.6 ? .6 : .22 + .4 * Math.max(0, Math.cos(5 * a)) ** 2
    }
    if (d <= 13.2 && y > wy - 13) return 0
  }
  const top = along(ROOF, x)
  if (y < top) return 0
  if (y > 93) return 0
  if (y < top + 1.3) return .85
  const crease = 76 - (x * 6) / 143
  if (x > 49 && x < 140 && y < 64.5) return Math.abs(x - 85) < 1.3 || y < top + 2.4 ? .45 : .14 + .12 * smoothstep(58, 50, y)
  if (Math.abs(y - 65.5) < .7 && x > 46) return .62
  if (Math.abs(y - crease) < .7) return .58
  if (x < 12 && y > 77 && y < 80) return .9
  if (len(x - 57, y - 64) < 2.6) return .55
  return (y < crease ? .5 : .4) - .22 * clamp((y - 70) / 23)
}
const CAR = baked(TILE, cells(car, [0, 48, N, 97]))
export const evCharge: WidgetPreset = {
  id: 'ev-charge', name: '02 EV Charge', label: '02  EV CHARGE', group: 'icon', chrome: 'dots', grid: TILE, style: photoStyle,
  defaults: { charge: 0.78 },
  layers: ({ data }) => {
    const pct = String(Math.round(data.charge * 100)), w = T.size(pct)[0] * 3
    return [
      num('02'), ...boltGlyph,
      layer(T.big(pct, 0, 22, { lattice: 3 })), layer(T.big('%', w + 3, 32.4, { lattice: 1.6 })),
      layer(cap('CHARGING', Math.max(57, Math.round(w + 19)), 36), 'idle'),
      layer(CAR, 'idle'),
      // charge port: plug, red port light, cable running back along the ground
      layer(T.hrule(97, 76, 7), 'value'), layer(T.dots([[106.5, 76]], 3.4), 'active'),
      layer(dotPath([[107.5, 79], [108.5, 90], [110, 96], [114, 99], [143, 99]], 1.05, 1.05), 'active'),
      layer(T.hrule(0, 109, 144), 'faint'),
      ...([['142 KW', 'SPEED', 1], ['00:28', 'TIME LEFT', 56], ['312 KM', 'RANGE', 104.5]] as const).flatMap(([v, k, x]) => [
        layer(T.big(v, x, 119, { lattice: 1.1 })), layer(cap(k, x, 131), 'idle'),
      ]),
      layer(T.vrule(47, 118, 19), 'faint'), layer(T.vrule(99, 118, 19), 'faint'),
      layer(T.dotLine(1, 141.5, 142, 141.5, { spacing: 1.5, size: 1.6 }), 'faint'),
      layer(T.dotLine(1, 141.5, 1 + 141 * data.charge, 141.5, { spacing: 1.5, size: 1.6 }), 'active'),
    ]
  },
}

// ── 03 Codex usage ──────────────────────────────────────────────────────────────────────────────
// 16 buckets over the day: total tokens (grey) with the consumed share in red on top of it.
const TOTAL = [.2, .14, .28, .14, .33, .44, .5, .22, .26, .54, .17, .33, .76, .43, .21, .43]
const USED = [0, 0, 0, 0, .09, .28, .28, .22, .19, .27, .17, .17, .25, .43, .21, .43]
const CHART = { x0: 72, gap: 3.8, base: 119, height: 76, size: 1.4, pitch: 1.5 }
export const codexUsage: WidgetPreset = {
  id: 'codex-usage', name: '03 Codex Usage', label: '03  CODEX USAGE', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    // each bar is two dot columns wide, like the reference's chunky bars
    const bars = (v: number[]) => [0, CHART.pitch].map(dx => T.dotBars(v, CHART.x0 + dx, CHART.base, { gap: CHART.gap, pitch: CHART.pitch, height: CHART.height, size: CHART.size }))
    return [
      num('03'), ...menuGlyph,
      layer(cap('HENRY / CODEX', 0, 27), 'active'),
      layer(T.big('2,842', 0, 42, { lattice: 2.3 })),
      layer(cap('TOKENS REMAINING', 0, 67), 'idle'),
      layer(T.big('1,158', 0, 89, { lattice: 1.4 })),
      layer(cap('CONSUMED TODAY', 0, 106), 'idle'),
      layer(T.hrule(0, 129, 64), 'faint'),
      layer(cap('DAILY USAGE', 0, 137), 'idle'),
      // chart: axis on the right with its scale, hour ticks below
      ...bars(TOTAL).map(b => layer(b, 'mid')), ...bars(USED).map(b => layer(b, 'active')),
      layer(T.vrule(134, 41, 80), 'faint'),
      layer(cap('6K', 143.5, 40, 'right'), 'idle'), layer(cap('3K', 143.5, 78, 'right'), 'idle'), layer(cap('0', 143.5, 116, 'right'), 'idle'),
      ...([['00', 0], ['06', 3.75], ['12', 7.5], ['18', 11.25], ['24', 15]] as const).map(([s, i]) => layer(cap(s, CHART.x0 + CHART.pitch / 2 + i * CHART.gap, 126, 'center'), 'idle')),
    ]
  },
}

// ── 04 fitness rings ────────────────────────────────────────────────────────────────────────────
const FLAME = ['....#....', '....##...', '...#.#...', '..#...#..', '.#....#.#', '.#.....##', '#...#...#', '#..#.#..#', '#..#..#.#', '.#..##.#.', '..#####..']
const SHOE = ['..##.......', '..#.#......', '..#..##....', '.#.....###.', '.#........#', '#.........#', '###########']
const DUMBBELL = ['..##...##..', '.#.#...#.#.', '#..#...#..#', '#..#####..#', '#..#...#..#', '.#.#...#.#.', '..##...##..']
const TREND: Pt[] = [[0, 120], [8, 117.5], [15, 115], [23, 110], [30, 113], [36, 113.5], [43, 117], [49, 118], [57, 113], [63, 112], [68, 109], [74, 114], [80, 116], [86, 116], [92, 110], [98, 105.5], [104, 103], [112, 105], [118, 105], [126, 107], [131, 108], [137, 107]]
const RING_C: Pt = [33.5, 61]
/** The dim red wash fading out below the trend line. */
const TREND_WASH = baked(TILE, cells((x, y) => { const d = y - along(TREND, x); return d > 1.5 ? .32 * (1 - d / 16) : 0 }, [0, 100, N, 127]))
export const fitnessRings: WidgetPreset = {
  id: 'fitness-rings', name: '04 Fitness Rings', label: '04  FITNESS RINGS', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { move: 0.5, exercise: 0.58, stand: 0.5 },
  layers: ({ data }) => {
    const ring = (r: number, spacing: number, size: number, fill: number, tone: 'active' | 'value') => [
      layer(T.dotRing(...RING_C, r, { spacing, size: 1.5 }), 'faint'),
      layer(T.dotRing(...RING_C, r, { spacing, size, sweep: TAU * fill }), tone),
    ]
    return [
      num('04'), ...menuGlyph,
      ...ring(33, 2.4, 2.9, data.move, 'active'), ...ring(23.5, 2.4, 2.9, data.exercise, 'active'), ...ring(13.5, 1.9, 1.7, data.stand, 'value'),
      layer(T.sprite(FLAME, 73, 26), 'active'), layer(T.big('1,234', 86, 27, { lattice: 1.15 })), layer(cap('CAL', 125, 31), 'idle'),
      layer(T.sprite(SHOE, 72, 51), 'idle'), layer(T.big('8,935', 86, 50, { lattice: 1.15 })), layer(cap('MOVE', 125, 54), 'idle'),
      layer(T.sprite(DUMBBELL, 72, 74), 'idle'), layer(T.big('62', 86, 73, { lattice: 1.15 })), layer(cap('TRAIN', 104, 77), 'idle'),
      // the trend line with a dim red wash fading out below it
      layer(TREND_WASH, 'active'),
      layer(dotPath(TREND, 1.1, 1.35), 'active'),
      layer(T.hrule(0, 129, 144, 2), 'faint'),
      ...['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => layer(T.text(d, 2 + i * 22.2, 136, { align: 'center' }), i === 6 ? 'active' : 'idle')),
    ]
  },
}

// ── 05 Henry sleep ──────────────────────────────────────────────────────────────────────────────
// Hypnogram blocks [x0, x1) per stage band, read off the reference.
const REM: Pt[] = [[5, 15], [39, 52], [73, 78], [121, 126]]
const CORE: Pt[] = [[0, 5], [16, 44], [53, 58], [63, 72], [78, 86], [88, 94], [95, 101], [106, 122], [127, 135], [136, 144]]
const DEEP: Pt[] = [[15, 25], [58, 63], [83, 88], [101, 106]]
const band = (spans: Pt[], row: number, h: number) => spans.map(([a, b]) => T.rect(a, row, b - a, h))
const STATS = [['DEEP', '1:46'], ['CORE', '4:35'], ['REM', '1:32'], ['AWAKE', '0:14']]
export const henrySleep: WidgetPreset = {
  id: 'henry-sleep', name: '05 Henry Sleep', label: '05  HENRY SLEEP', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    num('05'), ...menuGlyph,
    layer(T.big('8:07', 0, 22, { lattice: 2 })), layer(cap('HR', 48, 31), 'idle'),
    layer(T.rect(0, 46, 4, 4), 'active'), layer(cap('DEEP', 7, 45.5), 'idle'),
    layer(T.rect(40, 46, 4, 4), 'value'), layer(cap('CORE', 47, 45.5), 'idle'),
    layer(T.rect(78, 46, 4, 4), 'mid'), layer(cap('REM', 85, 45.5), 'idle'),
    layer(T.hrule(113, 48, 6), 'value'), layer(cap('AWAKE', 143.5, 45.5, 'right'), 'idle'),
    ...band(REM, 65, 11).map(f => layer(f, 'mid')), ...band(CORE, 77, 12).map(f => layer(f, 'value')), ...band(DEEP, 89, 11).map(f => layer(f, 'active')),
    layer(cap('23:41', 0, 104), 'idle'), layer(cap('07:48', 143.5, 104, 'right'), 'idle'),
    layer(frame(0, 115, 144, 29, 4), 'faint'),
    ...STATS.flatMap(([k, v], i) => [
      layer(cap(k, 5 + Math.round(i * 35.5), 121), i === 0 ? 'active' : 'idle'),
      layer(T.big(v, 5 + Math.round(i * 35.5), 130.5, { lattice: 1.15 }), i === 0 ? 'active' : 'value'),
      ...(i ? [layer(T.vrule(Math.round(i * 35.5), 120, 20), 'faint')] : []),
    ]),
  ],
}

// ── 06 mini game ────────────────────────────────────────────────────────────────────────────────
const HEART_OUTLINE = ['.##..##.', '#..##..#', '#......#', '.#....#.', '..#..#..', '...##...']
const SHIP_W = [
  '........##........', '........##........', '.......####.......', '.......#..#.......', '.......####.......', '.......#..#.......', '.......####.......', '.......#..#.......',
  '.....########.....', '.....#.#..#.#.....', '.....########.....', '.....##....##.....', '.....###..###.....', '.....##....##.....',
  '###.##########.###', '#.#.#.#.##.#.#.#.#', '##################', '#.#.#.#.##.#.#.#.#', '###.##########.###', '###..###..###..###', '###.....##.....###',
]
const SHIP_R = [
  '', '', '', '', '', '', '....#........#....', '....#........#....', '', '', '.#..............#.', '.#..............#.', '.#......##......#.', '........##........',
  '', '', '........##........', '........##........', '', '', '', '.....#......#.....',
]
// seeds 24/25 picked after the hash01 switch: evenly spread, no star pairs clumping beside the invaders
const STARS: Pt[] = Array.from({ length: 34 }, (_, i) => [Math.round(hash01(i, 24) * 143), 14 + Math.round(hash01(i, 25) * 129)] as Pt)
  .filter(([x, y]) => !(x > 52 && x < 84 && y > 108) && !(x > 90 && y < 40) && !(x < 30 && y < 28))
const SPARKS: Pt[] = [[82, 41], [76, 47], [91, 47], [75, 57], [92, 57], [79, 62], [88, 62], [83.5, 65]]
export const miniGame: WidgetPreset = {
  id: 'mini-game', name: '06 Mini Game', label: '06  MINI GAME', group: 'scatter', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const sway = Math.round(Math.sin(t * 1.2) * 2), shot = (t * 18) % 22
    const invader = (x: number, y: number) => { const L = T.lattice(1.25, x + sway, y); return L.at(L.sprite(INVADER, 0, 0)) }
    const ship = T.lattice(1.3, 57, 115)
    return [
      num('06'), ...menuGlyph,
      layer(T.dots(STARS.filter((_, i) => i % 3), 1), 'mid'), layer(T.dots(STARS.filter((_, i) => !(i % 3)), 1.3), 'idle'),
      ...([[HEART, 0, 'active'], [HEART, 10.5, 'active'], [HEART_OUTLINE, 21, 'idle']] as const).map(([art, x, tone]) => { const L = T.lattice(1.15, x, 18); return layer(L.at(L.sprite([...art], 0, 0)), tone) }),
      layer(T.text('SCORE', 94, 20), 'idle'), layer(T.big('01260', 94, 30, { lattice: 1.25 })),
      layer(invader(20, 43)), layer(invader(43, 55)), layer(invader(104, 64)),
      layer(invader(76, 47), 'active'), layer(T.dots(SPARKS.map(([x, y]) => [x + sway, y] as Pt), 1.1), 'active'),
      layer(T.dotLine(68, 81 - shot, 68, 89 - shot, { spacing: 1.2, size: 1.6 }), 'active'),
      layer(T.dotLine(68, 103 - shot, 68, 110 - shot, { spacing: 1.2, size: 1.6 }), 'active'),
      layer(ship.at(ship.sprite(SHIP_W, 0, 0))), layer(ship.at(ship.sprite(SHIP_R, 0, 0)), 'active'),
    ]
  },
}

// ── 07 AI assistant ─────────────────────────────────────────────────────────────────────────────
const pillIcon = (kind: number, cy: number): Field[] => {
  const ring = T.ring(7, cy, 3.6)
  if (kind === 1) return [T.box(3, cy - 4, 9, 9), T.dot(7, cy), T.dot(8, cy - 1)]
  if (kind === 2) return [ring, T.vrule(7, cy - 1, 3)]
  if (kind === 3) return [ring, T.dot(7, cy - 1), T.dot(6, cy), T.dot(8, cy), T.dot(7, cy + 1)]
  return [ring, T.dot(7, cy)]
}
const SUGGESTIONS = ['SUMMARIZE MY DAY', 'CHECK MY CALENDAR', 'ANALYZE MY WORKOUT', 'DRAFT PROJECT UPDATE']
export const aiAssistant: WidgetPreset = {
  id: 'ai-assistant', name: '07 AI Assistant', label: '07  AI ASSISTANT', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    num('07'), ...menuGlyph,
    layer(T.big('HELLO,', 2, 20, { lattice: 1.2 })), layer(T.big('HENRY', 2 + 42 * 1.2, 20, { lattice: 1.2 }), 'active'),
    layer(cap('HOW CAN I HELP TODAY?', 2, 33), 'idle'),
    ...SUGGESTIONS.flatMap((s, i) => {
      const y = 47 + i * 18.5, cy = Math.round(y + 8)
      return [
        layer(frame(0, Math.round(y), 144, 17, 7), 'faint'),
        ...pillIcon(i, cy).map(f => layer(f, 'idle')),
        layer(cap(s, 15, cy - 2.5), 'value'), layer(cap('>', 137, cy - 2.5), 'idle'),
      ]
    }),
    layer(frame(0, 123, 144, 21, 9), 'faint'),
    layer(cap('ASK ANYTHING...', 5, 131), 'mid'),
    layer(T.disc(133, 133, 9.5), 'active'),
    layer(T.vrule(133, 128, 11), 'value'), layer(T.line([[129, 132], [133, 128], [137, 132]]), 'value'),
  ],
}

// ── 08 vision camera ────────────────────────────────────────────────────────────────────────────
const LAPTOP: Pt[] = [[54, 60], [108, 48], [143, 53], [143, 93], [103, 105]]
const NOTEBOOK: Pt[] = [[13, 100], [62, 91], [94, 121], [42, 129]]
const LEAVES: Pt[] = [[110, 19], [116, 14], [124, 12], [131, 15], [139, 21], [140, 30], [112, 28], [119, 18]]
const TAGS: [number, number, string][] = [[84, 24, 'PLANT'], [18, 44, 'MUG'], [106, 77, 'LAPTOP'], [82, 108, 'NOTEBOOK']]
const TAG_BOX = TAGS.map(([x, y, s]) => [x, y, x + tagW(s) - 1, y + TAG_H - 1])
const LAPTOP_BOX = bbox(LAPTOP), NOTEBOOK_BOX = bbox(NOTEBOOK)
/** `segDist(x, y, a, b) < d`, skipping the distance when (x, y) is outside the segment's box grown by `d` (it cannot be that close). */
const near = (x: number, y: number, a: Pt, b: Pt, d: number) =>
  x > Math.min(a[0], b[0]) - d && x < Math.max(a[0], b[0]) + d && y > Math.min(a[1], b[1]) - d && y < Math.max(a[1], b[1]) + d && segDist(x, y, a, b) < d
const PEN: [Pt, Pt] = [[50, 98], [76, 114]]
/** Dim desk scene: black mug, closed silver laptop, notebook and pen, a potted plant. */
const desk = (x: number, y: number) => {
  for (const [a, b, c, d] of TAG_BOX) if (x >= a && x <= c && y >= b && y <= d) return 0
  // desk: a soft pool of light behind the laptop, falling off toward the edges
  let lum = .24 + .16 * clamp(1 - len(x - 60, y - 40) / 110) + .03 * (hash01(Math.round(x) * 157 + Math.round(y), 9) - .5)
  // plant: dark pot with a lit rim, leaf strokes fanning out of it
  if (x > 113 && x < 134 && y > 33 && y < 52) lum = y < 36 ? .5 : .1 + .1 * clamp((x - 114) / 20)
  else if (y < 36 && LEAVES.some(p => near(x, y, [123, 34], p, 1.3))) lum = .7
  // laptop lid: brushed silver, bright bevel along the near edges, darker logo
  if (inPoly(LAPTOP, x, y, LAPTOP_BOX)) {
    lum = .8 - .32 * clamp((x - 54) / 90) - .12 * clamp((y - 55) / 50) + .04 * Math.sin((x + y) * .9)
    if (near(x, y, LAPTOP[0], LAPTOP[4], 1.3) || near(x, y, LAPTOP[0], LAPTOP[1], .9)) lum = .95
    if (len((x - 97) / 1.3, y - 67) < 2.6) lum = .22
  } else if (near(x, y, [55, 62], [104, 107], 1.4) || near(x, y, [104, 107], [143, 96], 1.2)) lum = .55
  // notebook with a lit spine, pen across it
  if (inPoly(NOTEBOOK, x, y, NOTEBOOK_BOX)) lum = near(x, y, NOTEBOOK[0], NOTEBOOK[3], 1.4) ? .75 : .16 - .06 * clamp((y - 92) / 37)
  if (near(x, y, PEN[0], PEN[1], 1.5)) lum = near(x, y, PEN[0], PEN[1], .6) ? .75 : .05
  // mug: black body, lit rim, handle with a highlight on its outer curve
  const rim = len((x - 24.5) / 13.5, (y - 63) / 4)
  const ho = len((x - 38) / 9, (y - 77) / 10), hi = len((x - 38) / 5.5, (y - 77) / 6.5)
  if (x > 37 && ho <= 1 && hi >= 1) lum = ho > .82 ? .5 : .06
  if ((x >= 11 && x <= 38 && y >= 63 && y <= 95) || rim <= 1) lum = rim < 1 ? .03 : x < 15 ? .3 : x > 33 ? .18 : .06
  if (Math.abs(rim - 1) < .16) lum = .7
  return lum
}
const DESK = baked(TILE, cells(desk, [0, 16, N, 128]))
const corner = (x: number, y: number, dx: number, dy: number) => [T.hrule(dx > 0 ? x : x - 8, y, 9), T.vrule(x, dy > 0 ? y : y - 8, 9)]
export const visionCamera: WidgetPreset = {
  id: 'vision-camera', name: '08 Vision Camera', label: '08  VISION CAMERA', group: 'composite', chrome: 'dots', grid: TILE, style: photoStyle,
  layers: () => [
    num('08'), ...menuGlyph,
    layer(DESK, 'idle'),
    ...[...corner(4, 21, 1, 1), ...corner(139, 21, -1, 1), ...corner(4, 123, 1, -1), ...corner(139, 123, -1, -1)].map(f => layer(f, 'value')),
    ...TAGS.flatMap(([x, y, s]) => tag(x, y, s)),
    layer(cap('SCENE CONFIDENCE', 1, 138), 'idle'),
    layer(T.dots([[125, 140.5]], 2.6), 'active'), layer(cap('92%', 143, 138, 'right'), 'value'),
  ],
}

// ── 09 DeerFlow agent ───────────────────────────────────────────────────────────────────────────
const DEER_HEAD = [
  '.#...........#.', '.#.#.......#.#.', '.#.#.......#.#.', '##.#.#...#.#.##', '.####.#.#.####.', '....##...##....', '.....#####.....',
  '....#######....', '....##.#.##....', '.....#####.....', '.....#####.....', '......###......', '......###......', '.......#.......',
]
const DEER_C: Pt = [111, 50]
const CPU = [['CPU', '18%'], ['MEM', '42%'], ['NET', '23 KB/S'], ['TEMP', '37°C']]
const CPU_X = [0, 34, 68, 120]
export const deerflowAgent: WidgetPreset = {
  id: 'deerflow-agent', name: '09 DeerFlow Agent', label: '09  DEERFLOW AGENT', group: 'composite', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  defaults: { progress: 0.72 },
  layers: ({ data, t }) => {
    // two dotted halos with a brightness sweep running around them
    const sweep = (phase: number) => cells((x, y) => { const a = Math.atan2(x - DEER_C[0], DEER_C[1] - y); return .35 + .65 * (.5 + .5 * Math.cos(a - t * 1.2 - phase)) })
    const head = T.lattice(1.8, DEER_C[0] - 13.5, DEER_C[1] - 12)
    const dots = Math.floor(t * 2) % 4
    return [
      num('09'), ...waveGlyph,
      layer(T.big('ACTIVE', 0, 28, { lattice: 2 }), 'active'),
      layer(cap('RUNNING AGENT', 1, 53), 'value'),
      ...Array.from({ length: dots }, (_, i) => layer(T.dots([[1 + capW('RUNNING AGENT') + 2.5 + i * 2.6, 57.5]], .9), 'value')),
      layer({ ...T.dotRing(...DEER_C, 27, { spacing: 4.2, size: 1.7 }), field: sweep(0) }, 'active'),
      layer({ ...T.dotRing(...DEER_C, 21.5, { spacing: 4.2, size: 1.3 }), field: sweep(1.4) }, 'active'),
      layer(head.at(head.sprite(DEER_HEAD, 0, 0)), 'active'),
      layer(cap('TASK PROGRESS', 1, 92), 'idle'), layer(T.big(`${Math.round(data.progress * 100)}%`, 143.5, 90, { lattice: 1.15, align: 'right' })),
      layer(T.dotLine(1.5, 104.5, 142, 104.5, { spacing: 1.4, size: 2.2 }), 'faint'),
      layer(T.dotLine(1.5, 104.5, 1.5 + 140.5 * data.progress, 104.5, { spacing: 1.4, size: 2.2 }), 'active'),
      layer(T.hrule(0, 115, 144), 'faint'),
      ...CPU.flatMap(([k, v], i) => [
        layer(cap(k, CPU_X[i] + 1, 124), 'idle'), layer(T.text(v, CPU_X[i] + 1, 134)),
        ...(i ? [layer(T.vrule(CPU_X[i] - (i === 3 ? 5 : 4), 122, 21), 'faint')] : []),
      ]),
    ]
  },
}

export const mosaicBoard = [thermalMonitor, evCharge, codexUsage, fitnessRings, henrySleep, miniGame, aiAssistant, visionCamera, deerflowAgent]
