/**
 * Board 1 — DOT/480 OLED micro interface system (public/images/henry-example-interface-system.png).
 * TILE cards (144×144): 5×7 labels and captions on the card pitch, the clock faces in the sheet's
 * 6×8 numeral font as single big dots, rings/arcs/sliders as evenly spaced dot sites, and the small
 * line icons (transport, settings glyphs, camera buttons) as 1-dot strokes on the card pitch.
 */
import { glyph } from '../../engine/fields/bitmapFont'
import { hash01 } from '../../engine/math'
import { decodeText, splitFlapCells, type FlapCell } from '../../engine/motion/text'
import type { Field } from '../../engine/types'
import { TAU, TILE, bounded, combine, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
/** Small secondary lines ("MAY 20 TUE", "CLOUDY") sit a hair above the label pitch. */
const SMALL = { lattice: 1.1 }
const tile = { chrome: 'dots', grid: TILE, style: tileStyle } as const

// ── local helpers ───────────────────────────────────────────────────────────
/** The sheet's numeral face: 6×8, one-dot strokes (clock, timer, temperature). */
const NUM: Record<string, string[]> = {
  '0': ['.####.', '#....#', '#....#', '#....#', '#....#', '#....#', '#....#', '.####.'],
  '1': ['..#...', '.##...', '..#...', '..#...', '..#...', '..#...', '..#...', '.###..'],
  '2': ['.####.', '#....#', '.....#', '....#.', '...#..', '..#...', '.#....', '######'],
  '3': ['.####.', '#....#', '.....#', '..###.', '.....#', '.....#', '#....#', '.####.'],
  '4': ['...#..', '..##..', '.#.#..', '#..#..', '#..#..', '#####.', '...#..', '...#..'],
  '5': ['######', '#.....', '#.....', '#####.', '.....#', '.....#', '#....#', '.####.'],
  '6': ['..###.', '.#....', '#.....', '#####.', '#....#', '#....#', '#....#', '.####.'],
  '7': ['######', '.....#', '....#.', '...#..', '..#...', '..#...', '..#...', '..#...'],
  '8': ['.####.', '#....#', '#....#', '.####.', '#....#', '#....#', '#....#', '.####.'],
  '9': ['.####.', '#....#', '#....#', '#....#', '.#####', '.....#', '....#.', '.###..'],
  ':': ['...', '...', '.#.', '...', '...', '.#.', '...', '...'],
  '°': ['.##.', '#..#', '#..#', '.##.', '....', '....', '....', '....'],
  ' ': ['...', '...', '...', '...', '...', '...', '...', '...'],
}
const bitsOf = (ch: string) => NUM[ch] ?? glyph(ch).map(row => row.map(b => (b ? '#' : '.')).join(''))
/**
 * Text as explicit dot sites: `px`/`py` cells between dots, `size` = dot size. Unlike a lattice
 * layer this keeps the reference's dot-to-gap ratio (big dots with clear air between them).
 */
export function dotText(str: string, x: number, y: number, o: { px: number; py?: number; size: number; gap?: number; align?: 'left' | 'center' | 'right' }): LatticeField {
  const { px, py = px, size, gap = 1 } = o, chars = [...str].map(bitsOf)
  const cols = chars.reduce((n, g) => n + g[0].length, 0) + gap * (chars.length - 1), w = (cols - 1) * px
  let cx = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x
  const sites: Pt[] = []
  for (const g of chars) {
    g.forEach((row, r) => [...row].forEach((b, c) => { if (b === '#') sites.push([cx + c * px, y + r * py]) }))
    cx += (g[0].length + gap) * px
  }
  return T.dots(sites, size)
}
/**
 * Split-flap text as dot sites: like `dotText`, but a column mid-flip shows the new top half and
 * the old bottom half, with the flap folding about the glyph's middle — its rows squeeze toward
 * the hinge by |cos(πφ)| (old top half falling, then new bottom half landing) and hide whatever it
 * covers. Returns `[faces, flap]`; the flap dims while it is steep, so the fold reads as depth.
 */
export function flapText(cells: FlapCell[], x: number, y: number, o: { px: number; py?: number; size: number; gap?: number }): [LatticeField, LatticeField] {
  const { px, py = px, size, gap = 1 } = o
  const faces: Pt[] = [], flap: Pt[] = []
  let cx = x
  for (const { from, to, phase } of cells) {
    const a = bitsOf(from), b = bitsOf(to), rows = b.length, hinge = y + ((rows - 1) / 2) * py
    const fold = Math.abs(Math.cos(Math.PI * phase)), reach = (rows / 2) * py * fold
    b.forEach((row, r) => [...row].forEach((bit, c) => {
      const top = r < rows / 2, sy = y + r * py, sx = cx + c * px
      if (phase >= 1) { if (bit === '#') faces.push([sx, sy]); return }
      // behind the flap: new top half (uncovered as the flap falls), old bottom half (until it lands)
      const face = top ? bit : a[r]?.[c]
      const covered = top ? phase < .5 && sy > hinge - reach : phase >= .5 && sy < hinge + reach
      if (face === '#' && !covered) faces.push([sx, sy])
      // the flap: old top half folding down (φ < ½), then the new bottom half unfolding (φ ≥ ½)
      const flapBit = phase < .5 ? (top ? a[r]?.[c] : '.') : (top ? '.' : bit)
      if (flapBit === '#') (fold > .8 ? faces : flap).push([sx, hinge + (sy - hinge) * fold])
    }))
    cx += (b[0].length + gap) * px
  }
  return [T.dots(faces, size), T.dots(flap, size)]
}
const side = (ax: number, ay: number, bx: number, by: number, x: number, y: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax)
const segDist = (ax: number, ay: number, bx: number, by: number, x: number, y: number) => {
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
  return Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay))
}
const cellOf = (u: number) => Math.round(u * 143)
/** Rounded rectangle on the card pitch: outline (default) or filled, optional circular hole. */
function roundRect(c0: number, r0: number, w: number, h: number, rad: number, o: { fill?: boolean; hole?: [number, number, number] } = {}): Field {
  const cx = c0 + (w - 1) / 2, cy = r0 + (h - 1) / 2, hw = (w - 1) / 2, hh = (h - 1) / 2
  const f: Field = (u, v) => {
    const x = cellOf(u), y = cellOf(v)
    const qx = Math.abs(x - cx) - (hw - rad), qy = Math.abs(y - cy) - (hh - rad)
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad
    if (o.hole && Math.hypot(x - o.hole[0], y - o.hole[1]) <= o.hole[2]) return 0
    return o.fill ? (d <= 0.5 ? 1 : 0) : (d <= 0.5 && d > -0.5 ? 1 : 0)
  }
  return bounded(f, c0, r0, c0 + w - 1, r0 + h - 1)
}
/** Icon strokes as fine dot sites (about one card pitch apart), so curves stay round at icon size. */
const STROKE = 1.05
const linePts = (x: number, y: number, pts: Pt[]): Pt[] => pts.slice(1).flatMap(([bx, by], i) => {
  const [ax, ay] = pts[i], n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / STROKE))
  return Array.from({ length: n + 1 }, (_, k): Pt => [x + ax + ((bx - ax) * k) / n, y + ay + ((by - ay) * k) / n])
})
const arcPts = (cx: number, cy: number, r: number, start = 0, sweep = TAU): Pt[] => {
  const full = sweep >= TAU - 1e-9, n = Math.max(3, Math.round((sweep * r) / STROKE))
  return Array.from({ length: full ? n : n + 1 }, (_, k): Pt => { const a = start + (sweep * k) / n; return [cx + r * Math.sin(a), cy - r * Math.cos(a)] })
}
const icon = (...parts: Pt[][]) => {
  const out: Pt[] = []
  for (const p of parts.flat()) if (!out.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < .7)) out.push(p)
  return T.dots(out, .85)
}
/** A solid shape (stop square, toggle pill, transport triangles): overlapping fine dot sites, so it reads as one flat fill. */
function solid(inside: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number, step = .75): LatticeField {
  const sites: Pt[] = []
  for (let y = y0; y <= y1 + 1e-9; y += step) for (let x = x0; x <= x1 + 1e-9; x += step) if (inside(x, y)) sites.push([x, y])
  return T.dots(sites, 1.05)
}
const inTri = (a: Pt, b: Pt, c: Pt) => (x: number, y: number) => {
  const s = [side(...a, ...b, x, y), side(...b, ...c, x, y), side(...c, ...a, x, y)]
  return s.every(v => v >= -1e-9) || s.every(v => v <= 1e-9)
}
const tri = (a: Pt, b: Pt, c: Pt) => solid(inTri(a, b, c), Math.min(a[0], b[0], c[0]), Math.min(a[1], b[1], c[1]), Math.max(a[0], b[0], c[0]), Math.max(a[1], b[1], c[1]))
/** Stadium (pill) test, optional round hole. */
const inPill = (x0: number, y0: number, w: number, h: number, hole?: [number, number, number]) => (x: number, y: number) => {
  const r = h / 2, cy = y0 + r, cx = Math.max(x0 + r, Math.min(x0 + w - r, x))
  return Math.hypot(x - cx, y - cy) <= r && !(hole && Math.hypot(x - hole[0], y - hole[1]) <= hole[2])
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const DAYS3 = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const dateNow = () => { const d = new Date(); return `${MONTHS[d.getMonth()]} ${d.getDate()} ${DAYS3[d.getDay()]}` }

// ── 01 HOME ─────────────────────────────────────────────────────────────────
export const homeClock: WidgetPreset = {
  id: 'home-clock', name: '01 Home', label: '01  HOME', group: 'text', live: true, clock: true, burst: 1.2, ...tile,
  defaults: { battery: 0.78 },
  layers: ({ data, since }) => {
    // battery gauge: 27 dots on a half ring, 9 o'clock → 3 o'clock; charged run white, the rest dim
    const n = 27, lit = Math.round(data.battery * n), gauge = Array.from({ length: n }, (_, i): Pt => {
      const a = -Math.PI / 2 + (Math.PI * i) / (n - 1)
      return [100 + 32 * Math.sin(a), 129.5 - 32 * Math.cos(a)]
    })
    // on the minute the changed digits flip, split-flap style, one column after another
    const now = new Date(), digits = { px: 4.3, py: 4.8, size: 4.7 }
    const [faces, flap] = since === undefined ? [dotText(hhmm(now), 3, 35.5, digits)]
      : flapText(splitFlapCells(hhmm(new Date(+now - 60_000)), hhmm(now), since, { flip: .32, stagger: .12 }), 3, 35.5, digits)
    return [
      layer(faces),
      ...(flap ? [layer(flap, 'mid')] : []),
      layer(T.big(dateNow(), 4, 86, SMALL), 'idle'),
      layer(T.text(`${Math.round(data.battery * 100)}%`, 4, 124, { smooth: true })),
      layer(T.dots(gauge.slice(lit), 3.3), 'mid'),
      layer(T.dots(gauge.slice(0, lit), 3.3)),
    ]
  },
}

// ── 02 MUSIC ────────────────────────────────────────────────────────────────
// Album art: a scan-lined disc with a hole, a mountain ridge and a stippled slope.
const DISC: [number, number, number] = [71, 56, 35]
const cover = bounded((u: number, v: number) => {
  const x = cellOf(u), y = cellOf(v), [cx, cy, r] = DISC
  if (Math.hypot(x - cx, y - cy) > r || Math.hypot(x - 71.5, y - 49.5) < 9) return 0
  // L1: the long bright diagonal; L2: the ridge from the hole; L3: the shadow edge under the stripes
  if (segDist(64, 90, 105, 52, x, y) < .6 || segDist(80, 58, 104, 69, x, y) < .6) return 0
  const belowL1 = side(64, 90, 105, 52, x, y) > 0
  if (belowL1) return hash01(x, y) < .45 ? .5 : 0
  const shadow = x >= 80 ? y > 58 + (x - 80) * (11 / 24) : side(80, 58, 55, 86, x, y) < 0 && y > 58
  if (shadow) return x === 80 && y < 75 ? .3 : 0
  if (y % 2) return 0
  // stripes: brighter toward the bottom, like a sunset graded across the scan lines
  return .55 + .4 * ((y - cy + r) / (2 * r))
}, DISC[0] - DISC[2], DISC[1] - DISC[2], DISC[0] + DISC[2], DISC[1] + DISC[2])

const ridge = combine(...[[64, 90, 105, 52], [80, 58, 104, 69]].map(([ax, ay, bx, by]) => bounded((u: number, v: number) => (segDist(ax, ay, bx, by, cellOf(u), cellOf(v)) < .6 ? 1 : 0), ax, Math.min(ay, by), bx, Math.max(ay, by))))
/** Transport glyphs as flat fills: bar + two arrowheads (prev), mirrored for next. */
const transport = (x: number, dir: 1 | -1) => {
  const X = (dx: number) => x + dir * dx, top = 123, bot = 131.5, mid = 127.25, b0 = Math.min(X(0), X(1.5)), b1 = Math.max(X(0), X(1.5))
  return [solid(() => true, b0, top, b1, bot), tri([X(7.5), top], [X(7.5), bot], [X(2), mid]), tri([X(14), top], [X(14), bot], [X(8.5), mid])]
}
export const music: WidgetPreset = {
  id: 'music', name: '02 Music', group: 'photo', ...tile,
  defaults: { position: 0.44 }, springKeys: ['position'],
  layers: ({ data }) => {
    const knob = 2 + data.position * 138
    return [
      layer(cover), layer(ridge),
      layer(T.big('DAYLIGHT', 71.5, 100, { lattice: 1.4, align: 'center' })),
      ...transport(8.8, 1).map(f => layer(f)), layer(tri([67, 121.5], [67, 133], [76, 127.25])), ...transport(134.2, -1).map(f => layer(f)),
      layer(T.dotLine(2, 141, knob - 3, 141, { spacing: 1.65, size: .9 })),
      layer(T.dotLine(141, 141, knob + 3, 141, { spacing: 1.65, size: .7 }), 'mid'),
      layer(T.dots([[knob, 141]], 5), 'active'),
    ]
  },
}

// ── 03 TIMER ────────────────────────────────────────────────────────────────
export const timer: WidgetPreset = {
  id: 'timer', name: '03 Timer', group: 'polar', ...tile,
  defaults: { progress: 0.38 }, springKeys: ['progress'],
  layers: ({ data }) => {
    const ring = { spacing: (TAU * 60) / 104, size: 3.1 }
    return [
      layer(T.dotRing(72, 76, 60, ring), 'mid'),
      layer(T.dotRing(72, 76, 60, { ...ring, sweep: TAU * data.progress }), 'active'),
      layer(dotText('12:48', 72, 60, { px: 2.9, py: 3.4, size: 3.2, align: 'center' })),
      layer(T.dotRing(72, 117, 14.5, { spacing: 1.8, size: .75 })),
      layer(solid((x, y) => Math.hypot(Math.max(0, Math.abs(x - 72) - 3), Math.max(0, Math.abs(y - 117) - 3)) <= 1.4, 67.5, 112.5, 76.5, 121.5), 'active'),
    ]
  },
}

// ── 04 WEATHER ──────────────────────────────────────────────────────────────
// Cloud outline: three lobes over a flat base, traced as evenly spaced dots.
const LOBES: [number, number, number][] = [[91, 66.5, 11.5], [106, 57.5, 14], [127, 66.5, 11.5]]
const BASE = 78, SP = 3.6, LIFT = 1.3
const inCloud = (x: number, y: number, skip: number) => LOBES.some(([cx, cy, r], i) => i !== skip && Math.hypot(x - cx, y - cy) < r - .8) || (x > 91.5 && x < 126.5 && y > 60 && y < BASE - .8)
const cloudSites: Pt[] = [
  ...LOBES.flatMap(([cx, cy, r], i) => {
    const n = Math.round((TAU * r) / SP)
    return Array.from({ length: n }, (_, k): Pt => [cx + r * Math.sin((k / n) * TAU), cy - r * Math.cos((k / n) * TAU)]).filter(([x, y]) => y <= BASE + .1 && !inCloud(x, y, i))
  }),
  ...Array.from({ length: 10 }, (_, k): Pt => [91 + 4 + k * SP, BASE]),
].map(([x, y]): Pt => [x, BASE - (BASE - y) * LIFT]) // the sheet's cloud is taller than round lobes
/** Cities the card cycles through (same-length strings so the decode never reflows). */
const CITIES = [['TOKYO', '24', 'M 26° / L 18°'], ['OSAKA', '22', 'M 25° / L 17°'], ['KYOTO', '21', 'M 24° / L 16°']]
const CITY_S = 6
/** City `k` of the cycle at time `t`, decoding in from the previous one (t < CITY_S = the static Tokyo frame). */
const weatherAt = (t: number) => {
  const k = Math.floor(Math.max(0, t) / CITY_S), tau = t - k * CITY_S, next = CITIES[k % 3]
  if (k === 0) return next
  const prev = CITIES[(k - 1) % 3]
  return next.map((s, i) => decodeText(prev[i], s, tau, { seed: i + 1 }))
}
export const weather: WidgetPreset = {
  id: 'weather', name: '04 Weather', label: '04  WEATHER', group: 'icon', animated: true, ...tile,
  layers: ({ t }) => {
    const [city, temp, range] = weatherAt(t)
    return [
      layer(T.big(city, 1.5, 29, { lattice: 1.35 }), 'idle'),
      layer(dotText(temp, 2.5, 49, { px: 3, py: 4.3, size: 3.1 })), layer(T.dotRing(50, 53, 3.6, { spacing: (TAU * 3.6) / 8, size: 2.4 })),
      layer(T.dots(cloudSites, 2.7)),
      layer(T.big(range, 1, 107, SMALL), 'idle'),
      layer(T.big('CLOUDY', 1, 129, { lattice: 1.15 }), 'idle'),
    ]
  },
}

// ── 05 FITNESS ──────────────────────────────────────────────────────────────
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const WEEK = [7, 9, 7, 6, 8, 9, 8], TODAY_EXTRA = 7
export const fitness: WidgetPreset = {
  id: 'fitness', name: '05 Fitness', group: 'polar', ...tile,
  defaults: { move: 0.62, exercise: 0.58, stand: 0.6 }, springKeys: ['move', 'exercise', 'stand'],
  layers: ({ data }) => {
    const rings = ([[26.5, data.move, 'value'], [21, data.exercise, 'active'], [15.5, data.stand, 'active']] as const).flatMap(([r, p, tone]) => {
      const o = { spacing: (TAU * r) / Math.round((TAU * r) / 3.8), size: 3.3 }
      return [layer(T.dotRing(29, 92, r, o), 'mid'), layer(T.dotRing(29, 92, r, { ...o, sweep: TAU * p }), tone)]
    })
    const x = (i: number) => 69 + i * 11.5, pitch = 6, base = 117, dot = 3.7
    const column = (i: number, from: number, n: number) => Array.from({ length: n }, (_, k): Pt => [x(i), base - (from + k) * pitch])
    return [
      layer(T.big(`MOVE ${Math.round(data.move * 100)}%`, 0, 27, SMALL), 'idle'),
      ...rings,
      layer(T.dots(column(0, 0, WEEK[0]), dot)),
      layer(T.dots(WEEK.slice(1, 6).flatMap((n, i) => column(i + 1, 0, n)), dot), 'idle'),
      layer(T.dots(column(6, 0, WEEK[6]), dot)),
      layer(T.dots(column(6, WEEK[6], TODAY_EXTRA), dot), 'active'),
      ...DAYS.map((d, i) => layer(T.text(d, Math.round(x(i)), 129, { align: 'center' }))),
    ]
  },
}

// ── 06 MESSAGES ─────────────────────────────────────────────────────────────
const bubble = (top: number, initial: string, name: string, time: string, l1: string, l2: string, cursor?: 0 | 1) => [
  layer(roundRect(1, top, 142, 55, 6), 'mid'),
  layer(T.dotRing(16, top + 27, 11.5, { spacing: 1.6, size: .7 }), 'idle'),
  layer(T.big(initial, 16, top + 22, { lattice: 1.4, align: 'center' })),
  layer(T.text(name, 35, top + 11)), layer(T.text(time, 137, top + 11, { align: 'right' }), 'idle'),
  layer(T.text(l1, 35, top + 24), 'idle'), layer(T.text(l2, 35, top + 37), 'idle'),
  // text cursor: a one-dot bar after the last typed character
  ...(cursor === undefined ? [] : [layer(T.vrule(35 + T.size(cursor ? l2 : l1)[0] + 1, top + (cursor ? 37 : 24), 7))]),
]
/**
 * Typewriter on the newest message: the full text holds (the static frame), then it is retyped
 * at `CPS` characters a second behind a solid cursor, which blinks once the line is complete.
 */
const NEWEST = ['SEE YOU SOON.', "LET'S MEET UP."] as const, TYPE_PERIOD = 9, TYPE_HOLD = 3, CPS = 12
const typewriter = (t: number): [string, string, (0 | 1)?] => {
  const tau = (((t % TYPE_PERIOD) + TYPE_PERIOD) % TYPE_PERIOD) - TYPE_HOLD, [a, b] = NEWEST
  if (tau < 0) return [a, b]
  const n = Math.floor(tau * CPS)
  if (n < a.length) return [a.slice(0, n), '', 0]
  if (n < a.length + b.length) return [a, b.slice(0, n - a.length), 1]
  return Math.floor(tau * 2.5) % 2 ? [a, b] : [a, b, 1]
}
export const messages: WidgetPreset = {
  id: 'messages', name: '06 Messages', group: 'composite', live: true, animated: true, ...tile,
  layers: ({ t }) => [
    ...bubble(17, 'A', 'ALEX', '10:30', ...typewriter(t)),
    ...bubble(77, 'M', 'MAYA', '09:12', "DON'T FORGET", 'THE REPORT.'),
    layer(T.dots([[65, 140]], 3.4)), ...[72, 79].map(x => layer(T.dotRing(x, 140, 1.7, { spacing: 1.05, size: .55 }), 'idle')),
  ],
}

// ── 07 CAMERA ───────────────────────────────────────────────────────────────
/** Viewfinder frame: corner marks inset from the card edge, rule-of-thirds guides inside them. */
const FR = { x0: 10, x1: 133, y0: 19, y1: 100 }
const corner = (x: number, y: number, dx: number, dy: number) => [T.hrule(dx > 0 ? x : x - 6, y, 7), T.vrule(x, dy > 0 ? y : y - 7, 8)]
const flipIcon = (cx: number, cy: number) => icon(
  // camera body with the viewfinder bump, a turn arrow through it
  linePts(cx - 6, cy - 5, [[0, 3], [3, 3], [4.5, 1], [7.5, 1], [9, 3], [12, 3], [12, 10], [0, 10], [0, 3]]),
  arcPts(cx, cy + 1.5, 2.6, TAU * .15, TAU * .7), linePts(cx, cy - 1.1, [[-1.2, -1.2], [0, 0], [-1.2, 1.2]]),
)
const slidersIcon = (cx: number, cy: number) => icon(
  linePts(cx - 6, cy - 3, [[0, 0], [2, 0]]), linePts(cx + 1, cy - 3, [[0, 0], [6, 0]]), arcPts(cx - 1.5, cy - 3, 2),
  linePts(cx - 6, cy + 3, [[0, 0], [6, 0]]), linePts(cx + 5, cy + 3, [[0, 0], [2, 0]]), arcPts(cx + 2.5, cy + 3, 2),
)
export const camera: WidgetPreset = {
  id: 'camera', name: '07 Camera', label: '07  CAMERA', group: 'composite', ...tile,
  layers: () => {
    const { x0, x1, y0, y1 } = FR, w = x1 - x0, h = y1 - y0, cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2)
    return [
      // recording indicator in place of the live dot
      layer(T.dots([[116, 3.5]], 7.5), 'active'), layer(T.big('REC', 143, 0, { lattice: 1.15, align: 'right' }), 'active'),
      ...[...corner(x0, y0, 1, 1), ...corner(x1, y0, -1, 1), ...corner(x0, y1, 1, -1), ...corner(x1, y1, -1, -1)].map(f => layer(f)),
      ...[1, 2].map(k => layer(T.vrule(Math.round(x0 + (w * k) / 3), y0, h + 1, 2), 'mid')),
      ...[1, 2].map(k => layer(T.hrule(x0, Math.round(y0 + (h * k) / 3), w + 1, 2), 'mid')),
      layer(T.hrule(cx - 5, cy, 11)), layer(T.vrule(cx, cy - 5, 11)),
      layer(T.dotRing(20, 123, 10.5, { spacing: 2, size: 1 }), 'idle'), layer(flipIcon(20, 123)),
      layer(T.dotRing(cx, 123, 15, { spacing: 2.1, size: 1.1 })), layer(T.dots([[cx, 123]], 11), 'active'),
      layer(T.dotRing(124, 123, 10.5, { spacing: 2, size: 1 }), 'idle'), layer(slidersIcon(124, 123)),
    ]
  },
}

