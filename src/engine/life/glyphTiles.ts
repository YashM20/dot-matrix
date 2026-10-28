/**
 * Glyph tiles: dot micro-pattern glyphs on a tile lattice (docs/living-matter/L-pond.md §L1, D1). A glyph is a
 * k×k block of ordinary card dots (k = 3 in a 4-cell tile: glyph + 1-cell gutter), so goldens, X-ray and
 * quantization all keep working: there is no second renderer, only a raster of card cells that becomes one
 * multi-tone `toneOf` layer (one sampler scan). A tile can instead hold **one big dot** on the tile lattice
 * (`putBig`, `lattice: pitch`): the way bigger elements are drawn ("a coarser lattice, never clusters of small dots").
 *
 * Picking a glyph: by angle (`edgeOfGradient` / `edgeOfTangent`, no trig: tan 22.5° compares), by density
 * (`rampGlyph`, ordered dither) or by shape (`matchTile`: 16 coverage subsamples against each glyph's descriptor,
 * after Alex Harri's contrast step, memoised). `flickerOn` is the stateless half of glyph flicker: an STBN threshold
 * that scrolls in t, so only 2·rate/fps of the tiles change per frame and nothing is stored.
 *
 * API frozen at L1.3; L owns it. Q adds alphabets through `defineAlphabet` only (alphabets are frozen once built).
 */
import { stbn } from '../halftone/mask'
import { glyph as fontGlyph } from '../fields/bitmapFont'
import type { Field, GridConfig, Layer, Tone } from '../types'

/** Tone palette of every L raster: index → tone (-1 = empty). Index 4 waits for the owner's activeDim ruling (D2). */
export const LIFE_TONES = ['faint', 'mid', 'idle', 'value', 'activeDim', 'active'] as const
export const T_FAINT = 0, T_MID = 1, T_IDLE = 2, T_VALUE = 3, T_ACTIVE_DIM = 4, T_ACTIVE = 5

export interface Glyph { ch: string; w: number; h: number; /** w·h, row-major, 1 = dot */ bits: Uint8Array; /** lit / (w·h) */ ink: number; /** index in its alphabet */ index: number }
export interface Alphabet {
  name: string; w: number; h: number; glyphs: Glyph[]
  /** 16 floats per glyph: coverage at 4×4 sample points. */
  desc: Float32Array
  /** Density order for `rampGlyph` (the alphabet's own ramp glyphs when it has them, else every glyph by ink). */
  ramp: Glyph[]
}

/**
 * Build an alphabet from '#'/'.' rows (one string per row, rows joined by '/'). Names in `ramp` (in fill order)
 * become the density ramp. Frozen once built.
 */
export function defineAlphabet(name: string, w: number, h: number, glyphs: Record<string, string>, ramp?: string[]): Alphabet {
  const list: Glyph[] = Object.entries(glyphs).map(([ch, src], index) => {
    const rows = src.split('/')
    if (rows.length !== h || rows.some(r => r.length !== w)) throw new Error(`alphabet ${name}: glyph '${ch}' is not ${w}×${h}`)
    const bits = new Uint8Array(w * h)
    let lit = 0
    rows.forEach((r, y) => { for (let x = 0; x < w; x++) if (r[x] === '#') { bits[y * w + x] = 1; lit++ } })
    return Object.freeze({ ch, w, h, bits, ink: lit / (w * h), index })
  })
  const desc = new Float32Array(list.length * 16)
  list.forEach((g, k) => {
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const px = Math.floor(((i + .5) * w) / 4), py = Math.floor(((j + .5) * h) / 4)
      desc[k * 16 + j * 4 + i] = g.bits[py * w + px]
    }
  })
  const byCh = new Map(list.map(g => [g.ch, g]))
  const order = ramp ? ramp.map(c => { const g = byCh.get(c); if (!g) throw new Error(`alphabet ${name}: ramp glyph '${c}' missing`); return g })
    : [...list].sort((a, b) => a.ink - b.ink || a.index - b.index)
  return Object.freeze({ name, w, h, glyphs: Object.freeze(list) as Glyph[], desc, ramp: Object.freeze(order) as Glyph[] })
}

