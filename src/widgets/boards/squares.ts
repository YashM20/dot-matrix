/**
 * Board · SQUARES — spaced and joined (docs/living-matter/Q-squares.md §2.6). Square cells with a gutter
 * (`{grid.gap}`), and cells that fuse into one shape where they are equal (`Layer.join`): only cells of the same
 * tone, group and quantized level join, so every blob reads as one piece, one terrace or one quad.
 *
 *   TETRIS  a deterministic game (7-bag, El-Tetris AI): each settled piece fuses into one tetromino
 *   QUADS   Fogleman's Quads: split the worst quad 400 times, until 1,201 squares find a face
 *   BLOB    metaballs on a lattice: terraces fuse level by level, and the red neck is where two balls meet
 *   LCD     a four-shade 72 × 64 LCD in spaced squares: a clock, a walker and a parallax strip
 *
 * Chrome as on the algorithms board: the label top-left, the reference faint top-right, a footer rail with a
 * counter and one stat. t = 0 is a finished picture. One red per card, always the live thing.
 */
import { installSquares } from '../../engine/squares'
import { EMPTY, GARBAGE, tetris, ROTATIONS, type TetrisHistory } from '../../engine/squares/tetris'
import { tsin } from '../../engine/noise/trig'
import { glyph } from '../../engine/fields/bitmapFont'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { clamp } from '../../engine/math'
import type { DotStyle, Field, JoinSpec, Layer, Tone } from '../../engine/types'
import { TILE, layer, layoutFor, type WidgetPreset } from '../types'
import { portrait } from './mirror'

installSquares()

const T = layoutFor(TILE)
type Pt = [number, number]
const N = TILE.cols - 1
/**
 * Squares card style: `square` dots, five quantized levels, and a .16 gutter (`{grid.gap}`), so a full cell's half
 * side is .84 of the half pitch, about the tile circle's radius (4/π its ink).
 */
export const squareStyle: DotStyle = { shape: 'square', sizeMin: .25, sizeMax: 1.125, gap: .16, quantizeSteps: 5, opacityMode: 'fromValue' }
const tile = { group: 'composite', chrome: 'dots', grid: TILE, style: squareStyle, animated: true } as const

const cap = (s: string, col: number, row: number, align?: 'left' | 'center' | 'right') => T.big(s, col, row, { lattice: .72, align })
/** Top-right: the work the card is after. */
const cite = (s: string) => layer(cap(s, 143, 1, 'right'), 'faint')
const FOOT = 137, RAIL_Y = 132
/** Footer: a faint dotted rail filled in `mid` to `k`, an optional live (red) knob, a counter left and one stat right. */
function footer(k: number, left: string, right: string, live = false): Layer[] {
  const done: Pt[] = [], rest: Pt[] = [], end = N * clamp(k)
  let knob: Pt | undefined
  for (let c = 0; c <= N; c += 3) (c <= end ? done : rest).push([c, RAIL_Y])
  if (live && done.length) knob = done.pop()
  return [
    layer(T.dots(rest, .9), 'faint'), layer(T.dots(done, 1.1), 'mid'),
    ...(knob ? [layer(T.dots([knob], 2.2), 'active')] : []),
    layer(T.text(left, 0, FOOT), 'idle'),
    layer(T.text(right, 143, FOOT, { align: 'right' }), 'faint'),
  ]
}
const pad = (n: number, w: number) => String(Math.max(0, Math.round(n))).padStart(w, '0')
const thousands = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
const mod = (x: number, m: number) => ((x % m) + m) % m

/**
 * A layer on a `k`× lattice at card cell `origin`, read per lattice cell: `value(c, r)` over [0, w) × [0, h) (0 outside),
 * optionally a tone and a join group per cell. The field is bounded, so the sampler only visits the box.
 */
