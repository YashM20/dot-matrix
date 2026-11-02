/**
 * Iterated function systems by the chaos game: a few affine maps T(p) = A·p + B, one picked at random each step
 * (with probability |det A| / Σ|det A|, so the density over the attractor comes out smooth), applied to one
 * point over and over; the orbit is binned into a density. "Flames" style adds a nonlinear map after the affine
 * one: the article's twist (rotate by φ = k·|p| + a·sin(ω·n)) or a plane inversion p / |p|².
 *
 * Each orbit point also has an address: the base-m number formed by the maps that led to it, most recent first,
 * in [0, 1). The article colours by it; a card can use the mean address per cell as a second channel.
 *
 * Deterministic: a seeded stream (`rngFor`), `tsin`/`tcos`, `Math.sqrt`, + − × /.
 */
import { rngFor } from '../noise/dmath'
import { tcos, tsin } from '../noise/trig'
import { histogram, plotter, type Histogram } from './density'

/** x' = a·x + b·y + e, y' = c·x + d·y + f. */
export type Affine = readonly [a: number, b: number, c: number, d: number, e: number, f: number]
export const affineDet = (m: Affine) => m[0] * m[3] - m[1] * m[2]

// after Inigo Quilez, https://iquilezles.org/articles/ifsfractals/ (MIT)
/** Cumulative pick probabilities P(i) = |det Aᵢ| / Σₖ|det Aₖ| (a map with det 0 gets a small floor so it still fires). */
export function ifsWeights(maps: readonly Affine[]): Float64Array {
  const w = maps.map(m => Math.max(Math.abs(affineDet(m)), 1e-3)), sum = w.reduce((a, b) => a + b, 0), out = new Float64Array(maps.length)
  let acc = 0
  for (let i = 0; i < maps.length; i++) { acc += w[i] / sum; out[i] = acc }
  out[maps.length - 1] = 1
  return out
}

/** The Flames-style nonlinear map applied after each affine step (none: plain IFS). */
export type Variation =
  | { kind: 'twist'; k?: number; amp?: number; omega?: number }
  | { kind: 'inversion' }

// after Inigo Quilez, https://iquilezles.org/articles/ifsfractals/ (MIT)
/**
 * The variation at orbit step n, applied to (x, y) into `out`: twist rotates by φ = k·|p| + amp·sin(ω·n)
 * (k = 1, amp = 1 as in the article's formula); inversion is p / |p|² (the origin stays put).
 */
export function applyVariation(v: Variation, x: number, y: number, n: number, out: [number, number]): void {
  if (v.kind === 'inversion') { const r2 = x * x + y * y; if (r2 > 0) { out[0] = x / r2; out[1] = y / r2 } else { out[0] = x; out[1] = y } return }
  const { k = 1, amp = 1, omega = 0 } = v, phi = k * Math.sqrt(x * x + y * y) + (amp ? amp * tsin(omega * n) : 0)
  const c = tcos(phi), s = tsin(phi)
  out[0] = c * x - s * y; out[1] = s * x + c * y
}

export interface ChaosGameOptions {
  maps: readonly Affine[]
  /** Histogram size and window. */
  w: number
  h: number
  window: readonly [number, number, number, number]
  /** Orbit points binned, after `warmup` discarded ones (default 32). */
  steps: number
  warmup?: number
  seed?: number
  variation?: Variation
  /** Also accumulate the mean address per cell (default false). */
  address?: boolean
}
export interface ChaosGame extends Histogram {
  /** Mean address per cell in [0, 1) (only with `address`). */
  address?: Float32Array
}

// after Inigo Quilez, https://iquilezles.org/articles/ifsfractals/ (MIT)
/** A seeded chaos-game walker: `next()` advances one step and returns the map index it used; x, y hold the point. */
export function chaosWalker(maps: readonly Affine[], seed = 1, variation?: Variation) {
  const cum = ifsWeights(maps), rnd = rngFor(seed, 0x1f5), m = maps.length, q: [number, number] = [0, 0]
  const w = { x: rnd() - .5, y: rnd() - .5, n: 0, address: 0, next: (): number => {
    const r = rnd()
    let i = 0
    while (i < m - 1 && r >= cum[i]) i++
    const t = maps[i], x = t[0] * w.x + t[1] * w.y + t[4], y = t[2] * w.x + t[3] * w.y + t[5]
    if (variation) { applyVariation(variation, x, y, w.n, q); w.x = q[0]; w.y = q[1] } else { w.x = x; w.y = y }
    w.address = (i + w.address) / m
    w.n++
    return i
  } }
  return w
}

// after Inigo Quilez, https://iquilezles.org/articles/ifsfractals/ (MIT)
/** The chaos game's density: one seeded orbit, `steps` points binned. A fixed count, so the bake is deterministic. */
export function chaosGame(o: ChaosGameOptions): ChaosGame {
  const hist: ChaosGame = histogram(o.w, o.h, o.window), plot = plotter(hist), walk = chaosWalker(o.maps, o.seed, o.variation)
  const addr = o.address ? new Float32Array(o.w * o.h) : undefined
  for (let i = 0, n = o.warmup ?? 32; i < n; i++) walk.next()
  const [x0, y0, x1, y1] = o.window, sx = o.w / (x1 - x0), sy = o.h / (y1 - y0)
  for (let i = 0; i < o.steps; i++) {
    walk.next()
    plot(walk.x, walk.y)
    if (addr) {
      const px = Math.floor((walk.x - x0) * sx), py = Math.floor((walk.y - y0) * sy)
      if (px >= 0 && py >= 0 && px < o.w && py < o.h) addr[py * o.w + px] += walk.address
    }
  }
  if (addr) { for (let i = 0; i < addr.length; i++) if (hist.hits[i] > 0) addr[i] /= hist.hits[i]; hist.address = addr }
  return hist
}
