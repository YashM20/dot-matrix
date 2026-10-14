/**
 * Closed-form springs: position and velocity are pure functions of the time since release, so
 * any frame can be evaluated directly (scrubbing, snapshots, variable frame rates) with no
 * stepping error. Critical damping after Daniel Holden, "Spring-It-On".
 */
export interface SpringState { x: number; v: number }

const LN2 = Math.LN2
/** Critically damped spring toward `goal`; `halflife` (s) is the time to close half the distance. */
export function criticalSpring(x0: number, v0: number, goal: number, halflife: number, tau: number): SpringState {
  const y = (4 * LN2) / Math.max(1e-5, halflife) / 2
  const j0 = x0 - goal, j1 = v0 + j0 * y, e = Math.exp(-y * Math.max(0, tau))
  return { x: e * (j0 + j1 * tau) + goal, v: e * (v0 - j1 * y * tau) }
}

/** Under-damped spring (overshoots and settles): `frequency` in Hz, `damping` ratio in (0, 1). */
export function underdampedSpring(x0: number, v0: number, goal: number, frequency: number, damping: number, tau: number): SpringState {
  const w0 = 2 * Math.PI * frequency, z = Math.min(.999, Math.max(.01, damping)), wd = w0 * Math.sqrt(1 - z * z)
  const j0 = x0 - goal, a = j0, b = (v0 + z * w0 * j0) / wd, e = Math.exp(-z * w0 * Math.max(0, tau))
  const c = Math.cos(wd * tau), s = Math.sin(wd * tau)
  return { x: goal + e * (a * c + b * s), v: e * ((b * wd - z * w0 * a) * c - (a * wd + z * w0 * b) * s) }
}

/**
 * Data springs: smooth a record of numbers toward new targets. `set()` re-targets from the
 * current position *and velocity*, so interrupting a motion never jumps. `at(t)` is pure.
 */
export class DataSprings {
  private s = new Map<string, { x0: number; v0: number; goal: number; t0: number }>()
  halflife: number
  constructor(halflife = .18) { this.halflife = halflife }
  set(target: Record<string, number>, t: number): void {
    for (const [key, goal] of Object.entries(target)) {
      if (!Number.isFinite(goal)) continue
      const cur = this.s.get(key)
      if (!cur) { this.s.set(key, { x0: goal, v0: 0, goal, t0: t }); continue }
      if (cur.goal === goal) continue
      const { x, v } = criticalSpring(cur.x0, cur.v0, cur.goal, this.halflife, t - cur.t0)
      this.s.set(key, { x0: x, v0: v, goal, t0: t })
    }
  }
  at(t: number): Record<string, number> {
    const out: Record<string, number> = {}
    for (const [key, k] of this.s) out[key] = criticalSpring(k.x0, k.v0, k.goal, this.halflife, t - k.t0).x
    return out
  }
  /** True once every value is within `eps` of its goal (relative to the move size). */
  settled(t: number, eps = 1e-3): boolean {
    for (const k of this.s.values()) {
      const span = Math.max(1e-6, Math.abs(k.goal - k.x0))
      if (Math.abs(criticalSpring(k.x0, k.v0, k.goal, this.halflife, t - k.t0).x - k.goal) > eps * span) return false
    }
    return true
  }
}
