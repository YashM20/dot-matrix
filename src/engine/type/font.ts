/**
 * Dot type, part 1: a compact stroke font. Every glyph is a set of hand-authored centrelines in a
 * 10-unit cap box (y down, cap line y = 0, baseline y = 10), so the outline is a signed distance
 * to those strokes and can be set at any size, weight and width. Curves are superellipse arcs: the
 * `roundness` axis turns their exponent, round (n = 2) to squarish (n = 12), and the same exponent
 * squares off stroke ends and corners. Kerning comes from the glyphs' own side profiles.
 *
 * Stroke syntax: strokes split by `|`; a stroke is a run of `x,y` points and `a:cx,cy,rx,ry,a0,a1`
 * arcs (degrees, 0 = +x, 90 = down, swept from a0 to a1; joined to the previous point by a line).
 */

/** Cap height of the authoring box, in font units. */
export const CAP = 10
/** Advance of a space, font units. */
export const SPACE_UNITS = 3.6
/** White space between two glyphs' inked edges, font units (before kerning and tracking). */
export const WHITE_UNITS = 1.7

const S_UP = 'a:3,2.5,3,2.5,-15,-270 a:3,7.5,3,2.5,-90,165'
const GLYPHS: Record<string, string> = {
  A: '0,10 3,0 6,10 | 1.05,6.5 4.95,6.5',
  B: '0,10 0,0 3.2,0 a:3.2,2.4,2.5,2.4,-90,90 0,4.8 | 0,4.8 3.4,4.8 a:3.4,7.4,2.6,2.6,-90,90 0,10',
  C: 'a:3,5,3,5,-40,-320',
  D: '0,10 0,0 2.4,0 a:2.4,3.6,3.6,3.6,-90,0 6,6.4 a:2.4,6.4,3.6,3.6,0,90 0,10',
  E: '5,0 0,0 0,10 5,10 | 0,5 4.2,5',
  F: '5,0 0,0 0,10 | 0,5 4.2,5',
  G: 'a:3,5,3,5,-40,-360 3.4,5',
  H: '0,0 0,10 | 6,0 6,10 | 0,5 6,5',
  I: '0,0 0,10',
  J: '5,0 5,7.4 a:2.5,7.4,2.5,2.6,0,180',
  K: '0,0 0,10 | 5.4,0 0,6.2 | 1.9,4 5.6,10',
  L: '0,0 0,10 5,10',
  M: '0,10 0,0 3.5,6 7,0 7,10',
  N: '0,10 0,0 6,10 6,0',
  O: 'a:3.2,5,3.2,5,0,360',
  P: '0,10 0,0 3.3,0 a:3.3,2.75,2.6,2.75,-90,90 0,5.5',
  Q: 'a:3.2,5,3.2,5,0,360 | 4,7.4 6.6,10.2',
  R: '0,10 0,0 3.3,0 a:3.3,2.75,2.6,2.75,-90,90 0,5.5 | 3,5.5 5.8,10',
  S: S_UP,
  T: '0,0 6,0 | 3,0 3,10',
  U: '0,0 0,7 a:3,7,3,3,180,0 6,0',
  V: '0,0 3,10 6,0',
  W: '0,0 2,10 4,2.5 6,10 8,0',
  X: '0,0 6,10 | 6,0 0,10',
  Y: '0,0 3,5 6,0 | 3,5 3,10',
  Z: '0,0 6,0 0,10 6,10',
  0: 'a:2.8,5,2.8,5,0,360',
  1: '0,2.2 2.6,0 2.6,10',
  2: 'a:3,3,3,3,-165,28 0,10 6,10',
  3: 'a:2.9,2.5,2.9,2.5,-160,90 | 1.8,5 3,5 | a:3,7.5,3,2.5,-90,160',
  4: '4.4,10 4.4,0 0,7 6,7',
  5: '5.6,0 0.6,0 0.3,4.3 2.8,4 a:2.8,7,3.1,3,-90,150',
  6: 'a:3,7,3,3,0,360 | 0.4,5.5 4,0',
  7: '0,0 6,0 2,10',
  8: 'a:3,2.4,2,2.4,0,360 | a:3,7.3,3,2.7,0,360',
  9: 'a:3,3,3,3,0,360 | 5.6,4.5 2,10',
  '.': '0,10',
  ',': '0.6,9.6 0,11.2',
  ':': '0,3.5 | 0,10',
  ';': '0.6,3.5 | 0.6,9.6 0,11.2',
  '!': '0,0 0,6.5 | 0,10',
  '?': 'a:2.8,2.7,2.8,2.7,-170,70 2.8,5.6 2.8,7 | 2.8,10',
  "'": '0,0 0,3',
  '"': '0,0 0,3 | 2,0 2,3',
  '-': '0,5.5 4,5.5',
  '–': '0,5.5 6,5.5',
  '—': '0,5.5 9,5.5',
  '_': '0,10 6,10',
  '+': '0,5.5 5,5.5 | 2.5,3 2.5,8',
  '=': '0,4 5,4 | 0,7 5,7',
  '*': '2.5,1 2.5,6 | 0.3,2.2 4.7,4.8 | 4.7,2.2 0.3,4.8',
  '/': '4,0 0,10',
  '\\': '0,0 4,10',
  '<': '5,1.5 0,5.5 5,9.5',
  '>': '0,1.5 5,5.5 0,9.5',
  '(': 'a:2,5,2,6,-120,-240',
  ')': 'a:-1,5,2,6,-60,60',
  '[': '2.5,-0.5 0,-0.5 0,10.5 2.5,10.5',
  ']': '0,-0.5 2.5,-0.5 2.5,10.5 0,10.5',
  '%': 'a:1.2,1.8,1.2,1.8,0,360 | a:4.8,8.2,1.2,1.8,0,360 | 5.5,0 0.5,10',
  '#': '2,0.5 1.5,9.5 | 4.5,0.5 4,9.5 | 0,3.5 6,3.5 | 0,6.8 6,6.8',
  $: `${S_UP} | 3,-1.2 3,11.2`,
  '°': 'a:1.4,1.6,1.4,1.6,0,360',
  '·': '0,5.5',
  '…': '0,10 | 2.5,10 | 5,10',
  '&': '6,10 a:2.6,2.5,1.9,2.5,40,-270 a:2.7,7.4,2.7,2.6,-90,0 ',
  '@': 'a:4,5,4,5,30,350 | a:4,5.2,1.8,2,0,360 | 5.8,3.2 5.8,7 a:6.8,7,1,1,180,90',
}