function cells(k: number, origin: Pt, w: number, h: number, value: (c: number, r: number) => number,
  opts: { tone?: Tone; toneOf?: (c: number, r: number) => Tone | undefined; join?: JoinSpec | true; group?: (c: number, r: number) => number } = {}): Layer {
  const sub = latticeGrid(TILE, k, origin), X = Math.max(1, sub.cols - 1), Y = Math.max(1, sub.rows - 1)
  const at = (u: number, v: number): [number, number] => [Math.round(u * X), Math.round(v * Y)]
  const field: Field = (u, v) => { const [c, r] = at(u, v); return c < 0 || r < 0 || c >= w || r >= h ? 0 : value(c, r) }
  field.bounds = [0, 0, w - 1, h - 1]
  const { tone, toneOf, group } = opts
  const join: JoinSpec | true | undefined = group ? { ...(opts.join === true || !opts.join ? {} : opts.join), group: (u, v) => { const [c, r] = at(u, v); return group(c, r) } } : opts.join
  return { field, lattice: k, origin, tone, ...(toneOf ? { toneOf: (_: number, u: number, v: number) => { const [c, r] = at(u, v); return toneOf(c, r) } } : {}), ...(join ? { join } : {}) }
}

// ── 01 TETRIS ─ seven shapes, one rule ────────────────────────────────────────────────────────────────
// Thesis: "Seven shapes, one rule: only equals fuse." A 10 × 18 well on a 6× lattice. The settled stack is one
// layer whose cells join by piece colour (a greedy colouring of the pieces that ever touch), so every piece reads
// as one tetromino even beside a same-tone neighbour. The falling piece is the red; a cleared line flashes as one
// white bar for two frames, then the stack collapses. NEXT, SCORE and LINES sit in the side panel.
const TW = 10, TH = 18, TK = 6, T_ORIGIN: Pt = [6, 14]
let tet: TetrisHistory | undefined
const game = () => (tet ??= tetris({ w: TW, h: TH, seed: 3, max: 400, garbage: 6, rise: 12 }))
/** Seconds per piece; the drop eases in over the first 70%. */
const PIECE = .5, DROP = .7, FLASH = 2 / 12, T_OFF = 96.2
/** Tone of each kind (I O T S Z J L): joined fills sit a grey band low (Q-squares §2.5). */
const KIND_TONE: Tone[] = ['idle', 'mid', 'idle', 'mid', 'idle', 'mid', 'value']
export const sqTetris: WidgetPreset = {
  id: 'sq-tetris', name: 'Squares Tetris', label: 'TETRIS', ...tile,
  layers: ctx => {
    const g = game(), wh = TW * TH, loop = g.count * PIECE, p = mod(ctx.t + T_OFF, loop), k = Math.min(g.count - 1, Math.floor(p / PIECE)), into = p - k * PIECE
    const prev = k > 0 ? g.placements[k - 1] : undefined, flash = !!prev?.cleared.length && into < FLASH
    // the stack: after k placements, or (flashing) the locked board before the last clear
    const board = flash ? g.locked.subarray((k - 1) * wh, k * wh) : g.boards.subarray(k * wh, (k + 1) * wh)
    const cleared = new Set(flash ? prev!.cleared : [])
    const pieceAt = (c: number, r: number) => board[r * TW + c]
    // settled pieces: one joined tetromino each (group = the piece's colour)
    const stack = cells(TK, T_ORIGIN, TW, TH, (c, r) => (pieceAt(c, r) >= 0 && !cleared.has(r) ? 1 : 0), {
      toneOf: (c, r) => KIND_TONE[g.placements[pieceAt(c, r)]?.kind ?? 0], group: (c, r) => g.colour[pieceAt(c, r)] ?? 0, join: true,
    })
    // garbage rubble: spaced squares a level down, never joined
    const rubble = cells(TK, T_ORIGIN, TW, TH, (c, r) => (pieceAt(c, r) === GARBAGE && !cleared.has(r) ? .75 : 0), { tone: 'mid' })
    // a cleared line: one white bar for two frames
    const bars = cells(TK, T_ORIGIN, TW, TH, (c, r) => (cleared.has(r) && pieceAt(c, r) !== EMPTY ? 1 : 0), { tone: 'value', join: true })
    // empty well cells: small faint squares (spaced), under the stack
    const floor = cells(TK, T_ORIGIN, TW, TH, () => .25, { tone: 'faint' })
    // the falling piece: a hard drop from the spawn row, red and joined (the accent opts in)
    const now = g.placements[k], layers: Layer[] = []
    if (!flash && now) {
      const f = clamp((into - (prev?.cleared.length ? FLASH : 0)) / (PIECE * DROP)), y = Math.round(now.y * f * f)
      const on = new Set(ROTATIONS[now.kind][now.rot].map(([cx, cy]) => (y + cy) * TW + now.x + cx))
      layers.push(cells(TK, T_ORIGIN, TW, TH, (c, r) => (on.has(r * TW + c) ? 1 : 0), { tone: 'active', join: { accent: true } }))
    }
    // NEXT preview on the same lattice, joined
    const next = g.kinds[k + 1], shape = ROTATIONS[next][0], nx = new Set(shape.map(([cx, cy]) => cy * 4 + cx))
    const preview = cells(TK, [78, 26], 4, 2, (c, r) => (nx.has(r * 4 + c) ? 1 : 0), { tone: KIND_TONE[next], join: true })
    const lines = g.lines[k], score = g.score[k]
    return [
      cite('PAJITNOV 1984'),
      // well walls and floor at the card pitch
      layer(T.vrule(4, 14, 110), 'faint'), layer(T.vrule(67, 14, 110), 'faint'), layer(T.hrule(4, 123, 64), 'faint'),
      floor, rubble, stack, bars, ...layers,
      layer(T.text('NEXT', 78, 16), 'faint'), preview,
      layer(T.text('SCORE', 78, 52), 'faint'), layer(T.big(pad(score, 6), 78, 62, { lattice: 1.5 }), 'value'),
      layer(T.text('LINES', 78, 84), 'faint'), layer(T.big(pad(lines, 3), 78, 94, { lattice: 2 }), 'idle'),
      ...footer(p / loop, `PIECE ${pad(k + 1, 3)}`, `LEVEL ${pad(Math.floor(lines / 10), 2)}`),
    ]
  },
}

