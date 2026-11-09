/**
 * Hero numerals drawn as strokes, not sampled from a bitmap (#269). Each glyph is a few centrelines in dot units
 * (x right, y down, one unit = one hero dot, the glyph 14 dots tall). A face's strokes are one dot (`fine`) or two
 * dots wide (`twin`, `condensed`: two lines half a dot either side of the centreline, mitred at corners).
 * Dots go along each line at one even spacing: straight runs land on the lattice, and a 45° run spaces its dots one
 * dot apart along the stroke instead of √2 apart on the grid, so every gap reads the same. Dots closer than
 * `MERGE` to one already placed are dropped (lattice dots first), so joins and corners don't double up.
 *
 * Stroke syntax: strokes split by `|`; a stroke is `x,y` points; `d:` starts a list of single dots.
 * Digits are tabular (one width per face); punctuation keeps its own width.
 */
export type HeroFace = 'twin' | 'fine' | 'condensed'
type Pt = [number, number]
interface FaceDef { weight: 1 | 2; gap: number; glyphs: Record<string, [width: number, strokes: string]> }

/** Two dots closer than this (dot units) are one dot: a site dot is ~0.84 of its size across, so this keeps a gap. */
const MERGE = .85
/** A straight run takes the lattice positions within this far past its ends (its mitred ends sit off the lattice). */
const SNAP = .3

/** The glyph turned half a turn in a box `w` dots wide (a 9 from a 6). */
const turn = (w: number, s: string) => s.replace(/(-?[\d.]+),(-?[\d.]+)/g, (_, x, y) => `${+(w - 1 - +x).toFixed(3)},${+(13 - +y).toFixed(3)}`)

const TWIN6 = '8.5,2.5 6.5,.5 2.5,.5 .5,2.5 .5,10.5 2.5,12.5 6.5,12.5 8.5,10.5 8.5,8.5 6.5,6.5 .5,6.5'
const FINE6 = '7,2 5,0 2,0 0,2 0,11 2,13 5,13 7,11 7,7 5,5 2,5 0,7'
const COND6 = '6.5,3 6.5,1.5 5.5,.5 1.5,.5 .5,1.5 .5,11.5 1.5,12.5 5.5,12.5 6.5,11.5 6.5,7.5 5.5,6.5 .5,6.5'
const PUNCT: FaceDef['glyphs'] = {
  '.': [4, '1,12.5 2,12.5'], ':': [4, '1,3.5 2,3.5 | 1,9.5 2,9.5'],
  '-': [8, '0,6.5 7,6.5'], '+': [8, '0,6.5 7,6.5 | 3.5,3 3.5,10'],
}

