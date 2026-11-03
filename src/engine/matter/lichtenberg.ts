/**
 * Lichtenberg figures by the dielectric breakdown model (Niemeyer, Pietronero & Wiesmann, PRL 52, 1984), grown the
 * fast way (Kim, Sewall, Sud & Lin, "Fast Simulation of Laplacian Growth", IEEE CG&A 2007): no Laplace solve. Every
 * charged cell j is a point charge, so a candidate cell i holds φ_i = Σ_j (1 − R₁/r_ij); a new charge adds its term
 * to every candidate, a new candidate sums the cluster once. The next cell is drawn with probability ∝ Φ_i^η, Φ the
 * potential normalised to [0, 1] over the candidates.
 *
 * Two electrodes grow at once: side A sits at potential 0 and side B at 1, so each side's tips lean toward the other.
 * A fixed `ground` point (a finger) pulls side A on its own. Growth stops when the sides touch (`joined`), at `max`
 * cells, or when no candidate is left. Deterministic (docs/living-matter/F0-foundation.md F0.9): integer or half-integer
 * η (multiplies and one `Math.sqrt`, which IEEE 754 rounds exactly), `rngFor` draws, a table of R₁/r; no other Math.
 */
import { rngFor } from '../noise/dmath'

export interface DbmOptions {
  cols: number
  rows: number
  /** Cells growth may enter (1), or every cell. */
  mask?: Uint8Array
  /** Seed cells of side A (x, y), and of side B (none: one-sided growth). */
  a: readonly (readonly [number, number])[]
  b?: readonly (readonly [number, number])[]
  /** A point that attracts side A (a ground electrode under a finger), and how hard (default 0). */
  ground?: readonly [number, number]
  pull?: number
  /** Growth exponent: 1 coral, 2 lightning, 3+ single bolts. Integers and halves only (default 2). */
  eta?: number
  /** How strongly side B pulls side A and back (default 1: the plain two-electrode potential). */
  attract?: number
  /** Side B grows too (default true); false: B is a fixed target that side A grows toward (a finger). */
  bGrows?: boolean
  /**
   * The applied field between the electrodes, potential per cell along the line from A's first seed to B's (default
   * 0). The plates of a real burn sit in one: it drives the two figures at each other instead of round themselves.
   */
  field?: number
  seed: number
  /** Most cells grown, seeds included (default 2000). */
  max?: number
  /** Charge radius R₁ in cells (default .5). */
  r1?: number
  /** Lattice neighbours a cell grows into: 4 (thin channels, the model's square lattice; default) or 8. */
  neighbours?: 4 | 8
}

export interface Dbm {
  readonly cols: number
  readonly rows: number
  /** Cells in growth order (seeds first): y · cols + x. */
  readonly order: Int32Array
  /** Order index of each grown cell's parent (−1 for a seed). */
  readonly parent: Int32Array
  /** Side of each grown cell, by order index: 0 A, 1 B. */
  readonly side: Uint8Array
  /** Cells grown so far. */
  count: number
  /** Order index of the cell that joined the two sides (−1 not yet), and its neighbour on the other side. */
  joined: number
  joinedTo: number
  /** No more growth: joined, full, or out of candidates. */
  done: boolean
  /** Grow until `k` cells (or done); returns the count. Resumes where it stopped: growing to 300 then 900 ≡ to 900. */
  grow(k: number): number
}

const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const

/** Φ^η for integer and half-integer η (Φ in [0, 1]). */
function powEta(x: number, whole: number, half: boolean): number {
  let r = half ? Math.sqrt(x) : 1
  for (let i = 0; i < whole; i++) r *= x
  return r
}

