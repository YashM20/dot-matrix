/**
 * Read-outs of a Turing skin state (turing.ts) for drawing and checks: v at a body point (bilinear on the material
 * grid), and the spots (4-connected cells with v ≥ SPOT_V, labelled over the grid), each with its centre, size and
 * elongation measured in the water (cells scaled by the current growth). A spot stretched past SPLIT is dividing:
 * Gray-Scott spots lengthen into a peanut and pinch in two. Module scratch, no allocation per call beyond the list.
 */
import { SKIN_NX, SKIN_NY, type Turing } from './turing'

/** v at or above this is spot. */
export const SPOT_V = .2
/** A spot whose long axis is this many times its short one is splitting. */
export const SPLIT = 1.65
/** Spots smaller than this many cells are noise (a seed fading, a sliver). */
const MIN_CELLS = 3

/** v at material (ξ, η) (ξ ∈ [0, 1] snout to tail root, η ∈ [−1, 1]); 0 off the grid. */
export function skinV(t: Turing, s: Float32Array, x: number, y: number): number {
  const fx = x * SKIN_NX - .5, fy = ((y + 1) / 2) * SKIN_NY - .5
  const i = Math.floor(fx), j = Math.floor(fy)
  if (i < 0 || j < 0 || i >= SKIN_NX - 1 || j >= SKIN_NY - 1) return 0
  const a = fx - i, b = fy - j, o = t.layout.V + j * SKIN_NX + i
  return (s[o] * (1 - a) + s[o + 1] * a) * (1 - b) + (s[o + SKIN_NX] * (1 - a) + s[o + SKIN_NX + 1] * a) * b
}

export interface Spot { cells: number; x: number; y: number; elong: number; label: number }
export interface SpotMap { spots: Spot[]; label: Int32Array; splitting: number }

let lab: Int32Array | undefined, stack: Int32Array | undefined
/**
 * The spots of state `s` with the body at cell size (lx, ly) (growth's fractions; only their ratio matters):
 * centre in material cells, size in cells, elongation (√ of the covariance's eigenvalue ratio, in the water).
 * `label[c]` is the spot index of cell c (−1: none); `splitting` the index of the most elongated spot past SPLIT, or −1.
 */
export function turingSpots(t: Turing, s: Float32Array, lx = 1, ly = 1): SpotMap {
  const { n, V } = t.layout, nx = SKIN_NX, mask = t.skin.mask
  if (!lab || lab.length !== n) { lab = new Int32Array(n); stack = new Int32Array(n) }
  const st = stack!
  lab.fill(-1)
  const spots: Spot[] = []
  let splitting = -1, most = SPLIT
  for (let c0 = 0; c0 < n; c0++) {
    if (lab[c0] !== -1 || !mask[c0] || s[V + c0] < SPOT_V) continue
    const id = spots.length
    let top = 0, m = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0
    st[top++] = c0; lab[c0] = id
    while (top) {
      const c = st[--top], i = c % nx, j = (c / nx) | 0, x = i * lx, y = j * ly
      m++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y
      for (let k = 0; k < 4; k++) {
        const q = k === 0 ? (i + 1 < nx ? c + 1 : -1) : k === 1 ? (i > 0 ? c - 1 : -1) : k === 2 ? (j + 1 < SKIN_NY ? c + nx : -1) : j > 0 ? c - nx : -1
        if (q >= 0 && lab[q] === -1 && mask[q] && s[V + q] >= SPOT_V) { lab[q] = id; st[top++] = q }
      }
    }
    if (m < MIN_CELLS) { spots.push({ cells: m, x: -1, y: -1, elong: 0, label: id }); continue }
    const mx = sx / m, my = sy / m, a = sxx / m - mx * mx + lx * lx / 12, d = syy / m - my * my + ly * ly / 12, b = sxy / m - mx * my
    const tr = (a + d) / 2, det = Math.sqrt(Math.max(0, ((a - d) / 2) ** 2 + b * b)), elong = Math.sqrt((tr + det) / Math.max(1e-9, tr - det))
    spots.push({ cells: m, x: mx / lx, y: my / ly, elong, label: id })
    if (elong > most) { most = elong; splitting = id }
  }
  return { spots, label: lab, splitting }
}

/** Spots big enough to count. */
export const spotCount = (m: SpotMap) => m.spots.filter(p => p.cells >= MIN_CELLS).length