const FACES: Record<HeroFace, FaceDef> = {
  // A · two-dot stroke, 10 wide: corners cut on a 45° by two dots, bars on rows 0-1, 6-7 and 12-13
  twin: {
    weight: 2, gap: 2, glyphs: {
      0: [10, '2.5,.5 6.5,.5 8.5,2.5 8.5,10.5 6.5,12.5 2.5,12.5 .5,10.5 .5,2.5 2.5,.5'],
      1: [10, '4.5,0 4.5,13 | 4.5,.5 .5,4.5 | 2,12.5 7,12.5'],
      2: [10, '.5,4 .5,2.5 2.5,.5 6.5,.5 8.5,2.5 8.5,4.5 .5,12.5 | 0,12.5 9,12.5'],
      3: [10, '.5,4 .5,2.5 2.5,.5 6.5,.5 8.5,2.5 8.5,10.5 6.5,12.5 2.5,12.5 .5,10.5 .5,9 | 3,6.5 8.5,6.5'],
      4: [10, '6.5,0 6.5,13 | 6.5,.5 .5,6.5 .5,9 | 0,8.5 9,8.5'],
      5: [10, '9,.5 .5,.5 .5,5.5 6.5,5.5 8.5,7.5 8.5,10.5 6.5,12.5 2.5,12.5 .5,10.5 .5,9.5'],
      6: [10, TWIN6],
      7: [10, '0,.5 8.5,.5 8.5,2.5 2.5,8.5 2.5,13'],
      8: [10, '2.5,.5 6.5,.5 8.5,2.5 8.5,4.5 6.5,6.5 2.5,6.5 .5,4.5 .5,2.5 2.5,.5 | 2.5,6.5 6.5,6.5 8.5,8.5 8.5,10.5 6.5,12.5 2.5,12.5 .5,10.5 .5,8.5 2.5,6.5'],
      9: [10, turn(10, TWIN6)],
      '%': [10, 'd:1,0 2,0 0,1 1,1 2,1 3,1 0,2 1,2 2,2 3,2 1,3 2,3 | 8.5,2.5 1.5,9.5 | d:7,10 8,10 6,11 7,11 8,11 9,11 6,12 7,12 8,12 9,12 7,13 8,13'],
      ' ': [6, ''], ...PUNCT,
    },
  },
  // B · one-dot stroke, 8 wide: corners cut by one diagonal dot (the NDot / flip-dot weight)
  fine: {
    weight: 1, gap: 2, glyphs: {
      0: [8, '2,0 5,0 7,2 7,11 5,13 2,13 0,11 0,2 2,0'],
      1: [8, '4,0 4,13 | 4,0 1,3 | 2,13 6,13'],
      2: [8, '0,2 2,0 5,0 7,2 7,4 0,11 0,13 7,13'],
      3: [8, '0,2 2,0 5,0 7,2 7,4 5,6 2,6 | 5,6 7,8 7,11 5,13 2,13 0,11'],
      4: [8, '5,13 5,0 0,5 0,9 7,9'],
      5: [8, '7,0 0,0 0,5 5,5 7,7 7,11 5,13 2,13 0,11'],
      6: [8, FINE6],
      7: [8, '0,0 7,0 7,2 2,7 2,13'],
      8: [8, '2,0 5,0 7,2 7,4 5,6 2,6 0,4 0,2 2,0 | 2,6 5,6 7,8 7,11 5,13 2,13 0,11 0,8 2,6'],
      9: [8, turn(8, FINE6)],
      '.': [3, 'd:1,13'], ':': [3, 'd:1,4 1,10'], '-': [7, '0,7 6,7'], '+': [7, '0,7 6,7 | 3,4 3,10'],
      '%': [8, 'd:1,0 0,1 2,1 1,2 | 7,3 0,10 | d:6,11 5,12 7,12 6,13'],
      ' ': [5, ''],
    },
  },
  // C · two-dot stroke, 8 wide: flat sides, only the outer corner dot pulled in (departure boards)
  condensed: {
    weight: 2, gap: 2, glyphs: {
      0: [8, '1.5,.5 5.5,.5 6.5,1.5 6.5,11.5 5.5,12.5 1.5,12.5 .5,11.5 .5,1.5 1.5,.5'],
      1: [8, '3.5,0 3.5,13 | 1,.5 3.5,.5 | 1,12.5 6,12.5'],
      2: [8, '.5,3 .5,1.5 1.5,.5 5.5,.5 6.5,1.5 6.5,4.5 .5,10.5 .5,12.5 | 0,12.5 7,12.5'],
      3: [8, '.5,3 .5,1.5 1.5,.5 5.5,.5 6.5,1.5 6.5,11.5 5.5,12.5 1.5,12.5 .5,11.5 .5,10 | 2,6.5 6.5,6.5'],
      4: [8, '.5,0 .5,8.5 7,8.5 | 5.5,0 5.5,13'],
      5: [8, '7,.5 .5,.5 .5,5.5 5.5,5.5 6.5,6.5 6.5,11.5 5.5,12.5 1.5,12.5 .5,11.5 .5,10'],
      6: [8, COND6],
      7: [8, '0,.5 6.5,.5 6.5,3.5 2.5,7.5 2.5,13'],
      8: [8, '1.5,.5 5.5,.5 6.5,1.5 6.5,4.5 4.5,6.5 2.5,6.5 .5,4.5 .5,1.5 1.5,.5 | 2.5,6.5 4.5,6.5 6.5,8.5 6.5,11.5 5.5,12.5 1.5,12.5 .5,11.5 .5,8.5 2.5,6.5'],
      9: [8, turn(8, COND6)],
      '%': [8, 'd:1,0 0,1 1,1 2,1 1,2 | 6.5,3.5 .5,9.5 | d:6,11 5,12 6,12 7,12 6,13'],
      ' ': [5, ''], ...PUNCT,
    },
  },
}

