/**
 * Wave Function Collapse, simple tiled model (Maxim Gumin, 2016; the constraint-solving reading is
 * Karth & Smith, "WaveFunctionCollapse is Constraint Solving in the Wild", FDG 2017).
 *
 * Every cell starts as a superposition of all tiles. Each step *observes* the cell of lowest Shannon
 * entropy (weighted by tile frequency, ties broken by a seeded hash), collapses it to one tile drawn by
 * weight, then *propagates*: neighbours lose every tile whose facing edge socket no longer matches
 * (arc consistency, AC-3 with a stack) until nothing changes.
 *
 * A cell left with no tile is a contradiction. Local propagation cannot see global constraints (closed
 * strands need an even number of crossings on every cut), so contradictions are common near the end:
 * the solver *backtracks*: it restores the wave saved before the last observation, bans the tile it chose
 * there and propagates again, popping further while that fails (Karth & Smith §4). After `maxBacktracks`
 * it starts a fresh attempt from an independent seed, up to `restarts` times.
 *
 * Tiles are described by their four edge sockets [N, E, S, W]; two tiles may sit side by side when the
 * touching sockets are equal. `border` forces a socket on every outer edge (0 = closed patterns).
 *
 * The final path is kept, so a card can scrub it: `history[s]` is the option count of every cell after
 * s observations (row 0 = after the border alone; bans fold into the row they constrain), `observed[s - 1]`
 * is the cell observed at step s, and `settledAt[i]` is the first step at which cell i had one tile left
 * (by observation or by propagation; 0 = by the border). Counts never grow along the path. Deterministic for a seed.
 */
import { hash01, hash32 } from '../math'
import { mulberry32 } from '../sampler/jitter'

export interface WfcTile {
  /** Edge sockets [N, E, S, W]. */
  edges: readonly [number, number, number, number]
  /** Relative frequency (default 1). */
  weight?: number
}
export interface WfcSpec {
  w: number
  h: number
  tiles: readonly WfcTile[]
  seed?: number
  /** Socket every outer edge must show (default: unconstrained). */
  border?: number
  /** Backtracks allowed per attempt before a fresh one (default 16: chronological backtracking thrashes, a fresh seed is cheaper). */
  maxBacktracks?: number
  /** Fresh attempts after an attempt runs out of backtracks (default 24). */
  restarts?: number
}
export interface WfcResult {
  w: number
  h: number
  /** Final tile index per cell (row-major), -1 if every attempt failed. */
  tiles: Int16Array
  /** Cell observed at step s + 1. */
  observed: Int32Array
  /** Option count of every cell after s observations (steps + 1 rows of cells). */
  history: Uint8Array[]
  /** First step at which each cell had a single tile. */
  settledAt: Int16Array
  /** Seed of the attempt that succeeded. */
  seedUsed: number
  attempts: number
  /** Backtracks taken by the successful attempt. */
  backtracks: number
  ok: boolean
}

const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], OPP = [2, 3, 0, 1]
const popcount = (m: number) => { let c = 0; while (m) { m &= m - 1; c++ } return c }

