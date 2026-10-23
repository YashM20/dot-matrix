/**
 * SimFields — stateful simulations sampled as Fields. A `Sim` is a pure function of (seed, step index):
 * `simAt(sim, t)` advances a Float32Array grid at a fixed `dt` from the seeded initial state, and keeps a
 * checkpoint every `every` steps, so asking for any time t replays from the nearest checkpoint (or
 * continues from the head when moving forward). Same t → same grid, in any call order. Framework-free.
 *
 * Cost is bounded three ways (see docs/DOT-MATRIX-ENGINE-PLAN.md "SimField"):
 * - `lead` + `period` fold wall-clock t into one loop [lead, lead + period), so t = 3600 s costs what t = 1 s does;
 * - checkpoints are an LRU of at most `maxCheckpoints` grids (step 0 and the loop start are pinned);
 * - one call never takes more than `maxSteps` steps: an unlooped sim asked for a far t catches up over
 *   several calls (`sim.lag` > 0 until it arrives). Looped cards should keep lead + period ≤ maxSteps.
 * Steady state allocates nothing: the stepper ping-pongs two buffers, fields read a small ring of views.
 */
import type { Field } from '../types'
import { hash01 } from '../math'

export interface SimSpec {
  w: number; h: number
  /** Floats per cell (Gray–Scott stores U and V). */
  channels?: number
  /** Fixed step, seconds. */
  dt: number
  /** Checkpoint interval, in steps. */
  every?: number
  /** Fill the seeded initial state (a zeroed grid is passed in). */
  init: (grid: Float32Array, w: number, h: number) => void
  /**
   * One step: read `src`, write every cell of `dst`; `n` is the index of the step being taken (0-based).
   * `src` is the sim's own head buffer and may be used as scratch (Gray–Scott sub-steps ping-pong through it).
   */
  step: (src: Float32Array, dst: Float32Array, w: number, h: number, n: number) => void
  /** Seconds of head start: with a `period`, t = 0 shows step lead/dt (a still frame is already a pattern). */
  lead?: number
  /** Loop length in seconds: t folds into [lead, lead + period), so the sim resets each period. Default ∞ (no loop). */
  period?: number
  /** Most steps one `simAtStep` call may take (default 4096); beyond it the sim catches up over later calls. */
  maxSteps?: number
  /** Checkpoint LRU size (default 64; step 0 and the loop start never evict). */
  maxCheckpoints?: number
}
export interface Sim extends Required<SimSpec> {
  checkpoints: Map<number, Float32Array>
  /** The most recently computed state (scratch is reused), so forward playback never replays. */
  head: { n: number; grid: Float32Array }
  scratch: Float32Array
  /** Steps still missing after the last call (> 0 only when `maxSteps` cut a cold far jump short). */
  lag: number
  /** Total steps taken since creation (cost accounting for tests and benches). */
  stepsTaken: number
  /** Read-only snapshots handed to fields, reused round-robin (see `simView`). */
  views: { n: number; grid: Float32Array }[]
}

const VIEWS = 3
export function createSim(spec: SimSpec): Sim {
  const channels = spec.channels ?? 1, every = Math.max(1, spec.every ?? 32)
  const g0 = new Float32Array(spec.w * spec.h * channels)
  spec.init(g0, spec.w, spec.h)
  return {
    ...spec, channels, every, lead: spec.lead ?? 0, period: spec.period ?? Infinity,
    maxSteps: Math.max(1, spec.maxSteps ?? 4096), maxCheckpoints: Math.max(2, spec.maxCheckpoints ?? 64),
    checkpoints: new Map([[0, g0]]), head: { n: 0, grid: g0.slice() }, scratch: new Float32Array(g0.length),
    lag: 0, stepsTaken: 0, views: Array.from({ length: VIEWS }, () => ({ n: -1, grid: new Float32Array(g0.length) })),
  }
}

/** Loop bounds in steps: [start, start + length). length = ∞ when the sim does not loop. */
export const simLoop = (sim: Sim): [number, number] =>
  [Math.round(sim.lead / sim.dt), Number.isFinite(sim.period) ? Math.max(1, Math.round(sim.period / sim.dt)) : Infinity]

