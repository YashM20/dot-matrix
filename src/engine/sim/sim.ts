/**
 * SimFields — stateful simulations sampled as Fields. A `Sim` is a pure function of (seed, step index):
 * `simAt(sim, t)` advances a Float32Array grid at a fixed `dt` from the seeded initial state, and keeps a
 * checkpoint every `every` steps, so asking for any time t replays from the nearest checkpoint (or
 * continues from the head when moving forward). Same t → same grid, in any call order. Framework-free.
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
  /** One step: read `src`, write every cell of `dst`; `n` is the index of the step being taken (0-based). */
  step: (src: Float32Array, dst: Float32Array, w: number, h: number, n: number) => void
}
export interface Sim extends Required<SimSpec> {
  checkpoints: Map<number, Float32Array>
  /** The most recently computed state (scratch is reused), so forward playback never replays. */
  head: { n: number; grid: Float32Array }
  scratch: Float32Array
}

export function createSim(spec: SimSpec): Sim {
  const channels = spec.channels ?? 1, every = Math.max(1, spec.every ?? 32)
  const g0 = new Float32Array(spec.w * spec.h * channels)
  spec.init(g0, spec.w, spec.h)
  return { ...spec, channels, every, checkpoints: new Map([[0, g0]]), head: { n: 0, grid: g0.slice() }, scratch: new Float32Array(g0.length) }
}

/** Step index of time `t` (negative times clamp to the initial state). */
export const simStep = (sim: Sim, t: number) => Math.max(0, Math.floor(t / sim.dt + 1e-9))

/** The grid at step `n`. The returned array is owned by the sim: read it, do not keep it across calls. */
export function simAtStep(sim: Sim, n: number): Float32Array {
  const h = sim.head
  if (n < h.n) {
    const k = Math.floor(n / sim.every) * sim.every
    h.grid.set(sim.checkpoints.get(k)!); h.n = k
  }
  while (h.n < n) {
    sim.step(h.grid, sim.scratch, sim.w, sim.h, h.n)
    const s = sim.scratch; sim.scratch = h.grid; h.grid = s; h.n++
    if (h.n % sim.every === 0 && !sim.checkpoints.has(h.n)) sim.checkpoints.set(h.n, h.grid.slice())
  }
  return h.grid
}
export const simAt = (sim: Sim, t: number): Float32Array => simAtStep(sim, simStep(sim, t))

/** A bounded Field over one channel of a grid: nearest cell, 0 outside [0,1)². `map` shapes the stored value. */
export function simGridField(grid: Float32Array, w: number, h: number, channel = 0, channels = 1, map: (x: number) => number = x => x): Field {
  const f: Field = (u, v) => {
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0
    return map(grid[((v * h | 0) * w + (u * w | 0)) * channels + channel])
  }
  f.bounds = [0, 0, w - 1, h - 1]
  return f
}
/** Field of `sim` at time `t` (reads a snapshot, so it stays valid after later `simAt` calls). */
export const simField = (sim: Sim, t: number, channel = 0, map?: (x: number) => number): Field =>
  simGridField(simAt(sim, t).slice(), sim.w, sim.h, channel, sim.channels, map)

const clamp01 = (x: number) => x < 0 ? 0 : x > 1 ? 1 : x

// ── Gray–Scott reaction-diffusion ── U (channel 0) feeds V (channel 1); wrapped edges.
export interface GrayScottOptions { w: number; h: number; feed?: number; kill?: number; du?: number; dv?: number; seed?: number; dt?: number; sub?: number; blobs?: number; every?: number }
export function grayScott(o: GrayScottOptions): Sim {
  const { feed = .0367, kill = .0649, du = .2097, dv = .105, seed = 1, sub = 6 } = o
  return createSim({
    w: o.w, h: o.h, channels: 2, dt: o.dt ?? 1 / 12, every: o.every ?? 24,
    init: (g, w, h) => {
      for (let i = 0; i < w * h; i++) g[i * 2] = 1
      for (let b = 0; b < (o.blobs ?? 5); b++) {
        const cx = (hash01(seed, b, 1) * w) | 0, cy = (hash01(seed, b, 2) * h) | 0, r = 2 + ((hash01(seed, b, 3) * 3) | 0)
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          if (x * x + y * y > r * r) continue
          const i = (((cy + y + h) % h) * w + ((cx + x + w) % w)) * 2
          g[i] = .5; g[i + 1] = .25
        }
      }
    },
    step: (src, dst, w, h) => {
      let a = src, b = dst
      for (let s = 0; s < sub; s++) {
        for (let y = 0; y < h; y++) {
          const yu = ((y + h - 1) % h) * w, yc = y * w, yd = ((y + 1) % h) * w
          for (let x = 0; x < w; x++) {
            const xl = (x + w - 1) % w, xr = (x + 1) % w, i = (yc + x) * 2
            const U = a[i], V = a[i + 1]
            const lu = a[(yu + x) * 2] + a[(yd + x) * 2] + a[(yc + xl) * 2] + a[(yc + xr) * 2] - 4 * U
            const lv = a[(yu + x) * 2 + 1] + a[(yd + x) * 2 + 1] + a[(yc + xl) * 2 + 1] + a[(yc + xr) * 2 + 1] - 4 * V
            const uvv = U * V * V
            b[i] = clamp01(U + du * lu - uvv + feed * (1 - U))
            b[i + 1] = clamp01(V + dv * lv + uvv - (feed + kill) * V)
          }
        }
        const t = a; a = b; b = t
      }
      if (a !== dst) dst.set(a)
    },
  })
}

