/**
 * Stable fluids (Stam 1999) on a coarse cell-centred grid in a closed box, CPU kernels.
 *
 * State (in a world's Float32Array, `FLUID_CHANNELS` planes of w×h): u, v (cells / s), ink density d and the
 * pressure p (kept so each projection warm-starts from the last one, which is why a few Jacobi sweeps do).
 * A step is a fixed sequence of passes, each a pure map over the grid that reads one set of planes and writes
 * another: forces (buoyancy along gravity, vorticity confinement, damping) → project → advect u, v
 * (semi-Lagrangian, bilinear, unconditionally stable) → project → advect d (MacCormack, limited) → dissipate. Every pass is one
 * compute dispatch on a GPU; Jacobi (not Gauss–Seidel) keeps that true for the pressure solve.
 * Walls: zero normal velocity on the border cells, zero-gradient pressure. Framework-free.
 */
export const FLUID_CHANNELS = 4

export interface FluidOptions {
  w: number; h: number
  /** Jacobi sweeps per projection (default 14; warm-started). */
  iterations?: number
  /** Vorticity confinement strength (default 2.2). */
  vorticity?: number
  /** Ink density dissipation per second (default .18). */
  dissipation?: number
  /** Velocity damping per second (default .35). */
  damping?: number
  /** Buoyancy: ink accelerates along gravity at `sink` × density cells / s² (default 30; negative = rises). */
  sink?: number
  /** Speed limit, cells / s (default 60). */
  maxSpeed?: number
  /** MacCormack ink advection: sharper edges for ~2× the density pass (default true). */
  sharp?: boolean
}
export interface Fluid extends Required<FluidOptions> {
  n: number
  /** Plane offsets inside the state. */
  U: number; V: number; D: number; P: number
  /** Scratch planes (never state). */
  a: Float32Array; b: Float32Array; div: Float32Array; curl: Float32Array
}

export function createFluid(o: FluidOptions): Fluid {
  const n = o.w * o.h
  return {
    w: o.w, h: o.h, iterations: o.iterations ?? 14, vorticity: o.vorticity ?? 2.2, dissipation: o.dissipation ?? .18,
    damping: o.damping ?? .35, sink: o.sink ?? 30, maxSpeed: o.maxSpeed ?? 60, sharp: o.sharp ?? true,
    n, U: 0, V: n, D: 2 * n, P: 3 * n,
    a: new Float32Array(n), b: new Float32Array(n), div: new Float32Array(n), curl: new Float32Array(n),
  }
}
/** Floats of state a fluid needs. */
export const fluidSize = (f: Fluid) => f.n * FLUID_CHANNELS

/** Bilinear sample of plane `off` at cell coordinates (x, y), clamped to the cell centres. */
function bilerp(s: Float32Array, off: number, w: number, h: number, x: number, y: number): number {
  x = x < 0 ? 0 : x > w - 1 ? w - 1 : x; y = y < 0 ? 0 : y > h - 1 ? h - 1 : y
  const x0 = x | 0, y0 = y | 0, x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0, fx = x - x0, fy = y - y0
  const r0 = off + y0 * w, r1 = off + y1 * w
  return (s[r0 + x0] * (1 - fx) + s[r0 + x1] * fx) * (1 - fy) + (s[r1 + x0] * (1 - fx) + s[r1 + x1] * fx) * fy
}
/** Ink density at cell coordinates (bilinear). */
export const fluidDensityAt = (f: Fluid, s: Float32Array, x: number, y: number) => bilerp(s, f.D, f.w, f.h, x, y)

/**
 * Gaussian splat at cell (x, y), radius r cells: adds velocity (du, dv) in cells / s and ink dd (density is
 * capped at `cap`). The kernel is cut at 2.5 r.
 */