/**
 * Step index of time `t`. Unlooped: floor(t / dt), negative times clamp to the initial state.
 * Looped: lead/dt + (floor(t / dt) mod period/dt), any t (negative, wall-clock) lands inside the loop.
 */
export function simStep(sim: Sim, t: number): number {
  const n = Math.floor(t / sim.dt + 1e-9), [start, len] = simLoop(sim)
  if (len === Infinity) return Math.max(0, n)
  return start + (((n % len) + len) % len)
}
/** Position in the loop, 0..1 (0 for an unlooped sim). */
export const simPhase = (sim: Sim, t: number): number => { const [start, len] = simLoop(sim); return len === Infinity ? 0 : (simStep(sim, t) - start) / len }

/** Drop every checkpoint but step 0 and rewind the head: a true cold start (benches, memory pressure). */
export function simReset(sim: Sim): void {
  for (const k of [...sim.checkpoints.keys()]) if (k !== 0) sim.checkpoints.delete(k)
  sim.head.grid.set(sim.checkpoints.get(0)!); sim.head.n = 0; sim.lag = 0
  for (const v of sim.views) v.n = -1
}

/** Largest checkpoint step ≤ n (step 0 is always kept). */
function nearestCheckpoint(sim: Sim, n: number): number {
  const [start] = simLoop(sim)
  let k = Math.floor(n / sim.every) * sim.every
  while (k > 0 && !sim.checkpoints.has(k)) k -= sim.every
  return start > k && start <= n && sim.checkpoints.has(start) ? start : Math.max(0, k)
}
function keepCheckpoint(sim: Sim, n: number, grid: Float32Array) {
  const cp = sim.checkpoints
  if (cp.has(n)) return
  cp.set(n, grid.slice())
  if (cp.size <= sim.maxCheckpoints) return
  const [start] = simLoop(sim)
  for (const k of cp.keys()) if (k !== 0 && k !== start && k !== n) { cp.delete(k); break }
}

/** The grid at step `n`. The returned array is owned by the sim: read it, do not keep it across calls. */
export function simAtStep(sim: Sim, n: number): Float32Array {
  const h = sim.head, [start] = simLoop(sim)
  const k = nearestCheckpoint(sim, n)
  if (n < h.n || k > h.n) {
    const g = sim.checkpoints.get(k)!
    sim.checkpoints.delete(k); sim.checkpoints.set(k, g) // LRU touch
    h.grid.set(g); h.n = k
  }
  let budget = sim.maxSteps
  while (h.n < n && budget-- > 0) {
    sim.step(h.grid, sim.scratch, sim.w, sim.h, h.n)
    const s = sim.scratch; sim.scratch = h.grid; h.grid = s; h.n++; sim.stepsTaken++
    if (h.n % sim.every === 0 || h.n === start) keepCheckpoint(sim, h.n, h.grid)
  }
  sim.lag = n - h.n
  return h.grid
}
export const simAt = (sim: Sim, t: number): Float32Array => simAtStep(sim, simStep(sim, t))

/**
 * A read-only snapshot of the grid at time `t`, from a ring of reused buffers: no allocation per frame,
 * and a snapshot stays valid until `VIEWS` (3) other steps have been viewed — plenty for one frame.
 */
export function simView(sim: Sim, t: number): Float32Array {
  const n = simStep(sim, t)
  let oldest = sim.views[0]
  for (const v of sim.views) { if (v.n === n) return v.grid; if (v.n < oldest.n) oldest = v }
  const g = simAtStep(sim, n)
  // a lagging sim is not at n yet: hand out the state but do not memoise it under n
  oldest.grid.set(g); oldest.n = sim.lag ? -1 : n
  return oldest.grid
}

/** A bounded Field over one channel of a grid: nearest cell, 0 outside [0,1)². `map` shapes the stored value. */
export function simGridField(grid: Float32Array, w: number, h: number, channel = 0, channels = 1, map: (x: number) => number = x => x): Field {
  const f: Field = (u, v) => {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
    return map(grid[((v * h | 0) * w + (u * w | 0)) * channels + channel])
  }
  f.bounds = [0, 0, w - 1, h - 1]
  return f
}
/** Field of `sim` at time `t` (reads a `simView` snapshot, so it stays valid after later `simAt` calls). */
export const simField = (sim: Sim, t: number, channel = 0, map?: (x: number) => number): Field =>
  simGridField(simView(sim, t), sim.w, sim.h, channel, sim.channels, map)

