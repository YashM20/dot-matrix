/**
 * Reynolds steering (Steering Behaviors for Autonomous Characters, GDC 1999) on head agents, plus a turn-capped
 * integrator and the Mauthner C-start escape (Eaton et al. 1977; Domenici & Blake 1997).
 * Every behaviour adds into `out` [fx, fy], scaled by its weight `w` (the caller picks units: the pond uses L/s²).
 * The unscaled terms are at most about 1 in size, so weights read as accelerations.
 * Headings are unit vectors (hx, hy), never angles; turns use precomputed cos / sin, so no trig runs per step.
 */
import { dcos, dsin, noise2, TAU } from '../noise'

export interface Agent { x: number; y: number; hx: number; hy: number; u: number }

/** Steer toward (tx, ty) at full speed: (desired velocity − velocity) / maxU. */
export function seek(a: Agent, tx: number, ty: number, maxU: number, w: number, out: Float32Array | number[]): void {
  const dx = tx - a.x, dy = ty - a.y, l = Math.sqrt(dx * dx + dy * dy)
  if (!(l > 1e-9) || !(maxU > 0)) return
  out[0] += w * ((dx / l) * maxU - a.hx * a.u) / maxU
  out[1] += w * ((dy / l) * maxU - a.hy * a.u) / maxU
}
/** Steer away from (tx, ty) at full speed. */
export function flee(a: Agent, tx: number, ty: number, maxU: number, w: number, out: Float32Array | number[]): void {
  seek(a, 2 * a.x - tx, 2 * a.y - ty, maxU, w, out)
}
/** Seek that slows inside `slow` cells and stops on the target (arrive). */
export function arrive(a: Agent, tx: number, ty: number, maxU: number, slow: number, w: number, out: Float32Array | number[]): void {
  const dx = tx - a.x, dy = ty - a.y, l = Math.sqrt(dx * dx + dy * dy)
  if (!(l > 1e-9) || !(maxU > 0)) return
  const want = l < slow ? (maxU * l) / slow : maxU
  out[0] += w * ((dx / l) * want - a.hx * a.u) / maxU
  out[1] += w * ((dy / l) * want - a.hy * a.u) / maxU
}
/**
 * Wander on a circle `dist` ahead, radius `rad`: the angle on the circle is TAU·noise2(n·dt·rate, id, seed), smooth
 * in time and pure in (n, id, seed). Pushes toward that point (unit strength).
 */
export function wander(a: Agent, id: number, n: number, dt: number, o: { dist: number; rad: number; rate: number; seed: number }, w: number, out: Float32Array | number[]): void {
  const th = TAU * noise2(n * dt * o.rate, id * 7.31 + .5, o.seed)
  const tx = a.x + a.hx * o.dist + o.rad * dcos(th), ty = a.y + a.hy * o.dist + o.rad * dsin(th)
  const dx = tx - a.x, dy = ty - a.y, l = Math.sqrt(dx * dx + dy * dy)
  if (!(l > 1e-9)) return
  out[0] += (w * dx) / l; out[1] += (w * dy) / l
}
/**
 * Stay inside the region sdf < 0: look `ahead` seconds along the velocity; when sdf(p') > −margin, push along −∇sdf
 * with weight w·(1 + (sdf + margin)/margin). The gradient is a central difference (h = .5 cell).
 */
export function contain(a: Agent, sdf: (x: number, y: number) => number, ahead: number, margin: number, w: number, out: Float32Array | number[]): void {
  const px = a.x + a.hx * a.u * ahead, py = a.y + a.hy * a.u * ahead, d = sdf(px, py)
  if (d <= -margin) return
  const gx = sdf(px + .5, py) - sdf(px - .5, py), gy = sdf(px, py + .5) - sdf(px, py - .5), l = Math.sqrt(gx * gx + gy * gy)
  if (!(l > 1e-9)) return
  const k = w * (1 + (d + margin) / margin)
  out[0] -= (k * gx) / l; out[1] -= (k * gy) / l
}
/** Push away from `count` points (xy pairs) closer than `radius`, linearly stronger when closer. */
export function separate(a: Agent, others: ArrayLike<number>, count: number, radius: number, w: number, out: Float32Array | number[]): void {
  for (let k = 0; k < count; k++) {
    const dx = a.x - others[2 * k], dy = a.y - others[2 * k + 1], l = Math.sqrt(dx * dx + dy * dy)
    if (!(l > 1e-9) || l >= radius) continue
    const f = w * (1 - l / radius)
    out[0] += (f * dx) / l; out[1] += (f * dy) / l
  }
}
/** Match the mean velocity of `count` neighbours (hx hy u triples), normalised by the fastest of them and us. */
export function align(a: Agent, others: ArrayLike<number>, count: number, w: number, out: Float32Array | number[]): void {
  if (!count) return
  let vx = 0, vy = 0, top = a.u
  for (let k = 0; k < count; k++) { const u = others[3 * k + 2]; vx += others[3 * k] * u; vy += others[3 * k + 1] * u; if (u > top) top = u }
  if (!(top > 1e-9)) return
  out[0] += (w * (vx / count - a.hx * a.u)) / top
  out[1] += (w * (vy / count - a.hy * a.u)) / top
}