/** A glyph by its name (throws on a typo: alphabets are fixed). */
export function glyphOf(a: Alphabet, ch: string): Glyph {
  const g = a.glyphs.find(x => x.ch === ch)
  if (!g) throw new Error(`alphabet ${a.name} has no glyph '${ch}'`)
  return g
}

// ── the alphabets ───────────────────────────────────────────────────────────────────────────────────
const EDGE3_SRC: Record<string, string> = {
  '-': '.../###/...', '|': '.#./.#./.#.', '\\': '#../.#./..#', '/': '..#/.#./#..', '·': '.../.#./...',
  '+': '.#./###/.#.', x: '#.#/.#./#.#', o: '###/#.#/###', ':': '.#./.../.#.', '=': '###/.../###', '*': '#.#/###/#.#',
}
/** Ordered-dither ranks of the 3×3 ramp: level n lights every pixel whose rank < n. */
const RANK3 = [6, 8, 4, 1, 0, 3, 5, 2, 7]
const rampRows = (rank: readonly number[], k: number, n: number) =>
  Array.from({ length: k }, (_, y) => Array.from({ length: k }, (_, x) => (rank[y * k + x] < n ? '#' : '.')).join('')).join('/')
const RAMP3_SRC: Record<string, string> = Object.fromEntries(Array.from({ length: 10 }, (_, n) => [`r${n}`, rampRows(RANK3, 3, n)]))
const RAMP3_ORDER = Array.from({ length: 10 }, (_, n) => `r${n}`)
/** Rotate a k×k '#'/'.' glyph 90° clockwise. */
const rot = (src: string) => { const r = src.split('/'), k = r.length; return Array.from({ length: k }, (_, y) => Array.from({ length: k }, (_, x) => r[k - 1 - x][y]).join('')).join('/') }
const rots = (name: string, src: string) => { const out: Record<string, string> = {}; let s = src; for (let i = 0; i < 4; i++) { out[`${name}${i}`] = s; s = rot(s) } return out }
const SHAPE3_SRC: Record<string, string> = {
  ...EDGE3_SRC, ...RAMP3_SRC,
  top: '###/###/...', bottom: '.../###/###', left: '##./##./##.', right: '.##/.##/.##',
  ...rots('tri', '##./#../...'), ...rots('inv', '###/###/##.'), ...rots('wedge', '###/##./#..'),
}
/** Line and mark glyphs, 3×3: - | \ / · + x o : = * */
export const EDGE3 = defineAlphabet('EDGE3', 3, 3, EDGE3_SRC)
/** 10 density levels (r0 … r9) under the 3×3 ordered-dither matrix 6 8 4 / 1 0 3 / 5 2 7. */
export const RAMP3 = defineAlphabet('RAMP3', 3, 3, RAMP3_SRC, RAMP3_ORDER)
/** Body edges: EDGE3 + RAMP3, half fills, corner triangles and inverse corners (and their rotations). */
export const SHAPE3 = defineAlphabet('SHAPE3', 3, 3, SHAPE3_SRC, RAMP3_ORDER)

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
const QUAD4_SRC: Record<string, string> = Object.fromEntries(Array.from({ length: 16 }, (_, m) => {
  // bit order TL, TR, BL, BR, each a 2×2 dot block
  const on = (x: number, y: number) => (m >> ((y < 2 ? 0 : 2) + (x < 2 ? 0 : 1))) & 1
  return [`q${m}`, Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => (on(x, y) ? '#' : '.')).join('')).join('/')]
}))
/** 16 quadrant blocks (k = 4; bit order TL, TR, BL, BR). */
export const QUAD4 = defineAlphabet('QUAD4', 4, 4, QUAD4_SRC)
const RAMP4_ORDER = Array.from({ length: 17 }, (_, n) => `b${n}`)
/** 17 density levels under the 4×4 Bayer matrix. */
export const RAMP4 = defineAlphabet('RAMP4', 4, 4, Object.fromEntries(Array.from({ length: 17 }, (_, n) => [`b${n}`, rampRows(BAYER4, 4, n)])), RAMP4_ORDER)

