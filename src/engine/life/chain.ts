/**
 * Spines and ropes for creatures (docs/living-matter/L-pond.md §L1 "Spine").
 * - `chainFollow`: argonaut's follow-the-leader spine (github.com/argonautcode/animal-proc-anim): node 0 is placed,
 *   every next node sits `seg` behind its predecessor, and each joint angle is clamped to ±maxBend by a vector
 *   rotation (precomputed cos / sin, no trig per step). Only the head integrates motion.
 * - `ropeStep`: a Verlet rope with linear drag, an acceleration and an optional flow field, pinned at node 0.
 * - `fabrik`: FABRIK inverse kinematics (Aristidou & Lasenby 2011) from a fixed root.
 * Positions live in the world's `Float32Array` (x plane, then y plane); scratch stays outside it.
 */
import { dcos, dsin } from '../noise/dmath'

export interface Chain {
  n: number; seg: number; maxBend: number
  /** Offsets of the x and y planes in the state. */
  X: number; Y: number
  /** dcos / dsin of maxBend. */
  cb: number; sb: number
}
/** A chain of `n` nodes `seg` apart with joint limit `maxBend` (radians); state: 2n floats at `offset`. */
export function createChain(n: number, seg: number, maxBend: number, offset = 0): Chain {
  return { n, seg, maxBend, X: offset, Y: offset + n, cb: dcos(maxBend), sb: dsin(maxBend) }
}
/** Straight chain with its head at (x, y), heading (hx, hy): the nodes trail behind the head. */
export function chainInit(c: Chain, s: Float32Array, x: number, y: number, hx: number, hy: number): void {
  const l = Math.sqrt(hx * hx + hy * hy) || 1, ux = hx / l, uy = hy / l
  for (let i = 0; i < c.n; i++) { s[c.X + i] = x - ux * c.seg * i; s[c.Y + i] = y - uy * c.seg * i }
}
/**
 * Put node 0 at (hx, hy); each next node sits `seg` behind its predecessor, with the joint angle clamped to ±maxBend.
 * The first joint is free (the head turns the body); a coincident node keeps the previous direction.
 */
export function chainFollow(c: Chain, s: Float32Array, hx: number, hy: number): void {
  const { n, seg, X, Y, cb, sb } = c
  s[X] = hx; s[Y] = hy
  let px = 0, py = 0 // previous segment direction (tail-ward)
  for (let i = 1; i < n; i++) {
    let dx = s[X + i] - s[X + i - 1], dy = s[Y + i] - s[Y + i - 1]
    const l = Math.sqrt(dx * dx + dy * dy)
    if (l > 1e-9) { dx /= l; dy /= l } else if (i > 1) { dx = px; dy = py } else { dx = -1; dy = 0 }
    if (i > 1 && dx * px + dy * py < cb) {
      // rotate the previous direction by ±maxBend toward d
      const sg = px * dy - py * dx < 0 ? -1 : 1, ss = sb * sg
      dx = px * cb - py * ss; dy = px * ss + py * cb
    }
    s[X + i] = s[X + i - 1] + dx * seg; s[Y + i] = s[Y + i - 1] + dy * seg
    px = dx; py = dy
  }
}

export interface Rope { n: number; seg: number; drag: number; iters: number; X: number; Y: number; PX: number; PY: number }
/** A Verlet rope: 4n floats (x, y, previous x, previous y planes) at `offset`. */
export function createRope(n: number, seg: number, opts: { drag?: number; iters?: number } = {}, offset = 0): Rope {
  return { n, seg, drag: opts.drag ?? .02, iters: opts.iters ?? 4, X: offset, Y: offset + n, PX: offset + 2 * n, PY: offset + 3 * n }
}
/** Hang a rope straight down from (x, y), at rest. */
export function ropeInit(r: Rope, s: Float32Array, x: number, y: number): void {
  for (let i = 0; i < r.n; i++) { s[r.X + i] = s[r.PX + i] = x; s[r.Y + i] = s[r.PY + i] = y + i * r.seg }
}
const flowOut = new Float32Array(2)
/**
 * One Verlet step with linear drag (per step), acceleration (ax, ay) and an optional per-node `flow(x, y) → velocity`
 * the node is dragged toward; node 0 is pinned at (rx, ry). Then `iters` passes of distance constraints.
 */
