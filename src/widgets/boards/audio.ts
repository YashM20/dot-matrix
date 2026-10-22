/**
 * Board 7 — Audio / MIDI / Interpreter / Level 03 (public/images/HQLJDO3aoAAnxF9.jpg).
 * TILE cards (144×144). The reference numerals are a condensed two-stroke face (8×14 dots,
 * a 4×7 design upscaled with Scale2x), so this board carries that face locally (`face`) and
 * places it on a coarser lattice like `T.big`; rings, sliders and waveforms are dot sites.
 */
import { scale2x } from '../../engine/fields/bitmapFont'
import { hash01, len, smoothstep } from '../../engine/math'
import type { Field } from '../../engine/types'
import { TAU, TILE, baked, dim, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
const deg = (d: number) => (d / 360) * TAU
/** A site layer drawn lighter than full white (the reference's light-grey waveform/icon tier). */
const tint = (lf: LatticeField, v: number): LatticeField => ({ ...lf, field: () => v })

// ── condensed two-stroke face ───────────────────────────────────────────────
const FACE: Record<string, string[]> = {
  B: ['###.', '#..#', '#..#', '###.', '#..#', '#..#', '###.'],
  C: ['.###', '#...', '#...', '#...', '#...', '#...', '.###'], 
  E: ['####', '#...', '#...', '###.', '#...', '#...', '####'], F: ['####', '#...', '#...', '###.', '#...', '#...', '#...'],
  G: ['.###', '#...', '#...', '#.##', '#..#', '#..#', '.###'], H: ['#..#', '#..#', '#..#', '####', '#..#', '#..#', '#..#'],
  I: ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'], K: ['#..#', '#..#', '#.#.', '##..', '#.#.', '#..#', '#..#'],
  L: ['#...', '#...', '#...', '#...', '#...', '#...', '####'], O: ['####', '#..#', '#..#', '#..#', '#..#', '#..#', '####'],
  P: ['###.', '#..#', '#..#', '###.', '#...', '#...', '#...'], R: ['###.', '#..#', '#..#', '###.', '#.#.', '#..#', '#..#'],
  S: ['.###', '#...', '#...', '.##.', '...#', '...#', '###.'],
  U: ['#..#', '#..#', '#..#', '#..#', '#..#', '#..#', '.##.'], Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  0: ['####', '#..#', '#..#', '#..#', '#..#', '#..#', '####'], 
  2: ['.##.', '#..#', '...#', '..#.', '.#..', '#...', '####'], 3: ['###.', '...#', '...#', '.##.', '...#', '...#', '###.'],
  5: ['####', '#...', '####', '...#', '...#', '#..#', '####'],
  6: ['.##.', '#...', '#...', '###.', '#..#', '#..#', '.##.'], 7: ['####', '...#', '...#', '..#.', '.#..', '.#..', '.#..'],
  8: ['####', '#..#', '#..#', '####', '#..#', '#..#', '####'], 9: ['.##.', '#..#', '#..#', '.###', '...#', '...#', '.##.'],
  ':': ['.', '.', '#', '.', '.', '#', '.'], '.': ['.', '.', '.', '.', '.', '.', '#'], ' ': ['..', '..', '..', '..', '..', '..', '..'],
}
/** Glyphs Scale2x can't draw from 4×7 (odd-centred strokes and long diagonals), drawn at 8–9×14 directly. */
const BOX = ['.######.', '########', ...Array.from({ length: 10 }, () => '##....##'), '########', '.######.']
const FACE_14: Record<string, string[]> = {
  0: BOX, O: BOX,
  A: ['..####..', '.######.', '###..###', '##....##', '##....##', '##....##', '########', '########', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##'],
  D: ['######..', '#######.', '##...###', ...Array.from({ length: 8 }, () => '##....##'), '##...###', '#######.', '######..'],
  1: ['....##..', '...###..', '..####..', '.##.##..', ...Array.from({ length: 8 }, () => '....##..'), '.######.', '.######.'],
  8: ['.######.', '########', '##....##', '##....##', '##....##', '##....##', '.######.', '.######.', '##....##', '##....##', '##....##', '##....##', '########', '.######.'],
  M: ['##.....##', '##.....##', '###...###', '####.####', '#########', '##.###.##', '##.###.##', '##..#..##', '##.....##', '##.....##', '##.....##', '##.....##', '##.....##', '##.....##'],
  N: ['##....##', '###...##', '###...##', '####..##', '##.#..##', '##.##.##', '##.##.##', '##..####', '##..####', '##...###', '##...###', '##....##', '##....##', '##....##'],
  4: ['....###.', '....###.', '...####.', '...####.', '..##.##.', '..##.##.', '.##..##.', '.##..##.', '##...##.', '########', '########', '.....##.', '.....##.', '.....##.'],
  T: ['########', '########', ...Array.from({ length: 12 }, () => '...##...')],
  Z: ['########', '########', '.....###', '.....##.', '....###.', '....##..', '...###..', '...##...', '..###...', '..##....', '.###....', '.##.....', '########', '########'],
}
/** Straight-stroke letters double plainly: Scale2x would fillet their T-junctions into blobs. */
const BLOCKY = new Set('BEFHIKLP')
const double = (bits: boolean[][]) => bits.flatMap(r => { const row = r.flatMap(b => [b, b]); return [row, row] })
const faceCache = new Map<string, string[]>()
const faceGlyph = (ch: string) => {
  let g = faceCache.get(ch)
  if (!g) {
    const bits = (FACE[ch] ?? FACE[' ']).map(r => [...r].map(c => c === '#'))
    g = FACE_14[ch] ?? (BLOCKY.has(ch) ? double(bits) : scale2x(bits)).map(r => r.map(b => (b ? '#' : '.')).join(''))
    faceCache.set(ch, g)
  }
  return g
}
interface FaceOptions { lattice: number; align?: 'left' | 'center'; gap?: number; space?: number; rows?: number }
/** Sprite rows for a string: glyphs `gap` dots apart, spaces `space` dots wide, stretched to `rows` tall. */
function faceRows(str: string, { gap = 2, space = 4, rows = 14 }: Omit<FaceOptions, 'lattice'> = {}): string[] {
  const out = Array.from({ length: 14 }, () => '')
  ;[...str].forEach((ch, i) => {
    const g = ch === ' ' ? Array.from({ length: 14 }, () => '.'.repeat(space - gap)) : faceGlyph(ch)
    g.forEach((row, r) => { out[r] += (i ? '.'.repeat(gap) : '') + row })
  })
  return rows === 14 ? out : Array.from({ length: rows }, (_, r) => out[Math.min(13, Math.floor(((r + .5) * 14) / rows))])
}
/** Display text in the condensed face on a `lattice`-cell grid, box top-left (or top-centre) at (col,row). */
function face(str: string, col: number, row: number, opts: FaceOptions): LatticeField {
  const rows = faceRows(str, opts), w = rows[0].length * opts.lattice
  const g = T.lattice(opts.lattice, opts.align === 'center' ? col - w / 2 : col, row)
  return g.at(g.sprite(rows, 0, 0))
}

// ── pixel-art icons on the card pitch ───────────────────────────────────────
interface Pen { line(points: Pt[], t?: number): void; ring(cx: number, cy: number, r: number): void; fill(test: (x: number, y: number) => boolean): void }
function art(w: number, h: number, draw: (pen: Pen) => void): string[] {
  const g = Array.from({ length: h }, () => new Array<string>(w).fill('.'))
  const set = (x: number, y: number) => { if (x >= 0 && y >= 0 && x < w && y < h) g[y][x] = '#' }
  draw({
    line: (points, t = 1) => points.slice(1).forEach(([x1, y1], i) => {
      const [x0, y0] = points[i], n = Math.max(1, Math.round(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
      for (let s = 0; s <= n; s++) for (let a = 0; a < t; a++) for (let b = 0; b < t; b++) set(Math.round(x0 + ((x1 - x0) * s) / n) + a, Math.round(y0 + ((y1 - y0) * s) / n) + b)
    }),
    ring: (cx, cy, r) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.abs(Math.hypot(x - cx, y - cy) - r) < .5) set(x, y) },
    fill: test => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (test(x, y)) set(x, y) },
  })
  return g.map(r => r.join(''))
}
const flipX = (rows: string[]) => rows.map(r => [...r].reverse().join(''))
const UNDO = art(16, 16, p => { p.line([[5, 1], [2, 4], [5, 7]], 2); p.line([[2, 4], [10, 4]], 2); p.line([[10, 4], [12, 6], [12, 10], [10, 12], [5, 12]], 2) })
const ARROW_UP = art(16, 16, p => { p.line([[7, 1], [7, 14]], 2); p.line([[2, 6], [7, 1]], 2); p.line([[12, 6], [7, 1]], 2) })
/** 16×16 icon art (code is 18 wide), centred in its pad. */
const ICONS: Record<string, string[]> = {
  play: art(16, 16, p => p.fill((x, y) => y >= 1 && y <= 14 && x >= 3 && x - 3 <= (6.5 - Math.abs(y - 7.5)) * 1.6)),
  stop: art(16, 16, p => p.fill((x, y) => x >= 2 && x <= 13 && y >= 2 && y <= 13)),
  undo: UNDO, redo: flipX(UNDO),
  node: art(16, 16, p => { p.ring(10, 2.5, 2.2); p.ring(3, 13, 2.2); p.ring(12, 13, 2.2); p.line([[10, 5], [10, 8], [12, 11]]); p.line([[10, 8], [6, 8], [4, 9], [3, 11]]) }),
  terminal: art(16, 16, p => { p.line([[1, 3], [5, 7], [1, 11]], 2); p.line([[8, 12], [14, 12]], 2) }),
  mic: art(16, 16, p => { p.fill((x, y) => x >= 5 && x <= 10 && y <= 9 && !((y === 0 || y === 9) && (x === 5 || x === 10))); p.line([[2, 6], [2, 9], [4, 12], [11, 12], [13, 9], [13, 6]]); p.line([[7, 12], [7, 14]], 2); p.line([[4, 15], [11, 15]]) }),
  globe: art(15, 15, p => { p.ring(7, 7, 7); p.fill((x, y) => Math.hypot(x - 7, y - 7) < 7 && (x === 7 || y === 3 || y === 7 || y === 11 || Math.abs(Math.abs(x - 7) - 4 * Math.sqrt(1 - ((y - 7) / 7) ** 2)) < .5)) }),
  list: art(16, 16, p => [3, 8, 13].forEach(y => { p.line([[0, y], [1, y]]); p.line([[4, y], [14, y]]) })),
  code: art(18, 16, p => { p.line([[4, 3], [1, 7], [4, 11]], 2); p.line([[13, 3], [16, 7], [13, 11]], 2); p.line([[10, 0], [7, 13]], 2) }),
  check: art(16, 16, p => p.line([[1, 8], [5, 12], [13, 4]], 2)),
  cross: art(16, 16, p => { p.line([[2, 2], [12, 12]], 2); p.line([[12, 2], [2, 12]], 2) }),
  gear: art(16, 16, p => { p.ring(7.5, 7.5, 5); for (let i = 0; i < 8; i++) { const a = deg(i * 45), x = Math.round(7 + Math.sin(a) * 6), y = Math.round(7 - Math.cos(a) * 6); p.line([[x, y], [x, y]], 2) } }),
  target: art(16, 16, p => { p.line([[7, 0], [7, 15]]); p.line([[0, 7], [15, 7]]); p.ring(7, 7, 2.3) }),
  arrowUp: ARROW_UP, arrowDown: [...ARROW_UP].reverse(),
}

// ── waveforms and texture noise ─────────────────────────────────────────────
const frac = (x: number) => x - Math.floor(x)
/** Waveform bars as dot sites: half-heights in dots, mirrored around `cy`, `gap` cells apart. */
const dotWave = (halves: number[], x0: number, cy: number, gap: number, pitch: number, size: number): LatticeField =>
  T.dots(halves.flatMap((n, i) => Array.from({ length: 2 * n + 1 }, (_, j) => [x0 + i * gap, cy + (j - n) * pitch] as Pt)), size)
/** Scroll a recorded bar pattern with time so the waveform runs without changing its character. */
const scroll = (bars: number[], t: number) => bars.map((_, i) => bars[(i + Math.floor(t * 3)) % bars.length])

// ── cards ───────────────────────────────────────────────────────────────────
/** Gauge open at the bottom (7:30 → 4:30); the right half lights from 12 o'clock, mic gets a red head. */
const GAUGE = { r: 31, spacing: 4.7, size: 3.3 }, G_START = deg(225), G_SWEEP = deg(270), G_END = deg(135)
function gauge(cx: number, cy: number, level: number, marker: boolean) {
  const { r, spacing, size } = GAUGE, n = Math.round((TAU * r) / spacing), step = TAU / n
  const head = Math.floor((Math.min(1, level / .5) * G_END) / step + 1e-9) * step
  return [
    layer(T.dotRing(cx, cy, r, { spacing, size, start: G_START, sweep: G_SWEEP }), 'idle'),
    layer(T.dotRing(cx, cy, r, { spacing, size, start: 0, sweep: head }), 'value'),
    ...(marker ? [layer(T.dots([[cx + r * Math.sin(head), cy - r * Math.cos(head)]], 5.5), 'active')] : []),
  ]
}
export const audioLevels: WidgetPreset = {
  id: 'audio-levels', name: 'Audio', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  defaults: { speaker: 0.72, mic: 0.48 },
  layers: ({ data }) => [
    ...gauge(35, 70, data.speaker, false), ...gauge(110, 70, data.mic, true),
    layer(T.text('SPEAKER', 35, 59, { align: 'center' }), 'idle'), layer(T.text('MIC', 110, 59, { align: 'center' }), 'idle'),
    layer(face(`${Math.round(data.speaker * 100)}`, 35.5, 71, { lattice: 2.1, align: 'center' })),
    layer(face(`${Math.round(data.mic * 100)}`, 109, 71, { lattice: 2.1, align: 'center' })),
  ],
}

/** Rounded square of dot sites (corner sites dropped), `n` intervals per side. */
const dotBox = (x0: number, y0: number, s: number, n = 11): Pt[] => {
  const d = s / n, pts: Pt[] = []
  for (let i = 1; i < n; i++) pts.push([x0 + i * d, y0], [x0 + i * d, y0 + s], [x0, y0 + i * d], [x0 + s, y0 + i * d])
  return pts
}
const PAD = ['play', 'stop', 'undo', 'redo', 'node', 'terminal', 'mic', 'globe', 'list', 'code', 'check', 'cross', 'gear', 'target', 'arrowUp', 'arrowDown']
const PAD_X = [8, 43, 78, 113], PAD_Y = [13.4, 44, 74.6, 105.4], PAD_S = 25.5
export const vibePad: WidgetPreset = {
  id: 'vibe-pad', name: 'Vibe Pad', group: 'icon', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => PAD.flatMap((name, i) => {
    const x = PAD_X[i % 4], y = PAD_Y[Math.floor(i / 4)], hot = name === 'check', icon = ICONS[name]
    const sprite = T.sprite(icon, Math.round(x + PAD_S / 2 - icon[0].length / 2 + .5), Math.round(y + PAD_S / 2 - icon.length / 2 + .5))
    return [
      layer(T.dots(dotBox(x, y, PAD_S), 1.6), hot ? 'value' : 'idle'),
      layer(hot ? sprite : dim(sprite, .8), 'value'),
      ...(hot ? [layer(T.dots([[x + 21, y + 5]], 4.2), 'active')] : []),
    ]
  }),
}

const FADERS: [number, number][] = [[27.5, 106], [71, 122.5], [114.5, 114]]
export const midi: WidgetPreset = {
  id: 'midi', name: 'MIDI 01', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(face('AM7', 70, 18, { lattice: 3.05, align: 'center' })),
    ...Array.from({ length: 8 }, (_, i) => layer(T.dots([[11.5 + i * 17, 75.5]], 9.4), i === 3 ? 'active' : i < 5 ? 'value' : 'idle')),
    ...FADERS.flatMap(([c, knob]) => [
      layer(T.dotLine(c, 90, c, knob - 3, { spacing: 3.5, size: 1.9 }), 'idle'),
      layer(T.dotLine(c, 138, c, knob + 3, { spacing: 3.5, size: 1.9 }), 'idle'),
      // the fader cap: overlapping big dots read as one rounded white bar
      layer(T.dots([-3.4, -1.7, 0, 1.7, 3.4].map(d => [c + d, knob] as Pt), 3.3)),
    ]),
  ],
}