// ── 08 SETTINGS ─────────────────────────────────────────────────────────────
type Glyph = 'wifi' | 'bluetooth' | 'sun' | 'sound' | 'info'
const settingIcon = (g: Glyph, x: number, y: number) => {
  switch (g) {
    case 'wifi': return icon(...[3, 6, 9].map(r => arcPts(x + 6, y + 10.5, r, TAU - .9, 1.8)), [[x + 6, y + 10.5]])
    case 'bluetooth': return icon(linePts(x + 3, y, [[0, 3], [6, 8], [3, 11], [3, 0], [6, 3], [0, 8]]))
    case 'sun': return icon(arcPts(x + 6, y + 5.5, 2.6), ...Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * TAU, s = Math.sin(a), c = -Math.cos(a)
      return linePts(x + 6, y + 5.5, [[s * 4.6, c * 4.6], [s * 6.2, c * 6.2]])
    }))
    case 'sound': return icon(linePts(x, y, [[0, 3.5], [2.5, 3.5], [6, 0], [6, 11], [2.5, 7.5], [0, 7.5], [0, 3.5]]), arcPts(x + 7, y + 5.5, 2.6, TAU * .12, TAU * .26), arcPts(x + 7, y + 5.5, 5.2, TAU * .1, TAU * .3))
    case 'info': return icon(arcPts(x + 6, y + 5.5, 6), [[x + 6, y + 2.5]], linePts(x + 6, y + 4.6, [[0, 0], [0, 4.4]]))
  }
}
type Right = 'on' | 'chevron' | 'toggle-on' | 'toggle-off'
const ROW_H = 24
const settingRow = (i: number, g: Glyph, label: string, right: Right, selected = false) => {
  const top = 15 + i * ROW_H, tone = selected ? 'active' : 'idle', mid = top + 11
  const out = [layer(roundRect(0, top, 144, ROW_H - 1, 4), selected ? 'active' : 'mid'), layer(settingIcon(g, 5, top + 5.5), selected ? 'active' : 'value'), layer(T.text(label, 27, top + 8), tone)]
  if (right === 'on') out.push(layer(T.text('ON', 130, top + 8, { align: 'right' }), 'idle'))
  if (right === 'on' || right === 'chevron') out.push(layer(T.sprite(['#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...'], 135, top + 8), selected ? 'active' : 'idle'))
  if (right.startsWith('toggle')) {
    // on: a solid pill with a dark knob hole at the right; off: a bright outline with a full-height knob at the left
    const on = right === 'toggle-on', x0 = 120, w = 17, h = 10
    out.push(on
      ? layer(solid(inPill(x0, mid - h / 2, w, h, [x0 + w - h / 2, mid, 3.4]), x0, mid - h / 2, x0 + w, mid + h / 2))
      : layer(roundRect(x0, mid - h / 2, w + 1, h + 1, h / 2)))
    if (!on) out.push(layer(solid((x, y) => Math.hypot(x - (x0 + h / 2), y - mid) <= h / 2, x0, mid - h / 2, x0 + h, mid + h / 2)))
  }
  return out
}
export const settings: WidgetPreset = {
  id: 'settings', name: '08 Settings', group: 'icon', ...tile,
  layers: () => [
    ...settingRow(0, 'wifi', 'WI-FI', 'on'),
    ...settingRow(1, 'bluetooth', 'BLUETOOTH', 'toggle-off'),
    ...settingRow(2, 'sun', 'BRIGHTNESS', 'chevron', true),
    ...settingRow(3, 'sound', 'SOUND', 'toggle-on'),
    ...settingRow(4, 'info', 'ABOUT', 'chevron'),
  ],
}

