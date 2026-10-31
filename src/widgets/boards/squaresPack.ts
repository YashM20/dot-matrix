/**
 * Squares board, Q3 (docs/living-matter/Q-squares.md §4.4): the square field pack, rotation and nested motifs.
 *
 *   SCHOTTER  Nees 1968: 264 squares, order at the top, rubble below; rotation snapped to the square's two states
 *   BLOCKS    Voronoi under L∞ and L1: regions that are joined blocks, a Mondrian that drifts
 *   SORT      a pixel-sorted portrait, line by line, with block-glitch bursts every 4 s
 *   TRUCHET   Carlson's multi-scale Truchet: tiles at three scales, the colour inverting per level
 *   STITCH    a cross-stitch sampler (`motif: 'stitch'`): an alphabet inside a WFC border, sewn stitch by stitch
 *   BEADS     one sprite as Perler beads and as LEGO studs (`motif: 'bead' | 'stud'`), the split sweeping across
 *
 * The morph card (dots → squares → joined) sits with the LCD it morphs, in squares.ts. Same chrome and rules as the
 * rest of the board: t = 0 is a finished picture, one red per card and it is the live thing.
 */
import { blockVoronoi, type BlockMetric } from '../../engine/algo/linfVoronoi'
import { molnar, schotter } from '../../engine/algo/schotter'
import { pixelSortData, type SortRun } from '../../engine/algo/pixelSort'
import { blockGlitch } from '../../engine/algo/glitch'
import { truchetInk, truchetTileAt, truchetTiles, type TruchetTile } from '../../engine/algo/truchet'
import { wfc, type WfcTile } from '../../engine/algo/wfc'
import { glyph } from '../../engine/fields/bitmapFont'
import { tsin } from '../../engine/noise/trig'
import { clamp, hash01 } from '../../engine/math'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Layer, Tone } from '../../engine/types'
import { TILE, layer, type WidgetPreset } from '../types'
import { portrait } from './portrait'
import { FOOT, T, cells, cite, footer, mod, pad, tile, type Pt } from './squaresKit'

/** A layer of explicit sites (card cells) at one value, size and tone, optionally turned (radians). */
const siteLayer = (sites: Pt[], size: number, value: number, tone: Tone, rotation?: number): Layer => ({ field: () => value, sites, size, tone, ...(rotation ? { rotation } : {}) })

// ── 07 SCHOTTER ─ order to rubble ─────────────────────────────────────────────────────────────────────
// Thesis: "Order at the top, rubble at the bottom: 264 squares, two angles." Nees' Schotter on 5-cell squares (dot
// sites, offset by quarter cells): row i takes disorder i / 21 × k, and k breathes 0 → 1 over the loop. A square
// turns 45° with probability d, snapped to the two states a square has. Beside it a Molnár study: nested square
// rings whose sides wander by the same k. The red is the most disordered square.
const S_COLS = 12, S_ROWS = 22, S_K = 5, S_ORIGIN: Pt = [6, 12], S_LOOP = 18
export const schotterK = (t: number) => .5 + .5 * tsin((2 * Math.PI * t) / S_LOOP + Math.PI / 2)
export const sqSchotter: WidgetPreset = {
  id: 'sq-schotter', name: 'Squares Schotter', label: 'SCHOTTER', ...tile,
  layers: ctx => {
    const k = schotterK(ctx.t), sq = schotter({ cols: S_COLS, rows: S_ROWS, seed: 7, k })
    const at = (x: number, y: number): Pt => [S_ORIGIN[0] + x * S_K - .5, S_ORIGIN[1] + y * S_K - .5]
    // the most disordered square: farthest from its cell (turned squares count half a cell more); ties: the later one
    let worst = 0, score = -1
    sq.forEach((s, i) => { const v = Math.abs(s.x - s.col - .5) + Math.abs(s.y - s.row - .5) + (s.rot ? .5 : 0); if (v >= score) { score = v; worst = i } })
    const flat: Pt[] = [], turned: Pt[] = []
    sq.forEach((s, i) => { if (i !== worst) (s.rot ? turned : flat).push(at(s.x, s.y)) })
    const red = sq[worst], rings = molnar({ cx: 105, cy: 70, rings: 8, side: 52, step: 6, seed: 3, jitter: 1 + 3 * k, pitch: 2 })
    return [
      cite('NEES 1968'),
      siteLayer(rings.map(p => [p.x, p.y] as Pt), 1, .5, 'faint'),
      siteLayer(flat, S_K, .75, 'mid'), siteLayer(turned, S_K, .75, 'idle', Math.PI / 4),
      siteLayer([at(red.x, red.y)], S_K, .75, 'active', red.rot),
      layer(T.text('MOLNAR', 105, 104, { align: 'center' }), 'faint'),
      ...footer(k, `ROWS ${S_ROWS}`, `DISORDER ${k.toFixed(2)}`),
    ]
  },
}

