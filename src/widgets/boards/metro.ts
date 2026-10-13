/**
 * Board 5 — Metro / Oxygen / Quiet / Newswire (public/images/HQLGUfgakAA5Paz.jpg).
 * TILE cards (144×144). The reference mixes several dot-font cuts, so heroes here are dot
 * sites laid out from glyph bitmaps on a measured (sometimes anisotropic) pitch:
 * `smooth` = Scale2x 10×14 (2-dot strokes), `bold` = Scale3x 15×21 (3-dot strokes),
 * `narrow` = Scale2x with the inner column pairs merged (7–9 wide, poster headlines).
 */
import { glyph, scale2x } from '../../engine/fields/bitmapFont'
import type { Field } from '../../engine/types'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
type Pt = [number, number]
type Bits = boolean[][]

// ── local glyph cuts ────────────────────────────────────────────────────────
/** AdvMAME3x: 3× upscale that keeps diagonals one step thick — the 3-dot-stroke hero weight. */
function scale3x(bits: Bits): Bits {
  const h = bits.length, w = bits[0]?.length ?? 0, at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? bits[y][x] : false)
  const out = Array.from({ length: h * 3 }, () => new Array<boolean>(w * 3).fill(false))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const A = at(x - 1, y - 1), B = at(x, y - 1), C = at(x + 1, y - 1), D = at(x - 1, y), E = at(x, y), F = at(x + 1, y), G = at(x - 1, y + 1), H = at(x, y + 1), I = at(x + 1, y + 1)
    const px = [
      D === B && D !== H && B !== F ? D : E,
      (D === B && D !== H && B !== F && E !== C) || (B === F && B !== D && F !== H && E !== A) ? B : E,
      B === F && B !== D && F !== H ? F : E,
      (D === B && D !== H && B !== F && E !== G) || (D === H && D !== B && H !== F && E !== A) ? D : E,
      E,
      (B === F && B !== D && F !== H && E !== I) || (H === F && H !== D && F !== B && E !== C) ? F : E,
      D === H && D !== B && H !== F ? D : E,
      (D === H && D !== B && H !== F && E !== I) || (H === F && H !== D && F !== B && E !== G) ? H : E,
      H === F && H !== D && F !== B ? F : E,
    ]
    px.forEach((v, k) => { out[y * 3 + Math.floor(k / 3)][x * 3 + (k % 3)] = v })
  }
  return out
}
/** Merge Scale2x column/row pairs: `2` keeps both, `1` ORs them into one dot. */
function squeeze(bits: Bits, cols: number[], rows: number[]): Bits {
  const pick = (n: number[]) => n.flatMap((k, i) => (k === 2 ? [[2 * i], [2 * i + 1]] : [[2 * i, 2 * i + 1]]))
  const cs = pick(cols), rs = pick(rows)
  return rs.map(r => cs.map(c => r.some(y => c.some(x => bits[y]?.[x]))))
}
type Font = '5x7' | 'smooth' | 'bold' | 'narrow' | 'narrowShort'
const WIDE = new Set(['M', 'N', 'O', 'W'])
const bold = new Map<string, Bits>()
/** Reference cuts that differ from the stock 5×7: a 9 with a full bottom bowl. */
const CUT: Record<string, Bits> = { '9': ['01110', '10001', '10001', '01111', '00001', '10001', '01110'].map(r => [...r].map(b => b === '1')) }
function bitsFor(ch: string, font: Font): Bits {
  if (font === '5x7') return glyph(ch)
  if (font === 'smooth') return CUT[ch] ? scale2x(CUT[ch]) : glyph(ch, { smooth: true })
  if (font === 'bold') { let b = bold.get(ch); if (!b) { b = scale3x(glyph(ch)); bold.set(ch, b) } return b }
  const cols = WIDE.has(ch) ? [2, 2, 1, 2, 2] : ch === 'H' ? [2, 1, 2, 1, 2] : [2, 1, 1, 1, 2]
  return squeeze(glyph(ch, { smooth: true }), cols, font === 'narrowShort' ? [2, 1, 2, 1, 2, 1, 2] : [2, 2, 2, 2, 2, 2, 2])
}
interface TextDots { font: Font; px: number; py?: number; size: number; gap?: number; align?: 'left' | 'center' }
/** Text as dot sites: first dot centre at card cell (x, y), `px`/`py` cells between dots, `gap` empty dots between glyphs. */
function textDots(str: string, x: number, y: number, o: TextDots): LatticeField {
  const py = o.py ?? o.px, gap = o.gap ?? (o.font === '5x7' || o.font.startsWith('narrow') ? 1 : 2)
  const glyphs = [...str].map(ch => bitsFor(ch, o.font)), width = glyphs.reduce((w, g) => w + (g[0]?.length ?? 0) + gap, -gap)
  let cx = o.align === 'center' ? x - ((width - 1) * o.px) / 2 : x
  const sites: Pt[] = []
  for (const g of glyphs) {
    g.forEach((row, r) => row.forEach((on, c) => { if (on) sites.push([cx + c * o.px, y + r * py]) }))
    cx += ((g[0]?.length ?? 0) + gap) * o.px
  }
  return T.dots(sites, o.size)
}
/** Pixel-art rows → dot sites (`on` picks which characters light up). */
function spriteDots(rows: string[], x: number, y: number, px: number, py: number, size: number, on = '#'): LatticeField {
  const sites: Pt[] = []
  rows.forEach((row, r) => [...row].forEach((ch, c) => { if (on.includes(ch)) sites.push([x + c * px, y + r * py]) }))
  return T.dots(sites, size)
}
/** `n + 1` evenly spaced dots from a to b (both ends included) — walls, tracks. */
const seg = (x0: number, y0: number, x1: number, y1: number, n: number): Pt[] => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n] as Pt)
/** The reference zero has no slash — draw it with the O glyph. */
const O = (s: string) => s.replace(/0/g, 'O')