// Half-heights (in dots) read off the reference waveforms, left to right.
const REC_BARS = [0, 1, 2, 5, 3, 0, 0, 1, 4, 3, 2, 1, 2, 0, 1, 3, 1, 0, 1, 0, 0, 3, 1, 0, 0, 1, 0, 0]
const SAY_BARS = [0, 1, 2, 4, 2, 2, 3, 1, 3, 2, 3, 2, 1, 0, 1, 2, 4, 1, 1, 2, 1, 2, 0, 1, 0, 1, 0, 0]
export const recorder: WidgetPreset = {
  id: 'recorder', name: 'Recorder', group: 'composite', animated: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const bars = scroll(REC_BARS, t), head = 15, x = (i: number) => 1.5 + i * 5.15
    return [
      layer(face('01:47', 71.5, 27.5, { lattice: 2.45, align: 'center', gap: 3 })),
      layer(tint(dotWave(bars, x(0), 91, 5.15, 2.5, 2.3), .8), 'value'),
      layer(dotWave([bars[head]], x(head), 91, 0, 2.5, 2.3), 'value'),
      layer(T.dots([[x(head), 101.5]], 5.5), 'active'),
      layer(face('BUILD THE SMALLER ONE.', 72.5, 125, { lattice: .7, align: 'center', rows: 16 })),
    ]
  },
}