export type Pt = [number, number]
type Op = { k: 'p'; x: number; y: number } | { k: 'a'; cx: number; cy: number; rx: number; ry: number; a0: number; a1: number }
export interface StrokeGlyph {
  ch: string
  strokes: Op[][]
  /** Ink box of the centrelines, font units (min x is 0 after normalising). */
  w: number
  y0: number; y1: number
}

const parsed = new Map<string, StrokeGlyph | null>()
/** The stroke glyph for `ch` (letters fold to upper case), or null when the stroke font has none. */
export function strokeGlyph(ch: string): StrokeGlyph | null {
  const key = ch.length === 1 ? ch.toUpperCase() : ch
  let g = parsed.get(key)
  if (g !== undefined) return g
  const src = GLYPHS[key]
  g = src === undefined ? null : parseGlyph(key, src)
  parsed.set(key, g)
  return g
}
export const hasStrokeGlyph = (ch: string) => strokeGlyph(ch) !== null
/** Every character the stroke font draws. */
export const STROKE_CHARS = Object.keys(GLYPHS).join('')

function parseGlyph(ch: string, src: string): StrokeGlyph {
  const strokes: Op[][] = src.split('|').map(s => s.trim().split(/\s+/).filter(Boolean).map((tok): Op => {
    if (tok.startsWith('a:')) {
      const [cx, cy, rx, ry, a0, a1] = tok.slice(2).split(',').map(Number)
      return { k: 'a', cx, cy, rx, ry, a0, a1 }
    }
    const [x, y] = tok.split(',').map(Number)
    return { k: 'p', x, y }
  }))
  // normalise: ink box starts at x = 0
  const pts = flatten({ ch, strokes, w: 0, y0: 0, y1: 0 }, ident, identArc, 2, () => 64).flat()
  const x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]))
  const shifted = strokes.map(s => s.map((op): Op => (op.k === 'p' ? { ...op, x: op.x - x0 } : { ...op, cx: op.cx - x0 })))
  return { ch, strokes: shifted, w: x1 - x0, y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) }
}
const ident = (x: number, y: number): Pt => [x, y]
const identArc = (cx: number, cy: number, rx: number, ry: number): [number, number, number, number] => [cx, cy, rx, ry]