export function ropeStep(r: Rope, s: Float32Array, dt: number, rx: number, ry: number, ax: number, ay: number, flow?: (x: number, y: number, out: Float32Array) => void): void {
  const { n, seg, drag, iters, X, Y, PX, PY } = r, keep = 1 - drag, dt2 = dt * dt
  for (let i = 1; i < n; i++) {
    const x = s[X + i], y = s[Y + i]
    let vx = (x - s[PX + i]) * keep, vy = (y - s[PY + i]) * keep
    if (flow) { flow(x, y, flowOut); vx += (flowOut[0] * dt - vx) * drag; vy += (flowOut[1] * dt - vy) * drag }
    s[PX + i] = x; s[PY + i] = y
    s[X + i] = x + vx + ax * dt2; s[Y + i] = y + vy + ay * dt2
  }
  s[PX] = s[X]; s[PY] = s[Y]; s[X] = rx; s[Y] = ry
  for (let k = 0; k < iters; k++) {
    for (let i = 1; i < n; i++) {
      const ax_ = s[X + i - 1], ay_ = s[Y + i - 1], dx = s[X + i] - ax_, dy = s[Y + i] - ay_
      const l = Math.sqrt(dx * dx + dy * dy) || 1e-9, e = (l - seg) / l
      if (i === 1) { s[X + i] -= dx * e; s[Y + i] -= dy * e }
      else { s[X + i] -= dx * e * .5; s[Y + i] -= dy * e * .5; s[X + i - 1] += dx * e * .5; s[Y + i - 1] += dy * e * .5 }
    }
  }
}

/**
 * FABRIK (Aristidou & Lasenby 2011): move the joints `xs`/`ys` (root = index 0, fixed) so the end reaches (tx, ty),
 * segment i having length lens[i] (lens.length = xs.length − 1). Tolerance .05 cells, at most `iters` passes.
 * Returns false (and stretches toward the target) when it is out of reach.
 */
export function fabrik(xs: Float32Array, ys: Float32Array, lens: Float32Array, tx: number, ty: number, iters = 10): boolean {
  const n = xs.length, rx = xs[0], ry = ys[0]
  let total = 0
  for (let i = 0; i < n - 1; i++) total += lens[i]
  const dx = tx - rx, dy = ty - ry, dist = Math.sqrt(dx * dx + dy * dy)
  if (dist > total) {
    for (let i = 0; i < n - 1; i++) {
      const ex = tx - xs[i], ey = ty - ys[i], l = Math.sqrt(ex * ex + ey * ey) || 1e-9, k = lens[i] / l
      xs[i + 1] = xs[i] + ex * k; ys[i + 1] = ys[i] + ey * k
    }
    return false
  }
  for (let it = 0; it < iters; it++) {
    const ex = xs[n - 1] - tx, ey = ys[n - 1] - ty
    if (ex * ex + ey * ey <= .05 * .05) return true
    // backward: end on the target
    xs[n - 1] = tx; ys[n - 1] = ty
    for (let i = n - 2; i >= 0; i--) {
      const ax = xs[i] - xs[i + 1], ay = ys[i] - ys[i + 1], l = Math.sqrt(ax * ax + ay * ay) || 1e-9, k = lens[i] / l
      xs[i] = xs[i + 1] + ax * k; ys[i] = ys[i + 1] + ay * k
    }
    // forward: root back in place
    xs[0] = rx; ys[0] = ry
    for (let i = 0; i < n - 1; i++) {
      const ax = xs[i + 1] - xs[i], ay = ys[i + 1] - ys[i], l = Math.sqrt(ax * ax + ay * ay) || 1e-9, k = lens[i] / l
      xs[i + 1] = xs[i] + ax * k; ys[i + 1] = ys[i] + ay * k
    }
  }
  const ex = xs[n - 1] - tx, ey = ys[n - 1] - ty
  return ex * ex + ey * ey <= .05 * .05
}
