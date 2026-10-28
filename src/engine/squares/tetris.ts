/**
 * A deterministic Tetris game (the `sq-tetris` card, Q-squares §2.6): a seeded 7-bag and a greedy one-piece
 * placement AI with the El-Tetris weights (Islam 2009), hard drops only. The whole history is computed once:
 * the board after every placement (and before its line clear), the pieces, lines and score, and a greedy
 * colouring of the pieces so that no two pieces that ever touch share a join group.
 *
 * Deterministic by construction (inside the determinism lint): integer hashing (`ihash`) for the bag, only
 * + − × and comparisons in the evaluation, and the argmax keeps the first best (rotation, column) in scan order.
 */
import { ihash } from '../noise/hash'

/** The seven tetrominoes (I O T S Z J L), spawn orientation, as [x, y] cells. */
const SHAPES: [number, number][][] = [
  [[0, 1], [1, 1], [2, 1], [3, 1]],
  [[1, 0], [2, 0], [1, 1], [2, 1]],
  [[1, 0], [0, 1], [1, 1], [2, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [1, 1], [2, 1]],
  [[2, 0], [0, 1], [1, 1], [2, 1]],
]
export const KIND_NAMES = 'IOTSZJL'
/** Cells sorted and shifted to the origin: a canonical key for de-duplicating rotations. */
const normal = (cells: [number, number][]): [number, number][] => {
  const mx = Math.min(...cells.map(c => c[0])), my = Math.min(...cells.map(c => c[1]))
  return cells.map(([x, y]): [number, number] => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0])
}
/** Distinct rotations per kind (clockwise quarter turns), each normalised to its top-left. */
export const ROTATIONS: [number, number][][][] = SHAPES.map(s => {
  const out: [number, number][][] = [], seen = new Set<string>()
  let cells = normal(s)
  for (let r = 0; r < 4; r++) {
    const k = cells.join(';')
    if (!seen.has(k)) { seen.add(k); out.push(cells) }
    cells = normal(cells.map(([x, y]): [number, number] => [-y, x]))
  }
  return out
})

/** El-Tetris weights: landing height, eroded piece cells, row and column transitions, holes, well sums. */
const WEIGHTS = [-4.500158825082766, 3.4181268101392694, -3.2178882868487753, -9.348695305445199, -7.899265427351652, -3.3855972247263626]
const LINE_SCORE = [0, 100, 300, 500, 800]
/** Board cell values besides piece ids (≥ 0). */
export const EMPTY = -1, GARBAGE = -2

export interface Placement {
  kind: number; rot: number; x: number; y: number; id: number
  /** Rows cleared by this placement (indices in the locked board). */
  cleared: number[]
  /** A garbage row rose from the floor after this placement (the stack moved up one row). */
  rise: boolean
}
export interface TetrisHistory {
  w: number; h: number
  /** Placements made (the game stops when no move fits or at `max`). */
  count: number
  placements: Placement[]
  /** Piece kind of every spawned piece, in order (`count + 1` long: the last is the NEXT preview after the end). */
  kinds: Uint8Array
  /** Board after k placements (k = 0 … count), row-major, piece id, EMPTY or GARBAGE, at `k * w * h`. */
  boards: Int16Array
  /** Board right after placement k locked, before its line clear (k = 1 … count), at `(k - 1) * w * h`. */
  locked: Int16Array
  /** Lines and score after k placements. */
  lines: Int32Array; score: Int32Array
  /** Join group of each piece id: no two pieces that are ever 4-adjacent share one (greedy colouring in id order). */
  colour: Uint8Array
}

/** Kind of the i-th spawned piece: 7-bag, each bag shuffled by Fisher–Yates on `ihash(seed, bag, step)`. */
export function bagKind(seed: number, i: number): number {
  const bag = Math.floor(i / 7), order = [0, 1, 2, 3, 4, 5, 6]
  for (let j = 6; j > 0; j--) { const k = ihash(seed, bag, j) % (j + 1); const tmp = order[j]; order[j] = order[k]; order[k] = tmp }
  return order[i % 7]
}