export const radio: WidgetPreset = {
  id: 'radio', name: 'Radio', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(face('CH 07', 76.5, 12.5, { lattice: 1.95, align: 'center', space: 8 })),
    layer(T.dotRing(75, 84, 36, { spacing: 5.4, size: 3.6 }), 'idle'),
    layer(T.dots([[75, 48]], 7), 'active'),
    layer(face('HOLD', 75, 78.5, { lattice: 1.08, align: 'center' })),
    layer(face('READY', 76, 128.5, { lattice: .95, align: 'center' })),
  ],
}

const ARROW: Pt[] = [[60.5, 31], [63, 31], [65.5, 31], [68, 31], [70.5, 31], [73.2, 25.8], [73.2, 28.4], [73.2, 31], [73.2, 33.6], [73.2, 36.2], [75.8, 28.4], [75.8, 31], [75.8, 33.6], [78.4, 31]]
export const interpreter: WidgetPreset = {
  id: 'interpreter', name: 'Interpreter', group: 'composite', live: true, animated: true, chrome: 'dots', grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const said = scroll(SAY_BARS, t), heard = scroll(SAY_BARS, t + .7)
    return [
      layer(face('EN', 8.5, 16.5, { lattice: 2.3 })), layer(face('ZH', 91, 16.5, { lattice: 2.3, gap: 3 })),
      layer(T.dots(ARROW, 2)),
      layer(tint(dotWave(said, 3, 65.5, 5.1, 2.2, 2.1), .82), 'value'),
      layer(T.hrule(0, 82, 144, 3), 'idle'), layer(T.hrule(1, 82, 143, 3), 'idle'),
      layer(dotWave(heard, 3, 98, 5.1, 2.2, 2.1), 'value'),
      layer(T.cjk('开始吧', 32, 119, 23)),
    ]
  },
}