// ── cards ───────────────────────────────────────────────────────────────────
export const metro: WidgetPreset = {
  id: 'metro', name: 'Metro', group: 'text', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(textDots(O('02'), 29.6, 23.6, { font: 'bold', px: 2.5, py: 2.6, gap: 4, size: 2.75 })),
    layer(T.big('MIN', 54.1, 87.3, { lattice: 2.05 })),
    // line map: origin ring → track → you-are-here → climb → destination ring
    layer(T.dotRing(12.7, 134.8, 4.5, { spacing: 2.8, size: 2.3 })),
    layer(T.dots(seg(21.7, 135.1, 63.6, 135.1, 11), 2.4)),
    layer(T.dots(seg(77.8, 130.8, 89.2, 119.7, 4), 2.4)),
    layer(T.dots(seg(92.6, 118.4, 122.6, 118.4, 8), 2.4)),
    layer(T.dotRing(132.3, 118.4, 4.5, { spacing: 2.8, size: 2.3 })),
    layer(T.dots([[71.4, 135.1]], 9.5), 'active'),
  ],
}

const PCT = [
  '.##...#',
  '#..#..#',
  '#..#.#.',
  '.##..#.',
  '....#..',
  '...#...',
  '..#.##.',
  '.#.#..#',
  '.#.#..#',
  '#...##.',
]
export const oxygen: WidgetPreset = {
  id: 'oxygen', name: 'Oxygen', group: 'polar', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    // 43 dots round, the 12 o'clock one red
    layer(T.dotRing(76.1, 76.2, 65.8, { spacing: (TAU * 65.8) / 43, size: 2.6 }), 'idle'),
    layer(T.dots([[76.1, 10.4]], 2.8), 'active'),
    layer(textDots('98', 33.6, 57.4, { font: 'smooth', px: 2.9, py: 3.08, size: 2.9 })),
    layer(spriteDots(PCT, 103.3, 71.7, 2.9, 2.92, 2.9)),
  ],
}

