/**
 * Board 6 — Ride / Henry / System / Apps (public/images/HQLHmo4asAA8Blx.jpg).
 * TILE cards (144×144): 5×7 labels on the card pitch, body text on a 1.4–2 lattice, heroes in the
 * smooth display weight; rings, rules and markers are evenly spaced dot sites. The reference font
 * runs taller than 5×7, so body text uses `scale: [1, 9/7]` (rows 1 and 5 doubled — stems, not bars).
 */
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { TAU, TILE, bounded, dim, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
const TALL: [number, number] = [1, 9 / 7]
type Pt = [number, number]

/**
 * A field in card-cell coordinates sampled on a `k`-cell lattice anchored at (col,row): f sees each lattice dot's centre.
 * `size` ([w, h] in lattice dots) limits the field to that box — it reads 0 outside and carries matching `bounds`.
 */
function cellField(k: number, col: number, row: number, f: (x: number, y: number) => number, size?: [number, number]): LatticeField {
  const sub = latticeGrid(TILE, k, [col, row])
  const at = (t: number, n: number) => Math.round(t * (n - 1))
  if (!size) return { field: (u, v) => f(col + (at(u, sub.cols) + .5) * k - .5, row + (at(v, sub.rows) + .5) * k - .5), lattice: k, origin: [col, row] }
  const [w, h] = size
  const field = bounded((u, v) => { const i = at(u, sub.cols), j = at(v, sub.rows); return i < w && j < h ? f(col + (i + .5) * k - .5, row + (j + .5) * k - .5) : 0 }, 0, 0, w - 1, h - 1)
  return { field, lattice: k, origin: [col, row] }
}
/** A `#`/`.` sprite on a `k`-cell lattice (icons drawn at their own dot pitch). */
const spriteOn = (rows: string[], k: number, col: number, row: number): LatticeField => {
  const G = T.lattice(k, col, row)
  return G.at(G.sprite(rows, 0, 0))
}
/** Ring sites with index i of n (0 = 12 o'clock, clockwise) kept by `keep`. */
const ringSites = (cx: number, cy: number, r: number, n: number, keep: (i: number) => boolean): Pt[] =>
  Array.from({ length: n }, (_, i) => i).filter(keep).map(i => [cx + r * Math.sin((i / n) * TAU), cy - r * Math.cos((i / n) * TAU)])
/** Light-grey text: value-tone dots at 3/4 size and opacity. */
const soft = (l: LatticeField, v = .75): LatticeField => ({ ...l, field: dim(l.field, v) })
const range = (x0: number, step: number, n: number) => Array.from({ length: n }, (_, i) => x0 + i * step)

// ── Ride: speed ring open at the bottom, effort arc in red ──────────────────
const RIDE_RING = { cx: 72, cy: 73.5, r: 65.4, n: 54 }
export const ride: WidgetPreset = {
  id: 'ride', name: 'Ride', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { effort: 0.3 },
  layers: ({ data }) => {
    const { cx, cy, r, n } = RIDE_RING
    // track: 7 o'clock over the top to 5 o'clock (sites 34…53, 0…20); effort lights sites from 2 o'clock on
    const track = (i: number) => i >= 34 || i <= 20, red = Math.round(data.effort * 20)
    return [
      layer(T.dots(ringSites(cx, cy, r, n, track), 3.9), 'idle'),
      layer(T.dots(ringSites(cx, cy, r, n, i => i >= 8 && i < 8 + red && track(i)), 4.3), 'active'),
      layer(T.big('32', 24, 47.5, { lattice: 2.7, smooth: true })),
      layer(T.big('.', 81, 60, { lattice: 2, smooth: true })), layer(T.big('4', 98, 60, { lattice: 2, smooth: true })),
      layer(soft(T.big('KM/H', 72, 98, { lattice: 1.5, align: 'center' }))),
      layer(T.big('247', 42, 126, { lattice: 1.05, smooth: true })), layer(T.big('W', 87, 126, { lattice: 1.05, smooth: true })),
    ]
  },
}

// ── Henry: a bear holding a bunny inside two dotted rings ───────────────────
const ell = (x: number, y: number, cx: number, cy: number, a: number, b: number, p = 2) => Math.abs((x - cx) / a) ** p + Math.abs((y - cy) / b) ** p <= 1
const EYES: Pt[] = [[59, 65], [85.8, 65]]
const eyeRing = (x: number, y: number) => EYES.some(([ex, ey]) => { const m = Math.max(Math.abs(x - ex), Math.abs(y - ey)); return m > 3 && m <= 5.6 && !(Math.abs(x - ex) > 4 && Math.abs(y - ey) > 4) })
const eyeHole = (x: number, y: number) => EYES.some(([ex, ey]) => Math.max(Math.abs(x - ex), Math.abs(y - ey)) <= 3)
const nose = (x: number, y: number) => ell(x, y, 72, 68.4, 2.8, 2) || Math.hypot(x - 68.6, y - 73.4) < 1.2 || Math.hypot(x - 75.4, y - 73.4) < 1.2
const muzzle = (x: number, y: number) => ell(x, y, 72, 74, 7.2, 6.2) && !nose(x, y)
const bunnyHead = (x: number, y: number) => ell(x, y, 83, 107.5, 11.4, 10.2)
const bunnyHole = (x: number, y: number) => Math.hypot(x - 77.6, y - 104.6) < 3 || Math.hypot(x - 87.8, y - 104.6) < 3 || Math.hypot(x - 82.6, y - 110.8) < 1.3
const bunny = (x: number, y: number) => ((bunnyHead(x, y) && !bunnyHole(x, y)) || ell(x, y, 78.4, 90, 2.5, 8) || ell(x, y, 88.4, 90, 2.5, 8)) && y < 117.5
const bearShape = (x: number, y: number) => ell(x, y, 72, 63.5, 35.5, 24, 2.6) || Math.hypot(x - 50.5, y - 39.6) <= 9.4 || Math.hypot(x - 93.5, y - 39.6) <= 9.4 || ell(x, y, 72, 97, 28.5, 20.8, 4)
const bearWhite = (x: number, y: number) => eyeRing(x, y) || muzzle(x, y) || bunny(x, y)
const bearDark = (x: number, y: number) => eyeHole(x, y) || nose(x, y) || bunnyHead(x, y) || bunnyHole(x, y)
export const henryBear: WidgetPreset = {
  id: 'henry-bear', name: 'Henry', group: 'icon', live: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.dots(ringSites(72, 69.5, 65, 93, () => true).filter(([, y]) => y < 128), 2.25), 'idle'),
    layer(T.dots(ringSites(72, 69.5, 52.3, 78, () => true), 2.2), 'idle'),
    // fur: smaller, dimmer dots (the reference bear is brown — one accent per board, so it reads as grey)
    layer(cellField(2.3, 36.5, 29.5, (x, y) => (bearShape(x, y) && !bearWhite(x, y) && !bearDark(x, y) ? .8 : 0)), 'idle'),
    layer(cellField(2.3, 36.5, 29.5, (x, y) => (bearWhite(x, y) && !(eyeHole(x, y) || bunnyHole(x, y)) ? 1 : 0))),
    layer(T.big("I'M LISTENING", 72, 131, { lattice: 1.4, scale: TALL, align: 'center' })),
  ],
}