// ── 02 QUADS ─ split where it's wrong ─────────────────────────────────────────────────────────────────
// Thesis: "Split where it's wrong: 1,200 squares find the face." After Fogleman's Quads (2012): the portrait is
// one square; the quad with the largest error (RMS × area^¼) splits into four, again and again. Each quad is
// one joined square on a 2× lattice (its own group), so the grout between quads stays one gutter wide at every
// size. Tone is the quad's mean luma, a band low (faint, faint, mid, idle at the 40/80/94% quantiles). The red is the four children of the newest split.
const Q_SIZE = 128, Q_ORIGIN: Pt = [8, 8], QK = 2, Q_SPLITS = 400, Q_LOOP = 16, Q_GROW = 12, Q_OFF = 13
interface Quads { x: Int16Array; y: Int16Array; size: Int16Array; mean: Float32Array; killed: Int32Array; rms: Float32Array; splits: number; cuts: number[] }
let quads: Quads | undefined
/** The split history, built once: integral images of v and v², a max-heap by RMS × area^¼ (ties: lower quad id). */
function quadTree(): Quads {
  if (quads) return quads
  const W = Q_SIZE + 1, S1 = new Float64Array(W * W), S2 = new Float64Array(W * W)
  for (let y = 0; y < Q_SIZE; y++) for (let x = 0; x < Q_SIZE; x++) {
    const v = portrait(Q_ORIGIN[0] + x, Q_ORIGIN[1] + y), i = (y + 1) * W + x + 1
    S1[i] = v + S1[i - 1] + S1[i - W] - S1[i - W - 1]; S2[i] = v * v + S2[i - 1] + S2[i - W] - S2[i - W - 1]
  }
  const box = (S: Float64Array, x: number, y: number, s: number) => S[(y + s) * W + x + s] - S[y * W + x + s] - S[(y + s) * W + x] + S[y * W + x]
  const max = 1 + 4 * Q_SPLITS
  const q: Quads = { x: new Int16Array(max), y: new Int16Array(max), size: new Int16Array(max), mean: new Float32Array(max), killed: new Int32Array(max).fill(0x7fffffff), rms: new Float32Array(max), splits: 0, cuts: [] }
  let n = 0
  const add = (x: number, y: number, s: number) => {
    const a = s * s, m = box(S1, x, y, s) / a
    q.x[n] = x; q.y[n] = y; q.size[n] = s; q.mean[n] = m; q.rms[n] = Math.sqrt(Math.max(0, box(S2, x, y, s) / a - m * m))
    return n++
  }
  const score = (i: number) => q.rms[i] * Math.sqrt(Math.sqrt(q.size[i] * q.size[i]))
  // binary max-heap of quad ids
  const heap: number[] = []
  const better = (a: number, b: number) => score(a) > score(b) || (score(a) === score(b) && a < b)
  const push = (i: number) => { heap.push(i); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (!better(heap[c], heap[p])) break; [heap[c], heap[p]] = [heap[p], heap[c]]; c = p } }
  const pop = () => {
    const top = heap[0], last = heap.pop()!
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let b = c; if (l < heap.length && better(heap[l], heap[b])) b = l; if (r < heap.length && better(heap[r], heap[b])) b = r; if (b === c) break; [heap[c], heap[b]] = [heap[b], heap[c]]; c = b } }
    return top
  }
  push(add(0, 0, Q_SIZE))
  while (q.splits < Q_SPLITS && heap.length) {
    const i = pop(), h = q.size[i] / 2
    q.killed[i] = q.splits
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const c = add(q.x[i] + dx * h, q.y[i] + dy * h, h); if (h > QK) push(c) }
    q.splits++
  }
  // tone bands: quartiles of the leaf luma at the full split count
  const leaf: number[] = []
  for (let i = 0; i < n; i++) if (q.killed[i] >= q.splits) leaf.push(q.mean[i])
  leaf.sort((a, b) => a - b)
  q.cuts = [.4, .8, .94].map(f => leaf[Math.floor(f * (leaf.length - 1))])
  return (quads = q)
}
const Q_TONES: Tone[] = ['faint', 'faint', 'mid', 'idle']
export const sqQuads: WidgetPreset = {
  id: 'sq-quads', name: 'Squares Quads', label: 'QUADS', ...tile,
  layers: ctx => {
    const q = quadTree(), p = mod(ctx.t + Q_OFF, Q_LOOP), grow = clamp(p / Q_GROW), k = Math.max(1, Math.round(q.splits * grow * grow)), live = grow < 1
    const side = Q_SIZE / QK, id = new Int16Array(side * side).fill(-1)
    for (let i = 0; i <= 4 * k && i < q.x.length; i++) {
      if (q.killed[i] < k || q.size[i] === 0) continue
      const x0 = q.x[i] / QK, y0 = q.y[i] / QK, s = q.size[i] / QK
      for (let y = y0; y < y0 + s; y++) id.fill(i, y * side + x0, y * side + x0 + s)
    }
    const newest = live ? new Set([4 * k - 3, 4 * k - 2, 4 * k - 1, 4 * k]) : new Set<number>()
    const band = (m: number) => (m < q.cuts[0] ? 0 : m < q.cuts[1] ? 1 : m < q.cuts[2] ? 2 : 3)
    // group: size level × position parity, so two touching quads never share one
    const group = (c: number, r: number) => { const i = id[r * side + c], s = q.size[i] / QK; return 4 * Math.log2(s) + ((q.x[i] / q.size[i]) & 1) + 2 * ((q.y[i] / q.size[i]) & 1) }
    const at = (c: number, r: number) => id[r * side + c]
    let err = 0
    for (let i = 0; i <= 4 * k && i < q.x.length; i++) if (q.killed[i] >= k && q.size[i]) err += q.rms[i] * q.size[i] * q.size[i]
    return [
      cite('FOGLEMAN 2012'),
      cells(QK, Q_ORIGIN, side, side, (c, r) => (at(c, r) >= 0 && !newest.has(at(c, r)) ? 1 : 0), { toneOf: (c, r) => Q_TONES[band(q.mean[at(c, r)])], group, join: true }),
      cells(QK, Q_ORIGIN, side, side, (c, r) => (newest.has(at(c, r)) ? 1 : 0), { tone: 'active', group, join: { accent: true } }),
      layer(T.text(`SQUARES ${thousands(1 + 3 * k).padStart(5, " ")}`, 0, FOOT), "idle"),
      layer(T.text(`RMS ${(err / (Q_SIZE * Q_SIZE)).toFixed(3).slice(1)}`, 143, FOOT, { align: 'right' }), 'faint'),
    ]
  },
}

