/**
 * Weighted Voronoi stippling (Secord, "Weighted Voronoi Stippling", NPAR 2002).
 *
 * `n` stipples are scattered over a density raster by rejection sampling, then Lloyd-relaxed: each
 * iteration assigns every pixel to its nearest stipple (a discrete Voronoi diagram) and moves each
 * stipple to the density-weighted centroid of its cell. The stipples converge to a centroidal Voronoi
 * tessellation of the density, which is blue noise whose local spacing follows the image: tone comes
 * from where dots are, never from how big they are, so the result is a natural `sites` layer.
 *
 * Deterministic (mulberry32 from `seed`, no ambient randomness). Iterations are computed lazily and
 * cached, so asking for iteration k costs the iterations not yet run and nothing after that.
 * Nearest-site search uses a uniform bucket grid (CSR, rebuilt per iteration) with an expanding ring
 * search, so an iteration is O(pixels × sites per bucket), not O(pixels × n).
 */
import { mulberry32 } from '../sampler/jitter'

export interface StippleSpec {
  /** Density raster size in pixels (positions are returned in the same pixel space, centres at i + .5). */
  w: number
  h: number
  /** Density at pixel centre (x, y), in [0, 1]. Evaluated once per pixel. */
  density: (x: number, y: number) => number
  /** Number of stipples. */
  n: number
  seed?: number
  /** Lloyd iterations available (default 40). */
  iterations?: number
  /** Iterations solved with the exact bucket search before the Voronoi walk takes over (default 3; Infinity = all). */
  exact?: number
}
export interface Stipple {
  readonly w: number
  readonly h: number
  readonly n: number
  readonly iterations: number
  /** The density raster (row-major, w × h). */
  readonly rho: Float32Array
  /** Stipple positions after `k` Lloyd iterations (0 = the rejection-sampled start), interleaved x, y. Owned by the cache: read, don't write. */
  frame(k: number): Float32Array
  /** Positions blended between iterations floor(k) and ceil(k) (k fractional), into `out`. */
  at(k: number, out?: Float32Array): Float32Array
  /** Mean distance a stipple moved during iteration k (k ≥ 1), in pixels: the convergence curve. */
  moved(k: number): number
  /** Density at a (fractional) pixel position, nearest pixel; 0 outside. */
  densityAt(x: number, y: number): number
}