// ── Thu 20: date header, dotted rules, red now-line through the agenda item ─
const RULE_X = range(6.8, 4.71, 28)
export const designReview: WidgetPreset = {
  id: 'design-review', name: 'Thu 20', label: '', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    const now = RULE_X[10]
    const rule = (y: number): Pt[] => RULE_X.filter(x => x !== now).map(x => [x, y])
    return [
      // letter O, not zero: the font's 0 is slashed, the reference's isn't
      layer(T.big('THU 2O', 8, 10, { lattice: 1.8, smooth: true, scale: [1, 1.25] })),
      layer(T.dots([...rule(66.6), ...rule(118.3)], 3.3), 'idle'),
      layer(T.dots([...range(58.8, 3.88, 7), ...range(99.3, 3.74, 8)].map(y => [now, y]), 3), 'active'),
      layer(T.dots([[6.8, 91.9], [129.3, 92], [134.3, 92]], 3.4)), layer(T.dots([[125.1, 92]], 2.4)),
      layer(T.big('DESIGN REVIEW', 12, 85, { lattice: 1.4, scale: TALL })),
    ]
  },
}

// ── Memo 07: two-line poster, dotted progress rule ending in a red dot ──────
export const memo: WidgetPreset = {
  id: 'memo', name: 'Memo 07', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    const poster = { lattice: 1.5, smooth: true, scale: [1, 1.4] as [number, number] }
    return [
      layer(T.big('SHIP', 6, 35, poster)),
      layer(T.big('THE', 6, 74.5, poster)), layer(T.big('IDEA', 72, 74.5, poster)),
      layer(T.dotLine(4.7, 123.2, 130, 123.2, { spacing: 4.8, size: 3.3 }), 'idle'),
      layer(T.dots([[137.9, 123.2]], 7.6), 'active'),
    ]
  },
}

