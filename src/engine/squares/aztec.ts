/**
 * Domino shuffling on the Aztec diamond (Elkies, Kuperberg, Larsen & Propp 1992), the `sq-arctic` card
 * (docs/living-matter/X-advanced.md #2). Each step grows a uniformly random domino tiling of the order-n diamond to
 * order n + 1; after a few dozen steps the four corners freeze into brick walls and the disordered region inside
 * them is bounded by the arctic circle of radius n / √2 (Jockusch, Propp & Shor 1995).
 *
 * Cells are unit squares [x, x + 1] × [y, y + 1], y up; the order-n diamond is every cell with
 * |x + ½| + |y + ½| ≤ n. A domino is anchored at its left cell (horizontal) or its lower cell (vertical), and its
 * direction comes from the anchor's checkerboard parity against the order: a horizontal domino is N when
 * x + y + n is even (else S), a vertical one E when x + y + n is even (else W). One step:
 *   1. annihilate: an S domino sitting on an N domino (a 2 × 2 block), or an E domino left of a W one, collide; both go
 *   2. slide: every other domino moves one cell its way (the parity flips with the order, so its direction holds)
 *   3. create: the holes left in the order n + 1 diamond split into 2 × 2 blocks; each gets a horizontal pair (N over
 *      S) or a vertical pair (W left of E) by a seeded coin
 *
 * Deterministic (inside the determinism lint): integer arithmetic and `rngFor` coins.
 */
import { rngFor } from '../noise/dmath'

/** Directions: 0 N and 1 S (horizontal), 2 E and 3 W (vertical). */
export const N = 0, S = 1, E = 2, W = 3
export type Dir = 0 | 1 | 2 | 3
export interface Domino {
  /** Anchor cell: the left cell of a horizontal domino, the lower cell of a vertical one (y up). */
  x: number; y: number
  dir: Dir
  /** The order whose creation step made it. */
  born: number
}
/** One step, order − 1 → order: the tiling before it, which dominoes collided, the slid survivors and the new pairs. */
export interface ShuffleStep {
  order: number
  before: Domino[]
  /** 1 per `before` domino that annihilated. */
  dead: Uint8Array
  slid: Domino[]
  born: Domino[]
}
export interface AztecHistory {
  orders: number
  steps: ShuffleStep[]
  /** Holes the create pass could not fill as a 2 × 2 block (0 for a correct shuffle; the checks read it). */
  bad: number
}

export const horizontal = (d: Domino) => d.dir <= S
/** The direction parity says a domino anchored at (x, y) has in the order-n diamond. */
export const dirOf = (x: number, y: number, n: number, horiz: boolean): Dir => {
  const even = ((x + y + n) & 1) === 0
  return horiz ? (even ? N : S) : even ? E : W
}
/** The order-n diamond holds cell (x, y). */
export const inDiamond = (x: number, y: number, n: number) => Math.abs(2 * x + 1) + Math.abs(2 * y + 1) <= 2 * n
/** The second cell of a domino. */
export const partner = (d: Domino): [number, number] => (horizontal(d) ? [d.x + 1, d.y] : [d.x, d.y + 1])

/** Domino index per cell of the order-n box (2n × 2n, row-major from (−n, −n), y up); −1 where none. */
export function ownerGrid(ds: Domino[], n: number): Int32Array {
  const s = 2 * n, g = new Int32Array(s * s).fill(-1)
  ds.forEach((d, i) => {
    const [x2, y2] = partner(d)
    g[(d.y + n) * s + d.x + n] = i
    g[(y2 + n) * s + x2 + n] = i
  })
  return g
}

