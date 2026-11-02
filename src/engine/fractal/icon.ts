/**
 * Symmetric icons (Field and Golubitsky, *Symmetry in Chaos*, 1992): a map of the complex plane that commutes with
 * rotation by 2π/n, so its chaotic attractor has n-fold symmetry. Rendered like the IFS and popcorn images: iterate
 * one point, bin the orbit, map the density to tone.
 *
 *   F(z) = (λ + α·|z|² + β·Re(zⁿ) + iω)·z + γ·z̄ⁿ⁻¹
 *
 * The article writes it from memory as k = λ + α|z| + β·Re(zⁿ), z → k·z + γ·z̄ − ω·z·e^{iπ/2}; this is the book's
 * form, which it names as the source: |z|² and z̄ⁿ⁻¹ are what make the map n-fold symmetric. ω = 0 adds mirror
 * symmetry (the dihedral group); ω ≠ 0 spins it.
 *
 * Deterministic: + − × /, a seeded start, a fixed step count.
 */
import { histogram, plotter, type Histogram } from './density'

export interface IconParams { lambda: number; alpha: number; beta: number; gamma: number; omega: number; n: number }

// after Inigo Quilez, https://iquilezles.org/articles/iconimages/ (MIT), after Field and Golubitsky, Symmetry in Chaos
/** One step of the icon map from (x, y), written to `out` [x, y]. */
export function iconStep(p: IconParams, x: number, y: number, out: [number, number]): void {
  // z^(n-1) by repeated multiplication, then z^n = z^(n-1)·z
  let ux = x, uy = y
  for (let k = 2; k < p.n; k++) { const t = ux * x - uy * y; uy = ux * y + uy * x; ux = t }
  if (p.n < 2) { ux = 1; uy = 0 }
  const znx = ux * x - uy * y, zz = x * x + y * y
  const k = p.lambda + p.alpha * zz + p.beta * znx
  // (k + iω)·z + γ·conj(z^(n-1))
  out[0] = k * x - p.omega * y + p.gamma * ux
  out[1] = k * y + p.omega * x - p.gamma * uy
}

export interface IconOptions {
  /** Histogram size and window (centred on the origin; the attractor is symmetric about it). */
  w: number
  h: number
  window: readonly [number, number, number, number]
  /** Orbit points binned, after `warmup` discarded ones (default 100). */
  steps: number
  warmup?: number
  /** Start point (default .01, .003: off every symmetry axis). */
  x0?: number
  y0?: number
}

// after Inigo Quilez, https://iquilezles.org/articles/iconimages/ (MIT), after Field and Golubitsky, Symmetry in Chaos
/** The icon's density: one orbit, `steps` points binned. Stops early (with what it has) if the orbit runs off to infinity. */
export function iconDensity(p: IconParams, o: IconOptions): Histogram {
  const hist = histogram(o.w, o.h, o.window), plot = plotter(hist), q: [number, number] = [0, 0]
  let x = o.x0 ?? .01, y = o.y0 ?? .003
  for (let i = -(o.warmup ?? 100); i < o.steps; i++) {
    iconStep(p, x, y, q); x = q[0]; y = q[1]
    if (!(x * x + y * y < 1e12)) break
    if (i >= 0) plot(x, y)
  }
  return hist
}

/** The radius the orbit reaches (max |z| over `steps` points after a warm-up): for framing a window. */
export function iconRadius(p: IconParams, steps = 20000, warmup = 100): number {
  const q: [number, number] = [0, 0]
  let x = .01, y = .003, r2 = 0
  for (let i = -warmup; i < steps; i++) {
    iconStep(p, x, y, q); x = q[0]; y = q[1]
    const d = x * x + y * y
    if (!(d < 1e12)) return Infinity
    if (i >= 0 && d > r2) r2 = d
  }
  return Math.sqrt(r2)
}
