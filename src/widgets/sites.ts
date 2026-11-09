/**
 * Site-list helpers behind `layoutFor` (src/widgets/types.ts): the gap between dots, paths resampled by arc
 * length, coarse fills and single peak dots. They keep one rule: a dot never touches its neighbour.
 * A site dot of size `s` is about 0.84·s card cells across at full value (`tileStyle`), so a size of at most
 * 0.8 of the spacing always leaves a gap.
 */
import { latticeGrid } from '../engine/sampler/gridSampler'
import type { Field, GridConfig } from '../engine/types'
import type { LatticeField } from './types'

type Pt = [number, number]
/** The largest site size, as a share of the distance between site centres, that still shows a gap. */
export const GAP = .8
/** `size` clamped so dots `spacing` cells apart never touch. */
export const capSize = (size: number, spacing: number) => Math.min(size, spacing * GAP)

/** Bucket key of a point on a `d`-cell hash grid (cells offset so negative coordinates stay unique). */
const bucket = (x: number, y: number, d: number) => (Math.floor(x / d) + 4096) * 16384 + Math.floor(y / d) + 4096
/** Each point's distance to its nearest neighbour in `points`, capped at `reach` (points further apart read as `reach`). */
export function nearest(points: readonly Pt[], reach: number): Float64Array {
  const out = new Float64Array(points.length).fill(reach), grid = new Map<number, number[]>()
  points.forEach(([x, y], i) => { const k = bucket(x, y, reach), b = grid.get(k); if (b) b.push(i); else grid.set(k, [i]) })
  points.forEach(([x, y], i) => {
    const bx = Math.floor(x / reach), by = Math.floor(y / reach)
    for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
      for (const n of grid.get((bx + j + 4096) * 16384 + by + k + 4096) ?? []) {
        if (n === i) continue
        const d = Math.hypot(points[n][0] - x, points[n][1] - y)
        if (d < out[i]) out[i] = d
      }
    }
  })
  return out
}

/**
 * The points with none closer than `d` cells to a point kept before it (first come, first kept). Sites a path or a
 * few joined arcs put on top of each other collapse to one. Returns `points` itself when nothing is dropped.
 */
export function minGap(points: Pt[], d: number): Pt[] {
  if (!(d > 0) || points.length < 2) return points
  const d2 = d * d, kept: Pt[] = []
  if (points.length <= 48) {
    for (const p of points) if (!kept.some(q => (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < d2)) kept.push(p)
    return kept.length === points.length ? points : kept
  }
  const grid = new Map<number, Pt[]>()
  for (const p of points) {
    const [x, y] = p
    if (!Number.isFinite(x) || !Number.isFinite(y)) { kept.push(p); continue }
    const bx = Math.floor(x / d), by = Math.floor(y / d)
    let near = false
    for (let j = -1; j <= 1 && !near; j++) for (let k = -1; k <= 1 && !near; k++)
      near = grid.get((bx + j + 4096) * 16384 + by + k + 4096)?.some(q => (q[0] - x) ** 2 + (q[1] - y) ** 2 < d2) ?? false
    if (near) continue
    kept.push(p)
    const key = bucket(x, y, d), b = grid.get(key)
    if (b) b.push(p); else grid.set(key, [p])
  }
  return kept.length === points.length ? points : kept
}

/**
 * Evenly spaced points along a polyline, `spacing` cells apart, measured by arc length: the spacing carries across
 * vertices, so corners and the joins between arcs don't bunch up. `closed` runs back to the first point and drops a
 * last site that would sit on top of the first.
 */
export function trace(pts: readonly Pt[], spacing: number, closed = false): Pt[] {
  if (!pts.length) return []
  const p = closed ? [...pts, pts[0]] : pts, out: Pt[] = [[p[0][0], p[0][1]]]
  let carry = 0
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i], [x1, y1] = p[i + 1], len = Math.hypot(x1 - x0, y1 - y0)
    if (!len) continue
    let d = spacing - carry
    for (; d <= len + 1e-9; d += spacing) out.push([x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len])
    carry = len - (d - spacing)
  }
  if (closed && out.length > 2 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < spacing / 2) out.pop()
  return out
}

