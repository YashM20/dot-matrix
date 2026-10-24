/**
 * Spatio-temporal blue-noise threshold mask (STBN-style, MASTER-PLAN §8 item 5), generated in code:
 * a 64² void-and-cluster rank table (Ulichney 1993) built once on first use, animated over time by a
 * golden-ratio rotation of every threshold (slice k = fract(mask + k·φ)). Each slice is the same
 * blue-noise pattern with its thresholds re-ranked, and each cell's sequence over k is low-discrepancy,
 * so k frames average to the true tone with no repeating temporal pattern. Deterministic: no seed state.
 */
export const BLUE_NOISE_SIZE = 64
const N = BLUE_NOISE_SIZE, MASK = N - 1, PHI = 0.6180339887498949

let table: Float32Array | undefined

/** Void-and-cluster on an n×n torus: rank of every cell, as thresholds (rank + .5) / n². */
function voidAndCluster(n: number, sigma: number, seed: number): Float32Array {
  const size = n * n, reach = Math.ceil(sigma * 2.5), side = 2 * reach + 1
  const kern = new Float32Array(side * side)
  for (let y = -reach; y <= reach; y++) for (let x = -reach; x <= reach; x++) kern[(y + reach) * side + x + reach] = Math.exp(-(x * x + y * y) / (2 * sigma * sigma))
  // energy of the lit cells' Gaussians at every cell; `lit` adds +BIG to lit cells (so a plain min finds the
  // largest void among the empty cells), `dark` adds -BIG to empty cells (a plain max finds the tightest cluster)
  const BIG = 1e6, on = new Uint8Array(size), lit = new Float64Array(size), dark = new Float64Array(size).fill(-BIG)
  const wrap = new Int32Array(n + 2 * reach)
  for (let i = 0; i < wrap.length; i++) wrap[i] = (i - reach + n) % n
  // per-row extremes, refreshed only for the rows a splat touched (the full scan is then n, not n²)
  const rowMin = new Float64Array(n), rowMinAt = new Int32Array(n), rowMax = new Float64Array(n), rowMaxAt = new Int32Array(n)
  // which extremes the current phase reads: 1 voids, 2 clusters, 3 both
  let need = 3
  const refresh = (r: number) => {
    const j0 = r * n, end = j0 + n
    if (need & 1) { let lo = Infinity, a = 0; for (let j = j0; j < end; j++) if (lit[j] < lo) { lo = lit[j]; a = j } rowMin[r] = lo; rowMinAt[r] = a }
    if (need & 2) { let hi = -Infinity, b = 0; for (let j = j0; j < end; j++) if (dark[j] > hi) { hi = dark[j]; b = j } rowMax[r] = hi; rowMaxAt[r] = b }
  }
  const set = (i: number, v: 0 | 1) => {
    on[i] = v
    const s = v ? 1 : -1, cx = i % n, cy = (i / n) | 0
    lit[i] += s * BIG; dark[i] += s * BIG
    for (let y = 0; y < side; y++) {
      const row = wrap[cy + y] * n, k = y * side
      for (let x = 0; x < side; x++) { const j = row + wrap[cx + x], e = s * kern[k + x]; lit[j] += e; dark[j] += e }
    }
    for (let y = 0; y < side; y++) refresh(wrap[cy + y])
  }
  for (let r = 0; r < n; r++) refresh(r)
  // tightest cluster = the lit cell with the most energy; largest void = the empty cell with the least
  const cluster = () => { let r = 0; for (let k = 1; k < n; k++) if (rowMax[k] > rowMax[r]) r = k; return rowMaxAt[r] }
  const voidAt = () => { let r = 0; for (let k = 1; k < n; k++) if (rowMin[k] < rowMin[r]) r = k; return rowMinAt[r] }
  // initial binary pattern: ~10% of cells from an integer hash (deterministic)
  let h = seed >>> 0, ones = 0
  for (let i = 0; i < size; i++) {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9 >>> 0
    if ((h >>> 8) % 10 === 0) { set(i, 1); ones++ }
  }
  // relax it into a blue-noise prototype: move the tightest cluster into the largest void until stable
  for (let guard = 0; guard < size; guard++) {
    const c = cluster(); set(c, 0)
    const v = voidAt()
    if (v === c) { set(c, 1); break }
    set(v, 1)
  }
  const rank = new Int32Array(size), proto = on.slice()
  // phase 1: peel the prototype's clusters, ranks ones-1 … 0
  need = 2
  for (let r = ones - 1; r >= 0; r--) { const c = cluster(); set(c, 0); rank[c] = r }
  // phases 2 + 3: from the prototype, fill the largest void each time (the largest void among the empty
  // cells is also the tightest cluster of empty cells, so one rule covers both halves)
  need = 1
  for (let i = 0; i < size; i++) if (proto[i]) set(i, 1)
  for (let r = 0; r < n; r++) refresh(r)
  for (let r = ones; r < size; r++) { const v = voidAt(); set(v, 1); rank[v] = r }
  const out = new Float32Array(size)
  for (let i = 0; i < size; i++) out[i] = (rank[i] + .5) / size
  return out
}

/** The 64² blue-noise threshold table (row-major, values in (0, 1), each rank exactly once). Built on first call (~20 ms). */
export const blueNoise = (): Float32Array => (table ??= voidAndCluster(N, 1.5, 0x5eed))

/** STBN threshold in [0, 1) for cell (x, y) at temporal slice `slice` (frame index). Tiles every 64 cells. */
export function stbn(x: number, y: number, slice = 0): number {
  const s = (slice * PHI) % 1, t = blueNoise()[(y & MASK) * N + (x & MASK)] + (s < 0 ? s + 1 : s)
  return t >= 1 ? t - 1 : t
}