// Thermal puppy: luminance = heat (white-hot face, chest and paws, cooler ear tips, a warm floor glow).
const ell = (u: number, v: number, cx: number, cy: number, rx: number, ry: number) => 1 - len((u - cx) / rx, (v - cy) / ry)
const puppy: Field = (u, v) => {
  const n1 = hash01(Math.floor(u * 150) + Math.floor(v * 150) * 157, 3), n2 = hash01(Math.floor(u * 40) + Math.floor(v * 28) * 41, 9) - .5
  const fuzz = .1 * n2 + .07 * (n1 - .5)
  const head = ell(u, v, .51, .21, .17, .15), muzzle = ell(u, v, .51, .3, .08, .07)
  const ears = Math.max(ell(u, v, .33, .285, .055, .11), ell(u, v, .685, .28, .055, .11))
  const torso = Math.max(ell(u, v, .5, .5, .16, .2), ell(u, v, .5, .64, .21, .16)), chest = ell(u, v, .5, .47, .09, .14)
  const legs = Math.max(ell(u, v, .38, .74, .075, .13), ell(u, v, .62, .74, .075, .13), ell(u, v, .3, .7, .08, .11), ell(u, v, .72, .7, .08, .11))
  const paws = Math.max(ell(u, v, .37, .84, .085, .045), ell(u, v, .63, .84, .085, .045), ell(u, v, .27, .8, .06, .04), ell(u, v, .75, .79, .06, .04))
  const gap = v > .7 ? Math.max(0, .05 - Math.abs(u - .5)) * 4 * Math.min(1, (v - .7) * 8) : 0
  const inside = smoothstep(-.04, .1, Math.max(head, ears, torso, legs, paws, muzzle) + fuzz - gap)
  const glow = Math.max(0, chest * 1.2, muzzle * 1.4, head * .7, paws * .9)
  let heat = .8 + .2 * Math.min(1, glow * 2.2) + fuzz * 2 - (ears > 0 && head < .05 ? .14 : 0)
  if (Math.min(len((u - .43) / .024, (v - .245) / .024), len((u - .58) / .024, (v - .245) / .024)) < 1) heat = .1
  const back = .04 + .05 * v + .26 * Math.max(0, ell(u, v, .5, .9, .55, .14))
  return Math.max(0, Math.min(1, back + (heat - back) * inside))
}
/** The puppy never changes: baked once per card cell (about 20 ellipse tests a cell). */
const PUPPY = baked(TILE, puppy)
const NOSE: Pt = [73.5, 43]
export const thermalPuppy: WidgetPreset = {
  id: 'thermal-puppy', name: 'Thermal', label: '', group: 'photo', chrome: 'dots', bleed: true, grid: TILE, style: { ...tileStyle, sizeMin: 0, sizeMax: 1.05, quantizeSteps: 0 },
  layers: () => [
    layer(PUPPY, 'value'),
    layer(T.dotRing(NOSE[0], NOSE[1], 3.2, { spacing: 1.3, size: 1.2 })),
    layer(T.dots([NOSE], 4.5), 'active'),
    // bleed cards have no padding, so the label is placed by hand at the padded inset
    layer(T.big('THERMAL', 5, 5, { lattice: .92 })),
  ],
}

