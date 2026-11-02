/**
 * More cellular noise (IQ5, #66): the cell border with its normal (`voronoiEdge2`), smooth Voronoi in its
 * exponential and power-sum forms (`smoothVoronoi2`, `smoothVoronoiPow2`), and Voronoise (`voronoise2`), which
 * blends cell noise, noise and Voronoi through a jitter u and a metric v.
 *
 * All of them use voronoi.ts's feature points (one per lattice cell at cell + jitter·(h & 0xffff, h >>> 16)/65536,
 * h = ihash(cx, cy, seed)), so at the same seed and jitter they line up with `voronoi2`. They scan the 5×5 cells
 * around floor(p), which holds the exact nearest point (voronoi.ts's search argument) and every point within 2 of p.
 * Deterministic math only (`dexp`, `dlog`, `dpow`), so the bits match in every JS engine.
 */
import { dexp, dlog, dpow } from './dmath'
import { fmix32, IH_A, IH_B, IH_C, ihash } from './hash'
import { voronoi2, type VoronoiOut } from './voronoi'

const Q16 = 1 / 65536, U32 = 1 / 4294967296, LN2 = Math.LN2, INV_LN2 = 1 / Math.LN2
/** voronoi.ts's salt for the cell id, so `nid` here is the id `voronoi2` reports for that cell. */
const ID_SALT = 0x68e31da4
/** Salt for the per-cell value Voronoise blends (independent of the point's position in its cell). */
const VALUE_SALT = 0x1b873593
/** Voronoise's reach, squared: a point 1.414 or more away gets weight 0. */
const R2 = 1.414 * 1.414

export interface VoronoiEdgeOut {
  /** Exact distance to the nearest border of the cell p lies in (lattice units, ≥ 0). Equals `voronoiBorder2`. */
  d: number
  /** The nearest feature point and its cell id (as `voronoi2`). */
  x: number; y: number; id: number
  /** Unit normal of the nearest border, pointing out of p's cell into the neighbour's: bevels and lit grout. */
  nx: number; ny: number
  /** Cell id of the neighbour across that border. */
  nid: number
}
const edgeScratch: VoronoiEdgeOut = { d: 0, x: 0, y: 0, id: 0, nx: 0, ny: 0, nid: 0 }
const vor: VoronoiOut = { f1: 0, f2: 0, id: 0, x: 0, y: 0 }

// after Inigo Quilez, https://iquilezles.org/articles/voronoilines/ (MIT)
/**
 * The article's two-pass `voronoiDistance`, which also reports which border is nearest. Pass 1 finds the nearest
 * feature point a exactly (`voronoi2`). Pass 2 centres a 5×5 scan on a's cell and takes, for every other point b,
 * the distance to their bisector, dot((a + b)/2 − p, normalize(b − a)); the smallest one is the border. Centring on
 * a's cell (not p's) is what keeps the lines even near the corners where three cells meet. Writes into `out`
 * (default: a module scratch, valid until the next call). `jitter` ∈ [0, 1] as `voronoi2`.
 */