/** cos / sin of the largest turn one step may take (ω·dt), computed once per (ω, dt). */
export const turnCap = (omega: number, dt: number) => ({ c: dcos(omega * dt), s: dsin(omega * dt) })
/** Turn the heading toward the unit vector (dx, dy) by at most the cap (c, s) (exact when within it). */
export function turnToward(a: Agent, dx: number, dy: number, turn: { c: number; s: number }): void {
  const dot = a.hx * dx + a.hy * dy
  if (dot >= turn.c) { a.hx = dx; a.hy = dy; return }
  const sg = a.hx * dy - a.hy * dx < 0 ? -1 : 1, s = turn.s * sg
  const hx = a.hx * turn.c - a.hy * s, hy = a.hx * s + a.hy * turn.c, l = Math.sqrt(hx * hx + hy * hy) || 1
  a.hx = hx / l; a.hy = hy / l
}
/**
 * Integrate: the wanted velocity is v = h·u + clamp(F, maxF)·respond; the heading turns toward it by at most ω·dt
 * (`turn`); the speed takes F's along-heading part over dt, clamped to [minU, maxU]; then the agent moves.
 * `respond` (default dt) is how many seconds of F the heading answers to at once: a fish steers its heading (a
 * capped turn), so the pond uses about 1 s, and a point mass uses dt (v += F·dt).
 */
export function integrate(a: Agent, f: Float32Array | number[], dt: number, maxF: number, turn: { c: number; s: number }, minU: number, maxU: number, respond = dt): void {
  let fx = f[0], fy = f[1]
  const fl = Math.sqrt(fx * fx + fy * fy)
  if (fl > maxF) { fx *= maxF / fl; fy *= maxF / fl }
  const vx = a.hx * a.u + fx * respond, vy = a.hy * a.u + fy * respond, vl = Math.sqrt(vx * vx + vy * vy)
  if (vl > 1e-9) turnToward(a, vx / vl, vy / vl, turn)
  const u = a.u + (fx * a.hx + fy * a.hy) * dt
  a.u = u < minU ? minU : u > maxU ? maxU : u
  a.x += a.hx * a.u * dt; a.y += a.hy * a.u * dt
}

/** C-start timings (s) and the turn range it aims for. */
export const CSTART = { bend: .13, burst: .4, refractory: 1.5, turnMin: 90 * Math.PI / 180, turnSpan: 15 * Math.PI / 180, omega: 14 } as const
/**
 * C-start (Mauthner escape): pick the escape turn away from a stimulus at (sx, sy). The agent turns away from the
 * side the stimulus is on, by 90° + 15°·hash (`salt` ∈ [0, 1)), so the bend phase (14 rad/s for .13 s) completes it.
 * Writes [target hx, target hy, turn sign (+1 = toward +left), turn angle] into `out`; the caller runs the
 * timers (bend, then a .4 s burst at 2.6 L/s with beat 1, then a glide; refractory 1.5 s).
 */
export function startle(a: Agent, sx: number, sy: number, salt: number, out: Float32Array | number[]): void {
  const qx = sx - a.x, qy = sy - a.y
  // the stimulus is on the +cross side → turn the other way (a stimulus dead behind or ahead picks by salt)
  const cr = a.hx * qy - a.hy * qx, sg = cr > 1e-9 ? -1 : cr < -1e-9 ? 1 : salt < .5 ? -1 : 1
  const ang = CSTART.turnMin + CSTART.turnSpan * salt, c = dcos(ang), s = dsin(ang) * sg
  out[0] = a.hx * c - a.hy * s; out[1] = a.hx * s + a.hy * c; out[2] = sg; out[3] = ang
}