/** Three glyphs defined here so `bitmapFont` (and every golden that uses it) stays untouched. */
const FONT_LOCAL: Record<string, string[]> = {
  '|': ['00100', '00100', '00100', '00100', '00100', '00100', '00100'],
  '~': ['00000', '00000', '01000', '10101', '00010', '00000', '00000'],
  o: ['00000', '00000', '01110', '10001', '10001', '01110', '00000'],
}
const FONT57_CHARS = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '/', '\\', '○', '●']
const fontSrc = (ch: string) => (FONT_LOCAL[ch] ?? fontGlyph(ch).map(r => r.map(b => (b ? '1' : '0')).join(''))).map(r => r.replace(/1/g, '#').replace(/0/g, '.')).join('/')
/** 5×7 font glyphs (in 6×8 tiles) for the TYPE look (L3.4): ` . : - = + * # % / \ ○ ●` plus | ~ o. */
export const FONT57 = defineAlphabet('FONT57', 5, 7, Object.fromEntries([...FONT57_CHARS, '|', '~', 'o'].map(c => [c, fontSrc(c)])))

// ── edges and ramps ─────────────────────────────────────────────────────────────────────────────────
/** tan 22.5° (√2 − 1): the octant boundary for snapping a direction to - | \ / without trig. */
const TAN_22_5 = .41421356
/** Line glyph along a direction vector (tangent), y down: '-' '|' '\' '/'. */
export function edgeOfTangent(a: Alphabet, tx: number, ty: number): Glyph {
  const ax = Math.abs(tx), ay = Math.abs(ty)
  return glyphOf(a, ay < TAN_22_5 * ax ? '-' : ax < TAN_22_5 * ay ? '|' : tx * ty > 0 ? '\\' : '/')
}
/** Line glyph across a gradient (gx, gy), i.e. along the iso-line. */
export const edgeOfGradient = (a: Alphabet, gx: number, gy: number): Glyph => edgeOfTangent(a, -gy, gx)
/** Density glyph for level 0..1 (the alphabet's ramp, ordered-dither fill order). */
export function rampGlyph(a: Alphabet, level: number): Glyph {
  const n = a.ramp.length - 1, k = Math.round((level > 0 ? (level < 1 ? level : 1) : 0) * n)
  return a.ramp[k]
}

// ── shape matching ──────────────────────────────────────────────────────────────────────────────────
const memo = new Map<Alphabet, Map<number, Glyph>>()
/** Memo statistics (the checks read the hit rate). */
export const matchStats = { hits: 0, misses: 0 }
const q16 = new Float32Array(16)
/**
 * Nearest glyph to 16 coverage subsamples (4×4 over the glyph box, row-major). Each sample is quantised to 2 bits
 * first (so the result is a pure function of the 32-bit memo key), then Alex Harri's contrast step:
 * v ← (v / max)^γ · max when max > .1 (γ = 2); then L2 over the 16-vector, ties → lower index.
 */
