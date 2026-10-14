import { clamp } from '../math'

export type Ease = (t: number) => number

/** CSS-style cubic-bézier timing function (x1, y1, x2, y2), solved by Newton + bisection. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t, sy = (t: number) => ((ay * t + by) * t + cy) * t
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx
  return x => {
    x = clamp(x)
    let t = x
    for (let i = 0; i < 6; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-6) return sy(t); if (Math.abs(d) < 1e-6) break; t -= e / d }
    let lo = 0, hi = 1; t = x
    for (let i = 0; i < 24; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-6) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2 }
    return sy(t)
  }
}

/**
 * Motion tokens (Material 3 values). Entrances decelerate, exits accelerate; only mechanical
 * things (playheads, scanners) move linearly — see docs/STYLE-BIBLE.md › Motion.
 */
export const ease = {
  linear: ((t: number) => clamp(t)) as Ease,
  standard: cubicBezier(.2, 0, 0, 1),
  emphasized: cubicBezier(.2, 0, 0, 1),
  decelerate: cubicBezier(.05, .7, .1, 1),
  accelerate: cubicBezier(.3, 0, .8, .15),
  outCubic: ((t: number) => 1 - (1 - clamp(t)) ** 3) as Ease,
}
export type EaseName = keyof typeof ease

/** Durations (ms). At 12 fps anything under ~300 ms is under 4 frames and reads as a cut. */
export const duration = { short: 200, medium: 400, long: 600, enter: 420, stagger: 70 }

/** Progress of a tween that starts at `t0` and lasts `dur` seconds, eased. */
export const progress = (t: number, t0: number, dur: number, curve: Ease = ease.emphasized) => curve(dur <= 0 ? 1 : (t - t0) / dur)