// Corridor in perspective: brick walls, tiled floor, ribbed ceiling, a black end wall. Joints and
// tile lines repeat in log-depth like the reference's stylised perspective.
const VP: Pt = [.5, .39], F = .5, HC = .62, HF = .62, FAR = 5.2, LOG = 1 / Math.log(1.2)
const corridor: Field = (u, v) => {
  const dx = u - VP[0], dy = v - VP[1]
  const zWall = Math.abs(dx) > 1e-6 ? F / Math.abs(dx) : Infinity
  const zFloor = dy > 1e-6 ? (F * HF) / dy : Infinity, zCeil = dy < -1e-6 ? (F * HC) / -dy : Infinity
  const z = Math.min(zWall, zFloor, zCeil)
  if (z > FAR) return 0
  const fog = 1 - (.45 * (z - 1)) / (FAR - 1), depth = Math.log(z) * LOG
  if (z === zWall) {
    const y = (HC + (dy * z) / F) / (HC + HF), course = Math.floor(y * 5), fy = y * 5 - course
    const brick = Math.floor(depth + (course % 2) * .5), fz = frac(depth + (course % 2) * .5)
    if (y < .025) return .95 * fog
    if (fy < .14 || fz < .14 || y > .97) return .04
    return (.62 + .33 * hash01(course * 31 + brick, 7)) * fog * (1 - .35 * fy) * (fz < .3 ? 1.15 : 1)
  }
  const x = (dx * z) / F
  if (z === zFloor) {
    const lane = Math.abs(x * 6 - Math.round(x * 6)) < .09 * Math.sqrt(z), row = frac(depth * 1.1) < .16
    return lane || row ? .04 : (.36 + .08 * hash01(Math.floor(x * 6) * 13 + Math.floor(depth * 1.1), 5)) * fog
  }
  const rib = frac(depth * 2.4) < .3, ray = Math.abs(x * 3 - Math.round(x * 3)) < .05 * Math.sqrt(z)
  return rib || ray ? .42 * fog : .03
}
/** The corridor never changes: baked once per card cell. */
const CORRIDOR = baked(TILE, corridor)
const INVADER = [
  '#.......#',
  '#.......#',
  '.#######.',
  '...###...',
  '..#####..',
  '#########',
  '#..#.#..#',
  '#.......#',
  '#...#...#',
  '##.###.##',
]
export const level03: WidgetPreset = {
  id: 'level-03', name: 'Level 03', label: '', group: 'scatter', chrome: 'dots', bleed: true, grid: TILE, style: { ...tileStyle, sizeMin: 0, sizeMax: 1, quantizeSteps: 0 },
  layers: () => {
    const sprite = T.lattice(1.45, 69, 53.5)
    return [
      layer(CORRIDOR, 'value'),
      layer(sprite.at(sprite.sprite(INVADER, 0, 0)), 'active'),
      layer(face('84', 76, 110.5, { lattice: 1.85, align: 'center', rows: 13 })),
      layer(T.big('LEVEL 03', 5, 5, { lattice: .92 }), 'idle'),
    ]
  },
}

const CHECK_MARK = art(12, 10, p => p.line([[0, 4], [4, 8], [10, 1]], 2))
const item = (row: number, text: string, state: 'done' | 'current' | 'todo') => [
  layer(tint(T.dotRing(23.5, row, 9.5, { spacing: 2.4, size: 1.9 }), .72), 'value'),
  ...(state === 'done' ? [layer(T.sprite(CHECK_MARK, 18, Math.round(row - 5)))] : state === 'current' ? [layer(T.dots([[23.5, row]], 6.5), 'active')] : []),
  layer(face(text, 47.5, row - 6, { lattice: .93 })),
]
export const shopping: WidgetPreset = {
  id: 'shopping', name: 'Shopping', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(face('5 LEFT', 14, 15.5, { lattice: 2.2, space: 5 })),
    ...item(65.5, 'MILK', 'done'), ...item(93, 'COFFEE', 'current'), ...item(119.5, 'RAMEN', 'todo'),
  ],
}

export const audioBoard = [audioLevels, vibePad, midi, recorder, radio, interpreter, thermalPuppy, level03, shopping]
