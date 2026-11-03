/**
 * A blend for worlds of identical particles (Particle Lenia's plankton): before lerping state `a` toward `b`, the
 * particles of `a` are renumbered so each one heads for a nearby slot of `b`. Lerping by index would send a particle
 * from one creature across the dish to its namesake in another; matched, every particle moves a short way, and a
 * seam or a heal reads as the creatures easing into place. The dynamics do not care about the numbering (every
 * particle is the same), so the renumbering changes nothing else.
 *
 * Greedy matching, pure in its inputs: particles take their nearest free slot in order of how close their nearest
 * slot is (ties by index), searched over a spatial hash of `b`'s slots in growing rings, or the old numbering when that
 * is shorter, then three passes of pair swaps (2-opt on the summed squared way) over each particle's neighbouring slots. O(n log n + n · ring).
 * Scratch is allocated once per blend; no allocation per call.
 */
import { createHash } from '../physics/particles'
import { hashPoints } from './steer'

export interface MatchPlan {
  /** Particles, and the offsets of their x and y planes in the state. */
  n: number; X: number; Y: number
  /** World box of the particles and the hash cell (world units). */
  bounds: [number, number, number, number]; cell: number
  /** Slots past the particle planes that snap once k ≥ .5 instead of lerping (modes, timers). */
  discrete?: Iterable<number>
}

export function matchBlend(plan: MatchPlan): (a: Float32Array, b: Float32Array, k: number) => void {
  const { n, X, Y } = plan, hash = createHash(n, plan.bounds, plan.cell)
  const near = new Float64Array(n), order = new Int32Array(n), taken = new Uint8Array(n), to = new Int32Array(n), owner = new Int32Array(n)
  const px = new Float32Array(n), py = new Float32Array(n), snap = new Set(plan.discrete ?? [])
  const { cols, rows, start, items, cell, x0, y0 } = hash

  /** Nearest slot of `b` to (x, y) not yet taken (`free`), or any (`!free`); -1 if none in reach of `maxR` rings. */
  const nearest = (b: Float32Array, x: number, y: number, free: boolean, maxR: number): number => {
    const cx = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / cell))), cy = Math.min(rows - 1, Math.max(0, Math.floor((y - y0) / cell)))
    let best = -1, bd = Infinity
    for (let r = 0; r <= maxR; r++) {
      // every slot in ring r is at least (r − 1) cells away: stop once that is past the best so far
      if (best >= 0 && (r - 1) * cell * ((r - 1) * cell) > bd) break
      for (let gy = cy - r; gy <= cy + r; gy++) {
        if (gy < 0 || gy >= rows) continue
        const edge = gy === cy - r || gy === cy + r
        for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
          if (gx < 0 || gx >= cols) continue
          const c = gy * cols + gx
          for (let q = start[c]; q < start[c + 1]; q++) {
            const j = items[q]
            if (free && taken[j]) continue
            const dx = b[X + j] - x, dy = b[Y + j] - y, d = dx * dx + dy * dy
            if (d < bd || (d === bd && j < best)) { bd = d; best = j }
          }
        }
      }
    }
    return best
  }

  return (a, b, k0) => {
    const k = k0 >= .5 ? 1 : 2 * k0
    hashPoints(hash, b, n, X, Y)
    const reach = Math.max(cols, rows)
    for (let i = 0; i < n; i++) {
      const j = nearest(b, a[X + i], a[Y + i], false, reach), dx = b[X + j] - a[X + i], dy = b[Y + j] - a[Y + i]
      near[i] = dx * dx + dy * dy; order[i] = i
    }
    order.sort((p, q) => near[p] - near[q] || p - q)
    taken.fill(0)
    for (let m = 0; m < n; m++) {
      const i = order[m], j = nearest(b, a[X + i], a[Y + i], true, reach)
      taken[j] = 1; to[i] = j; owner[j] = i
    }
    // keep the numbering as it is when that is already the shorter way (two calm states)
    const d2 = (i: number, j: number) => { const dx = b[X + j] - a[X + i], dy = b[Y + j] - a[Y + i]; return dx * dx + dy * dy }
    let greedy = 0, same = 0
    for (let i = 0; i < n; i++) { greedy += d2(i, to[i]); same += d2(i, i) }
    if (same <= greedy) for (let i = 0; i < n; i++) { to[i] = i; owner[i] = i }
    // three passes of pair swaps: particles i and o trade slots when that shortens their summed squared way
    for (let pass = 0; pass < 3; pass++) for (let i = 0; i < n; i++) {
      const x = a[X + i], y = a[Y + i]
      const gx0 = Math.min(cols - 1, Math.max(0, Math.floor((x - x0) / cell))), gy0 = Math.min(rows - 1, Math.max(0, Math.floor((y - y0) / cell)))
      for (let gy = Math.max(0, gy0 - 2); gy <= Math.min(rows - 1, gy0 + 2); gy++) for (let gx = Math.max(0, gx0 - 2); gx <= Math.min(cols - 1, gx0 + 2); gx++) {
        const c = gy * cols + gx
        for (let q = start[c]; q < start[c + 1]; q++) {
          const j = items[q], o = owner[j], tc = to[i]
          if (o === i || d2(i, j) + d2(o, tc) >= d2(i, tc) + d2(o, j)) continue
          to[i] = j; owner[j] = i; to[o] = tc; owner[tc] = o
        }
      }
    }
    // renumber: particle i becomes slot to[i], then every float eases toward b (the same k doubling as seamBlend)
    for (let i = 0; i < n; i++) { px[to[i]] = a[X + i]; py[to[i]] = a[Y + i] }
    for (let j = 0; j < n; j++) { a[X + j] = px[j] + (b[X + j] - px[j]) * k; a[Y + j] = py[j] + (b[Y + j] - py[j]) * k }
    for (let i = 0; i < a.length; i++) {
      if ((i >= X && i < X + n) || (i >= Y && i < Y + n)) continue
      if (snap.has(i)) { if (k >= .5) a[i] = b[i] } else a[i] += (b[i] - a[i]) * k
    }
  }
}