/** Bear face outline (wiki hub, Henry app icon): round ears, dot eyes, boxed muzzle. */
const FACE = [
  '.####.......####.',
  '#...##.....##...#',
  '#....#.....#....#',
  '#...#########...#',
  '.#.#.........#.#.',
  '..##.........##..',
  '.##...........##.',
  '.#..##.....##..#.',
  '.#..##.....##..#.',
  '.#.............#.',
  '.#....#####....#.',
  '.#....#.#.#....#.',
  '..#...#.#.#...#..',
  '..##...###...##..',
  '...##.......##...',
  '....#########....',
]

// ── Henry's Wiki: bear hub, seven linked notes, one flagged red ─────────────
const HUB: Pt = [71.6, 64.6]
const NODES: Pt[] = [[71.7, 18.6], [122.5, 32], [123.7, 86.5], [89.5, 111.1], [53.9, 111.1], [19.8, 86.6], [20.5, 32.1]]
const link = ([x, y]: Pt) => {
  const d = Math.hypot(HUB[0] - x, HUB[1] - y), ux = (HUB[0] - x) / d, uy = (HUB[1] - y) / d
  return T.dotLine(x + ux * 11, y + uy * 11, HUB[0] - ux * 21, HUB[1] - uy * 21, { spacing: 3.3, size: 1.9 })
}
export const wiki: WidgetPreset = {
  id: 'wiki', name: "Henry's Wiki", group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    ...NODES.map(n => layer(link(n), 'idle')),
    ...NODES.map((n, i) => layer(T.dotDisc(n[0], n[1], 7.6, { spacing: 2.2, size: 2.1 }), i === 1 ? 'active' : 'idle')),
    layer(spriteOn(FACE, 2.2, 53, 48.8)),
    layer(T.big('WHY NOW?', 72, 125, { lattice: 1.2, smooth: true, align: 'center' })),
  ],
}

// ── System: settings list, the selected row marked red with a dotted leader ─
export const systemMenu: WidgetPreset = {
  id: 'system-menu', name: 'System', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    const item = { lattice: 1.65, scale: TALL }
    return [
      layer(T.big('DISPLAY', 17, 23, item), 'idle'),
      layer(T.dots([[4.2, 60.7]], 8.5), 'active'), layer(T.big('SOUND', 17, 54, item)),
      layer(T.dotLine(102.3, 62, 133.2, 62, { spacing: 5.15, size: 3.8 })),
      layer(T.big('NETWORK', 17, 86, item), 'idle'),
      layer(T.big('ABOUT', 17, 118, item), 'idle'),
    ]
  },
}

// ── Last Password: dotted dial, red marker at 12, masked password ───────────
const PW_DOT: Pt[] = [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]]
export const lastPassword: WidgetPreset = {
  id: 'last-password', name: 'Last Password', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.dots(ringSites(70.6, 66.1, 50, 58, i => i >= 2 && i <= 56), 3.1), 'idle'),
    layer(T.dots([[70.6, 16.1]], 7.6), 'active'),
    layer(T.dots(range(32.4, 10.37, 8).flatMap(cx => PW_DOT.map(([i, j]): Pt => [cx + (i - 1.5) * 1.95, 64.7 + (j - 1.5) * 1.95])), 2.2)),
    layer(T.big('24 ITEMS', 71.5, 125, { lattice: 1.6, align: 'center' }), 'idle'),
  ],
}

// ── Notifications: count headline over a 5×3 dot inbox, newest in red ──────
export const notifications: WidgetPreset = {
  id: 'notifications', name: 'Notifications', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    const big = { lattice: 2.15, smooth: true, scale: [1, 1.2] as [number, number] }
    const grid = [80.6, 102.4, 124.2].flatMap(y => [36.5, 50.5, 64.4, 77.7, 90.9].map((x): Pt => [x, y]))
    return [
      layer(T.big('3', 14, 24, big)), layer(T.big('NEW', 54, 24, big)),
      layer(T.dots(grid.slice(1), 5.9), 'idle'),
      layer(T.dots(grid.slice(0, 1), 7.9), 'active'),
    ]
  },
}

