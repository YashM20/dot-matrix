import type { Field, GridConfig } from '../types'
import { createRaster, sample, type Raster } from '../raster/raster'

/**
 * Stitches (docs/living-matter/M-materials.md §3.1): dashes laid along a polyline in cells, their needle holes,
 * and the iso-line of a distance raster to lay them along (contour stitching). Stitches are hard on card pitch.
 */
export interface StitchOptions {
  /** Stitch length along the line, cells (default 3). */
  length?: number
  /** Gap between stitches, cells (default 2; 0 = back-stitch). */
  gap?: number
  /** Thread width, cells (default 1.2). */
  width?: number
  /** Arc length of the first stitch's start (default 0). */
  phase?: number
}
/** Stitches laid along a polyline (cells): segment endpoints, the arc length at each start, and a point/heading at any arc length. */
export interface Stitches {
  /** x0, y0, x1, y1 per stitch (the chord between the stitch's two needle holes). */
  segs: Float32Array
  /** Arc length at each stitch's start, and its arc length (`len`: `length`, the last one may be short). */
  s0: Float32Array
  len: Float32Array
  count: number
  /** Polyline length. */
  total: number
  width: number
  closed: boolean
  /** Point and heading (radians, atan2(dy, dx)) at arc length s; closed loops wrap, open lines clamp. */
  at(s: number): readonly [x: number, y: number, angle: number]
}

type P = readonly [number, number]
/** Lay stitches along `polyline` (cells). `closed` joins the last point to the first. */
export function stitch(polyline: readonly P[], o: StitchOptions = {}, closed = false): Stitches {
  const length = Math.max(1e-6, o.length ?? 3), gap = Math.max(0, o.gap ?? 2), width = o.width ?? 1.2, phase = o.phase ?? 0
  const pts = closed && polyline.length > 1 ? [...polyline, polyline[0]] : [...polyline]
  const cum = new Float64Array(pts.length)
  for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  const total = cum[pts.length - 1] ?? 0
  const at = (s: number): readonly [number, number, number] => {
    if (pts.length === 0) return [0, 0, 0]
    if (pts.length === 1) return [pts[0][0], pts[0][1], 0]
    s = closed && total > 0 ? ((s % total) + total) % total : Math.max(0, Math.min(total, s))
    let lo = 0, hi = pts.length - 1
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m }
    const a = pts[lo], b = pts[hi], seg = cum[hi] - cum[lo], f = seg > 0 ? (s - cum[lo]) / seg : 0
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, Math.atan2(b[1] - a[1], b[0] - a[0])]
  }
  const starts: number[] = [], lens: number[] = []
  const end = total
  for (let s = phase; s < end - 1e-9; s += length + gap) { starts.push(s); lens.push(Math.min(length, end - s)) }
  const count = starts.length, segs = new Float32Array(count * 4)
  for (let k = 0; k < count; k++) {
    const a = at(starts[k]), b = at(starts[k] + lens[k])
    segs[4 * k] = a[0]; segs[4 * k + 1] = a[1]; segs[4 * k + 2] = b[0]; segs[4 * k + 3] = b[1]
  }
  return { segs, s0: Float32Array.from(starts), len: Float32Array.from(lens), count, total, width, closed, at }
}

const sewn = new WeakMap<Stitches, Map<string, Field>>()
/**
 * Hard field of the stitches sewn up to arc length `upTo` (default all): 1 within width/2 of a sewn stitch, else 0.
 * A stitch is sewn once its whole length is ≤ `upTo`. Baked to a raster per stitch count (LRU of 4: the sewn length grows).
 */
export function stitchField(st: Stitches, grid: GridConfig, upTo = Infinity): Field {
  let n = 0
  while (n < st.count && st.s0[n] + st.len[n] <= upTo + 1e-9) n++
  const key = `${grid.cols}x${grid.rows}|${n}`
  let per = sewn.get(st)
  const hit = per?.get(key)
  if (hit) { per!.delete(key); per!.set(key, hit); return hit }
  const r = createRaster(grid), { cols, rows } = grid, h = st.width / 2, S = st.segs
  let c0 = cols, r0 = rows, c1 = -1, r1 = -1
  for (let k = 0; k < n; k++) {
    const ax = S[4 * k], ay = S[4 * k + 1], bx = S[4 * k + 2], by = S[4 * k + 3], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy
    const xa = Math.max(0, Math.floor(Math.min(ax, bx) - h)), xb = Math.min(cols - 1, Math.ceil(Math.max(ax, bx) + h))
    const ya = Math.max(0, Math.floor(Math.min(ay, by) - h)), yb = Math.min(rows - 1, Math.ceil(Math.max(ay, by) + h))
    for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
      const ex = ax + dx * t - x, ey = ay + dy * t - y
      if (ex * ex + ey * ey <= h * h + 1e-9) {
        r.data[y * cols + x] = 1
        if (x < c0) c0 = x; if (x > c1) c1 = x; if (y < r0) r0 = y; if (y > r1) r1 = y
      }
    }
  }
  r.bounds = c1 < 0 ? [0, 0, -1, -1] : [c0, r0, c1, r1]
  const f = sample(r)
  if (!per) sewn.set(st, (per = new Map()))
  per.set(key, f)
  if (per.size > 4) per.delete(per.keys().next().value!)
  return f
}

