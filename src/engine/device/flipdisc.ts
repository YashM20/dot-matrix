/**
 * Flip-disc panel simulator. Each disc is a two-faced coin on an axle (bright face = on, black face =
 * off); a coil pulse kicks it half a turn. The controller writes the panel column by column, so a
 * change sweeps left → right (`columnS` per column), and each disc's rotation is an underdamped
 * step response (`omega`, `zeta`): it swings past the stop and settles — the inertia you see.
 * Pure in t; frame k (k / refresh s) is the target the host sends.
 */
import type { FlipPhysics } from './profile'
import type { DeviceFrame } from './toDevice'

export interface FlipView {
  /** Face showing per disc: 1 = bright, 0 = black. */
  face: Uint8Array
  /** Apparent disc width per disc, 0 (edge-on) .. 1 (flat to the viewer) — |cos θ|. */
  tilt: Float32Array
  /** Discs mid-flip right now. */
  moving: number
  k: number
}
export interface FlipEvent { t: number; col: number; count: number }
export interface FlipSim {
  at(t: number): FlipView
  /** Column writes with at least one flip in [t0, t1): the clack schedule (app-side audio). */
  events(t0: number, t1: number): FlipEvent[]
  physics: FlipPhysics
  refresh: number
}

/** Rotation progress x(τ) of a disc flipping at τ = 0: 0 → 1 with overshoot (underdamped step response). */
export function flipAngle(tau: number, omega: number, zeta: number): number {
  if (tau <= 0) return 0
  const z = Math.min(.999, zeta), wd = omega * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * omega * tau) * (Math.cos(wd * tau) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * tau))
}
/** Seconds after the kick until the disc is within 1% of its stop (bounded history). */
export const settleTime = (omega: number, zeta: number) => Math.log(100) / (Math.min(.999, zeta) * omega)

export function createFlipSim(frameAt: (k: number) => DeviceFrame, physics: FlipPhysics, refresh = 1, memo = 8): FlipSim {
  const frames = new Map<number, Uint8Array>()
  let cols = 0, rows = 0
  const state = (k: number) => {
    let s = frames.get(k)
    if (!s) {
      const f = frameAt(k); cols = f.cols; rows = f.rows
      s = new Uint8Array(f.out.length)
      for (let i = 0; i < s.length; i++) s[i] = f.mask[i] && f.out[i] >= .5 ? 1 : 0
      frames.set(k, s)
      if (frames.size > memo) frames.delete(frames.keys().next().value!)
    }
    return s
  }
  const period = 1 / refresh, settle = settleTime(physics.omega, physics.zeta)
  const at = (t: number): FlipView => {
    const k = Math.floor(t * refresh + 1e-9), tau = t - k * period
    const cur = state(k), prev = state(k - 1), n = cur.length
    const face = new Uint8Array(n), tilt = new Float32Array(n)
    let moving = 0
    for (let i = 0; i < n; i++) {
      const c = i % cols, local = tau - c * physics.columnS
      if (cur[i] === prev[i] || local >= settle) { face[i] = cur[i]; tilt[i] = 1; continue }
      if (local < 0) { face[i] = prev[i]; tilt[i] = 1; continue }
      const th = Math.PI * flipAngle(local, physics.omega, physics.zeta), cs = Math.cos(th)
      face[i] = cs >= 0 ? prev[i] : cur[i]; tilt[i] = Math.abs(cs); moving++
    }
    return { face, tilt, moving, k }
  }
  const events = (t0: number, t1: number): FlipEvent[] => {
    const out: FlipEvent[] = []
    for (let k = Math.floor(t0 * refresh) - 1; k <= Math.floor(t1 * refresh); k++) {
      const cur = state(k), prev = state(k - 1)
      for (let c = 0; c < cols; c++) {
        const t = k * period + c * physics.columnS
        if (t < t0 || t >= t1) continue
        let count = 0
        for (let r = 0; r < rows; r++) if (cur[r * cols + c] !== prev[r * cols + c]) count++
        if (count) out.push({ t, col: c, count })
      }
    }
    return out
  }
  return { at, events, physics, refresh }
}