// ── 03 BLOB ─ metaballs that fuse only with their equals ──────────────────────────────────────────────
// Thesis: "Metaballs on a grid: cells fuse only with their equals." Four balls on Lissajous paths over a 3×
// lattice; f = Σ rᵢ² / dᵢ², value = f / 2 on five levels. Cells from level .5 up join, level by level, so the blob
// is a stack of terraces with grout between them; the .25 halo stays spaced squares. The red is the neck: the
// cells where the two closest balls each give more than .35 of the threshold, so it forms as they meet.
const BK = 3, B_ORIGIN: Pt = [0, 9], BW = 48, BH = 40, B_LOOP = 24
const BALLS = [
  { r: 6.2, ax: 14, ay: 9, wx: 1, wy: 2, px: 0, py: .6 },
  { r: 5.4, ax: 15, ay: 11, wx: 2, wy: 1, px: 2.1, py: 0 },
  { r: 4.8, ax: 12, ay: 12, wx: 3, wy: 2, px: 4.2, py: 1.3 },
  { r: 5.8, ax: 16, ay: 8, wx: 1, wy: 3, px: 1.1, py: 3.4 },
]
const B_OFF = 3.4
function ballsAt(t: number): Pt[] {
  const w = (2 * Math.PI) / B_LOOP
  return BALLS.map(b => [BW / 2 - .5 + b.ax * tsin(b.wx * w * t + b.px), BH / 2 - .5 + b.ay * tsin(b.wy * w * t + b.py + Math.PI / 2)])
}
/**
 * The field and its neck at ball positions `at`. The neck belongs to the pair of balls that is nearest (distance
 * over the sum of radii) without overlapping: the cells between their centres that are lit (value ≥ .5) where each
 * ball gives more than .35 of the threshold and neither reaches it alone. Only the largest 4-connected piece of
 * that corridor is kept, so the red is one shape.
 */