/**
 * A bounded Field that sees the whole cell: `fn(grid, i, x, y)` with `i` the cell's first float
 * (channels interleaved), so a card can read neighbours, several channels or its position (vignettes).
 */
export function simMapField(sim: Sim, t: number, fn: (grid: Float32Array, i: number, x: number, y: number) => number): Field {
  const g = simView(sim, t), { w, h, channels } = sim
  const f: Field = (u, v) => {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
    const x = u * w | 0, y = v * h | 0
    return fn(g, (y * w + x) * channels, x, y)
  }
  f.bounds = [0, 0, w - 1, h - 1]
  return f
}

const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x
/** Neighbour index tables for one axis: wrap (torus) or clamp (zero-flux mirror); -1 = outside (dead edge). */
export type SimEdge = 'wrap' | 'clamp' | 'dead'
function neighbours(n: number, edge: SimEdge): [Int32Array, Int32Array] {
  const lo = new Int32Array(n), hi = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    lo[i] = i > 0 ? i - 1 : edge === 'wrap' ? n - 1 : edge === 'clamp' ? 0 : -1
    hi[i] = i < n - 1 ? i + 1 : edge === 'wrap' ? 0 : edge === 'clamp' ? n - 1 : -1
  }
  return [lo, hi]
}

// ── Gray–Scott reaction-diffusion ── U (channel 0) feeds V (channel 1).
// Explicit Euler, unit sub-step: U' = U + du∇²U − UV² + F(1−U), V' = V + dv∇²V + UV² − (F+k)V, with the
// 5-point Laplacian (N+S+E+W − 4C). Stable while du ≤ .25. Edges wrap by default (torus); `edge: 'clamp'`
// is zero-flux, so patterns meet the border instead of continuing off it.
export interface GrayScottOptions {
  w: number; h: number; feed?: number; kill?: number; du?: number; dv?: number; seed?: number; dt?: number; sub?: number; blobs?: number; every?: number
  edge?: 'wrap' | 'clamp'
  /** Extra kill per cell (evaluated once at creation), e.g. a ramp toward the border so the pattern fades out. */
  killAt?: (x: number, y: number, w: number, h: number) => number
  /** Seed radius range [min, max] in cells (default [2, 4]). */
  radius?: [number, number]
  lead?: number; period?: number; maxSteps?: number; maxCheckpoints?: number
}
export function grayScott(o: GrayScottOptions): Sim {
  const { feed = .0367, kill = .0649, du = .2097, dv = .105, seed = 1, sub = 6, edge = 'wrap', radius = [2, 4] } = o
  const { w, h } = o, [xl, xr] = neighbours(w, edge), [yu, yd] = neighbours(h, edge)
  // per-cell decay F + k (one table, no per-step allocation)
  const fk = new Float64Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) fk[y * w + x] = feed + kill + (o.killAt ? o.killAt(x, y, w, h) : 0)
  return createSim({
    w, h, channels: 2, dt: o.dt ?? 1 / 12, every: o.every ?? 24,
    lead: o.lead, period: o.period, maxSteps: o.maxSteps, maxCheckpoints: o.maxCheckpoints,
    init: (g) => {
      for (let i = 0; i < w * h; i++) g[i * 2] = 1
      const span = radius[1] - radius[0] + 1
      for (let b = 0; b < (o.blobs ?? 5); b++) {
        const cx = (hash01(seed, b, 1) * w) | 0, cy = (hash01(seed, b, 2) * h) | 0, r = radius[0] + ((hash01(seed, b, 3) * span) | 0)
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r) continue
          const i = (((cy + y + h) % h) * w + ((cx + x + w) % w)) * 2
          g[i] = .5; g[i + 1] = .25
        }
      }
    },
    step: (src, dst) => {
      let a = src, b = dst
      for (let s = 0; s < sub; s++) {
        for (let y = 0; y < h; y++) {
          const ru = yu[y] * w, rc = y * w, rd = yd[y] * w
          for (let x = 0; x < w; x++) {
            const c = rc + x, i = c * 2, l = (rc + xl[x]) * 2, r = (rc + xr[x]) * 2, up = (ru + x) * 2, dn = (rd + x) * 2
            const U = a[i], V = a[i + 1], uvv = U * V * V
            const U1 = U + du * (a[up] + a[dn] + a[l] + a[r] - 4 * U) - uvv + feed * (1 - U)
            const V1 = V + dv * (a[up + 1] + a[dn + 1] + a[l + 1] + a[r + 1] - 4 * V) + uvv - fk[c] * V
            b[i] = U1 < 0 ? 0 : U1 > 1 ? 1 : U1
            b[i + 1] = V1 < 1e-9 ? 0 : V1 > 1 ? 1 : V1 // flush to 0: keeps decaying V out of the float32 denormal range
          }
        }
        const t = a; a = b; b = t
      }
      if (a !== dst) dst.set(a)
    },
  })
}

