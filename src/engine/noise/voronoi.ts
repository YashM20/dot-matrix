/**
 * Worley / Voronoi noise: F1, F2, the nearest cell's id and feature point, in three metrics, plus the exact
 * distance to the nearest cell border (iq 2012).
 *
 * One feature point per lattice cell at cell + jitter·(h & 0xffff, h >>> 16)/65536 with h = ihash(cx, cy, seed):
 * 16-bit coordinates are exact in float32, so the GPU (noise/glsl.ts) sees the same points.
 *
 * Neighbourhood search (exact, with an early out): scan the 3×3 cells around floor(p); if the wanted distance
 * (F1, or F2 when the caller reads it) is still > 1, also scan the 16-cell ring at offset ±2. Ring points are
 * always more than 1 away along one axis (and L1, L2, L∞ are all ≥ the per-axis distance); points beyond the ring
 * are more than 2 away. So F1 is exact in all three metrics (the own cell's point is within 1 / √2 / 2), F2 is
 * exact for L2 (a second point within 1.80) and L∞ (within 2), and L1's F2 can be wrong only when it exceeds 2
 * (rate measured in scripts/noise.ts). Ties keep the first-scanned cell (fixed scan order, rows then columns).
 */
import { fmix32, IH_A, IH_B, IH_C, ihash } from './hash'

export type Metric = 'l2' | 'l1' | 'linf'
export interface VoronoiOut {
  /** Nearest and second-nearest feature distance in `metric` (lattice units). */
  f1: number; f2: number
  /** uint32 id of the nearest cell (ihash of its lattice cell): stable per cell, use for per-pane tone/colour role. */
  id: number
  /** Nearest feature point (lattice units): stained-glass pane centres, terrazzo chip centres. */
  x: number; y: number
}
const scratch: VoronoiOut = { f1: 0, f2: 0, id: 0, x: 0, y: 0 }
const Q16 = 1 / 65536
/** Salt for the cell id, so it is independent of the feature point's position inside its cell. */
const ID_SALT = 0x68e31da4
const metricIndex = (m: Metric | undefined) => (m === 'l1' ? 1 : m === 'linf' ? 2 : 0)

/** Search result (module scratch, no allocation per call): f1, f2, nearest point x, y, its cell i, j. */
const S = new Float64Array(6)
/*
 * The exact F1 (and F2 when `want` = 2) search, one copy per metric (a per-cell metric switch costs ~15%).
 * Pass 0: the 3×3 block in row order. Pass 1, only while the wanted distance is > 1 (squared L2 > 1 ⇔ L2 > 1):
 * the ±2 ring in row order, skipping a ring cell whose points are ≥ lx, ly away per axis when that bound can't beat
 * the wanted distance (same result as scanning it: only a strictly nearer point updates f1/f2). `h` is
 * ihash(cx + i, cy + j, seed), inlined. noise/glsl.ts mirrors the scan order, so ties resolve the same way.
 */
/** The exact search in L2 (compared squared; the square root is taken once at the end). */
function search0(x: number, y: number, seed: number, want: 1 | 2, jitter: number): void {
  const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy, sc = Math.imul(seed, IH_C), a0 = Math.imul(cx, IH_A), b0 = Math.imul(cy, IH_B)
  let f1 = Infinity, f2 = Infinity, bx = 0, by = 0, bi = 0, bj = 0
  for (let j = -1; j <= 1; j++) {
    const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc
    for (let i = -1; i <= 1; i++) {
      const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
      const dx = px - x, dy = py - y, d = dx * dx + dy * dy
      if (d < f1) { f2 = f1; f1 = d; bx = px; by = py; bi = ci; bj = cj } else if (d < f2) f2 = d
    }
  }
  if ((want === 1 ? f1 : f2) > 1) {
    for (let j = -2; j <= 2; j++) {
      const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc, ly = j === 2 ? 2 - fy : j === -2 ? 1 + fy : 0, edge = j === -2 || j === 2
      for (let i = -2; i <= 2; i++) {
        if (!edge && i > -2 && i < 2) continue
        const lx = i === 2 ? 2 - fx : i === -2 ? 1 + fx : 0, lb = lx * lx + ly * ly
        if (!(lb < (want === 1 ? f1 : f2))) continue
        const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
        const dx = px - x, dy = py - y, d = dx * dx + dy * dy
        if (d < f1) { f2 = f1; f1 = d; bx = px; by = py; bi = ci; bj = cj } else if (d < f2) f2 = d
      }
    }
  }
  S[0] = Math.sqrt(f1); S[1] = Math.sqrt(f2); S[2] = bx; S[3] = by; S[4] = bi; S[5] = bj
}

/** The exact search in L1. */
function search1(x: number, y: number, seed: number, want: 1 | 2, jitter: number): void {
  const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy, sc = Math.imul(seed, IH_C), a0 = Math.imul(cx, IH_A), b0 = Math.imul(cy, IH_B)
  let f1 = Infinity, f2 = Infinity, bx = 0, by = 0, bi = 0, bj = 0
  for (let j = -1; j <= 1; j++) {
    const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc
    for (let i = -1; i <= 1; i++) {
      const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
      const dx = px - x, dy = py - y, d = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy)
      if (d < f1) { f2 = f1; f1 = d; bx = px; by = py; bi = ci; bj = cj } else if (d < f2) f2 = d
    }
  }
  if ((want === 1 ? f1 : f2) > 1) {
    for (let j = -2; j <= 2; j++) {
      const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc, ly = j === 2 ? 2 - fy : j === -2 ? 1 + fy : 0, edge = j === -2 || j === 2
      for (let i = -2; i <= 2; i++) {
        if (!edge && i > -2 && i < 2) continue
        const lx = i === 2 ? 2 - fx : i === -2 ? 1 + fx : 0, lb = lx + ly
        if (!(lb < (want === 1 ? f1 : f2))) continue
        const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
        const dx = px - x, dy = py - y, d = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy)
        if (d < f1) { f2 = f1; f1 = d; bx = px; by = py; bi = ci; bj = cj } else if (d < f2) f2 = d
      }
    }
  }
  S[0] = f1; S[1] = f2; S[2] = bx; S[3] = by; S[4] = bi; S[5] = bj
}

