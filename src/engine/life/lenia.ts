/**
 * Particle Lenia (Mordvintsev, Niklasson and Randazzo, Google Research 2022), written from the published math:
 * every particle descends an energy field built from the others.
 *
 *   U(x) = Σ_j K(|x − p_j|),   K(r) = w_K · exp(−((r − μ_K) / σ_K)²)      a ring-shaped density
 *   G(u) = exp(−((u − μ_G) / σ_G)²)                                    growth: how much a spot likes its density
 *   R(x) = (c_rep / 2) · Σ_j max(1 − |x − p_j|, 0)²                     short-range repulsion
 *   E(x) = R(x) − G(U(x)),   p_i ← p_i − dt · ∇E(p_i)                   explicit Euler, fixed dt
 *
 * ∇E(p_i) = ∇R(p_i) − G′(U(p_i)) · ∇U(p_i), so one sweep over the pairs within the kernel's reach gives U, ∇U
 * and ∇R at every particle (each pair once, both ends). K and K′ come from a table over r built with `dexp`, read
 * with linear interpolation; G uses `dexp` directly. Only +, ×, ÷ and `Math.sqrt` on doubles, in a fixed order
 * (the spatial hash's bucket order), so a run is bit-identical across engines. Typed-array scratch is allocated once.
 */
import { dexp } from '../noise/dmath'
import { createHash, type SpatialHash } from '../physics/particles'
import { hashPoints } from './steer'

export interface LeniaParams {
  /** Kernel ring radius and width, and its weight. */
  muK: number; sigmaK: number; wK: number
  /** The density the growth function likes, and how picky it is. */
  muG: number; sigmaG: number
  /** Repulsion strength (reach 1). */
  cRep: number
}
/** The 2D rotor of the paper (its default set). */
export const LENIA_ROTOR: LeniaParams = { muK: 4, sigmaK: 1, wK: .022, muG: .6, sigmaG: .15, cRep: 1 }

/** Table resolution over r ∈ [0, reach]. */
const TAB = 1024

export interface Lenia {
  params: LeniaParams
  n: number
  /** The kernel's reach, μ_K + 3σ_K (K < 1.3e-4 · w_K past it). */
  reach: number
  hash: SpatialHash
  /** Per particle after a sweep: U, ∂U/∂x, ∂U/∂y, R, ∂R/∂x, ∂R/∂y. */
  U: Float64Array; UX: Float64Array; UY: Float64Array; R: Float64Array; RX: Float64Array; RY: Float64Array
  kTab: Float64Array; dkTab: Float64Array
}

/** A solver for `n` particles inside `bounds` (world units; positions outside clamp into the edge buckets). */
export function createLenia(params: LeniaParams, n: number, bounds: [number, number, number, number]): Lenia {
  const reach = params.muK + 3 * params.sigmaK
  const kTab = new Float64Array(TAB + 2), dkTab = new Float64Array(TAB + 2)
  for (let i = 0; i < TAB + 2; i++) {
    const r = (i / TAB) * reach, z = (r - params.muK) / params.sigmaK, k = params.wK * dexp(-z * z)
    kTab[i] = k; dkTab[i] = (-2 * z / params.sigmaK) * k
  }
  const f = () => new Float64Array(n)
  return { params, n, reach, hash: createHash(n, bounds, reach), U: f(), UX: f(), UY: f(), R: f(), RX: f(), RY: f(), kTab, dkTab }
}

/** G(u) and G′(u). */
export function growth(p: LeniaParams, u: number): [number, number] {
  const z = (u - p.muG) / p.sigmaG, g = dexp(-z * z)
  return [g, (-2 * z / p.sigmaG) * g]
}