export function dbm(o: DbmOptions): Dbm {
  const { cols, rows } = o, n = cols * rows, max = Math.min(n, o.max ?? 2000), r1 = o.r1 ?? .5, eta = o.eta ?? 2
  const whole = Math.floor(eta), half = eta - whole === .5
  if (!(eta > 0) || (eta !== whole && !half)) throw new Error(`dbm: η must be an integer or a half (got ${eta})`)
  const attract = o.attract ?? 1, pull = o.pull ?? 0, rand = rngFor(o.seed, 7)
  // R₁/r for every offset: index (dy + rows − 1) · tw + (dx + cols − 1)
  const tw = 2 * cols - 1, inv = new Float64Array(tw * (2 * rows - 1))
  for (let dy = -(rows - 1); dy < rows; dy++) for (let dx = -(cols - 1); dx < cols; dx++) {
    const d2 = dx * dx + dy * dy
    inv[(dy + rows - 1) * tw + dx + cols - 1] = d2 === 0 ? 1 : r1 / Math.sqrt(d2)
  }
  // a cell's key: inv[base(c) − key(j)] is R₁/r between c and j (base(c) = key(c) + the table's centre)
  const key = new Int32Array(n), mid = (rows - 1) * tw + cols - 1
  for (let c = 0; c < n; c++) key[c] = ((c / cols) | 0) * tw + (c % cols)
  const NB = o.neighbours === 8 ? N8 : N4
  // per cell: 0 free, 1 charged A, 2 charged B; its order index once charged
  const state = new Uint8Array(n), at = new Int32Array(n).fill(-1)
  // candidates: one union list (every potential is kept fresh on it), flags for which side may grow into it
  const sa = new Float64Array(n), sb = new Float64Array(n), candSide = new Uint8Array(n), cand: number[] = [], pos = new Int32Array(n).fill(-1), w = new Float64Array(n)
  const order = new Int32Array(max), parent = new Int32Array(max), side = new Uint8Array(max)
  const g = o.ground, gTerm = new Float64Array(g && pull ? n : 0)
  if (g && pull) for (let c = 0; c < n; c++) { const dx = (c % cols) - g[0], dy = ((c / cols) | 0) - g[1]; gTerm[c] = pull / (1 + Math.sqrt(dx * dx + dy * dy) / 8) }
  // the applied field: E · (c − a₀) · û, û the unit vector from A's first seed to B's
  const ext = new Float64Array(o.field && o.b?.length ? n : 0)
  if (ext.length) {
    const [ax, ay] = o.a[0], [bx, by] = o.b![0], l = Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2) || 1, ux = (bx - ax) / l, uy = (by - ay) / l
    for (let c = 0; c < n; c++) ext[c] = o.field! * (((c % cols) - ax) * ux + (((c / cols) | 0) - ay) * uy)
  }
  const pv = new Float64Array(n)
  const allowed = (c: number) => !o.mask || o.mask[c] === 1
  const f: Dbm = { cols, rows, order, parent, side, count: 0, joined: -1, joinedTo: -1, done: false, grow }

  /** Sum the cluster's charges into a new candidate (both sides). */
  function sumInto(c: number): void {
    let a = 0, b = 0
    const base = key[c] + mid
    for (let k = 0; k < f.count; k++) { const t = inv[base - key[order[k]]]; if (side[k]) b += t; else a += t }
    sa[c] = a; sb[c] = b
  }
  function charge(c: number, s: 0 | 1, par: number): void {
    const k = f.count++
    order[k] = c; parent[k] = par; side[k] = s; state[c] = s + 1; at[c] = k
    // off the candidate list (swap-remove), then its charge into every remaining candidate
    const p = pos[c]
    if (p >= 0) { const last = cand.pop()!; if (last !== c) { cand[p] = last; pos[last] = p } pos[c] = -1; candSide[c] = 0 }
    const S = s ? sb : sa, kc = mid - key[c]
    for (let i = 0; i < cand.length; i++) { const q = cand[i]; S[q] += inv[kc + key[q]] }
    // its free neighbours become candidates of its side
    const x = c % cols, y = (c / cols) | 0
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const q = ny * cols + nx
      if (state[q] || !allowed(q)) continue
      if (pos[q] < 0) { pos[q] = cand.length; cand.push(q); sumInto(q) }
      candSide[q] |= s ? 2 : 1
    }
  }
  /** The charged neighbour of c on side s that grew first (the branch it hangs from), as an order index. */
  function oldest(c: number, s: number): number {
    const x = c % cols, y = (c / cols) | 0
    let best = -1
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const q = ny * cols + nx
      if (state[q] === s + 1 && (best < 0 || at[q] < best)) best = at[q]
    }
    return best
  }
  /** One cell for side s; false when it has no candidate. */
  function step(s: 0 | 1): boolean {
    const bit = s ? 2 : 1, two = (o.b?.length ?? 0) > 0
    let lo = Infinity, hi = -Infinity, m = 0
    // the potential seen from side s: A wants far from A and near B (and the ground); B the mirror
    const E = ext.length > 0
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i]
      if (!(candSide[c] & bit)) continue
      const e = E ? ext[c] : 0
      const p = pv[i] = s ? sa[c] - attract * sb[c] - e : (two ? attract * sb[c] : 0) - sa[c] + e + (pull ? gTerm[c] : 0)
      if (p < lo) lo = p
      if (p > hi) hi = p
      m++
    }
    if (!m) return false
    const span = hi - lo
    let sum = 0
    for (let i = 0; i < cand.length; i++) {
      const c = cand[i]
      if (!(candSide[c] & bit)) { w[i] = 0; continue }
      sum += w[i] = span > 0 ? powEta((pv[i] - lo) / span, whole, half) : 1
    }
    let u = rand() * sum, pick = -1
    for (let i = 0; i < cand.length; i++) { if (w[i] <= 0) continue; pick = i; if ((u -= w[i]) < 0) break }
    if (pick < 0) return false
    const c = cand[pick], par = oldest(c, s)
    charge(c, s, par)
    // touching the other side: the discharge
    const x = c % cols, y = (c / cols) | 0
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue
      const q = ny * cols + nx
      if (state[q] === (s ? 1 : 2)) { f.joined = f.count - 1; f.joinedTo = at[q]; f.done = true; return true }
    }
    return true
  }
  function grow(k: number): number {
    let turn: 0 | 1 = f.count % 2 === 0 ? 0 : 1
    const two = (o.b?.length ?? 0) > 0 && o.bGrows !== false
    while (!f.done && f.count < Math.min(k, max)) {
      const s: 0 | 1 = two ? turn : 0
      if (!step(s) && !(two && step(s ? 0 : 1))) { f.done = true; break }
      turn = turn ? 0 : 1
    }
    if (f.count >= max) f.done = true
    return f.count
  }

  for (const [x, y] of o.a) { const c = y * cols + x; if (!state[c]) charge(c, 0, -1) }
  for (const [x, y] of o.b ?? []) { const c = y * cols + x; if (!state[c]) charge(c, 1, -1) }
  return f
}

/**
 * Branch weight of every grown cell among the first `k`: how many cells hang from it (itself included). Trunks carry
 * the whole tree, tips carry 1: a channel's width follows it. `into` is reused when given.
 */
export function dbmWeights(f: Dbm, k = f.count, into?: Int32Array): Int32Array {
  const w = into && into.length >= f.order.length ? into : new Int32Array(f.order.length)
  const m = Math.min(k, f.count)
  w.fill(1, 0, m)
  for (let i = m - 1; i >= 0; i--) { const p = f.parent[i]; if (p >= 0) w[p] += w[i] }
  return w
}

/** The discharge path once joined: order indices from the A electrode, through the join, to the B electrode. */
export function dbmPath(f: Dbm): number[] {
  if (f.joined < 0) return []
  const up = (i: number) => { const out: number[] = []; for (let k = i; k >= 0; k = f.parent[k]) out.push(k); return out }
  const a = up(f.side[f.joined] ? f.joinedTo : f.joined), b = up(f.side[f.joined] ? f.joined : f.joinedTo)
  return [...a.reverse(), ...b]
}
