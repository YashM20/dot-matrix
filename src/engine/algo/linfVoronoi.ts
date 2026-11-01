/**
 * Block Voronoi (squares Q3, docs/living-matter/Q-squares.md §4.2): Voronoi regions under the L∞ (Chebyshev) or L1
 * (Manhattan) metric, rasterized per cell. Under L∞ the distance to a seed is a square ring, so region boundaries
 * run along the axes and the diagonals: on a square lattice the regions read as a Mondrian of blocks. Under L1 the
 * rings are diamonds and the boundaries are the same two families of lines, met at other places.
 *
 * Seeds are explicit (n of them, hashed into the w × h box) and may drift: seed i moves by `drift` cells on a
 * Lissajous path of its own, at time t. (F0's `voronoi2` keeps one fixed feature point per noise cell, so it can't
 * drift; an exact scan over n ≤ 64 seeds costs ~n operations per cell.) Ties go to the lower seed index.
 * `edge` marks the cells within `eps` of the bisector (f2 − f1 < eps). Pure and deterministic (inside the lint).
 */
import { hash01 } from '../math'
import { tsin } from '../noise/trig'

export type BlockMetric = 'linf' | 'l1'
export interface BlockVoronoiOptions {
  seed: number
  /** Seeds (≤ 255, so a region id fits a join group). */
  n: number
  metric?: BlockMetric
  /** Grid size in cells. */
  w: number
  h: number
  /** Time (s) and drift amplitude (cells) of the seeds' paths. */
  t?: number
  drift?: number
  /** Edge band: f2 − f1 < eps (cells; default .5). */
  eps?: number
}
export interface BlockVoronoi {
  /** Nearest seed per cell (row-major). */
  id: Int16Array
  /** 1 on the cells within `eps` of a boundary. */
  edge: Uint8Array
  /** Seed positions (cell units, x y pairs) at t. */
  seeds: Float64Array
  /** Cells per region. */
  area: Int32Array
}

/** Distance between two points in a block metric. */
export const blockDistance = (dx: number, dy: number, metric: BlockMetric): number => {
  const ax = Math.abs(dx), ay = Math.abs(dy)
  return metric === 'l1' ? ax + ay : ax > ay ? ax : ay
}
/** The seeds at time t: hashed into [.5, w − .5] × [.5, h − .5], each drifting on its own Lissajous path. */
export function blockSeeds(seed: number, n: number, w: number, h: number, t = 0, drift = 0): Float64Array {
  const out = new Float64Array(2 * n)
  for (let i = 0; i < n; i++) {
    const bx = .5 + hash01(seed, i, 1) * (w - 1), by = .5 + hash01(seed, i, 2) * (h - 1)
    const wx = .21 + .17 * hash01(seed, i, 3), wy = .19 + .19 * hash01(seed, i, 4), px = 6.283 * hash01(seed, i, 5), py = 6.283 * hash01(seed, i, 6)
    out[2 * i] = Math.max(.5, Math.min(w - .5, bx + drift * tsin(wx * t + px)))
    out[2 * i + 1] = Math.max(.5, Math.min(h - .5, by + drift * tsin(wy * t + py)))
  }
  return out
}
/** The regions of `n` seeds over a w × h cell grid (cell centres at c + .5, r + .5). */
export function blockVoronoi(o: BlockVoronoiOptions): BlockVoronoi {
  const { w, h, n } = o, metric = o.metric ?? 'linf', eps = o.eps ?? .5, seeds = blockSeeds(o.seed, n, w, h, o.t ?? 0, o.drift ?? 0)
  const id = new Int16Array(w * h), edge = new Uint8Array(w * h), area = new Int32Array(n)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let f1 = Infinity, f2 = Infinity, best = 0
    for (let i = 0; i < n; i++) {
      const d = blockDistance(c + .5 - seeds[2 * i], r + .5 - seeds[2 * i + 1], metric)
      if (d < f1) { f2 = f1; f1 = d; best = i } else if (d < f2) f2 = d
    }
    const j = r * w + c
    id[j] = best; area[best]++
    if (f2 - f1 < eps) edge[j] = 1
  }
  return { id, edge, seeds, area }
}