export function fluidSplat(f: Fluid, s: Float32Array, x: number, y: number, r: number, du: number, dv: number, dd: number, cap = 1.5): void {
  const { w, h } = f, reach = r * 2.5, inv = 1 / (r * r)
  const c0 = Math.max(0, Math.floor(x - reach)), c1 = Math.min(w - 1, Math.ceil(x + reach))
  const r0 = Math.max(0, Math.floor(y - reach)), r1 = Math.min(h - 1, Math.ceil(y + reach))
  for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) {
    const dx = i - x, dy = j - y, g = Math.exp(-(dx * dx + dy * dy) * inv)
    if (g < .01) continue
    const c = j * w + i
    s[f.U + c] += du * g; s[f.V + c] += dv * g
    if (dd) { const d = s[f.D + c] + dd * g; s[f.D + c] = d > cap ? cap : d < 0 ? 0 : d }
  }
}

/** Zero normal velocity on the border cells (closed box). */
function walls(f: Fluid, s: Float32Array) {
  const { w, h, U, V } = f
  for (let j = 0; j < h; j++) { s[U + j * w] = 0; s[U + j * w + w - 1] = 0 }
  for (let i = 0; i < w; i++) { s[V + i] = 0; s[V + (h - 1) * w + i] = 0 }
}

/** Make (u, v) divergence-free: Jacobi on ∇²p = ∇·u from the stored p, then u -= ∇p. */
function project(f: Fluid, s: Float32Array) {
  const { w, h, U, V, P, div, a } = f
  walls(f, s)
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i
    const ur = i < w - 1 ? s[U + c + 1] : 0, ul = i > 0 ? s[U + c - 1] : 0
    const vd = j < h - 1 ? s[V + c + w] : 0, vu = j > 0 ? s[V + c - w] : 0
    div[c] = .5 * (ur - ul + vd - vu)
  }
  // ping-pong between the state's p plane and scratch `a`; an even sweep count ends in the state
  const sweeps = f.iterations + (f.iterations & 1)
  for (let k = 0; k < sweeps; k++) {
    const src = k & 1 ? a : s, so = k & 1 ? 0 : P, dst = k & 1 ? s : a, dof = k & 1 ? P : 0
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const c = j * w + i, pc = src[so + c]
      const pl = i > 0 ? src[so + c - 1] : pc, pr = i < w - 1 ? src[so + c + 1] : pc
      const pu = j > 0 ? src[so + c - w] : pc, pd = j < h - 1 ? src[so + c + w] : pc
      dst[dof + c] = (pl + pr + pu + pd - div[c]) * .25
    }
  }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i, pc = s[P + c]
    const pl = i > 0 ? s[P + c - 1] : pc, pr = i < w - 1 ? s[P + c + 1] : pc
    const pu = j > 0 ? s[P + c - w] : pc, pd = j < h - 1 ? s[P + c + w] : pc
    s[U + c] -= .5 * (pr - pl); s[V + c] -= .5 * (pd - pu)
  }
  walls(f, s)
}

/** Semi-Lagrangian advection of plane `off` by the state's velocity, through scratch `tmp`. */
function advect(f: Fluid, s: Float32Array, off: number, tmp: Float32Array, dt: number) {
  const { w, h, U, V } = f
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i
    tmp[c] = bilerp(s, off, w, h, i - dt * s[U + c], j - dt * s[V + c])
  }
  s.set(tmp, off)
}
/**
 * MacCormack advection (Selle et al. 2008) of plane `off`: a forward and a backward semi-Lagrangian pass
 * estimate the scheme's own error and correct half of it, limited to the range of the four source cells, so
 * ink keeps its edges on a coarse grid without new extrema. Three passes, each a pure grid map.
 */