export function stipple(spec: StippleSpec): Stipple {
  const { w, h, n, seed = 1, iterations = 40, exact: EXACT = 3 } = spec
  const rho = new Float32Array(w * h)
  let mass = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const d = Math.max(0, Math.min(1, spec.density(x + .5, y + .5) || 0)); rho[y * w + x] = d; mass += d }
  // the pixels that carry weight (zero-density pixels never move a centroid)
  let lit = 0
  for (let i = 0; i < rho.length; i++) if (rho[i] > 0) lit++
  const litIdx = new Int32Array(lit)
  for (let i = 0, j = 0; i < rho.length; i++) if (rho[i] > 0) litIdx[j++] = i

  // start: rejection sampling on the density (continuous positions), seeded
  const start = new Float32Array(n * 2)
  {
    const rnd = mulberry32(seed >>> 0)
    let peak = 0
    for (let i = 0; i < rho.length; i++) if (rho[i] > peak) peak = rho[i]
    for (let i = 0, guard = 0; i < n && guard < n * 4000; guard++) {
      const x = rnd() * w, y = rnd() * h, d = rho[Math.min(h - 1, y | 0) * w + Math.min(w - 1, x | 0)]
      if (mass > 0 && rnd() * peak < d) { start[i * 2] = x; start[i * 2 + 1] = y; i++ }
    }
  }
  const frames: Float32Array[] = [start], moves: number[] = [0]

  // bucket grid sized for ~1 stipple per bucket at average density
  const area = Math.max(1, lit), cell = Math.max(1, Math.sqrt(area / Math.max(1, n))), bw = Math.ceil(w / cell), bh = Math.ceil(h / cell)
  const owner = new Int32Array(lit).fill(-1), head = new Int32Array(bw * bh + 1), items = new Int32Array(n), sx = new Float64Array(n), sy = new Float64Array(n), sw = new Float64Array(n)
  const bucketOf = (x: number, y: number) => Math.min(bh - 1, Math.max(0, (y / cell) | 0)) * bw + Math.min(bw - 1, Math.max(0, (x / cell) | 0))

  // Voronoi adjacency of the last assignment (cells that share a lit pixel edge), for the walk
  const MAXN = 24, nb = new Int32Array(n * MAXN), nbc = new Uint8Array(n), ownerPx = new Int32Array(w * h).fill(-1)
  const link = (a: number, b: number) => {
    const base = a * MAXN, c = nbc[a]
    for (let k = 0; k < c; k++) if (nb[base + k] === b) return
    if (c < MAXN) { nb[base + c] = b; nbc[a] = c + 1 }
  }
  /** Nearest stipple to (px, py) by greedy descent over last iteration's Voronoi neighbours, from `s`. */
  const walk = (p: Float32Array, s: number, px: number, py: number): number => {
    let dx = p[s * 2] - px, dy = p[s * 2 + 1] - py, best = dx * dx + dy * dy
    for (;;) {
      let next = -1
      for (let k = 0, base = s * MAXN, c = nbc[s]; k < c; k++) {
        const t = nb[base + k]
        dx = p[t * 2] - px; dy = p[t * 2 + 1] - py
        const dd = dx * dx + dy * dy
        if (dd < best || (dd === best && t < (next < 0 ? s : next))) { best = dd; next = t }
      }
      if (next < 0) return s
      s = next
    }
  }

  /**
   * One Lloyd iteration. The first iterations (`exact`) find every pixel's nearest stipple with the bucket
   * ring search; later ones, when stipples move a fraction of a pixel, walk from the pixel's last owner over
   * the last Voronoi adjacency (the Delaunay greedy walk), ~6 distance tests per pixel.
   */
  function step(p: Float32Array, exact: boolean): Float32Array {
    // CSR buckets: count, prefix sum, fill
    head.fill(0)
    for (let i = 0; i < n; i++) head[bucketOf(p[i * 2], p[i * 2 + 1]) + 1]++
    for (let b = 0; b < bw * bh; b++) head[b + 1] += head[b]
    const fillAt = head.slice(0, bw * bh)
    for (let i = 0; i < n; i++) items[fillAt[bucketOf(p[i * 2], p[i * 2 + 1])]++] = i
    sx.fill(0); sy.fill(0); sw.fill(0)
    const maxRing = Math.max(bw, bh)
    for (let j = 0; j < lit; j++) {
      const pi = litIdx[j], px = (pi % w) + .5, py = ((pi / w) | 0) + .5, d = rho[pi]
      const bx = Math.min(bw - 1, (px / cell) | 0), by = Math.min(bh - 1, (py / cell) | 0)
      if (!exact) {
        const who = walk(p, owner[j], px, py)
        owner[j] = who; ownerPx[pi] = who
        sx[who] += d * px; sy[who] += d * py; sw[who] += d
        continue
      }
      // last iteration's owner is almost always still the nearest: start from it, so the ring search stops early
      let who = owner[j], best = Infinity
      if (who >= 0) { const dx = p[who * 2] - px, dy = p[who * 2 + 1] - py; best = dx * dx + dy * dy }
      // distance from the pixel to the edge of its own bucket: ring r + 1 is at least r·cell + off away
      const off = Math.min(px - bx * cell, (bx + 1) * cell - px, py - by * cell, (by + 1) * cell - py)
      for (let r = 0; r <= maxRing; r++) {
        const y0 = by - r, y1 = by + r, x0 = bx - r, x1 = bx + r
        for (let yy = y0; yy <= y1; yy++) {
          if (yy < 0 || yy >= bh) continue
          // the ring only: full rows at the top and bottom, two cells per row between
          const edge = yy === y0 || yy === y1, stepX = edge ? 1 : x1 - x0 || 1
          for (let xx = x0; xx <= x1; xx += stepX) {
            if (xx < 0 || xx >= bw) continue
            const b = yy * bw + xx
            for (let k = head[b]; k < head[b + 1]; k++) {
              const s = items[k], dx = p[s * 2] - px, dy = p[s * 2 + 1] - py, dd = dx * dx + dy * dy
              if (dd < best || (dd === best && s < who)) { best = dd; who = s }
            }
          }
        }
        // anything outside rings 0…r is at least r·cell + off away
        if (best <= (r * cell + off) * (r * cell + off)) break
      }
      owner[j] = who; ownerPx[pi] = who
      sx[who] += d * px; sy[who] += d * py; sw[who] += d
    }
    // the adjacency of this assignment, for the next walk
    nbc.fill(0)
    for (let j = 0; j < lit; j++) {
      const pi = litIdx[j], a = ownerPx[pi], x = pi % w
      const r = x + 1 < w ? ownerPx[pi + 1] : -1, dn = pi + w < w * h ? ownerPx[pi + w] : -1
      if (r >= 0 && r !== a) { link(a, r); link(r, a) }
      if (dn >= 0 && dn !== a) { link(a, dn); link(dn, a) }
    }
    const next = new Float32Array(n * 2)
    for (let i = 0; i < n; i++) {
      if (sw[i] > 0) { next[i * 2] = sx[i] / sw[i]; next[i * 2 + 1] = sy[i] / sw[i] } else { next[i * 2] = p[i * 2]; next[i * 2 + 1] = p[i * 2 + 1] }
    }
    return next
  }
  const frame = (k: number): Float32Array => {
    const want = Math.max(0, Math.min(iterations, Math.floor(k)))
    while (frames.length <= want) {
      const prev = frames[frames.length - 1], next = step(prev, frames.length <= EXACT)
      let m = 0
      for (let i = 0; i < n; i++) m += Math.sqrt((next[i * 2] - prev[i * 2]) ** 2 + (next[i * 2 + 1] - prev[i * 2 + 1]) ** 2)
      frames.push(next); moves.push(n ? m / n : 0)
    }
    return frames[want]
  }
  return {
    w, h, n, iterations, rho, frame,
    at(k, out = new Float32Array(n * 2)) {
      const kk = Math.max(0, Math.min(iterations, k)), a = frame(kk), b = frame(Math.ceil(kk)), f = kk - Math.floor(kk)
      for (let i = 0; i < n * 2; i++) out[i] = a[i] + (b[i] - a[i]) * f
      return out
    },
    moved(k) { frame(k); return moves[Math.max(0, Math.min(iterations, Math.floor(k)))] },
    densityAt(x, y) { const c = Math.floor(x), r = Math.floor(y); return c < 0 || r < 0 || c >= w || r >= h ? 0 : rho[r * w + c] },
  }
}