export const homeQuiet: WidgetPreset = {
  id: 'home-quiet', name: 'Home', group: 'icon', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => {
    // floor plan: two rooms on the left (door gap in the shared right wall), one on the right (door on its left)
    const X = [12.7, 58.6], R = [83.5, 132.1], Y = (i: number) => 72.2 + i * 3.415
    const walls: Pt[] = [
      ...seg(X[0], Y(0), X[1], Y(0), 13), ...seg(X[0], Y(11), X[1], Y(11), 13), ...seg(X[0], Y(20), X[1], Y(20), 13),
      ...seg(X[0], Y(0), X[0], Y(20), 20), ...seg(X[1], Y(0), X[1], Y(5), 5), ...seg(X[1], Y(11), X[1], Y(20), 9),
      ...seg(R[0], Y(0), R[1], Y(0), 14), ...seg(R[0], Y(20), R[1], Y(20), 14),
      ...seg(R[1], Y(0), R[1], Y(20), 20), ...seg(R[0], Y(0), R[0], Y(5), 5), ...seg(R[0], Y(11), R[0], Y(20), 9),
    ]
    return [
      layer(T.big('QUIET', 12.45, 21.75, { lattice: 2.1, smooth: true })),
      layer(T.dots(walls, 2.5), 'idle'),
      layer(T.dots([[100.8, 121.4]], 8), 'active'),
    ]
  },
}

// lap delta trace: flat, a dip, then the long climb past the car (red) to the line
const LAP: Pt[] = [[0.4, 100.8], [4.6, 99.6], [9.7, 98.9], [14.3, 99.2], [19, 99.8], [23.6, 100.6], [28.3, 101.3], [32.9, 101.9], [37.6, 102.1], [42.2, 102.1], [46.4, 101.7], [50.6, 101.1], [54.9, 100.4], [59.6, 99.3], [64.1, 97.9], [68.5, 96], [72.8, 93.9], [77, 91.6], [81, 89.3], [85, 86.9], [89, 84.4], [93.2, 81.9], [97.5, 79.5], [101.7, 77.2], [114.8, 70.5], [119.2, 68.8], [123.6, 67.4], [128, 66.2], [132.5, 65.3], [137.1, 64.6], [141.8, 64.1]]
export const finalLap: WidgetPreset = {
  id: 'final-lap', name: 'Final Lap', group: 'chart', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(textDots('P', 15.1, 22.8, { font: 'smooth', px: 3.1, py: 3.35, size: 2.9 })),
    layer(textDots('2', 52.7, 22.8, { font: 'smooth', px: 2.85, py: 3.35, size: 2.9 })),
    layer(T.dots(LAP, 2.5)),
    layer(T.dots([[108.3, 73.6]], 8.5), 'active'),
    layer(T.dots(seg(11.6, 128.6, 20.6, 128.6, 6), 1.5)),
    layer(textDots(O('0.8 SEC'), 25.7, 123.1, { font: '5x7', px: 1.8, py: 1.88, size: 2.1 })),
  ],
}

export const newswire: WidgetPreset = {
  id: 'newswire', name: 'Newswire', group: 'text', chrome: 'dots', live: true, grid: TILE, style: tileStyle,
  layers: () => {
    const head = { font: 'narrow', px: 2.52, py: 2.75, size: 2.4 } as const
    return [
      layer(textDots('THE', 1.8, 15, head)),
      layer(textDots('MOON', 1.8, 59.5, head)),
      layer(textDots('BLINKED', 1.8, 104, head)),
    ]
  },
}