/** Glyph height in dots (the smooth face's height, so a face swaps in at the same lattice). */
export const HERO_H = 14
/** True when every character of `s` is in the face (digits, `. : % - +`, space). */
export const heroCovers = (face: HeroFace, s: string) => s.length > 0 && [...s].every(ch => ch in FACES[face].glyphs)
/** Width of `s` in dots: glyph widths plus the face's gap between glyphs. */
export function heroWidth(face: HeroFace, s: string): number {
  const f = FACES[face], chars = [...s]
  return chars.reduce((w, ch) => w + (f.glyphs[ch]?.[0] ?? 0), 0) + Math.max(0, chars.length - 1) * f.gap
}

const isInt = (v: number) => Math.abs(v - Math.round(v)) < 1e-6
/** A stroke moved `d` dots to its left, mitred at each corner (a closed stroke mitres where it meets itself). */
function offset(p: Pt[], d: number): Pt[] {
  const closed = p.length > 2 && p[0][0] === p[p.length - 1][0] && p[0][1] === p[p.length - 1][1]
  const normal = (a: Pt, b: Pt): Pt => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] }
  return p.map((pt, i) => {
    const prev = i > 0 ? normal(p[i - 1], pt) : closed ? normal(p[p.length - 2], p[0]) : null
    const next = i < p.length - 1 ? normal(pt, p[i + 1]) : closed ? normal(p[0], p[1]) : null
    const a = prev ?? next!, b = next ?? prev!, m: Pt = [a[0] + b[0], a[1] + b[1]], ml = Math.hypot(m[0], m[1])
    const k = d / ((m[0] / ml) * a[0] + (m[1] / ml) * a[1])
    return [pt[0] + (m[0] / ml) * k, pt[1] + (m[1] / ml) * k]
  })
}
/** Dots along one line: lattice positions on straight runs, even one-dot spacing on every other run. */
function along(line: Pt[], onGrid: Pt[], off: Pt[]) {
  for (let i = 0; i < line.length - 1; i++) {
    const [x0, y0] = line[i], [x1, y1] = line[i + 1], len = Math.hypot(x1 - x0, y1 - y0)
    if (!len) continue
    if (y0 === y1 && isInt(y0)) { for (let x = Math.ceil(Math.min(x0, x1) - SNAP); x <= Math.floor(Math.max(x0, x1) + SNAP); x++) onGrid.push([x, Math.round(y0)]); continue }
    if (x0 === x1 && isInt(x0)) { for (let y = Math.ceil(Math.min(y0, y1) - SNAP); y <= Math.floor(Math.max(y0, y1) + SNAP); y++) onGrid.push([Math.round(x0), y]); continue }
    const n = Math.max(1, Math.round(len))
    for (let k = 0; k <= n; k++) off.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n])
  }
}
const cache = new Map<string, Pt[]>()
/** One glyph's dots in dot units, its box's top-left at 0,0. */
export function heroGlyph(face: HeroFace, ch: string): Pt[] {
  const key = face + ch, hit = cache.get(key)
  if (hit) return hit
  const f = FACES[face], onGrid: Pt[] = [], off: Pt[] = []
  for (const stroke of (f.glyphs[ch]?.[1] ?? '').split('|').map(s => s.trim()).filter(Boolean)) {
    const pts = stroke.replace(/^d:/, '').trim().split(/\s+/).map(p => p.split(',').map(Number) as Pt)
    if (stroke.startsWith('d:')) { onGrid.push(...pts); continue }
    for (const line of f.weight === 2 ? [offset(pts, .5), offset(pts, -.5)] : [pts]) along(line, onGrid, off)
  }
  const kept: Pt[] = []
  for (const p of [...onGrid, ...off]) if (!kept.some(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < MERGE * MERGE)) kept.push(p)
  cache.set(key, kept)
  return kept
}
/** Every dot of `s` set in the face, in dot units from the text's top-left. */
export function heroDots(face: HeroFace, s: string): Pt[] {
  const f = FACES[face], out: Pt[] = []
  let x = 0
  for (const ch of s) { for (const [gx, gy] of heroGlyph(face, ch)) out.push([x + gx, gy]); x += (f.glyphs[ch]?.[0] ?? 0) + f.gap }
  return out
}
