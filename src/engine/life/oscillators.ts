/**
 * Coupled oscillators (docs/living-matter/L-pond.md §L2 "oscillators.ts"):
 * - **Kuramoto** (1975/1984): dθᵢ = ωᵢ + (K/|Nᵢ|)·Σ sin(θⱼ − θᵢ), explicit Euler, all derivatives from the old
 *   phases (Jacobi), so the result is independent of index order. The jellies' pulse phases drift into loose sync.
 * - **Mirollo–Strogatz pulse coupling** (SIAM J. Appl. Math. 50, 1990): a phase φ climbs to 1, fires and resets;
 *   each firing kicks its neighbours through the concave state x = f(φ) = 1 − (1 − φ)², by ε. A kicked oscillator
 *   that reaches x ≥ 1 fires in the same step (absorption). Synchronous rounds (≤ 4) make the result independent of
 *   index order: kicks are counted per round, then applied. The fireflies' flashes fall into step this way.
 */
import { dcos, dsin, TAU } from '../noise'
import { buildHash, type SpatialHash } from '../physics/particles'

let dth = new Float64Array(0)
/** dθᵢ = ωᵢ + (K/|Nᵢ|)·Σ dsin(θⱼ − θᵢ), explicit Euler, θ wrapped to [0, 2π). `neighbours(i, visit)` lists i's neighbours. */
export function kuramotoStep(theta: Float32Array, omega: ArrayLike<number>, k: number, neighbours: (i: number, visit: (j: number) => void) => void, dt: number): void {
  const n = theta.length
  if (dth.length < n) dth = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0, m = 0
    const ti = theta[i]
    neighbours(i, j => { if (j !== i) { sum += dsin(theta[j] - ti); m++ } })
    dth[i] = omega[i] + (m ? (k / m) * sum : 0)
  }
  for (let i = 0; i < n; i++) {
    let v = theta[i] + dth[i] * dt
    v -= Math.floor(v / TAU) * TAU
    theta[i] = v < TAU ? v : 0
  }
}
/** Order parameter r = |Σ e^{iθ}| / N (1 = in phase, ≈ 0 = spread). */
export function kuramotoOrder(theta: ArrayLike<number>): number {
  let c = 0, s = 0
  for (let i = 0; i < theta.length; i++) { c += dcos(theta[i]); s += dsin(theta[i]) }
  return theta.length ? Math.sqrt(c * c + s * s) / theta.length : 0
}

export interface PulseSpec {
  n: number
  /** Free period in seconds, one for all or one per oscillator. */
  period: number | Float32Array
  /** Kick per firing neighbour, on the state scale x. */
  eps: number
  /** Seconds after a fire during which kicks are ignored. */
  refractory: number
  /** Coupling radius (same units as `pos`). */
  radius: number
}
/** State function x = f(φ) = 1 − (1 − φ)² (concave up to 1) and its exact inverse φ = 1 − √(1 − x). */
export const pulseF = (phi: number) => 1 - (1 - phi) * (1 - phi)
export const pulseFInv = (x: number) => 1 - Math.sqrt(1 - x)
let kick = new Float32Array(0), now = new Uint8Array(0), list = new Int32Array(0), next = new Int32Array(0)
/**
 * One step of Mirollo–Strogatz with local coupling. `phase` (0..1), `age` (seconds since the last fire; the plan's
 * "step of last fire" as an age, so a looped world's fold never makes it negative) and `pos` (planes: x[n], y[n],
 * kind[n] with kind 0 = off, the layout `buildHash` reads) are views into the world state. The hash is rebuilt here.
 * φ += dt/Tᵢ; φ ≥ 1 fires (φ ← 0, age ← 0). Each round, every oscillator within `radius` of a firing one that is
 * not refractory and has not fired this step counts the firings; then x = f(φ) + ε·count, and x ≥ 1 fires in the
 * next round. After 4 rounds the remaining absorbed oscillators fire without kicking. Returns the fire count.
 */
export function pulseStep(phase: Float32Array, age: Float32Array, pos: Float32Array, hash: SpatialHash, spec: PulseSpec, n: number, dt: number): number {
  void n
  const N = spec.n, r2 = spec.radius * spec.radius
  if (kick.length < N) { kick = new Float32Array(N); now = new Uint8Array(N); list = new Int32Array(N); next = new Int32Array(N) }
  buildHash(hash, pos, N, 0, N, 2 * N)
  let m = 0
  for (let i = 0; i < N; i++) {
    now[i] = 0
    if (pos[2 * N + i] === 0) continue
    age[i] += dt
    const T = typeof spec.period === 'number' ? spec.period : spec.period[i]
    phase[i] += dt / T
    if (phase[i] >= 1) list[m++] = i
  }
  let fires = 0
  const { cell, cols, rows, x0, y0, start, items } = hash, reach = Math.ceil(spec.radius / cell)
  for (let round = 0; m > 0; round++) {
    for (let q = 0; q < m; q++) { const i = list[q]; now[i] = 1; phase[i] = 0; age[i] = 0; fires++ }
    if (round >= 4) break
    for (let i = 0; i < N; i++) kick[i] = 0
    for (let q = 0; q < m; q++) {
      const j = list[q], xj = pos[j], yj = pos[N + j]
      const cx = Math.min(cols - 1, Math.max(0, Math.floor((xj - x0) / cell))), cy = Math.min(rows - 1, Math.max(0, Math.floor((yj - y0) / cell)))
      for (let gy = Math.max(0, cy - reach); gy <= Math.min(rows - 1, cy + reach); gy++) for (let gx = Math.max(0, cx - reach); gx <= Math.min(cols - 1, cx + reach); gx++) {
        const c = gy * cols + gx
        for (let k = start[c]; k < start[c + 1]; k++) {
          const i = items[k]
          if (now[i] || age[i] < spec.refractory) continue
          const dx = pos[i] - xj, dy = pos[N + i] - yj
          if (dx * dx + dy * dy <= r2) kick[i]++
        }
      }
    }
    let mm = 0
    for (let i = 0; i < N; i++) {
      if (!kick[i]) continue
      const x = pulseF(phase[i]) + spec.eps * kick[i]
      if (x >= 1) next[mm++] = i
      else phase[i] = pulseFInv(x)
    }
    for (let q = 0; q < mm; q++) list[q] = next[q]
    m = mm
  }
  return fires
}
/** Fired this step (valid after `pulseStep` until the next call). */
export const pulseFiredNow = (i: number) => now[i] === 1