// antlers as loose dot sprays, measured off the reference
const ANTLERS: Pt[] = [[3.4, 30], [5.5, 35.9], [6.8, 41.4], [11, 46.8], [11, 60.3], [13.9, 32.9], [13.9, 38.4], [13.9, 43.9], [14.3, 27.4], [14.3, 51.5], [14.8, 64.6], [16.9, 22.4], [19.4, 54.9], [19.8, 19], [20.3, 64.6], [25.3, 57.4], [27.4, 40.9], [27.4, 46.4], [27.4, 63.7], [29.5, 35.9], [30, 51.9], [32.1, 54], [32.5, 60.3], [34.6, 66.7], [35.4, 27.4], [35.4, 30.4], [39.7, 68.8], [45.1, 55.3], [45.1, 59.9], [45.1, 71.3], [46, 49.4], [48.1, 66.2], [48.9, 42.6], [50.6, 73.8], [53.6, 70.9],
  [90.7, 70.9], [94.9, 41.4], [95.4, 67.1], [96.2, 73.4], [97.9, 32.9], [98.7, 46], [99.2, 62.4], [101.3, 51.5], [101.3, 57], [101.3, 70.9], [106.8, 69.2], [111, 67.5], [112.7, 49.4], [114.3, 64.6], [115.2, 54.4], [116, 60.3], [117.7, 22.4], [119.8, 59.9], [121.5, 65], [121.9, 28.3], [122.4, 16.5], [124.5, 30.4], [124.9, 54.9], [127, 65], [128.7, 49.4], [130, 32.9], [130, 37.1], [130.8, 43.9], [132.9, 62.4], [135.9, 27.4], [136.3, 39.7], [136.3, 57.4], [138.4, 16.5], [141.4, 35], [143, 27.4], [138.2, 6.1]]
export const deerflowStars: WidgetPreset = {
  id: 'deerflow-stars', name: 'DeerFlow', group: 'scatter', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(T.dots(ANTLERS, 2.6), 'idle'),
    layer(T.dots([[110.4, 38.8]], 5), 'active'),
    layer(textDots(O('80K'), 24.9, 80.6, { font: 'smooth', px: 2.76, py: 2.98, size: 2.8 })),
    layer(textDots('STARS', 38, 128.1, { font: '5x7', px: 2.34, py: 2.13, size: 2.3 })),
  ],
}

// Cody: '#' light dots (antlers, ears, face, hooves), '+' grey fur
const CODY = [
  '...#...........#.........',
  '...#...........#.........',
  '...#..#.....#..#.........',
  '.#..#.#.....#..#.#.......',
  '.#..##.......###.#.......',
  '.#####.......####........',
  '....##......###..........',
  '.....##.....##...........',
  '##....#....##...###......',
  '###+++++++++++##+##......',
  '.##++++++++++++###.......',
  '...++++++++++++..........',
  '...++++++++++++..........',
  '...#+.#++++#+.#..........',
  '...##.##++##+.#..........',
  '...#+.######+.#..........',
  '...#####..#####..........',
  '...#####..#####........##',
  '....##########++++++++++#',
  '......#######+++++++++++#',
  '.......+++++++++++++++++.',
  '.......+++++++++++++++++.',
  '.......##+++++++++++++++.',
  '........##++++++++++++++.',
  '.........##+++###++++++..',
  '.........+##++....+++.++.',
  '.........++.++....++..++.',
  '.........++.++....++..++.',
  '.........++.++....++..++.',
  '.........##.##....##..##.',
  '........###.##...###.###.',
]
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...']
export const cody: WidgetPreset = {
  id: 'cody', name: 'Cody', group: 'icon', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(spriteDots(CODY, 29.5, 13.9, 3.28, 3.32, 2.9, '+'), 'mid'),
    layer(spriteDots(CODY, 29.5, 13.9, 3.28, 3.32, 2.9, '#')),
    layer(spriteDots(HEART, 113.3, 17.7, 2.6, 2.6, 2.5), 'active'),
    layer(textDots('WANTS COFFEE', 21.7, 131.4, { font: '5x7', px: 1.4, py: 1.35, size: 1.55 }), 'idle'),
  ],
}

const HORIZON = 81.4
const sun = (cx: number, cy: number, r: number): LatticeField => {
  const disc = T.dotDisc(cx, cy, r, { spacing: 2.52, size: 1.65 })
  return { ...disc, sites: disc.sites!.filter(([, y]) => y < HORIZON - 1.5) }
}
const WALKER: Pt[] = [[77, 91.3], [79.3, 91.3], [77, 93.7], [79.3, 93.7], [75, 98.5], [77, 98.5], [79, 98.5], [81, 98.5],
  ...[100.7, 103.1, 105.4, 107.7].flatMap(y => [[73.7, y], [77, y], [79.3, y], [82.6, y]] as Pt[]),
  ...[110.2, 112.5, 114.8, 117.4, 119.8].flatMap(y => [[77, y], [79.3, y]] as Pt[])]