export function voronoiEdge2(x: number, y: number, seed = 0, jitter = 1, out: VoronoiEdgeOut = edgeScratch): VoronoiEdgeOut {
  voronoi2(x, y, seed, 'l2', vor, jitter)
  // the point's cell: ci + jitter·k/65536 with k < 65536 stays below ci + 1, so floor gives ci back
  const ax = vor.x - x, ay = vor.y - y, ci = Math.floor(vor.x), cj = Math.floor(vor.y)
  const sc = Math.imul(seed, IH_C), a0 = Math.imul(ci, IH_A), b0 = Math.imul(cj, IH_B)
  let md = Infinity, nx = 0, ny = 0, ni = ci, nj = cj
  // the inner 3×3 first (pass 0), then the ±2 ring (pass 1), so the bound below skips most of the ring
  for (let pass = 0; pass < 2; pass++) for (let j = pass ? -2 : -1; j <= (pass ? 2 : 1); j++) {
    const qj = cj + j, hb = ((b0 + j * IH_B) | 0) ^ sc, row = j === -2 || j === 2
    for (let i = pass ? -2 : -1, step = pass && !row ? 4 : 1; i <= (pass ? 2 : 1); i += step) {
      if (i === 0 && j === 0) continue
      // h = ihash(qi, qj, seed), inlined
      const qi = ci + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb)
      const rx = qi + jitter * (h & 0xffff) * Q16 - x, ry = qj + jitter * (h >>> 16) * Q16 - y
      const ex = rx - ax, ey = ry - ay, l2 = ex * ex + ey * ey
      if (l2 === 0) continue
      // d = num / √l2: skip without the root when d is clearly ≥ md (the margin sends a near-tie down the slow path)
      const num = .5 * (ax + rx) * ex + .5 * (ay + ry) * ey
      if (num > 0 && num * num > md * md * l2 * (1 + 1e-9)) continue
      const l = Math.sqrt(l2), d = num / l
      if (d < md) { md = d; nx = ex / l; ny = ey / l; ni = qi; nj = qj }
    }
  }
  out.d = md > 0 ? md : 0; out.x = vor.x; out.y = vor.y; out.id = vor.id
  out.nx = nx; out.ny = ny; out.nid = ihash(ni, nj, seed ^ ID_SALT)
  return out
}