/** Shuffle from the empty diamond up to `orders`, coins from `seed` (p = the chance of a horizontal pair). */
export function aztecShuffle(orders: number, seed: number, p = .5): AztecHistory {
  const steps: ShuffleStep[] = []
  let tiling: Domino[] = [], bad = 0
  for (let n = 1; n <= orders; n++) {
    const before = tiling, m = n - 1, s = 2 * m, own = ownerGrid(before, m), dead = new Uint8Array(before.length)
    const at = (x: number, y: number) => (x < -m || y < -m || x >= m || y >= m ? -1 : own[(y + m) * s + x + m])
    before.forEach((d, i) => {
      if (d.dir === S) {
        const j = at(d.x, d.y - 1)
        if (j >= 0 && before[j].dir === N && before[j].x === d.x && before[j].y === d.y - 1) dead[i] = dead[j] = 1
      } else if (d.dir === E) {
        const j = at(d.x + 1, d.y)
        if (j >= 0 && before[j].dir === W && before[j].x === d.x + 1 && before[j].y === d.y) dead[i] = dead[j] = 1
      }
    })
    const slid: Domino[] = []
    before.forEach((d, i) => {
      if (dead[i]) return
      const x = d.x + (d.dir === E ? 1 : d.dir === W ? -1 : 0), y = d.y + (d.dir === N ? 1 : d.dir === S ? -1 : 0)
      slid.push({ x, y, dir: d.dir, born: d.born })
    })
    // fill: scan rows bottom up, cells left to right; the first open cell is the lower left of an open 2 × 2 block
    const t = 2 * n, open = new Uint8Array(t * t), rand = rngFor(seed, n)
    for (let y = -n; y < n; y++) for (let x = -n; x < n; x++) if (inDiamond(x, y, n)) open[(y + n) * t + x + n] = 1
    for (const d of slid) { const [x2, y2] = partner(d); open[(d.y + n) * t + d.x + n] = 0; open[(y2 + n) * t + x2 + n] = 0 }
    const born: Domino[] = []
    for (let y = -n; y < n; y++) for (let x = -n; x < n; x++) {
      const j = (y + n) * t + x + n
      if (!open[j]) continue
      if (x + 1 >= n || y + 1 >= n || !open[j + 1] || !open[j + t] || !open[j + t + 1]) { bad++; open[j] = 0; continue }
      open[j] = open[j + 1] = open[j + t] = open[j + t + 1] = 0
      if (rand() < p) born.push({ x, y: y + 1, dir: dirOf(x, y + 1, n, true), born: n }, { x, y, dir: dirOf(x, y, n, true), born: n })
      else born.push({ x, y, dir: dirOf(x, y, n, false), born: n }, { x: x + 1, y, dir: dirOf(x + 1, y, n, false), born: n })
    }
    steps.push({ order: n, before, dead, slid, born })
    tiling = slid.concat(born)
  }
  return { orders, steps, bad }
}
/** The tiling of the order-n diamond (n ≥ 1) from a history. */
export const tilingAt = (h: AztecHistory, n: number): Domino[] => (n <= 0 ? [] : h.steps[n - 1].slid.concat(h.steps[n - 1].born))

/**
 * A greedy colouring of the dominoes' edge-adjacency graph (the lowest colour no touching domino has), so a join pass
 * keeps touching dominoes apart. `grid` is `ownerGrid(ds, n)`. Planar, so a handful of colours; capped at 255.
 */
export function colourDominoes(ds: Domino[], grid: Int32Array, n: number): Uint8Array {
  const s = 2 * n, col = new Uint8Array(ds.length).fill(255)
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i], [x2, y2] = partner(d)
    let used = 0
    for (const [cx, cy] of [[d.x, d.y], [x2, y2]]) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = cx + dx, y = cy + dy
      if (x < -n || y < -n || x >= n || y >= n) continue
      const j = grid[(y + n) * s + x + n]
      if (j >= 0 && j !== i && col[j] < 31) used |= 1 << col[j]
    }
    let c = 0
    while (used & (1 << c)) c++
    col[i] = Math.min(c, 255)
  }
  return col
}

/** Unit steps per direction (N S E W). */
const STEP_OF: [number, number][] = [[0, 1], [0, -1], [1, 0], [-1, 0]]
/**
 * The frozen dominoes of an order-n tiling (1 each): the brick walls in the corners. A domino is frozen when it faces
 * the diamond's edge through frozen ground: every cell one step its way is outside the diamond or under a frozen
 * domino of the same direction. Settled by repeated passes (a wall grows one row per pass at worst).
 */
export function frozenOf(ds: Domino[], grid: Int32Array, n: number): Uint8Array {
  const s = 2 * n, frozen = new Uint8Array(ds.length)
  for (let changed = true; changed;) {
    changed = false
    for (let i = 0; i < ds.length; i++) {
      if (frozen[i]) continue
      const d = ds[i], [dx, dy] = STEP_OF[d.dir]
      let ok = true
      for (const [cx, cy] of [[d.x, d.y], partner(d)]) {
        const x = cx + dx, y = cy + dy
        if (!inDiamond(x, y, n)) continue
        const j = grid[(y + n) * s + x + n]
        if (j < 0 || !frozen[j] || ds[j].dir !== d.dir) { ok = false; break }
      }
      if (ok) { frozen[i] = 1; changed = true }
    }
  }
  return frozen
}