/** Set bits of a 32-bit integer. */
const popcount = (x: number) => { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (Math.imul((x + (x >>> 4)) & 0x0f0f0f0f, 0x01010101) >>> 24) }
/** Piece rows as bitmasks (bit c = column c), top row first. */
const ROW_BITS: number[][][] = ROTATIONS.map(rs => rs.map(cells => { const rows: number[] = []; for (const [x, y] of cells) rows[y] = (rows[y] ?? 0) | (1 << x); return rows }))

/** Can piece rows `p` sit with their top-left at column x, row y on the bit board? */
function fits(bits: Int32Array, h: number, p: number[], x: number, y: number): boolean {
  for (let i = 0; i < p.length; i++) { const r = y + i; if (r >= h || (r >= 0 && bits[r] & (p[i] << x))) return false }
  return true
}
const depth = new Int32Array(32), work = new Int32Array(64)
/** El-Tetris value of the bit board `bits` (piece just locked at row y with rows `p`), from the six features. */
function evaluate(bits: Int32Array, w: number, h: number, p: number[], y: number): number {
  const FULL = (1 << w) - 1
  // eroded piece cells, and the board after the clear (full rows dropped, empty rows on top)
  let cleared = 0, eroded = 0, n = h
  for (let r = h - 1; r >= 0; r--) {
    if (bits[r] === FULL) { cleared++; const i = r - y; if (i >= 0 && i < p.length) eroded += popcount(p[i]); continue }
    work[--n] = bits[r]
  }
  for (let r = 0; r < n; r++) work[r] = 0
  const landing = h - (y + (p.length - 1) / 2)
  let rowT = 0, colT = popcount(work[0]), holes = 0, wells = 0, covered = 0, open = 0
  for (let r = 0; r < h; r++) {
    const b = work[r]
    // an empty row: two transitions (wall → empty → wall), nothing else
    if (b === 0 && covered === 0) { rowT += 2; if (r + 1 < h) colT += popcount(work[r + 1]); continue }
    const walled = (b << 1) | 1 | (1 << (w + 1))
    rowT += popcount((walled ^ (walled >>> 1)) & ((1 << (w + 1)) - 1))
    if (r + 1 < h) colT += popcount(b ^ work[r + 1])
    holes += popcount(covered & ~b & FULL)
    covered |= b
    // wells: cumulative depth per column, visiting only columns with a well cell now or a run to end
    const well = ~b & ((b << 1) | 1) & ((b >>> 1) | (1 << (w - 1))) & FULL
    for (let m = well | open; m; m &= m - 1) {
      const c = 31 - Math.clz32(m & -m)
      if (well & (1 << c)) wells += ++depth[c]; else depth[c] = 0
    }
    open = well
  }
  for (let m = open; m; m &= m - 1) depth[31 - Math.clz32(m & -m)] = 0
  colT += popcount(~work[h - 1] & FULL)
  return WEIGHTS[0] * landing + WEIGHTS[1] * cleared * eroded + WEIGHTS[2] * rowT + WEIGHTS[3] * colT + WEIGHTS[4] * holes + WEIGHTS[5] * wells
}

/** One garbage row: every cell filled but one hole, at a hashed column. */
const garbageRow = (row: Int16Array, w: number, seed: number, n: number) => { row.fill(GARBAGE); row[ihash(seed, n, 977) % w] = EMPTY }

/**
 * Play a game: ≤ `max` placements on a `w` × `h` well. B-type start with `garbage` rows of rubble, and (versus
 * style) one more garbage row rises from the floor after every `rise`-th placement (0 = never), so the stack
 * stays busy. The game stops early when no move fits or a rise would push a cell out of the top.
 */