// ── 09 SYSTEM ───────────────────────────────────────────────────────────────
const N = 36, pitch = 3.9
const usage = (row: number, value: number, tone: 'active' | 'value') => {
  const lit = Math.round(value * N), at = (i: number): Pt => [1.5 + i * pitch, row]
  return [
    layer(T.dots(Array.from({ length: N - lit }, (_, i) => at(lit + i)), 3.3), 'mid'),
    layer(T.dots(Array.from({ length: lit }, (_, i) => at(i)), 3.3), tone),
  ]
}
export const system: WidgetPreset = {
  id: 'system', name: '09 System', group: 'chart', ...tile,
  defaults: { cpu: 0.42 },
  layers: ({ data }) => [
    layer(T.text('CPU USAGE', 0, 24), 'idle'), layer(T.text(`${Math.round(data.cpu * 100)}%`, 139, 24, { align: 'right' })),
    ...usage(51, data.cpu, 'active'), ...usage(72.5, .39, 'value'), ...usage(94, .47, 'value'), ...usage(116, .31, 'value'),
    layer(T.text('HENRY / 480', 0, 135), 'idle'), layer(T.text('V1.0.0', 141, 135, { align: 'right' }), 'idle'),
  ],
}

export const henryBoard = [homeClock, music, timer, weather, fitness, messages, camera, settings, system]