/** A shape test in card cells: true where the shape covers the point. */
export type Inside = (x: number, y: number) => boolean
/**
 * A filled shape as a few big dots `k` cells apart instead of the card's fine grid: `inside` is tested at each dot
 * centre (card cells) of a square lattice centred on `box` [x0, y0, x1, y1]. Use k = 2 for shapes up to about 16 cells
 * across and k = 3 above that. Two fills with the same `k` and `box` put their dots on the same sites, and the later
 * layer wins a shared site, so a glyph on a button is its own fill in another tone. `size` defaults to 0.8 × k.
 */
export function fillOn(k: number, inside: Inside, box: readonly [number, number, number, number], size = GAP * k): LatticeField {
  const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
  const nx = Math.floor((x1 - x0) / 2 / k + 1e-9), ny = Math.floor((y1 - y0) / 2 / k + 1e-9), sites: Pt[] = []
  for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) if (inside(cx + i * k, cy + j * k)) sites.push([cx + i * k, cy + j * k])
  return { field: () => 1, sites, size: capSize(size, k) }
}

/**
 * A filled triangle pointing left or right (play, prev, next) as hex-packed dots `k` cells apart: the tip dot at
 * (x, y), then columns of 2, 3 … `n` dots k·√3/2 apart, so every neighbour sits exactly `k` away. `bar` adds a column of
 * `n` dots `k` beyond the tip (the skip glyphs |◀ and ▶|). `size` defaults to 0.8 × k.
 */
export function dotTri(x: number, y: number, n: number, { k = 2.2, dir = 'right', bar = false, size = GAP * k }: { k?: number; dir?: 'left' | 'right'; bar?: boolean; size?: number } = {}): LatticeField {
  const s = dir === 'right' ? -1 : 1, dx = (k * Math.sqrt(3)) / 2, sites: Pt[] = []
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) sites.push([x + s * i * dx, y + (j - i / 2) * k])
  if (bar) for (let j = 0; j < n; j++) sites.push([x - s * k, y + (j - (n - 1) / 2) * k])
  return { field: () => 1, sites, size: capSize(size, k) }
}

/**
 * The bright core of a field on a `k`-cell lattice (origin `origin`, card cells), as one dot: the cells at or above
 * `top` of the field's peak (and above `from`) become one site at their centroid, sized to their area. `cut` wraps any
 * field on the same lattice so it draws nothing under that dot. No cell above `from`: no dot, and `cut` is the identity.
 */
export function peakOn(grid: GridConfig, k: number, origin: Pt, field: Field, { from = 0, top = .8, max = 4 }: { from?: number; top?: number; max?: number } = {}) {
  const sub = latticeGrid(grid, k, origin), b = field.bounds
  const c0 = b ? Math.max(0, Math.floor(b[0])) : 0, r0 = b ? Math.max(0, Math.floor(b[1])) : 0
  const c1 = b ? Math.min(sub.cols - 1, Math.ceil(b[2])) : sub.cols - 1, r1 = b ? Math.min(sub.rows - 1, Math.ceil(b[3])) : sub.rows - 1
  // one scan: the window's values, then the peak and the centroid of the cells near it
  const w = Math.max(0, c1 - c0 + 1), h = Math.max(0, r1 - r0 + 1), vals = new Float32Array(w * h)
  let peak = from
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const s = field(sub.cols === 1 ? .5 : c / (sub.cols - 1), sub.rows === 1 ? .5 : r / (sub.rows - 1))
    vals[(r - r0) * w + c - c0] = s
    if (s > peak) peak = s
  }
  if (peak <= from) return { dot: undefined, cut: (f: Field) => f }
  const floor = Math.max(from, peak * top)
  let n = 0, sx = 0, sy = 0
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (vals[(r - r0) * w + c - c0] >= floor) { n++; sx += c; sy += r }
  const ci = sx / n, ri = sy / n, x = origin[0] + (ci + .5) * k - .5, y = origin[1] + (ri + .5) * k - .5
  // an equal-area circle, one lattice dot at least, `max` lattice dots at most
  const across = Math.min(max * k, Math.max(1.2 * k, 2 * k * Math.sqrt(n / Math.PI))), size = across / .84, clear = across / 2 / k + .5
  const dot: LatticeField = { field: () => 1, sites: [[x, y]], size }
  const cut = (f: Field): Field => {
    const g: Field = (u, v) => Math.hypot(u * (sub.cols - 1) - ci, v * (sub.rows - 1) - ri) < clear ? 0 : f(u, v)
    g.bounds = f.bounds
    return g
  }
  return { dot, cut }
}