function blobFrame(at: Pt[]): { val: Float32Array; neck: Uint8Array; necks: number; gap: number } {
  const n = BW * BH, val = new Float32Array(n), cand = new Uint8Array(n), neck = new Uint8Array(n)
  let pi = -1, pj = -1, gap = Infinity
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    const d = Math.hypot(at[i][0] - at[j][0], at[i][1] - at[j][1]) / (BALLS[i].r + BALLS[j].r)
    if (d > 1 && d < gap) { gap = d; pi = i; pj = j }
  }
  for (let r = 0; r < BH; r++) for (let c = 0; c < BW; c++) {
    let f = 0, a = 0, b = 0
    for (let i = 0; i < 4; i++) {
      const dx = c - at[i][0], dy = r - at[i][1], g = (BALLS[i].r * BALLS[i].r) / (dx * dx + dy * dy + .25)
      f += g
      if (i === pi) a = g; else if (i === pj) b = g
    }
    const v = clamp(f / 2), j = r * BW + c
    val[j] = v
    if (pi < 0 || v < .5 || !(a > .35 && b > .35 && a < 1 && b < 1)) continue
    // between the two centres: projected inside the segment, off its axis by less than the smaller radius
    const ax = at[pj][0] - at[pi][0], ay = at[pj][1] - at[pi][1], L2 = ax * ax + ay * ay, px = c - at[pi][0], py = r - at[pi][1]
    const s = (px * ax + py * ay) / L2, off = Math.abs(px * ay - py * ax) / Math.sqrt(L2)
    if (s > 0 && s < 1 && off < Math.min(BALLS[pi].r, BALLS[pj].r)) cand[j] = 1
  }
  // keep the largest 4-connected piece (scan order, so ties keep the first)
  const seen = new Uint8Array(n), stack: number[] = []
  let bestCells: number[] = []
  for (let s0 = 0; s0 < n; s0++) {
    if (!cand[s0] || seen[s0]) continue
    const comp: number[] = []
    seen[s0] = 1; stack.push(s0)
    while (stack.length) {
      const j = stack.pop()!, c = j % BW, r = (j - c) / BW
      comp.push(j)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cc = c + dc, rr = r + dr, k = rr * BW + cc
        if (cc >= 0 && cc < BW && rr >= 0 && rr < BH && cand[k] && !seen[k]) { seen[k] = 1; stack.push(k) }
      }
    }
    if (comp.length > bestCells.length) bestCells = comp
  }
  for (const j of bestCells) neck[j] = 1
  return { val, neck, necks: bestCells.length, gap }
}
export const sqBlob: WidgetPreset = {
  id: 'sq-blob', name: 'Squares Blob', label: 'BLOB', ...tile,
  layers: ctx => {
    const t = ctx.t + B_OFF, at = ballsAt(t)
    const { val, neck, necks, gap } = blobFrame(at)
    return [
      cite('BLINN 1982'),
      cells(BK, B_ORIGIN, BW, BH, (c, r) => (neck[r * BW + c] ? 0 : val[r * BW + c]), { toneOf: (c, r) => (val[r * BW + c] >= .875 ? 'idle' : 'mid'), join: { at: .5, inner: .35 } }),
      cells(BK, B_ORIGIN, BW, BH, (c, r) => neck[r * BW + c], { tone: 'active', join: { accent: true, inner: .35 } }),
      ...footer(mod(t, B_LOOP) / B_LOOP, `D/R ${gap < 9 ? gap.toFixed(2) : '-.--'}`, `NECK ${pad(necks, 3)}`),
    ]
  },
}