/** One site per stitch end (the needle holes) for stitches [from, to), for a `sites` layer. Back-stitch ends that coincide merge. */
export function stitchHoles(st: Stitches, from = 0, to = st.count): [number, number][] {
  const out: [number, number][] = [], S = st.segs
  const push = (x: number, y: number) => { const l = out[out.length - 1]; if (!l || Math.abs(l[0] - x) > 1e-3 || Math.abs(l[1] - y) > 1e-3) out.push([x, y]) }
  for (let k = Math.max(0, from); k < Math.min(st.count, to); k++) { push(S[4 * k], S[4 * k + 1]); push(S[4 * k + 2], S[4 * k + 3]) }
  return out
}

/**
 * Iso-line of a distance raster at `level` (marching squares over the cell centres, linear interpolation, saddles
 * split by the centre average), as polylines in cells: closed loops repeat no point (first ≠ last); lines that run
 * off the grid are returned open.
 */
export function contour(sdf: Raster, level: number): [number, number][][] {
  const { cols, rows } = sdf.grid, D = sdf.data
  const v = (c: number, r: number) => D[r * cols + c] - level
  // edge ids: horizontal edge (c,r)-(c+1,r) = 2·(r·cols + c), vertical edge (c,r)-(c,r+1) = 2·(r·cols + c) + 1
  const pt = new Map<number, [number, number]>(), adj = new Map<number, number[]>()
  const point = (id: number): [number, number] => {
    let p = pt.get(id)
    if (p) return p
    const cell = id >> 1, c = cell % cols, r = (cell - c) / cols, a = v(c, r)
    if ((id & 1) === 0) { const b = v(c + 1, r); p = [c + a / (a - b), r] } else { const b = v(c, r + 1); p = [c, r + a / (a - b)] }
    pt.set(id, p)
    return p
  }
  const link = (a: number, b: number) => {
    point(a); point(b)
    let la = adj.get(a); if (!la) adj.set(a, (la = [])); la.push(b)
    let lb = adj.get(b); if (!lb) adj.set(b, (lb = [])); lb.push(a)
  }
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = v(c, r), b = v(c + 1, r), d = v(c + 1, r + 1), e = v(c, r + 1)
    const k = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (d < 0 ? 4 : 0) | (e < 0 ? 8 : 0)
    if (k === 0 || k === 15) continue
    const top = 2 * (r * cols + c), bottom = 2 * ((r + 1) * cols + c), left = 2 * (r * cols + c) + 1, right = 2 * (r * cols + c + 1) + 1
    switch (k) {
      case 1: case 14: link(top, left); break
      case 2: case 13: link(top, right); break
      case 4: case 11: link(right, bottom); break
      case 8: case 7: link(bottom, left); break
      case 3: case 12: link(left, right); break
      case 6: case 9: link(top, bottom); break
      case 5: case 10: {
        const inside = (a + b + d + e) / 4 < 0
        // 5: a and d inside
        if ((k === 5) === inside) { link(top, right); link(bottom, left) } else { link(top, left); link(right, bottom) }
        break
      }
    }
  }
  const seen = new Set<string>(), out: [number, number][][] = []
  const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)
  const walk = (start: number) => {
    const line: [number, number][] = [point(start)]
    let prev = -1, cur = start
    for (;;) {
      const next = (adj.get(cur) ?? []).find(n => n !== prev && !seen.has(edgeKey(cur, n))) ?? (adj.get(cur) ?? []).find(n => !seen.has(edgeKey(cur, n)))
      if (next === undefined) break
      seen.add(edgeKey(cur, next))
      if (next === start) return { line, closed: true }
      line.push(point(next)); prev = cur; cur = next
    }
    return { line, closed: false }
  }
  // open lines first (start at an end: an edge on the grid border has one neighbour), then the loops
  for (const [id, n] of adj) if (n.length === 1 && !seen.has(edgeKey(id, n[0]))) out.push(walk(id).line)
  for (const [id, n] of adj) if (n.some(m => !seen.has(edgeKey(id, m)))) { const w = walk(id); if (w.line.length > 1) out.push(w.line) }
  return out
}