export function wfc(spec: WfcSpec): WfcResult {
  const { w, h, tiles, seed = 1, border, restarts = 24 } = spec
  const T = tiles.length, N = w * h, maxBacktracks = spec.maxBacktracks ?? 16
  if (T > 31) throw new Error('wfc: at most 31 tiles (bitmask in one int)')
  const weight = tiles.map(t => t.weight ?? 1), wlogw = weight.map(x => x * Math.log(x))
  // compat[dir][t] = bitmask of tiles allowed in the neighbour cell in direction dir
  const compat = DX.map((_, dir) => tiles.map(a => tiles.reduce((m, b, j) => (a.edges[dir] === b.edges[OPP[dir]] ? m | (1 << j) : m), 0)))
  const all = (1 << T) - 1
  for (let attempt = 0; attempt <= restarts; attempt++) {
    const s = attempt === 0 ? seed : hash32(seed, attempt), rnd = mulberry32((Math.imul(s, 2654435761) ^ 0x5bd1e995) >>> 0)
    const wave = new Int32Array(N).fill(all), stack: number[] = []
    const restrict = (i: number, mask: number): boolean => {
      const before = wave[i], after = before & mask
      if (after === before) return true
      wave[i] = after
      if (!after) return false
      stack.push(i)
      return true
    }
    const propagate = (): boolean => {
      while (stack.length) {
        const i = stack.pop()!, x = i % w, y = (i / w) | 0, m = wave[i]
        for (let dir = 0; dir < 4; dir++) {
          const nx = x + DX[dir], ny = y + DY[dir]
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
          let allowed = 0
          for (let t = 0; t < T; t++) if (m & (1 << t)) allowed |= compat[dir][t]
          if (!restrict(ny * w + nx, allowed)) { stack.length = 0; return false }
        }
      }
      return true
    }
    const counts = () => { const row = new Uint8Array(N); for (let i = 0; i < N; i++) row[i] = popcount(wave[i]); return row }
    let ok = true
    if (border !== undefined) {
      const em = [0, 1, 2, 3].map(dir => tiles.reduce((m, t, j) => (t.edges[dir] === border ? m | (1 << j) : m), 0))
      for (let x = 0; x < w; x++) { ok &&= restrict(x, em[0]); ok &&= restrict((h - 1) * w + x, em[2]) }
      for (let y = 0; y < h; y++) { ok &&= restrict(y * w, em[3]); ok &&= restrict(y * w + w - 1, em[1]) }
      ok &&= propagate()
    }
    if (!ok) continue
    const observed: number[] = [], picks: number[] = [], saves: Int32Array[] = [], history: Uint8Array[] = [counts()]
    let backtracks = 0
    for (;;) {
      // lowest entropy among undecided cells; the hash is a tiny tie-break noise
      let best = -1, bestH = Infinity
      for (let i = 0; i < N; i++) {
        const m = wave[i]
        if (!(m & (m - 1))) continue
        let sw = 0, swl = 0
        for (let t = 0; t < T; t++) if (m & (1 << t)) { sw += weight[t]; swl += wlogw[t] }
        const H = Math.log(sw) - swl / sw + 1e-6 * hash01(i, s)
        if (H < bestH) { bestH = H; best = i }
      }
      if (best < 0) break
      // collapse by weight
      const m = wave[best]
      let total = 0
      for (let t = 0; t < T; t++) if (m & (1 << t)) total += weight[t]
      let r = rnd() * total, pick = -1
      for (let t = 0; t < T; t++) if (m & (1 << t)) { pick = t; r -= weight[t]; if (r < 0) break }
      saves.push(wave.slice()); observed.push(best); picks.push(pick)
      wave[best] = 1 << pick
      stack.push(best)
      ok = propagate()
      // backtrack: undo the last observation, ban its tile, propagate; pop further while that fails
      while (!ok && observed.length && backtracks < maxBacktracks) {
        backtracks++
        const cell = observed.pop()!, banned = picks.pop()!
        wave.set(saves.pop()!)
        ok = restrict(cell, ~(1 << banned)) && propagate()
      }
      if (!ok) break
      history.length = observed.length
      history.push(counts())
    }
    if (!ok) continue
    const out = new Int16Array(N), settledAt = new Int16Array(N).fill(-1)
    for (let i = 0; i < N; i++) out[i] = 31 - Math.clz32(wave[i])
    for (let st = 0; st < history.length; st++) for (let i = 0; i < N; i++) if (settledAt[i] < 0 && history[st][i] === 1) settledAt[i] = st
    return { w, h, tiles: out, observed: Int32Array.from(observed), history, settledAt, seedUsed: s, attempts: attempt + 1, backtracks, ok: true }
  }
  return { w, h, tiles: new Int16Array(N).fill(-1), observed: new Int32Array(0), history: [], settledAt: new Int16Array(N).fill(-1), seedUsed: seed, attempts: restarts + 1, backtracks: 0, ok: false }
}