/** The exact search in L∞. */
function search2(x: number, y: number, seed: number, want: 1 | 2, jitter: number): void {
  const cx = Math.floor(x), cy = Math.floor(y), fx = x - cx, fy = y - cy, sc = Math.imul(seed, IH_C), a0 = Math.imul(cx, IH_A), b0 = Math.imul(cy, IH_B)
  let f1 = Infinity, f2 = Infinity, bx = 0, by = 0, bi = 0, bj = 0
  for (let j = -1; j <= 1; j++) {
    const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc
    for (let i = -1; i <= 1; i++) {
      const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
      const dx = px - x, dy = py - y, ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy, d = ax > ay ? ax : ay
      if (d < f1) { f2 = f1; f1 = d; bx = px; by = py; bi = ci; bj = cj } else if (d < f2) f2 = d
    }
  }
  if ((want === 1 ? f1 : f2) > 1) {
    for (let j = -2; j <= 2; j++) {
      const cj = cy + j, hb = ((b0 + j * IH_B) | 0) ^ sc, ly = j === 2 ? 2 - fy : j === -2 ? 1 + fy : 0, edge = j === -2 || j === 2
      for (let i = -2; i <= 2; i++) {
        if (!edge && i > -2 && i < 2) continue
        const lx = i === 2 ? 2 - fx : i === -2 ? 1 + fx : 0, lb = lx > ly ? lx : ly
        if (!(lb < (want === 1 ? f1 : f2))) continue
        const ci = cx + i, h = fmix32(((a0 + i * IH_A) | 0) ^ hb), px = ci + jitter * (h & 0xffff) * Q16, py = cj + jitter * (h >>> 16) * Q16
        const dx = px - x, dy = py - y, ax = dx < 0 ? -dx : dx, ay = dy < 0 ? -dy : dy, d = ax > ay ? ax : ay
        if (d < f1) { f2 = f1; f1 = d; bx = px; by = py; bi = ci; bj = cj } else if (d < f2) f2 = d
      }
    }
  }
  S[0] = f1; S[1] = f2; S[2] = bx; S[3] = by; S[4] = bi; S[5] = bj
}
const search = (x: number, y: number, seed: number, metric: number, want: 1 | 2, jitter: number) =>
  metric === 0 ? search0(x, y, seed, want, jitter) : metric === 1 ? search1(x, y, seed, want, jitter) : search2(x, y, seed, want, jitter)

/**
 * Worley F1/F2, the nearest cell's id and feature point. Writes into `out` (default: a module scratch
 * object, valid until the next call). Default metric 'l2', jitter 1 (0 = a regular grid of points).
 */
export function voronoi2(x: number, y: number, seed = 0, metric: Metric = 'l2', out: VoronoiOut = scratch, jitter = 1): VoronoiOut {
  search(x, y, seed, metricIndex(metric), 2, jitter)
  out.f1 = S[0]; out.f2 = S[1]; out.x = S[2]; out.y = S[3]; out.id = ihash(S[4], S[5], seed ^ ID_SALT)
  return out
}

/**
 * The IR builtin `voronoi(x, y, seed, mode)`: mode = metric·4 + out (floored, clamped to 0..11), metric 0 l2,
 * 1 l1, 2 linf; out 0 f1, 1 f2, 2 f2 − f1, 3 id/2³². F1 and the id only need the F1 search (no early F2 ring).
 */
export function voronoiMode(x: number, y: number, seed: number, mode: number): number {
  const k = mode >= 0 ? (mode < 11 ? Math.floor(mode) : 11) : 0, metric = k >> 2, o = k & 3
  search(x, y, seed, metric > 2 ? 2 : metric, o === 0 || o === 3 ? 1 : 2, 1)
  return o === 0 ? S[0] : o === 1 ? S[1] : o === 2 ? S[1] - S[0] : ihash(S[4], S[5], seed ^ ID_SALT) / 4294967296
}

/**
 * Exact distance to the nearest cell border (iq 2012, two passes, L2 only): lead moats and grout of even width.
 * Pass 1 finds the nearest feature point exactly; pass 2 takes, over the 5×5 cells around its cell, the distance
 * to each bisector plane: dot((a + b)/2 − p, normalize(b − a)) for a = nearest, b = the other point.
 */
export function voronoiBorder2(x: number, y: number, seed = 0, jitter = 1): number {
  search(x, y, seed, 0, 1, jitter)
  const ax = S[2] - x, ay = S[3] - y, ci = S[4], cj = S[5]
  let md = Infinity
  for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) {
    if (i === 0 && j === 0) continue
    const qi = ci + i, qj = cj + j, h = ihash(qi, qj, seed)
    const rx = qi + jitter * (h & 0xffff) * Q16 - x, ry = qj + jitter * (h >>> 16) * Q16 - y
    const ex = rx - ax, ey = ry - ay, l = Math.sqrt(ex * ex + ey * ey)
    if (l === 0) continue
    const d = (.5 * (ax + rx) * ex + .5 * (ay + ry) * ey) / l
    if (d < md) md = d
  }
  return md > 0 ? md : 0
}