function advectSharp(f: Fluid, s: Float32Array, off: number, dt: number) {
  const { w, h, U, V, a, b } = f
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = j * w + i; a[c] = bilerp(s, off, w, h, i - dt * s[U + c], j - dt * s[V + c]) }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const c = j * w + i; b[c] = bilerp(a, 0, w, h, i + dt * s[U + c], j + dt * s[V + c]) }
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i
    let x = i - dt * s[U + c], y = j - dt * s[V + c]
    x = x < 0 ? 0 : x > w - 1 ? w - 1 : x; y = y < 0 ? 0 : y > h - 1 ? h - 1 : y
    const x0 = x | 0, y0 = y | 0, x1 = x0 < w - 1 ? x0 + 1 : x0, y1 = y0 < h - 1 ? y0 + 1 : y0
    const q0 = s[off + y0 * w + x0], q1 = s[off + y0 * w + x1], q2 = s[off + y1 * w + x0], q3 = s[off + y1 * w + x1]
    const lo = Math.min(q0, q1, q2, q3), hi = Math.max(q0, q1, q2, q3), v = a[c] + .5 * (s[off + c] - b[c])
    b[c] = v < lo ? lo : v > hi ? hi : v
  }
  s.set(b, off)
}

/** Forces: buoyancy along (gx, gy), vorticity confinement, damping and the speed limit. */
function forces(f: Fluid, s: Float32Array, dt: number, gx: number, gy: number) {
  const { w, h, U, V, D, curl } = f
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i
    const vr = i < w - 1 ? s[V + c + 1] : 0, vl = i > 0 ? s[V + c - 1] : 0, ud = j < h - 1 ? s[U + c + w] : 0, uu = j > 0 ? s[U + c - w] : 0
    curl[c] = .5 * (vr - vl - (ud - uu))
  }
  const eps = f.vorticity, sink = f.sink * dt, damp = 1 / (1 + f.damping * dt), vmax = f.maxSpeed
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i, d = s[D + c]
    let fu = sink * d * gx, fv = sink * d * gy
    if (i > 0 && j > 0 && i < w - 1 && j < h - 1) {
      // N = ∇|ω| / |∇|ω||, f = ε (N × ω)
      const nx = .5 * (Math.abs(curl[c + 1]) - Math.abs(curl[c - 1])), ny = .5 * (Math.abs(curl[c + w]) - Math.abs(curl[c - w]))
      const len = Math.hypot(nx, ny) + 1e-5, wv = curl[c]
      fu += eps * dt * (ny / len) * wv; fv -= eps * dt * (nx / len) * wv
    }
    let u = (s[U + c] + fu) * damp, v = (s[V + c] + fv) * damp
    const sp = u * u + v * v
    if (sp > vmax * vmax) { const k = vmax / Math.sqrt(sp); u *= k; v *= k }
    s[U + c] = u; s[V + c] = v
  }
}

/** One stable-fluids step of `dt` seconds with gravity (gx, gy) in g. */
export function fluidStep(f: Fluid, s: Float32Array, dt: number, gx = 0, gy = 1): void {
  forces(f, s, dt, gx, gy)
  project(f, s)
  // self-advection: both planes backtrace through the same (projected) field, written after both are read
  const { w, h, U, V, D, n, a, b } = f
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = j * w + i, x = i - dt * s[U + c], y = j - dt * s[V + c]
    a[c] = bilerp(s, U, w, h, x, y); b[c] = bilerp(s, V, w, h, x, y)
  }
  s.set(a, U); s.set(b, V)
  project(f, s)
  if (f.sharp) advectSharp(f, s, D, dt); else advect(f, s, D, a, dt)
  const keep = 1 / (1 + f.dissipation * dt)
  for (let c = 0; c < n; c++) { const d = s[D + c] * keep; s[D + c] = d < 1e-4 ? 0 : d }
}

/** Total ink (mass accounting in tests). */
export function fluidInk(f: Fluid, s: Float32Array): number { let m = 0; for (let c = 0; c < f.n; c++) m += s[f.D + c]; return m }
/** Largest |divergence| after a projection (tests). */
export function fluidMaxDivergence(f: Fluid, s: Float32Array): number {
  const { w, h, U, V } = f
  let m = 0
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const c = j * w + i, d = Math.abs(.5 * (s[U + c + 1] - s[U + c - 1] + s[V + c + w] - s[V + c - w]))
    if (d > m) m = d
  }
  return m
}