export function tetris({ w = 10, h = 18, seed = 1, max = 400, garbage = 0, rise = 0 }: { w?: number; h?: number; seed?: number; max?: number; garbage?: number; rise?: number } = {}): TetrisHistory {
  const wh = w * h, board = new Int16Array(wh).fill(EMPTY)
  const boards = new Int16Array((max + 1) * wh), locked = new Int16Array(max * wh)
  const lines = new Int32Array(max + 1), score = new Int32Array(max + 1), kinds = new Uint8Array(max + 1), placements: Placement[] = []
  let rows = 0
  for (let r = h - garbage; r < h; r++) garbageRow(board.subarray(r * w, r * w + w), w, seed, rows++)
  boards.set(board, 0)
  let total = 0, points = 0, k = 0
  const bits = new Int32Array(h)
  for (; k < max; k++) {
    const kind = (kinds[k] = bagKind(seed, k))
    // the AI works on row bitmasks; the id board is what the card draws
    for (let r = 0; r < h; r++) { let b = 0; for (let c = 0; c < w; c++) if (board[r * w + c] !== EMPTY) b |= 1 << c; bits[r] = b }
    let best = -Infinity, rot = -1, x = 0, y = 0
    ROW_BITS[kind].forEach((p, ri) => {
      const wPiece = 32 - Math.clz32(p.reduce((a, b) => a | b, 0))
      for (let px = 0; px + wPiece <= w; px++) {
        if (!fits(bits, h, p, px, 0)) continue
        let py = 0
        while (fits(bits, h, p, px, py + 1)) py++
        for (let i = 0; i < p.length; i++) bits[py + i] |= p[i] << px
        const v = evaluate(bits, w, h, p, py)
        for (let i = 0; i < p.length; i++) bits[py + i] &= ~(p[i] << px)
        if (v > best) { best = v; rot = ri; x = px; y = py }
      }
    })
    if (rot < 0) break
    for (const [cx, cy] of ROTATIONS[kind][rot]) board[(y + cy) * w + x + cx] = k
    locked.set(board, k * wh)
    const cleared: number[] = []
    for (let r = 0; r < h; r++) { let n = 0; for (let c = 0; c < w; c++) if (board[r * w + c] !== EMPTY) n++; if (n === w) cleared.push(r) }
    if (cleared.length) {
      const keep: number[] = []
      for (let r = 0; r < h; r++) if (!cleared.includes(r)) keep.push(r)
      const next = new Int16Array(wh).fill(EMPTY)
      keep.forEach((r, i) => next.set(board.subarray(r * w, r * w + w), (h - keep.length + i) * w))
      board.set(next)
    }
    total += cleared.length
    points += LINE_SCORE[cleared.length] * (1 + Math.floor((total - cleared.length) / 10))
    const up = rise > 0 && (k + 1) % rise === 0
    let topped = false
    if (up) {
      for (let c = 0; c < w; c++) if (board[c] !== EMPTY) topped = true
      board.copyWithin(0, w); garbageRow(board.subarray(wh - w), w, seed, rows++)
    }
    placements.push({ kind, rot, x, y, id: k, cleared, rise: up })
    boards.set(board, (k + 1) * wh); lines[k + 1] = total; score[k + 1] = points
    if (topped) { k++; break }
  }
  kinds[k] = bagKind(seed, k)
  const count = k
  // colouring: every pair of pieces that is 4-adjacent in any state (locked, or after a clear) is an edge
  const adj: Set<number>[] = Array.from({ length: count }, () => new Set())
  const scan = (b: Int16Array, o: number) => {
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const a = b[o + r * w + c]
      if (a < 0) continue
      const right = c + 1 < w ? b[o + r * w + c + 1] : -1, down = r + 1 < h ? b[o + (r + 1) * w + c] : -1
      if (right >= 0 && right !== a) { adj[a].add(right); adj[right].add(a) }
      if (down >= 0 && down !== a) { adj[a].add(down); adj[down].add(a) }
    }
  }
  for (let i = 1; i <= count; i++) { scan(locked, (i - 1) * wh); scan(boards, i * wh) }
  const colour = new Uint8Array(Math.max(1, count))
  for (let id = 0; id < count; id++) {
    const used = new Set<number>()
    for (const o of adj[id]) if (o < id) used.add(colour[o])
    let c = 0
    while (used.has(c)) c++
    colour[id] = c
  }
  return { w, h, count, placements, kinds, boards: boards.subarray(0, (count + 1) * wh), locked: locked.subarray(0, count * wh), lines: lines.subarray(0, count + 1), score: score.subarray(0, count + 1), colour }
}