/** Half stencil: each cell meets itself and these four neighbours, so every pair of nearby cells is visited once. */
const HALF = [1, 0, -1, 1, 0, 1, 1, 1]
/** One sweep: U, ∇U, R and ∇R at every particle of `s` (planes X and Y). */
export function leniaFields(L: Lenia, s: Float32Array, X: number, Y: number): void {
  const { n, hash, U, UX, UY, R, RX, RY, kTab, dkTab, reach } = L, c = L.params.cRep
  hashPoints(hash, s, n, X, Y)
  const inv = TAB / reach, reach2 = reach * reach
  U.fill(kTab[0]); UX.fill(0); UY.fill(0); R.fill(0); RX.fill(0); RY.fill(0)
  const { cols, rows, start, items } = hash
  // the pairs between bucket ranges [a0, a1) and [b0, b1) of `items` (same = one bucket with itself), both ends
  const span = (a0: number, a1: number, b0: number, b1: number, same: boolean) => {
    for (let p = a0; p < a1; p++) {
      const i = items[p], xi = s[X + i], yi = s[Y + i]
      let u = 0, ux = 0, uy = 0, rr = 0, rx = 0, ry = 0
      for (let q = same ? p + 1 : b0; q < b1; q++) {
        const j = items[q], dx = xi - s[X + j], dy = yi - s[Y + j], r2 = dx * dx + dy * dy
        if (r2 >= reach2 || r2 < 1e-18) continue
        const r = Math.sqrt(r2), a = r * inv, t0 = a | 0, w = a - t0
        const k = kTab[t0] + (kTab[t0 + 1] - kTab[t0]) * w, dk = (dkTab[t0] + (dkTab[t0 + 1] - dkTab[t0]) * w) / r
        u += k; U[j] += k
        ux += dk * dx; uy += dk * dy; UX[j] -= dk * dx; UY[j] -= dk * dy
        if (r < 1) {
          const m = 1 - r, h = .5 * c * m * m, g = (c * m) / r
          rr += h; R[j] += h
          rx -= g * dx; ry -= g * dy; RX[j] += g * dx; RY[j] += g * dy
        }
      }
      U[i] += u; UX[i] += ux; UY[i] += uy; R[i] += rr; RX[i] += rx; RY[i] += ry
    }
  }
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const c0 = cy * cols + cx, a0 = start[c0], a1 = start[c0 + 1]
    if (a0 === a1) continue
    span(a0, a1, a0, a1, true)
    for (let h = 0; h < 8; h += 2) {
      const gx = cx + HALF[h], gy = cy + HALF[h + 1]
      if (gx < 0 || gx >= cols || gy >= rows) continue
      const c1 = gy * cols + gx
      if (start[c1] < start[c1 + 1]) span(a0, a1, start[c1], start[c1 + 1], false)
    }
  }
}

/**
 * One Euler step of size `dt` in place. `fx`, `fy` (optional, per particle) are extra forces added to −∇E (walls,
 * a pointer); `scale` multiplies the whole step per particle (0 = held still).
 * Returns the mean energy E̅ = (1/n) Σ (R_i − G(U_i)) before the step.
 */
export function leniaStep(L: Lenia, s: Float32Array, X: number, Y: number, dt: number, fx?: Float64Array, fy?: Float64Array): number {
  leniaFields(L, s, X, Y)
  const { n, U, UX, UY, R, RX, RY, params } = L
  let e = 0
  for (let i = 0; i < n; i++) {
    const z = (U[i] - params.muG) / params.sigmaG, g = dexp(-z * z), dg = (-2 * z / params.sigmaG) * g
    e += R[i] - g
    let vx = dg * UX[i] - RX[i], vy = dg * UY[i] - RY[i]
    if (fx && fy) { vx += fx[i]; vy += fy[i] }
    s[X + i] += dt * vx; s[Y + i] += dt * vy
  }
  return e / n
}

/** Mean energy of the current positions (one sweep, no step). */
export function leniaEnergy(L: Lenia, s: Float32Array, X: number, Y: number): number {
  leniaFields(L, s, X, Y)
  let e = 0
  for (let i = 0; i < L.n; i++) e += L.R[i] - growth(L.params, L.U[i])[0]
  return e / L.n
}