/** Squared L2 distances to the 25 feature points around p (row order), and the smallest of them. */
const D2 = new Float64Array(25)
function gather(x: number, y: number, seed: number, jitter: number): number {
  const cx = Math.floor(x), cy = Math.floor(y), sc = Math.imul(seed, IH_C), a0 = Math.imul(cx, IH_A), b0 = Math.imul(cy, IH_B)
  let m = Infinity, k = 0
  for (let j = -2; j <= 2; j++) {
    const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc
    for (let i = -2; i <= 2; i++) {
      // h = ihash(cx + i, cy + j, seed), inlined as voronoi.ts does
      const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
      const dx = px - x, dy = py - y, d = dx * dx + dy * dy
      D2[k++] = d
      if (d < m) m = d
    }
  }
  return m
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothvoronoi/ (MIT)
/**
 * Smooth Voronoi, exponential form: −s·log2 Σ 2^(−dᵢ/s) over the feature distances dᵢ, a smooth F1 with no creases
 * where cells meet. `smoothness` s is the article's 1/falloff (default 1/32, its value). Summed relative to the
 * nearest distance (m − s·log2 Σ 2^(−(dᵢ − m)/s), the same value) so a small s can't underflow; terms more than
 * 40 halvings below the nearest one are skipped (that moves the result by < 1e-10·s). Bounds: F1 − s·log2 25 ≤ result ≤ F1, and s ≤ 0 returns F1 exactly
 * (=== voronoi2(…).f1). Order-independent, as the article notes for the exponential and power forms.
 */
export function smoothVoronoi2(x: number, y: number, seed = 0, smoothness = 1 / 32, jitter = 1): number {
  const m = Math.sqrt(gather(x, y, seed, jitter))
  if (!(smoothness > 0)) return m
  const inv = 1 / smoothness, cut = m + 40 * smoothness, cut2 = cut * cut
  let sum = 0
  for (let k = 0; k < 25; k++) if (D2[k] < cut2) sum += dexp(-(Math.sqrt(D2[k]) - m) * inv * LN2)
  return m - smoothness * dlog(sum) * INV_LN2
}

// after Inigo Quilez, https://iquilezles.org/articles/smoothvoronoi/ (MIT)
/**
 * Smooth Voronoi, power-sum form: (Σ dᵢ^−2n)^(−1/2n) with n = 1/(2s). `smoothness` s defaults to 1/16, the article's
 * pow(d², 8) and 1/16 root (n = 8, an integer, so dpow takes its exact repeated-multiplication path). Summed as
 * F1·(Σ (F1²/dᵢ²)ⁿ)^(−s), the same value without the overflow of dᵢ^−16 near a point. Bounds:
 * F1·25^(−s) ≤ result ≤ F1, and s ≤ 0 returns F1 exactly. Cheaper than the exponential form at integer n, softer
 * near the points (the blend is relative, not absolute). Terms below 2^−40 of the nearest one are skipped
 * (relative change < 1e-10·s).
 */
export function smoothVoronoiPow2(x: number, y: number, seed = 0, smoothness = 1 / 16, jitter = 1): number {
  const m2 = gather(x, y, seed, jitter), m = Math.sqrt(m2)
  if (!(smoothness > 0) || m2 === 0) return m
  const n = .5 / smoothness, cut = dexp(-80 * smoothness * LN2) // (m²/d²)ⁿ < 2^−40 ⇔ m²/d² < 2^(−80s)
  // an integer n ≤ 64 runs dpow's own multiplication path inline (same bits, no call)
  const ni = n <= 64 && Math.floor(n) === n ? n : 0
  let sum = 0
  for (let k = 0; k < 25; k++) {
    if (!(m2 >= cut * D2[k])) continue
    const q = m2 / D2[k]
    if (ni) { let r = q; for (let i = 1; i < ni; i++) r *= q; sum += r } else sum += dpow(q, n)
  }
  return m * dpow(sum, -smoothness)
}

/** The per-cell value Voronoise blends, in [0, 1): ihash(i, j, seed ^ salt) / 2³². Cell (i, j) is the integer lattice cell. */
export const cellValue2 = (i: number, j: number, seed = 0): number => ihash(i, j, seed ^ VALUE_SALT) * U32

// after Inigo Quilez, https://iquilezles.org/articles/voronoise/ (MIT)
/**
 * Voronoise in [0, 1): one pattern that is cell noise at (u, v) = (0, 0), noise at (0, 1), Voronoi at (1, 0) and
 * the article's "Voronoise" at (1, 1). u jitters the feature points (0 = the lattice corners, 1 = voronoi2's points);
 * v sets the metric: each point's value `cellValue2` is weighted by (1 − smoothstep(0, 1.414, dᵢ))^k with
 * k = 1 + 63·(1 − v)⁴, so k = 64 picks the nearest point (a min) and k = 1 averages them (an interpolation). It scans 25
 * cells a sample, but only the points within 1.414 (about six) get a weight; at fractional k each weight is a
 * dexp/dlog pair, so this is the slowest noise here, as the article warns.
 */
export function voronoise2(x: number, y: number, u: number, v: number, seed = 0): number {
  const w1 = 1 - v, k = 1 + 63 * (w1 * w1 * w1 * w1)
  const cx = Math.floor(x), cy = Math.floor(y), sc = Math.imul(seed, IH_C), a0 = Math.imul(cx, IH_A), b0 = Math.imul(cy, IH_B)
  let va = 0, wt = 0, near = Infinity, ni = 0, nj = 0
  for (let j = -2; j <= 2; j++) {
    const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc
    for (let i = -2; i <= 2; i++) {
      const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + u * (h & 0xffff) * Q16, py = cj + u * (h >>> 16) * Q16
      const dx = px - x, dy = py - y, d2 = dx * dx + dy * dy
      if (d2 < near) { near = d2; ni = ci; nj = cj }
      if (d2 >= R2) continue // its weight (1 − 1)^k is 0
      const t = Math.sqrt(d2) / 1.414, s = t < 1 ? t * t * (3 - 2 * t) : 1, w = dpow(1 - s, k)
      va += w * cellValue2(ci, cj, seed); wt += w
    }
  }
  // every weight is 0 only when no point is within 1.414 (possible by a hair: the own cell's point is within √2)
  return wt > 0 ? va / wt : cellValue2(ni, nj, seed)
}