// ── Falling sand ── 0 = empty, 2 = wall, any other value is a grain (1 = SAND, 3 = SAND_B, …) that keeps its
// kind. Rows are swept bottom-up (direction alternating per step) and a grain moves at most once per step:
// straight down if empty, else diagonally down (side picked by a seeded hash) if both the diagonal and the
// side cell are empty. Grains only ever move into empty cells, so falling conserves mass exactly; the only
// sources are emitters (top row), the only sinks are `drain` rows. The bottom row is a floor.
export const SAND = 1, WALL = 2, SAND_B = 3
export interface SandEmitter { x: number; rate: number; jitter?: number; kind?: number }
export interface SandOptions {
  w: number; h: number; seed?: number; dt?: number; rate?: number; every?: number
  /** Custom scene: walls and pre-filled grains (replaces the default two ledges and stream). */
  init?: (grid: Float32Array, w: number, h: number) => void
  /** Pour points, x as a fraction of the width (default one stream at .42 with `rate`; `[]` for a closed scene). */
  emitters?: SandEmitter[]
  lead?: number; period?: number; maxSteps?: number; maxCheckpoints?: number
}
export function fallingSand(o: SandOptions): Sim {
  const { seed = 1, rate = .7 } = o
  const emitters = o.emitters ?? (o.init ? [] : [{ x: .42, rate, jitter: 4 }])
  return createSim({
    w: o.w, h: o.h, dt: o.dt ?? 1 / 24, every: o.every ?? 48,
    lead: o.lead, period: o.period, maxSteps: o.maxSteps, maxCheckpoints: o.maxCheckpoints,
    init: o.init ?? ((g, w, h) => {
      // two slanted ledges to scatter the stream
      const y0 = (h * (.4 + .06 * hash01(seed, 7))) | 0, x0 = (w * .2) | 0, x1 = (w * .6) | 0
      for (let x = x0; x < x1; x++) g[(y0 + (((x - x0) * .15) | 0)) * w + x] = WALL
      const y1 = (h * .8) | 0, x2 = (w * .45) | 0, x3 = (w * .85) | 0
      for (let x = x2; x < x3; x++) g[(y1 - (((x - x2) * .12) | 0)) * w + x] = WALL
    }),
    step: (src, dst, w, h, n) => {
      dst.set(src)
      const dir = n & 1 ? 1 : -1
      for (let y = h - 2; y >= 0; y--) {
        for (let k = 0; k < w; k++) {
          const x = dir > 0 ? k : w - 1 - k, i = y * w + x, g = dst[i]
          if (g === 0 || g === WALL) continue
          const d = i + w
          if (dst[d] === 0) { dst[d] = g; dst[i] = 0; continue }
          const first = hash01(seed, n, i) < .5 ? -1 : 1
          for (let m = 0; m < 2; m++) {
            const s = m ? -first : first, nx = x + s
            if (nx < 0 || nx >= w) continue
            if (dst[d + s] === 0 && dst[i + s] === 0) { dst[d + s] = g; dst[i] = 0; break }
          }
        }
      }
      emitters.forEach((e, j) => {
        if (hash01(seed, n, 99 + j * 17) >= e.rate) return
        const x = ((w * e.x) + (hash01(seed, n, 5 + j * 17) - .5) * (e.jitter ?? 4)) | 0
        if (x >= 0 && x < w && dst[x] === 0) dst[x] = e.kind ?? SAND
      })
    },
  })
}
/** Grains in a sand grid (any kind). */
export const sandCount = (g: Float32Array) => { let c = 0; for (let i = 0; i < g.length; i++) if (g[i] !== 0 && g[i] !== WALL) c++; return c }