export const tatooine: WidgetPreset = {
  id: 'tatooine', name: 'Tatooine', group: 'photo', chrome: 'dots', grid: TILE, style: tileStyle,
  layers: () => [
    layer(sun(46, 57.4, 36.5)), layer(sun(121.3, 69.5, 22)),
    layer(T.dotLine(0, HORIZON, 143, HORIZON, { spacing: 2.53, size: 1.45 }), 'idle'),
    layer(T.dots([[133.8, HORIZON]], 5.2), 'active'),
    layer(T.dots(WALKER, 1.75)),
    layer(T.big('BINARY SUNSET', 27.25, 131.35, { lattice: 1.3 }), 'idle'),
  ],
}

// Profile halftone (luminance 0–9 per site on a 2.52 × 2.72 cell pitch): face looking right, lit from the right.
const FACE = [
  '...............344441',
  '............122455765',
  '............343567877',
  '...........24346778782',
  '..........134357778895',
  '.........1224457889898',
  '........111134578899992',
  '............22478899996',
  '..............134577897',
  '.............232..22697',
  '...........355551.12796',
  '..........1441...245782',
  '.........23.234...1586',
  '.........334552....582',
  '.......2331.47653..59',
  '.......466413689731491',
  '.......477777789842387',
  '.......2578998998752594',
  '........368998999764379',
  '........257899998874.296',
  '........13579999897..1795',
  '.........2468899983.324794',
  '..........35679986..3543893',
  '..........13678994...34.593',
  '...........1457983....1264',
  '...........1346985...174',
  '............34688976797',
  '............23578998999',
  '............124778878992',
  '............124777766791',
  '.............24661..353',
  '............1148633498',
  '.............257432.89',
  '............13443..167',
  '..............2345761',
  '..............246897',
  '..............247999',
  '...............36899',
  '................3698',
  '.................582',
  '.................42',
]
const FACE_X = 63.26, FACE_Y = 23.5, FACE_PX = 2.52, FACE_PY = 2.72
const faceSites: Pt[] = [], faceLum = new Map<string, number>()
FACE.forEach((row, r) => [...row].forEach((ch, c) => {
  if (ch === '.') return
  const x = FACE_X + c * FACE_PX, y = FACE_Y + r * FACE_PY
  faceSites.push([x, y]); faceLum.set(`${Math.round(x * 10)},${Math.round(y * 10)}`, 0.3 + (0.7 * +ch) / 9)
}))
/** Site field: the sampler evaluates each site at its own u/v, so look the luminance back up by position. */
const faceField: Field = (u, v) => faceLum.get(`${Math.round(u * (TILE.cols - 1) * 10)},${Math.round(v * (TILE.rows - 1) * 10)}`) ?? 0
export const afterlight: WidgetPreset = {
  id: 'afterlight', name: 'Afterlight', label: '', group: 'photo', chrome: 'dots', grid: TILE, style: { ...tileStyle, sizeMin: 0, sizeMax: 1.05, quantizeSteps: 0 },
  layers: () => [
    layer(textDots('AFTERLIGHT', 0, 0, { font: 'narrowShort', px: 1.8, py: 2.16, size: 2 })),
    layer({ field: faceField, sites: faceSites, lattice: 2.6 }, 'value'),
    layer(T.dotLine(70.2, 0, 70.2, 134, { spacing: 2.9, size: 1.8 }), 'active'),
    layer(T.big('A FILM BY HENRY LI', 0, 136, { lattice: 1.05 }), 'idle'),
  ],
}

export const metroBoard = [metro, oxygen, homeQuiet, finalLap, newswire, deerflowStars, cody, tatooine, afterlight]