// ── Apps: 3×3 launcher of dot icons, Henry selected ─────────────────────────
const MONITOR = [
  '.##########.',
  '############',
  '##........##',
  '##........##',
  '##........##',
  '##........##',
  '##........##',
  '############',
  '.##########.',
  '.....##.....',
  '.....##.....',
  '..########..',
]
const BARS = [
  '.........##.',
  '.........##.',
  '.........##.',
  '.........##.',
  '...##....##.',
  '...##....##.',
  '...##.##.##.',
  '...##.##.##.',
  '##.##.##.##.',
  '##.##.##.##.',
  '##.##.##.##.',
  '##.##.##.##.',
]
const CALENDAR = [
  '...##....##...',
  '.############.',
  '##############',
  '##..........##',
  '##.##.##.##.##',
  '##.##.##.##.##',
  '##..........##',
  '##.##.##.##.##',
  '##.##.##.##.##',
  '##..........##',
  '##############',
  '.############.',
]
const DOCUMENT = [
  '.##########.',
  '############',
  '##........##',
  '##.######.##',
  '##........##',
  '##.######.##',
  '##........##',
  '##.#####..##',
  '##........##',
  '##.####...##',
  '############',
  '.##########.',
]
/** Round icons on a 12-dot box: gear (ring + 8 teeth) and compass (ring + centre cross). */
const polar = (i: number, j: number) => { const dx = i - 5.5, dy = j - 5.5; return { dx, dy, d: Math.hypot(dx, dy) } }
const gear = (i: number, j: number) => {
  const { dx, dy, d } = polar(i, j)
  const tooth = Array.from({ length: 8 }, (_, t) => (t / 8) * TAU).some(a => { const along = dx * Math.sin(a) - dy * Math.cos(a), perp = Math.abs(dx * Math.cos(a) + dy * Math.sin(a)); return along > 3.5 && along < 6 && perp < 1.05 })
  return (d >= 2.2 && d <= 4.6) || tooth
}
const compass = (i: number, j: number) => {
  const { dx, dy, d } = polar(i, j)
  return (d >= 4.4 && d <= 6.1) || (Math.abs(dx) < 1 && Math.abs(dy) < 2) || (Math.abs(dy) < 1 && Math.abs(dx) < 2)
}
/** Thick polyline icons (pulse, mountain): lattice dots within `w` of the path. */
const segDist = (x: number, y: number, [ax, ay]: Pt, [bx, by]: Pt) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)))
  return Math.hypot(x - ax - t * dx, y - ay - t * dy)
}
const strokeOn = (paths: Pt[][], k: number, col: number, row: number, w = .75) => cellField(k, col, row, (x, y) => {
  const i = (x - col + .5) / k - .5, j = (y - row + .5) / k - .5
  return paths.some(p => p.slice(1).some((q, s) => segDist(i, j, p[s], q) <= w)) ? 1 : 0
}, [Math.floor(Math.max(...paths.flat().map(p => p[0])) + w) + 1, Math.floor(Math.max(...paths.flat().map(p => p[1])) + w) + 1])
const PULSE: Pt[][] = [[[0, 5], [3.5, 5], [5.5, .5], [7.5, 9.5], [9.5, .5], [11.5, 5], [15, 5]]]
const MOUNTAIN: Pt[][] = [[[.5, 9.5], [3.5, 3.5], [5.8, 6.3], [9.5, .5], [15, 9.5]], [[.5, 9.5], [15, 9.5]]]
export const apps: WidgetPreset = {
  id: 'apps', name: 'Apps', group: 'icon', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    // each icon only spans its own box of lattice dots (12×12 for the round ones), so the sampler skips the rest
    const shape = (f: (i: number, j: number) => boolean, col: number, row: number, size: [number, number] = [12, 12]) => cellField(1.85, col, row, (x, y) => (f(Math.round((x - col + .5) / 1.85 - .5), Math.round((y - row + .5) / 1.85 - .5)) ? 1 : 0), size)
    const grey = (rows: string[], col: number, row: number) => shape((i, j) => rows[j]?.[i] === '#', col, row, [Math.max(...rows.map(r => r.length)), rows.length])
    return [
      layer(grey(MONITOR, 16, 13), 'idle'), layer(grey(BARS, 60, 13), 'idle'), layer(shape(gear, 103, 13), 'idle'),
      layer(shape(compass, 16, 48), 'idle'), layer(spriteOn(FACE, 1.8, 56, 45)), layer(strokeOn(PULSE, 1.95, 100, 51), 'idle'),
      layer(grey(CALENDAR, 14, 85), 'idle'), layer(strokeOn(MOUNTAIN, 1.9, 56, 86), 'idle'), layer(grey(DOCUMENT, 104, 85), 'idle'),
      layer(T.dots([[71, 116.5]], 7.5), 'active'),
      layer(T.big('HENRY', 72, 125, { lattice: 2, align: 'center' })),
    ]
  },
}

export const rideBoard = [ride, henryBear, designReview, memo, wiki, systemMenu, lastPassword, notifications, apps]