// ── 04 LCD ─ four shades ──────────────────────────────────────────────────────────────────────────────
// Thesis: "Four shades, 160 × 144 in spirit." A 72 × 64 four-shade LCD on a 2× lattice: every pixel is a square
// at one size (the gutter is the LCD grid), and the shade is the tone: off pixels small and faint (the LCD grid), lit pixels faint, mid, idle, value.
// HH:MM in the 5 × 7 font scaled 3× in LCD pixels, the date under it, a walker with a two-frame cycle over a
// parallax strip (far hills, near ground). The colon is the red, at 1 Hz.
const LK = 2, L_ORIGIN: Pt = [0, 12], LW = 72, LH = 64
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'], DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
/** The walker, 16 × 16, two frames ('#' value, '+' idle, '.' unlit). */
const WALKER = [[
  '.....####.......', '....######......', '....##+#+#......', '....######......', '.....####.......', '......##........',
  '....######......', '...########.....', '...#.####.#.....', '...#.####.#.....', '.....####.......', '.....#..#.......',
  '....##..##......', '....#....#......', '...##....##.....', '................',
], [
  '.....####.......', '....######......', '....##+#+#......', '....######......', '.....####.......', '......##........',
  '....######......', '...########.....', '..#..####..#....', '.....####.......', '.....####.......', '......##........',
  '......##........', '.....#.#........', '.....#..#.......', '................',
]]
const SHADE: Tone[] = ['faint', 'faint', 'mid', 'idle', 'value']
export const sqGameboy: WidgetPreset = {
  id: 'sq-gameboy', name: 'Squares LCD', label: 'LCD', ...tile, clock: true,
  layers: ctx => {
    const t = ctx.t, px = new Uint8Array(LW * LH), set = (x: number, y: number, s: number) => { if (x >= 0 && y >= 0 && x < LW && y < LH) px[y * LW + x] = s }
    // sky: two clouds drifting left (mid)
    for (const [cx, cy, w, speed] of [[20, 32, 9, 1.5], [58, 27, 7, 1]]) {
      const x0 = Math.round(mod(cx - t * speed, LW + 20) - 10)
      for (let x = 0; x < w; x++) { set(x0 + x, cy, 2); if (x > 1 && x < w - 2) set(x0 + x, cy - 1, 2) }
    }
    // far hills (mid), scrolling at a third of the ground speed
    const run = t * 6
    for (let x = 0; x < LW; x++) {
      const u = x + run / 3, top = 49 - Math.round(3 + 2.5 * tsin(u * .11) + 1.5 * tsin(u * .27 + 1))
      for (let y = top; y < 54; y++) set(x, y, 1)
    }
    // near ground: a lit lip (idle), then a scrolling dither (idle / mid)
    for (let x = 0; x < LW; x++) {
      const u = Math.floor(x + run)
      set(x, 54, 2)
      for (let y = 55; y < LH; y++) set(x, y, (u + y) % 4 === 0 || (u * 3 + y * 5) % 13 === 0 ? 1 : 0)
    }
    // the walker, two frames at 4 Hz
    const frame = WALKER[Math.floor(t * 4) & 1]
    frame.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') set(10 + x, 38 + y, ch === '#' ? 4 : 3) }))
    // HH:MM, 3× in LCD pixels; the colon goes in its own (red) layer
    const now = new Date(), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0')
    const digit = (ch: string, x0: number) => glyph(ch).forEach((row, gy) => row.forEach((on, gx) => { if (on) for (let i = 0; i < 9; i++) set(x0 + gx * 3 + (i % 3), 3 + gy * 3 + Math.floor(i / 3), 4) }))
    digit(hh[0], 1); digit(hh[1], 18); digit(mm[0], 38); digit(mm[1], 55)
    // the date under the clock (1×, idle)
    const date = `${DAYS[now.getDay()]} ${String(now.getDate()).padStart(2, '0')} ${MONTHS[now.getMonth()]}`, dx0 = Math.round((LW - date.length * 6 + 1) / 2)
    ;[...date].forEach((ch, k) => glyph(ch).forEach((row, gy) => row.forEach((on, gx) => { if (on) set(dx0 + k * 6 + gx, 27 + gy, 2) })))
    const colon = (Math.floor(t) & 1) === 0
    const dots = new Set([[34, 9], [35, 9], [34, 10], [35, 10], [34, 17], [35, 17], [34, 18], [35, 18]].map(([x, y]) => y * LW + x))
    return [
      cite('DMG-01 1989'),
      cells(LK, L_ORIGIN, LW, LH, (c, r) => (colon && dots.has(r * LW + c) ? 0 : px[r * LW + c] ? 1 : .25), { toneOf: (c, r) => SHADE[px[r * LW + c]] }),
      ...(colon ? [cells(LK, L_ORIGIN, LW, LH, (c, r) => (dots.has(r * LW + c) ? 1 : 0), { tone: 'active' })] : []),
    ]
  },
}

export const squaresBoard = [sqTetris, sqQuads, sqBlob, sqGameboy]
/** The board's sims and sizes, for the checks (`scripts/squares.ts`). */
export const squaresSources = { game, quadTree, ballsAt, blobFrame, B_OFF, B_LOOP, TETRIS: { w: TW, h: TH, k: TK, origin: T_ORIGIN }, BLOB: { k: BK, origin: B_ORIGIN, w: BW, h: BH }, QUADS: { size: Q_SIZE, k: QK, origin: Q_ORIGIN, splits: Q_SPLITS } }