// ── Conway's Life ── B3/S23. Edges wrap (torus) by default; `edge: 'dead'` is a bounded board whose outside
// is always dead (gliders crash into the border as blocks). `afterglow` adds channel 1: 1 while alive, then
// × afterglow per step once dead, so a trail can be drawn in a dimmer tone.
export interface LifeOptions {
  w: number; h: number; seed?: number; density?: number; dt?: number; every?: number
  edge?: 'wrap' | 'dead'
  /** Soup rectangle as fractions [x0, y0, x1, y1] (default the whole board). */
  soup?: [number, number, number, number]
  /** Stamp patterns after the soup (see `lifeStamp`). */
  stamps?: (grid: Float32Array, w: number, h: number, channels: number) => void
  /** Trail decay per step in (0, 1); enables channel 1. */
  afterglow?: number
  lead?: number; period?: number; maxSteps?: number; maxCheckpoints?: number
}
/** Write a `#`/`.` pattern into a Life grid at (x, y), clearing its box first. `flip` mirrors x, `flipY` mirrors y. */
export function lifeStamp(g: Float32Array, w: number, rows: string[], x: number, y: number, channels = 1, flip = false, flipY = false) {
  const pw = Math.max(...rows.map(r => r.length))
  rows.forEach((row, j) => {
    for (let i = 0; i < pw; i++) {
      const c = row[flip ? pw - 1 - i : i] === '#' ? 1 : 0, k = ((y + (flipY ? rows.length - 1 - j : j)) * w + x + i) * channels
      if (k >= 0 && k < g.length) { g[k] = c; if (channels > 1) g[k + 1] = c }
    }
  })
}
export function life(o: LifeOptions): Sim {
  const { seed = 1, density = .32, edge = 'wrap', soup = [0, 0, 1, 1] } = o
  const { w, h } = o, ch = o.afterglow ? 2 : 1, glow = o.afterglow ?? 0
  const [xl, xr] = neighbours(w, edge), [yu, yd] = neighbours(h, edge)
  return createSim({
    w, h, channels: ch, dt: o.dt ?? 1 / 8, every: o.every ?? 16,
    lead: o.lead, period: o.period, maxSteps: o.maxSteps, maxCheckpoints: o.maxCheckpoints,
    init: (g) => {
      const x0 = soup[0] * w, y0 = soup[1] * h, x1 = soup[2] * w, y1 = soup[3] * h
      for (let i = 0; i < w * h; i++) {
        const x = i % w, y = (i / w) | 0
        if (x >= x0 && x < x1 && y >= y0 && y < y1 && hash01(seed, i) < density) { g[i * ch] = 1; if (ch > 1) g[i * ch + 1] = 1 }
      }
      o.stamps?.(g, w, h, ch)
    },
    step: (src, dst) => {
      const at = (r: number, c: number) => (r < 0 || c < 0 ? 0 : src[(r + c) * ch])
      for (let y = 0; y < h; y++) {
        const ru = yu[y] < 0 ? -1 : yu[y] * w, rc = y * w, rd = yd[y] < 0 ? -1 : yd[y] * w
        for (let x = 0; x < w; x++) {
          const l = xl[x], r = xr[x]
          const c = at(ru, l) + at(ru, x) + at(ru, r) + at(rc, l) + at(rc, r) + at(rd, l) + at(rd, x) + at(rd, r)
          const i = (rc + x) * ch, alive = c === 3 || (c === 2 && src[i] === 1) ? 1 : 0
          dst[i] = alive
          if (ch > 1) dst[i + 1] = alive ? 1 : src[i + 1] * glow
        }
      }
    },
  })
}

/** Field of V (the pattern), lifted so thin fronts still draw. */
export const grayScottField = (sim: Sim, t: number): Field => simField(sim, t, 1, v => clamp01(v * 2.6))
export const sandField = (sim: Sim, t: number): Field => simField(sim, t, 0, v => v === WALL ? .35 : v !== 0 ? 1 : 0)
export const lifeField = (sim: Sim, t: number): Field => simField(sim, t, 0)