// ── 08 BLOCKS ─ Voronoi under L∞ ──────────────────────────────────────────────────────────────────────
// Thesis: "Measure distance in squares and Voronoi turns into Mondrian." Fourteen drifting seeds on a 3× lattice;
// each region is one joined block (join group = region id), so the grout between blocks is the Voronoi edge. Under
// L∞ the edges run along the axes and the diagonals (joined fills at a quarter and a half level: a band low); the second half of the loop measures in L1 (Manhattan), where
// the same seeds give diamonds. Regions arrive one at a time; the red is the newest.
const V_K = 3, V_ORIGIN: Pt = [0, 12], V_W = 48, V_H = 40, V_SEEDS = 14, V_LOOP = 24, V_FIRST = 6, V_OFF = 9
const V_LEVEL: Record<string, number> = { faint: .25, mid: .25, idle: .5 }
const V_TONES: Tone[] = ['faint', 'mid', 'faint', 'idle', 'mid', 'faint', 'idle', 'mid', 'faint', 'idle', 'mid', 'faint', 'mid', 'idle']
export const sqBlocks: WidgetPreset = {
  id: 'sq-blocks', name: 'Squares Blocks', label: 'BLOCKS', ...tile,
  layers: ctx => {
    const t = ctx.t + V_OFF, half = V_LOOP / 2, metric: BlockMetric = Math.floor(t / half) & 1 ? 'l1' : 'linf', p = mod(t, half) / half
    const n = Math.min(V_SEEDS, V_FIRST + Math.floor(p * (V_SEEDS - V_FIRST + 1)))
    const vo = blockVoronoi({ seed: 11, n, metric, w: V_W, h: V_H, t, drift: 3 }), id = (c: number, r: number) => vo.id[r * V_W + c]
    return [
      cite('MONDRIAN 1930'),
      cells(V_K, V_ORIGIN, V_W, V_H, (c, r) => (id(c, r) === n - 1 ? 0 : V_LEVEL[V_TONES[id(c, r)]]), { toneOf: (c, r) => V_TONES[id(c, r)], group: id, join: true }),
      cells(V_K, V_ORIGIN, V_W, V_H, (c, r) => (id(c, r) === n - 1 ? 1 : 0), { tone: 'active', group: id, join: { accent: true } }),
      layer(T.text(`REGIONS ${pad(n, 2)}`, 0, FOOT), 'idle'),
      layer(T.text(metric === 'linf' ? 'CHEBYSHEV' : 'MANHATTAN', 143, FOOT, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 09 SORT ─ pixel sorting ───────────────────────────────────────────────────────────────────────────
// Thesis: "Sort the middle tones, keep the edges: a face melts into streaks." The mirror portrait on a 2× lattice,
// pixel-sorted row by row (runs of values in [.3, .85], dark → bright, stable). The sort sweeps down the face; equal
// neighbours join, so a sorted run reads as one streak. Every 4 s a block-glitch burst shifts a few blocks by whole
// cells for half a second. The red is the run being sorted.
const P_K = 2, P_ORIGIN: Pt = [8, 10], P_W = 64, P_H = 58, P_LOOP = 20, P_OFF = 13
const P_SUB = latticeGrid(TILE, P_K, P_ORIGIN)
interface SortState { raw: Float32Array; sorted: Float32Array; runs: SortRun[][] }
let sortState: SortState | undefined
/** The portrait once raw and once fully sorted (rows are independent, so a sweep at row k is a row-wise mix), with each row's runs. */
function sortFrame(): SortState {
  if (sortState) return sortState
  const raw = new Float32Array(P_W * P_H)
  for (let r = 0; r < P_H; r++) for (let c = 0; c < P_W; c++) raw[r * P_W + c] = clamp(portrait(P_ORIGIN[0] + c * P_K + .5, P_ORIGIN[1] + r * P_K + .5))
  const sorted = Float32Array.from(raw), all = pixelSortData(sorted, P_W, P_H, { lo: .3, hi: .85 }), runs: SortRun[][] = Array.from({ length: P_H }, () => [])
  for (const run of all) if (run.length > 1) runs[run.line].push(run)
  return (sortState = { raw, sorted, runs })
}
const sortTone = (v: number): Tone => (v > .62 ? 'idle' : v > .4 ? 'mid' : 'faint')
export const sqSort: WidgetPreset = {
  id: 'sq-sort', name: 'Squares Sort', label: 'SORT', ...tile,
  layers: ctx => {
    const s = sortFrame(), t = ctx.t, p = mod(t + P_OFF, P_LOOP) / P_LOOP, line = Math.min(P_H - 1, Math.floor(p * 1.15 * P_H))
    // the run being sorted: the longest run of the current line (a line without one points at the next that has one)
    let live: SortRun | undefined
    for (let r = line; r < P_H && !live; r++) for (const run of s.runs[r]) if (!live || run.length > live.length) live = run
    const at = (c: number, r: number) => (r <= line ? s.sorted : s.raw)[r * P_W + c]
    const inLive = (c: number, r: number) => !!live && r === live.line && c >= live.start && c < live.start + live.length
    const burst = mod(t, 4) < .5 ? Math.floor(t / 4) : -1
    const grey = cells(P_K, P_ORIGIN, P_W, P_H, (c, r) => (inLive(c, r) ? 0 : at(c, r)), { join: { at: .5 } })
    return [
      cite('ASENDORF 2010'),
      { ...grey, field: blockGlitch(grey.field, { seed: 5, step: burst, blocks: 6, maxShift: 9, cols: P_SUB.cols, rows: P_SUB.rows }), toneOf: (v: number) => sortTone(v) },
      cells(P_K, P_ORIGIN, P_W, P_H, (c, r) => (inLive(c, r) ? Math.max(.5, at(c, r)) : 0), { tone: 'active', join: { accent: true } }),
      layer(T.text(`ROW ${pad(Math.min(line + 1, P_H), 2)}/${P_H}`, 0, FOOT), 'idle'),
      layer(T.text(burst >= 0 ? 'GLITCH' : `RUN ${pad(live?.length ?? 0, 2)}`, 143, FOOT, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 10 TRUCHET ─ three scales ─────────────────────────────────────────────────────────────────────────
// Thesis: "One tile, three sizes, the colour flipping each time." Carlson's multi-scale Truchet on a 2× lattice:
// 3 × 2 tiles of 24 cells, split by hash into 12s and 6s; arcs, crosses and bars a third of a tile wide; each level
// inverts the colour. Tiles are placed breadth first, so the pattern resolves level by level; the ink fuses into
// one joined figure. The red is the tile being placed.
const R_K = 2, R_ORIGIN: Pt = [0, 22], R_COLS = 3, R_ROWS = 2, R_SIZE = 24, R_W = 72, R_H = 48, R_LOOP = 16, R_REVEAL = 12, R_OFF = 13.5
let truchet: TruchetTile[] | undefined, truchetLast: { placed: number; ink: Uint8Array; owner: Int16Array } | undefined
/** Ink and the showing tile per lattice cell with `placed` tiles down (cached: it changes a few times a second at most). */
function truchetFrame(ts: TruchetTile[], placed: number): { placed: number; ink: Uint8Array; owner: Int16Array } {
  if (truchetLast?.placed === placed) return truchetLast
  const ink = new Uint8Array(R_W * R_H), owner = new Int16Array(R_W * R_H)
  for (let r = 0; r < R_H; r++) for (let c = 0; c < R_W; c++) {
    const j = r * R_W + c
    ink[j] = truchetInk(ts, R_COLS, R_ROWS, c + .5, r + .5, placed); owner[j] = truchetTileAt(ts, R_COLS, R_ROWS, c + .5, r + .5, placed)
  }
  return (truchetLast = { placed, ink, owner })
}
const tiles = () => (truchet ??= truchetTiles({ seed: 6, cols: R_COLS, rows: R_ROWS, size: R_SIZE, split: [.85, .5] }))
export const sqTruchet: WidgetPreset = {
  id: 'sq-truchet', name: 'Squares Truchet', label: 'TRUCHET', ...tile,
  layers: ctx => {
    const ts = tiles(), p = mod(ctx.t + R_OFF, R_LOOP), placed = Math.max(1, Math.min(ts.length, Math.ceil((p / R_REVEAL) * ts.length))), live = placed - 1
    const { ink, owner } = truchetFrame(ts, placed)
    const level = ts[live].level
    return [
      cite('CARLSON 2018'),
      cells(R_K, R_ORIGIN, R_W, R_H, (c, r) => (owner[r * R_W + c] < 0 ? 0 : ink[r * R_W + c] ? (owner[r * R_W + c] === live ? 0 : 1) : .25),
        { toneOf: (c, r) => (ink[r * R_W + c] ? 'mid' : 'faint'), join: { at: .5 } }),
      cells(R_K, R_ORIGIN, R_W, R_H, (c, r) => (owner[r * R_W + c] === live && ink[r * R_W + c] ? 1 : 0), { tone: 'active', join: { accent: true } }),
      ...footer(Math.min(1, p / R_REVEAL), `TILES ${pad(placed, 2)}/${ts.length}`, `LEVEL ${level + 1}`),
    ]
  },
}

// ── 11 STITCH ─ a cross-stitch sampler ────────────────────────────────────────────────────────────────
// Thesis: "Every cell an X: a sampler sewn one stitch at a time." The alphabet in the 5 × 7 font on a 3× lattice of
// stitches (`motif: 'stitch'`: each cell drawn as an X), inside a two-stitch border that Wave Function Collapse lays
// along each side from 2 × 2 tiles whose sockets are their edge columns, so the zigzags run on unbroken. Three
// threads (value, idle, mid). The needle sews row by row; the unsewn chart shows as faint marks. The red is the
// stitch being sewn.
const X_K = 3, X_ORIGIN: Pt = [0, 9], X_W = 48, X_H = 40, X_LOOP = 30, X_OFF = 25
const X_ROWS = ['ABCDEFG', 'HIJKLMN', 'OPQRSTU', 'VWXYZ']
/** 2 × 2 border tiles: bits TL TR BL BR; W socket = the left column (top 1, bottom 2), E = the right column. */
const X_BITS = [0b1001, 0b0110, 0b1100, 0b0011, 0b1111, 0b0000, 0b1010, 0b0101, 0b1000, 0b0100, 0b0010, 0b0001]
const X_TILES: WfcTile[] = X_BITS.map((b, i) => ({ edges: [0, ((b >> 2) & 1) | ((b & 1) << 1), 0, ((b >> 3) & 1) | (((b >> 1) & 1) << 1)] as const, weight: [5, 5, 1.5, 1.5, .5, .15, .3, .3, .6, .6, .6, .6][i] }))
interface Sampler { tone: Uint8Array; order: Int32Array; count: number }
let sampler: Sampler | undefined
const X_TONES: Tone[] = ['faint', 'value', 'idle', 'mid']
/** The chart (tone code per stitch: 0 none, 1 value, 2 idle, 3 mid) and the sewing order, built once. */
function stitchChart(): Sampler {
  if (sampler) return sampler
  const tone = new Uint8Array(X_W * X_H), set = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < X_W && y < X_H) tone[y * X_W + x] = t }
  // the border: one WFC strip of 2 × 2 tiles per side (ends forced empty-socketed), value blocks at the corners
  const strip = (n: number, seed: number) => wfc({ w: n, h: 1, tiles: X_TILES, seed, border: 0 }).tiles
  const run = (n: number, seed: number, put: (i: number, dx: number, dy: number) => void) => {
    const s = strip(n, seed)
    for (let i = 0; i < n; i++) { const b = X_BITS[Math.max(0, s[i])]; for (let k = 0; k < 4; k++) if ((b >> (3 - k)) & 1) put(i, k & 1, k >> 1) }
  }
  const across = (X_W - 4) / 2, down = (X_H - 4) / 2
  run(across, 3, (i, dx, dy) => set(2 + 2 * i + dx, dy, 3)); run(across, 5, (i, dx, dy) => set(2 + 2 * i + dx, X_H - 2 + dy, 3))
  run(down, 7, (i, dx, dy) => set(dy, 2 + 2 * i + dx, 3)); run(down, 9, (i, dx, dy) => set(X_W - 2 + dy, 2 + 2 * i + dx, 3))
  for (const [x, y] of [[0, 0], [X_W - 2, 0], [0, X_H - 2], [X_W - 2, X_H - 2]]) for (let k = 0; k < 4; k++) set(x + (k & 1), y + (k >> 1), 1)
  // the alphabet, one tone per row (value, idle, mid, idle), centred
  X_ROWS.forEach((word, row) => {
    const x0 = Math.floor((X_W - (word.length * 6 - 1)) / 2), y0 = 4 + row * 8 + (row === 3 ? 1 : 0), t = [1, 2, 3, 2][row]
    ;[...word].forEach((ch, i) => glyph(ch).forEach((line, gy) => line.forEach((on, gx) => { if (on) set(x0 + i * 6 + gx, y0 + gy, t) })))
  })
  // sewing order: the border first (clockwise from the top-left, by ring distance), then the text row by row
  const order = new Int32Array(X_W * X_H).fill(-1), cellsOf: number[] = []
  for (let i = 0; i < tone.length; i++) if (tone[i]) cellsOf.push(i)
  const key = (i: number) => { const x = i % X_W, y = (i - x) / X_W, edge = x < 2 || y < 2 || x >= X_W - 2 || y >= X_H - 2; return edge ? 0 : 1e6 + y * X_W + x }
  cellsOf.sort((a, b) => key(a) - key(b) || a - b).forEach((c, k) => { order[c] = k })
  return (sampler = { tone, order, count: cellsOf.length })
}
export const sqStitch: WidgetPreset = {
  id: 'sq-stitch', name: 'Squares Stitch', label: 'STITCH', ...tile,
  layers: ctx => {
    const ch = stitchChart(), p = mod(ctx.t + X_OFF, X_LOOP) / X_LOOP, sewn = Math.min(ch.count, Math.floor(p * 1.1 * ch.count)), live = Math.min(ch.count - 1, sewn)
    const at = (c: number, r: number) => r * X_W + c, done = (c: number, r: number) => ch.order[at(c, r)] >= 0 && ch.order[at(c, r)] < sewn
    const thread = (t: number): Layer => ({ ...cells(X_K, X_ORIGIN, X_W, X_H, (c, r) => (ch.tone[at(c, r)] === t && done(c, r) && ch.order[at(c, r)] !== live ? 1 : 0), { tone: X_TONES[t] }), motif: 'stitch' })
    return [
      cite('SAMPLER 1888'),
      // the chart: unsewn stitches as small faint squares
      cells(X_K, X_ORIGIN, X_W, X_H, (c, r) => (ch.tone[at(c, r)] && !done(c, r) && ch.order[at(c, r)] !== live ? .25 : 0), { tone: 'faint' }),
      thread(1), thread(2), thread(3),
      { ...cells(X_K, X_ORIGIN, X_W, X_H, (c, r) => (ch.order[at(c, r)] === live ? 1 : 0), { tone: 'active' }), motif: 'stitch' },
      layer(T.text(`STITCH ${pad(sewn, 3)}/${ch.count}`, 0, FOOT), 'idle'),
      layer(T.text('3 THREADS', 143, FOOT, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 12 BEADS ─ Perler and LEGO ────────────────────────────────────────────────────────────────────────
// Thesis: "One sprite, two toys: a bead has a hole, a stud has a ring." A 24 × 22 sprite on 6-cell squares: left of
// the split each pixel is an ironed Perler bead (a rounded square with a round hole, `motif: 'bead'`), right of it a
// LEGO plate with its stud (`motif: 'stud'`); the split sweeps across and back. Both motifs are cuts in the cell's own
// colour; the shape is still the exponent. The red is the bird's eye.
const B_K = 6, B_ORIGIN: Pt = [0, 12], B_W = 24, B_H = 22, B_LOOP = 16
/** The sprite ('.' empty, '1' belly, '2' body, '3' outline, '4' ground, 'e' the eye). */
const SPRITE = [
  '........................',
  '........................',
  '.........3333...........',
  '.......33222233.........',
  '......3222222223........',
  '.....322e2222222........',
  '.....3222222222211......',
  '....33222222222111......',
  '....3222222222223.......',
  '...332222222222223......',
  '..3332222211112222333...',
  '.33322222111111222333...',
  '3333222221111111222333..',
  '33332222211111112222333.',
  '.3332222221111112222233.',
  '..33322222211112222233..',
  '...333222222222222333...',
  '....3333222222223333....',
  '......33333333333.......',
  '.........4..4...........',
  '........44.44...........',
  '4444444444444444444444..',
]
/** A band low for a sprite this large (Q-squares §2.5): the belly idle, the body mid, the outline and ground faint. */
const B_TONE: Record<string, Tone> = { 1: 'idle', 2: 'mid', 3: 'faint', 4: 'faint', e: 'active' }
const pix = (c: number, r: number) => SPRITE[r]?.[c] ?? '.'
export const sqBeads: WidgetPreset = {
  id: 'sq-beads', name: 'Squares Beads', label: 'BEADS', ...tile,
  layers: ctx => {
    const p = mod(ctx.t, B_LOOP) / B_LOOP, tri = p < .5 ? 2 * p : 2 - 2 * p, split = Math.round(4 + tri * (B_W - 8))
    const lit = (c: number, r: number) => pix(c, r) !== '.' && pix(c, r) !== 'e'
    const side = (bead: boolean): Layer => ({
      ...cells(B_K, B_ORIGIN, B_W, B_H, (c, r) => ((c < split) === bead ? (lit(c, r) ? 1 : .25) : 0), { toneOf: (c, r) => (lit(c, r) ? B_TONE[pix(c, r)] : 'faint') }),
      motif: bead ? 'bead' : 'stud', ...(bead ? { shapeOf: () => .55 } : {}),
    })
    const eye = SPRITE.findIndex(l => l.includes('e')), ex = SPRITE[eye].indexOf('e')
    return [
      cite('PERLER  LEGO'),
      side(true), side(false),
      { ...cells(B_K, B_ORIGIN, B_W, B_H, (c, r) => (c === ex && r === eye ? 1 : 0), { tone: 'active' }), motif: ex < split ? 'bead' : 'stud', ...(ex < split ? { shapeOf: () => .55 } : {}) },
    ]
  },
}

export const squaresPack: WidgetPreset[] = [sqSchotter, sqBlocks, sqSort, sqTruchet, sqStitch, sqBeads]
/** Sims and sizes for the checks (`scripts/squares.ts`). */
export const packSources = { schotterK, sortFrame, tiles, stitchChart, TRUCHET: { k: R_K, origin: R_ORIGIN, w: R_W, h: R_H }, STITCH: { k: X_K, origin: X_ORIGIN, w: X_W, h: X_H }, hash01 }