/** Superellipse exponent of the `roundness` axis (1 = round, n = 2; 0 = squarish, n = 12). */
export const roundnessExponent = (roundness: number) => 2 + 10 * (1 - Math.max(0, Math.min(1, roundness))) ** 2

/**
 * Centreline polylines of a glyph after mapping: `point` places authored points (snap them here),
 * `arc` places an arc's centre and radii (snap its box here), arcs are sampled as superellipses of
 * exponent `n` with `samples(rx, ry, sweep°)` points.
 */
export function flatten(g: StrokeGlyph, point: (x: number, y: number) => Pt, arc: typeof identArc, n: number, samples: (rx: number, ry: number, sweep: number) => number): Pt[][] {
  const e = 2 / n
  return g.strokes.map(stroke => {
    const out: Pt[] = []
    const push = (p: Pt) => { const q = out[out.length - 1]; if (!q || Math.abs(q[0] - p[0]) > 1e-6 || Math.abs(q[1] - p[1]) > 1e-6) out.push(p) }
    for (const op of stroke) {
      if (op.k === 'p') { push(point(op.x, op.y)); continue }
      const [cx, cy, rx, ry] = arc(op.cx, op.cy, op.rx, op.ry), m = Math.max(2, samples(rx, ry, Math.abs(op.a1 - op.a0)))
      for (let i = 0; i <= m; i++) {
        const a = ((op.a0 + ((op.a1 - op.a0) * i) / m) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
        push([cx + rx * Math.sign(c) * Math.abs(c) ** e, cy + ry * Math.sign(s) * Math.abs(s) ** e])
      }
    }
    return out
  })
}

// ── kerning from side profiles ─────────────────────────────────────────────
const BANDS = 12, BAND0 = -.5
interface Profile { left: Float64Array; right: Float64Array }
const profiles = new Map<string, Profile>()
function profileOf(g: StrokeGlyph): Profile {
  let p = profiles.get(g.ch)
  if (p) return p
  const left = new Float64Array(BANDS).fill(Infinity), right = new Float64Array(BANDS).fill(-Infinity)
  for (const line of flatten(g, ident, identArc, roundnessExponent(.5), () => 48)) {
    const add = (x: number, y: number) => { const b = Math.floor(y - BAND0); if (b < 0 || b >= BANDS) return; if (x < left[b]) left[b] = x; if (x > right[b]) right[b] = x }
    if (line.length === 1) add(line[0][0], line[0][1])
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i], steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / .2))
      for (let k = 0; k <= steps; k++) add(ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps)
    }
  }
  profiles.set(g.ch, (p = { left, right }))
  return p
}
const kerns = new Map<string, number>()
/** Largest kern, font units. */
export const MAX_KERN = 2
/**
 * Pair kerning in font units (≤ 0): half the smallest white gap the two side profiles leave beyond
 * the plain box spacing, capped at MAX_KERN. AV, LT, T. tuck in; HH, OO and NN stay put.
 */
export function kernUnits(a: string, b: string): number {
  const key = a + '\u0000' + b
  let k = kerns.get(key)
  if (k !== undefined) return k
  const ga = strokeGlyph(a), gb = strokeGlyph(b)
  k = 0
  if (ga && gb) {
    const pa = profileOf(ga), pb = profileOf(gb)
    let gap = Infinity
    // a band one glyph leaves empty counts as that glyph's outermost ink, so '.' or '-' never slide under a neighbour
    const ra = outermost(pa.right, -1), lb = outermost(pb.left, 1)
    for (let j = 0; j < BANDS; j++) {
      if (!(pa.right[j] > -Infinity) && !(pb.left[j] < Infinity)) continue
      gap = Math.min(gap, ga.w - (pa.right[j] > -Infinity ? pa.right[j] : ra) + (pb.left[j] < Infinity ? pb.left[j] : lb))
    }
    if (Number.isFinite(gap)) k = -Math.min(MAX_KERN, Math.max(0, gap) * .6)
    if (Math.abs(k) < .05) k = 0
  }
  kerns.set(key, k)
  return k
}
/** Outermost profile value among inked bands (`side` -1: right profile max, 1: left profile min); 0 when the glyph has none. */
function outermost(prof: Float64Array, side: -1 | 1): number {
  let v = side < 0 ? -Infinity : Infinity
  for (const x of prof) if (side < 0 ? x > v : x < v) v = x
  return Number.isFinite(v) ? v : 0
}