export function matchTile(a: Alphabet, sub16: ArrayLike<number>): Glyph {
  let key = 0
  for (let i = 0; i < 16; i++) {
    const v = sub16[i], q = v > 0 ? (v < 1 ? Math.round(v * 3) : 3) : 0
    key = (key * 4 + q) >>> 0
    q16[i] = q / 3
  }
  let m = memo.get(a)
  if (!m) memo.set(a, (m = new Map()))
  const hit = m.get(key)
  if (hit) { matchStats.hits++; return hit }
  matchStats.misses++
  let max = 0
  for (let i = 0; i < 16; i++) if (q16[i] > max) max = q16[i]
  if (max > .1) for (let i = 0; i < 16; i++) { const r = q16[i] / max; q16[i] = r * r * max }
  let best = 0, bestD = Infinity
  for (let g = 0; g < a.glyphs.length; g++) {
    let d = 0
    for (let i = 0; i < 16; i++) { const e = q16[i] - a.desc[g * 16 + i]; d += e * e }
    if (d < bestD) { bestD = d; best = g }
  }
  const out = a.glyphs[best]
  m.set(key, out)
  return out
}

// ── the tile raster ─────────────────────────────────────────────────────────────────────────────────
export interface TileGrid {
  cols: number; rows: number
  /** Card cells per tile (square tiles; FONT57 uses 6 with a 5×7 glyph and draws its 8-cell rows as pitchY). */
  pitch: number
  /** Card cell of tile (0, 0). */
  ox: number; oy: number
  /** Card rows per tile when it differs from `pitch` (FONT57's 6×8 tiles). */
  pitchY?: number
}
export interface TileRaster {
  grid: TileGrid; cardW: number; cardH: number
  /** Per card cell: tone index into LIFE_TONES, -1 empty. */
  tone: Int8Array
  value: Float32Array
  /** Per tile: one big dot on the tile lattice (style B interiors); -1 = none. */
  bigTone: Int8Array; bigValue: Float32Array
  /** Any big dot set since the last clear. */
  bigCount: number
}
export function createTileRaster(card: { cols: number; rows: number }, tiles: TileGrid): TileRaster {
  const r: TileRaster = {
    grid: tiles, cardW: card.cols, cardH: card.rows,
    tone: new Int8Array(card.cols * card.rows), value: new Float32Array(card.cols * card.rows),
    bigTone: new Int8Array(tiles.cols * tiles.rows), bigValue: new Float32Array(tiles.cols * tiles.rows), bigCount: 0,
  }
  clearTiles(r)
  return r
}
export function clearTiles(r: TileRaster): void {
  r.tone.fill(-1); r.value.fill(0); r.bigTone.fill(-1); r.bigValue.fill(0); r.bigCount = 0
}
const inTiles = (r: TileRaster, tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < r.grid.cols && ty < r.grid.rows
/**
 * Stamp glyph g at tile (tx, ty): lit pixels get (fg, fgValue); unlit pixels get (bg, bgValue) when bg ≥ 0 and are
 * cleared otherwise; the gutter stays empty. Clears that tile's big dot.
 */
export function putGlyph(r: TileRaster, tx: number, ty: number, g: Glyph, fg: number, fgValue: number, bg = -1, bgValue = 0): void {
  if (!inTiles(r, tx, ty)) return
  const { pitch, ox, oy } = r.grid, py = r.grid.pitchY ?? pitch, x0 = ox + tx * pitch, y0 = oy + ty * py
  const ti = ty * r.grid.cols + tx
  if (r.bigTone[ti] >= 0) { r.bigTone[ti] = -1; r.bigValue[ti] = 0; r.bigCount-- }
  for (let y = 0; y < py; y++) {
    const cy = y0 + y
    if (cy < 0 || cy >= r.cardH) continue
    for (let x = 0; x < pitch; x++) {
      const cx = x0 + x
      if (cx < 0 || cx >= r.cardW) continue
      const i = cy * r.cardW + cx, inGlyph = x < g.w && y < g.h
      if (inGlyph && g.bits[y * g.w + x]) { r.tone[i] = fg; r.value[i] = fgValue }
      else if (inGlyph && bg >= 0) { r.tone[i] = bg; r.value[i] = bgValue }
      else { r.tone[i] = -1; r.value[i] = 0 }
    }
  }
}
/** One big dot for the whole tile (pitch × a card dot); the tile's card cells are cleared. Square-pitch grids only. */
export function putBig(r: TileRaster, tx: number, ty: number, tone: number, value: number): void {
  if (!inTiles(r, tx, ty) || r.grid.pitchY !== undefined) return
  const { pitch, ox, oy } = r.grid, x0 = ox + tx * pitch, y0 = oy + ty * pitch, ti = ty * r.grid.cols + tx
  if (r.bigTone[ti] < 0) r.bigCount++
  r.bigTone[ti] = tone; r.bigValue[ti] = value
  for (let y = 0; y < pitch; y++) for (let x = 0; x < pitch; x++) {
    const cx = x0 + x, cy = y0 + y
    if (cx >= 0 && cy >= 0 && cx < r.cardW && cy < r.cardH) { const i = cy * r.cardW + cx; r.tone[i] = -1; r.value[i] = 0 }
  }
}
/** Clear a tile (cells and big dot). */
export function clearTile(r: TileRaster, tx: number, ty: number): void {
  if (!inTiles(r, tx, ty)) return
  putGlyph(r, tx, ty, EMPTY, -1, 0)
}
const EMPTY: Glyph = Object.freeze({ ch: ' ', w: 1, h: 1, bits: new Uint8Array(1), ink: 0, index: -1 })

/**
 * Stateless flicker (advanced doc #12, the stateless half): a tile is "on" while frac(stbn(tx, ty) + rate·t + phase)
 * < share. The STBN table (halftone/mask.ts) spreads the on-tiles as blue noise in space; the threshold scrolls
 * continuously in t, so only 2·rate/fps of the tiles change per frame (rate .25/s at 30 fps → 1.7 %). Pure in t.
 */
export function flickerOn(tx: number, ty: number, t: number, share: number, rate: number, phase = 0): boolean {
  const x = stbn(tx, ty) + rate * t + phase
  return x - Math.floor(x) < share
}

// ── raster → layers ─────────────────────────────────────────────────────────────────────────────────
const toneName = (i: number): Tone | undefined => (i >= 0 ? LIFE_TONES[i] : undefined)
/**
 * The raster as layers: one multi-tone `toneOf` layer bounded to the tile box (`split` → one layer per tone), plus,
 * when any big dot is set, one multi-tone layer with `lattice: pitch, origin: [ox, oy]` (the sampler hides card dots
 * under a lit lattice dot). `tones` limits the output to those tones (X-ray, checks).
 * The layers read the raster live: draw, take the layers, sample, then draw the next frame.
 */
export function tileLayers(r: TileRaster, opts: { split?: boolean; tones?: readonly Tone[] } = {}): Layer[] {
  const { cardW, cardH } = r, { pitch, ox, oy } = r.grid, py = r.grid.pitchY ?? pitch
  const c0 = Math.max(0, ox), r0 = Math.max(0, oy), c1 = Math.min(cardW - 1, ox + r.grid.cols * pitch - 1), r1 = Math.min(cardH - 1, oy + r.grid.rows * py - 1)
  const allow = opts.tones ? new Set(opts.tones) : undefined
  const cw = cardW - 1, ch = cardH - 1, tone = r.tone, value = r.value
  // u, v ≥ 0 on the card: (x + .5) | 0 rounds like Math.round there, at a fraction of the cost (one call per card cell)
  const cellOf = (u: number, v: number) => {
    const c = (u * cw + .5) | 0, rr = (v * ch + .5) | 0
    return c < c0 || c > c1 || rr < r0 || rr > r1 || u < 0 || v < 0 ? -1 : rr * cardW + c
  }
  const make = (only?: number): Layer => {
    const field: Field = only === undefined && !allow
      ? (u, v) => { const i = cellOf(u, v); return i < 0 || tone[i] < 0 ? 0 : value[i] }
      : (u, v) => {
        const i = cellOf(u, v)
        if (i < 0) return 0
        const t = tone[i]
        if (t < 0 || (only !== undefined && t !== only) || (allow && !allow.has(LIFE_TONES[t]))) return 0
        return value[i]
      }
    field.bounds = [c0, r0, c1, r1]
    return only !== undefined ? { field, tone: LIFE_TONES[only] } : { field, toneOf: (_v, u, v) => { const i = cellOf(u, v); return i < 0 ? undefined : toneName(r.tone[i]) } }
  }
  const out: Layer[] = opts.split ? LIFE_TONES.map((_, k) => make(k)) : [make()]
  if (r.bigCount > 0 && r.grid.pitchY === undefined) {
    // the lattice the sampler builds for (pitch, origin): floor((card − origin) / pitch) cells each way
    const sc = Math.max(1, Math.floor((cardW - ox) / pitch)), sr = Math.max(1, Math.floor((cardH - oy) / pitch))
    const tileOf = (u: number, v: number) => {
      const c = Math.round(u * (sc - 1)), rr = Math.round(v * (sr - 1))
      return c < 0 || rr < 0 || c >= r.grid.cols || rr >= r.grid.rows ? -1 : rr * r.grid.cols + c
    }
    const big = (only?: number): Layer => {
      const field: Field = (u, v) => {
        const i = tileOf(u, v)
        if (i < 0) return 0
        const t = r.bigTone[i]
        if (t < 0 || (only !== undefined && t !== only) || (allow && !allow.has(LIFE_TONES[t]))) return 0
        return r.bigValue[i]
      }
      field.bounds = [0, 0, Math.min(sc, r.grid.cols) - 1, Math.min(sr, r.grid.rows) - 1]
      const base = { field, lattice: pitch, origin: [ox, oy] as [number, number] }
      return only !== undefined ? { ...base, tone: LIFE_TONES[only] } : { ...base, toneOf: (_v, u, v) => { const i = tileOf(u, v); return i < 0 ? undefined : toneName(r.bigTone[i]) } }
    }
    if (opts.split) out.push(...LIFE_TONES.map((_, k) => big(k))); else out.push(big())
  }
  return out
}

/** What `glyphTileLayers` asks for per tile. */
export interface TileSample {
  /** 0..1 share of the tile that is "ink" (below .2 → nothing; above .85 → a ramp/solid glyph). */
  cover: number
  /** 16 coverage subsamples for `matchTile` (edges). */
  sub16?: ArrayLike<number>
  /** A gradient: an edge glyph along its iso-line. */
  gx?: number; gy?: number
  /** A density: `rampGlyph(level)`. */
  level?: number
  fg: number; value?: number; bg?: number
}
/**
 * Convenience (overview §3 signature): sample(tx, ty) → tile, then glyph by cover / angle / level, then layers.
 * Allocates a raster per call (the layers read it); hot paths keep their own raster and call `tileLayers`.
 */
export function glyphTileLayers(card: GridConfig, tiles: TileGrid, sample: (tx: number, ty: number) => TileSample | undefined, alphabet: Alphabet): Layer[] {
  const r = createTileRaster(card, tiles), edges = alphabet.glyphs.some(g => g.ch === '-') ? alphabet : EDGE3
  for (let ty = 0; ty < tiles.rows; ty++) for (let tx = 0; tx < tiles.cols; tx++) {
    const s = sample(tx, ty)
    if (!s || s.cover < .2) continue
    const v = s.value ?? .8
    const g = s.gx !== undefined && s.gy !== undefined ? edgeOfGradient(edges, s.gx, s.gy)
      : s.level !== undefined ? rampGlyph(alphabet, s.level)
      : s.cover < .85 && s.sub16 ? matchTile(alphabet, s.sub16) : rampGlyph(alphabet, 1)
    putGlyph(r, tx, ty, g, s.fg, v, s.bg ?? -1, v)
  }
  return tileLayers(r)
}