// ── Falling sand ── 1 = grain, 2 = wall. A seeded stream drops from the top; grains fall, then slide diagonally.
export const SAND = 1, WALL = 2
export interface SandOptions { w: number; h: number; seed?: number; dt?: number; rate?: number; every?: number }
export function fallingSand(o: SandOptions): Sim {
  const { seed = 1, rate = .7 } = o
  return createSim({
    w: o.w, h: o.h, dt: o.dt ?? 1 / 24, every: o.every ?? 48,
    init: (g, w, h) => {
      // two slanted ledges to scatter the stream
      const y0 = (h * (.4 + .06 * hash01(seed, 7))) | 0, x0 = (w * .2) | 0, x1 = (w * .6) | 0
      for (let x = x0; x < x1; x++) g[(y0 + (((x - x0) * .15) | 0)) * w + x] = WALL
      const y1 = (h * .8) | 0, x2 = (w * .45) | 0, x3 = (w * .85) | 0
      for (let x = x2; x < x3; x++) g[(y1 - (((x - x2) * .12) | 0)) * w + x] = WALL
    },
    step: (src, dst, w, h, n) => {
      dst.set(src)
      const dir = n & 1 ? 1 : -1
      for (let y = h - 2; y >= 0; y--) {
        for (let k = 0; k < w; k++) {
          const x = dir > 0 ? k : w - 1 - k, i = y * w + x
          if (dst[i] !== SAND) continue
          const d = i + w
          if (dst[d] === 0) { dst[d] = SAND; dst[i] = 0; continue }
          const first = hash01(seed, n, i) < .5 ? -1 : 1
          for (let m = 0; m < 2; m++) {
            const s = m ? -first : first, nx = x + s
            if (nx < 0 || nx >= w) continue
            if (dst[d + s] === 0 && dst[i + s] === 0) { dst[d + s] = SAND; dst[i] = 0; break }
          }
        }
      }
      // emitter: a grain at the top, x jittered around 42% across
      if (hash01(seed, n, 99) < rate) {
        const x = ((w * .42) + (hash01(seed, n, 5) - .5) * 4) | 0
        if (dst[x] === 0) dst[x] = SAND
      }
    },
  })
}

// ── Conway's Life ── torus, B3/S23, seeded soup.
export interface LifeOptions { w: number; h: number; seed?: number; density?: number; dt?: number; every?: number }
export function life(o: LifeOptions): Sim {
  const { seed = 1, density = .32 } = o
  return createSim({
    w: o.w, h: o.h, dt: o.dt ?? 1 / 8, every: o.every ?? 16,
    init: (g, w, h) => { for (let i = 0; i < w * h; i++) g[i] = hash01(seed, i) < density ? 1 : 0 },
    step: (src, dst, w, h) => {
      for (let y = 0; y < h; y++) {
        const yu = ((y + h - 1) % h) * w, yc = y * w, yd = ((y + 1) % h) * w
        for (let x = 0; x < w; x++) {
          const xl = (x + w - 1) % w, xr = (x + 1) % w
          const c = src[yu + xl] + src[yu + x] + src[yu + xr] + src[yc + xl] + src[yc + xr] + src[yd + xl] + src[yd + x] + src[yd + xr]
          dst[yc + x] = c === 3 || (c === 2 && src[yc + x] === 1) ? 1 : 0
        }
      }
    },
  })
}

/** Field of V (the pattern), lifted so thin fronts still draw. */
export const grayScottField = (sim: Sim, t: number): Field => simField(sim, t, 1, v => clamp01(v * 2.6))
export const sandField = (sim: Sim, t: number): Field => simField(sim, t, 0, v => v === SAND ? 1 : v === WALL ? .35 : 0)
export const lifeField = (sim: Sim, t: number): Field => simField(sim, t, 0)
