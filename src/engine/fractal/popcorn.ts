/**
 * Popcorn images: the orbits of a stationary velocity field p' = v(p), stepped with Euler at a small time step λ,
 * binned into a density. Two fields:
 *
 *   pickover   x ← x − λ·sin(y + tan 3y)              y ← y − λ·sin(x + tan 3x)            (Pickover's originals)
 *   iq         x ← x + λ·cos(t₀ + y + cos(t₁ + πx))   y ← y + λ·cos(t₂ + x + cos(t₃ + πy))  (the article's variant)
 *
 * Both read the old (x, y) for both updates. The article also renders without a histogram: start one orbit at each
 * pixel and colour by the distance it travels (`popcornTravel`).
 *
 * Deterministic: `tsin` / `tcos` (table sine, src/engine/noise/trig) and a seeded stream (`rngFor`), so a chaotic
 * orbit lands on the same cells in every engine.
 */
import { rngFor } from '../noise/dmath'
import { tcos, tsin } from '../noise/trig'
import { histogram, plotter, type Histogram } from './density'

export interface PopcornParams {
  kind: 'pickover' | 'iq'
  /** Euler time step λ. */
  h: number
  /** The `iq` field's phases t₀ … t₃ (ignored by `pickover`). */
  t?: readonly [number, number, number, number]
}
const PI = Math.PI

// after Inigo Quilez, https://iquilezles.org/articles/popcorns/ (MIT), after Clifford Pickover's popcorn formulas
/** One Euler step of the popcorn field from (x, y), written to `out` [x, y]. */
export function popcornStep(p: PopcornParams, x: number, y: number, out: [number, number] | Float64Array): void {
  const h = p.h
  if (p.kind === 'pickover') {
    // tan 3y as sin / cos: the table sine keeps the step bit-identical
    const ty = tsin(3 * y) / tcos(3 * y), tx = tsin(3 * x) / tcos(3 * x)
    out[0] = x - h * tsin(y + ty)
    out[1] = y - h * tsin(x + tx)
  } else {
    const t = p.t ?? [0, 0, 0, 0]
    out[0] = x + h * tcos(t[0] + y + tcos(t[1] + PI * x))
    out[1] = y + h * tcos(t[2] + x + tcos(t[3] + PI * y))
  }
}

export interface PopcornOptions {
  /** Histogram size and window. */
  w: number
  h: number
  window: readonly [number, number, number, number]
  /** Number of orbits, each started at a seeded random point of `start` (default: the window). */
  orbits: number
  start?: readonly [number, number, number, number]
  /** Euler steps per orbit, all binned (popcorn orbits are transients: no warm-up). */
  steps: number
  seed?: number
}

// after Inigo Quilez, https://iquilezles.org/articles/popcorns/ (MIT), after Clifford Pickover
/** The popcorn density: `orbits` seeded starts × `steps` Euler steps, binned. A fixed count, so the bake is deterministic. */
export function popcornDensity(p: PopcornParams, o: PopcornOptions): Histogram {
  const hist = histogram(o.w, o.h, o.window), plot = plotter(hist), [sx0, sy0, sx1, sy1] = o.start ?? o.window
  const rnd = rngFor(o.seed ?? 1, 0x9c0), q: [number, number] = [0, 0]
  for (let k = 0; k < o.orbits; k++) {
    let x = sx0 + (sx1 - sx0) * rnd(), y = sy0 + (sy1 - sy0) * rnd()
    for (let i = 0; i < o.steps; i++) { popcornStep(p, x, y, q); x = q[0]; y = q[1]; plot(x, y) }
  }
  return hist
}

/** One orbit from (x, y): `steps` points as x, y pairs (for drawing a single grain's path). */
export function popcornPath(p: PopcornParams, x: number, y: number, steps: number): Float64Array {
  const out = new Float64Array(2 * steps), q: [number, number] = [0, 0]
  for (let i = 0; i < steps; i++) { popcornStep(p, x, y, q); x = q[0]; y = q[1]; out[2 * i] = x; out[2 * i + 1] = y }
  return out
}

// after Inigo Quilez, https://iquilezles.org/articles/popcorns/ (MIT)
/** The article's histogram-free render: the distance an orbit started at (x, y) travels in `steps` Euler steps. */
export function popcornTravel(p: PopcornParams, x: number, y: number, steps: number): number {
  const q: [number, number] = [0, 0]
  let d = 0
  for (let i = 0; i < steps; i++) {
    popcornStep(p, x, y, q)
    const dx = q[0] - x, dy = q[1] - y
    d += Math.sqrt(dx * dx + dy * dy); x = q[0]; y = q[1]
  }
  return d
}
