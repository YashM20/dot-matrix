/**
 * Shared plumbing of the pond's looped worlds (docs/living-matter/L-pond.md §2, L2): the seam blend and the
 * tap-or-hold press tracker. Every L2 scene is a `World` (physics/world.ts) with a `seam`; its blend comes from
 * `seamBlend`, and its input reads presses through `pressStep`.
 */
import { TAU } from '../noise'
import type { StepPointer } from '../physics/world'

export interface SeamPlan {
  size: number
  /** Discrete slots (modes, flags, indices): snap to the target once k ≥ .5, never lerped. */
  discrete?: Iterable<number>
  /** Angles in radians: blended along the short way round, wrapped to [0, 2π). */
  angles?: Iterable<number>
  /** Phases in turns: blended along the short way round, wrapped to [0, 1). */
  turns?: Iterable<number>
  /** Offsets of (x, y) unit-vector pairs: renormalised after the lerp. */
  units?: Iterable<number>
}
/**
 * The world's blend for a scene. The world's seam calls it after each of the loop's last steps with
 * k = 1/(rem + 1) toward the loop-start state while the scene keeps moving; doubling k (capped at 1) makes the
 * remaining gap telescope to exactly 0 on the last step (the koi pond's fix, docs/LIFE.md "State, loop and memory").
 * A heal (k = 1/healLeft) still ends on the pristine state.
 */
export function seamBlend(plan: SeamPlan): (x: Float32Array, y: Float32Array, k: number) => void {
  const kind = new Uint8Array(plan.size) // 0 lerp, 1 discrete, 2 angle, 3 turn
  for (const i of plan.discrete ?? []) kind[i] = 1
  for (const i of plan.angles ?? []) kind[i] = 2
  for (const i of plan.turns ?? []) kind[i] = 3
  const units = [...(plan.units ?? [])]
  return (x, y, k0) => {
    const k = k0 >= .5 ? 1 : 2 * k0
    for (let i = 0; i < x.length; i++) {
      const c = kind[i]
      if (c === 0) { x[i] += (y[i] - x[i]) * k; continue }
      if (c === 1) { if (k >= .5) x[i] = y[i]; continue }
      const P = c === 2 ? TAU : 1, H = P / 2
      let d = y[i] - x[i]
      if (d > H) d -= P; else if (d < -H) d += P
      let v = x[i] + d * k
      if (v >= P) v -= P; else if (v < 0) v += P
      x[i] = v
    }
    for (const q of units) { const hx = x[q], hy = x[q + 1], l = Math.sqrt(hx * hx + hy * hy); if (l > 1e-9) { x[q] = hx / l; x[q + 1] = hy / l } else { x[q] = 1; x[q + 1] = 0 } }
  }
}

/** Slots of a press tracker inside a world state (4 floats at `at`): held seconds (−1 = none), press x, press y, hold flag. */
export const PRESS_SLOTS = 4
/** A press held at least this long is a hold (no tap on release). Matches the touch hold that engages a card. */
export const HOLD_S = .3
export const PRESS_NONE = 0, PRESS_TAP = 1, PRESS_HOLD = 2, PRESS_DOWN = 3
/**
 * One step of a press: returns PRESS_TAP on the step a press shorter than HOLD_S ends (at the press point,
 * readable with `pressAt`), PRESS_HOLD while a press has been held ≥ HOLD_S (at the pointer), PRESS_DOWN while a
 * younger press is down, PRESS_NONE otherwise. A touch that lifts leaves the frame instead of reporting
 * down = false (framePointers drops it): that counts as a release too.
 */
export function pressStep(s: Float32Array, at: number, p: StepPointer | undefined, dt: number): number {
  if (p?.pressed) { s[at] = 0; s[at + 1] = p.x; s[at + 2] = p.y; s[at + 3] = 0 }
  if (p?.down && s[at] >= 0) {
    s[at] += dt
    if (s[at] >= HOLD_S) { s[at + 3] = 1; s[at + 1] = p.x; s[at + 2] = p.y; return PRESS_HOLD }
    return PRESS_DOWN
  }
  if (s[at] >= 0 && (!p || p.released || !p.down)) {
    const tap = s[at] < HOLD_S && !s[at + 3]
    s[at] = -1; s[at + 3] = 0
    return tap ? PRESS_TAP : PRESS_NONE
  }
  return PRESS_NONE
}
/** The press point (the tap's position after a PRESS_TAP; the pointer's while held). */
export const pressAt = (s: Float32Array, at: number): [number, number] => [s[at + 1], s[at + 2]]
/** Init a press tracker's slots (no press). */
export const pressInit = (s: Float32Array, at: number) => { s[at] = -1; s[at + 1] = s[at + 2] = s[at + 3] = 0 }
/** Discrete slots of a press tracker for `seamBlend` (the timer and the hold flag). */
export const pressDiscrete = (at: number) => [at, at + 3]
