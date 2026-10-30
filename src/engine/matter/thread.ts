/**
 * A thread off a spool (docs/living-matter/M-materials.md §5, `mat-thread`): track L's Verlet rope (`life/chain.ts`
 * `ropeStep`) pinned at the spool, with the step code this card needs on top of it:
 * - gravity from the hub (`gx`, `gy`: physics only);
 * - a pull: the free end follows the hand; pulled past the thread's length, the spool pays thread out (the segments
 *   lengthen) up to `maxLength`, and once let go it winds back to the rest length;
 * - a flick: a sideways kick to the lower half;
 * - inextensible at rest: after the rope's own passes a follow-the-leader sweep (Müller et al. 2012) puts every node
 *   exactly one segment from the one above it, so a hanging thread has no strain.
 *
 * Step code: registered with the determinism lint (scripts/lib/detLint.ts `src/engine/matter/thread`).
 */
import { createRope, ropeInit, ropeStep, type Rope } from '../life/chain'

export interface Thread {
  rope: Rope
  /** Rest length (cells) and the most the spool pays out. */
  length: number; maxLength: number
  /** Offset of the scalars after the rope: [paid length, pulled 0/1]. */
  S: number
  size: number
}
export function createThread(n = 40, seg = 2.2, o: { maxLength?: number } = {}): Thread {
  const rope = createRope(n, seg, { drag: .03, iters: 8 })
  const S = 4 * n
  return { rope, length: seg * (n - 1), maxLength: o.maxLength ?? seg * (n - 1) * 1.45, S, size: S + 2 }
}
/** Hang the thread straight down from the spool at (x, y), at rest. */
export function threadInit(th: Thread, s: Float32Array, x: number, y: number): void {
  th.rope.seg = th.length / (th.rope.n - 1)
  ropeInit(th.rope, s, x, y)
  s[th.S] = th.length; s[th.S + 1] = 0
}

export interface ThreadInput {
  /** The spool's exit point (cells). */
  x: number; y: number
  /** Gravity in g (≈ (0, 1) upright), and its strength in cells / s² at 1 g. */
  gx: number; gy: number; g?: number
  /** The hand pulling the free end (cells), or null. */
  pull?: readonly [number, number] | null
  /** A sideways flick, cells / s (0 = none). */
  flick?: number
}

/** Largest relative stretch of any segment against the current segment length. */
export function threadStrain(th: Thread, s: Float32Array): number {
  const { n, X, Y } = th.rope, seg = s[th.S] / (n - 1)
  let worst = 0
  for (let i = 1; i < n; i++) { const dx = s[X + i] - s[X + i - 1], dy = s[Y + i] - s[Y + i - 1]; worst = Math.max(worst, Math.abs(Math.sqrt(dx * dx + dy * dy) - seg) / seg) }
  return worst
}

export function threadStep(th: Thread, s: Float32Array, dt: number, inp: ThreadInput): void {
  const r = th.rope, { n, X, Y, PX } = r, g = inp.g ?? 260
  // pay out to reach the hand, wind back in (a sixth of the gap a step) once let go
  let L = s[th.S]
  if (inp.pull) {
    const dx = inp.pull[0] - inp.x, dy = inp.pull[1] - inp.y, want = Math.min(th.maxLength, Math.max(th.length, Math.sqrt(dx * dx + dy * dy) * 1.02))
    if (want > L) L = want
  } else L += (th.length - L) / 6
  if (Math.abs(L - th.length) < 1e-4) L = th.length
  s[th.S] = L; s[th.S + 1] = inp.pull ? 1 : 0
  r.seg = L / (n - 1)
  if (inp.flick) for (let i = n >> 1; i < n; i++) s[PX + i] -= inp.flick * dt * (i / (n - 1))
  ropeStep(r, s, dt, inp.x, inp.y, g * inp.gx, g * inp.gy)
  if (inp.pull) {
    // the end on the hand (as far as the thread reaches), then the constraints with both ends held
    let ex = inp.pull[0], ey = inp.pull[1]
    const dx = ex - inp.x, dy = ey - inp.y, d = Math.sqrt(dx * dx + dy * dy)
    if (d > L) { ex = inp.x + dx * L / d; ey = inp.y + dy * L / d }
    s[X + n - 1] = ex; s[Y + n - 1] = ey
    for (let k = 0; k < 6; k++) for (let i = 1; i < n; i++) {
      const ax = s[X + i - 1], ay = s[Y + i - 1], qx = s[X + i] - ax, qy = s[Y + i] - ay
      const l = Math.sqrt(qx * qx + qy * qy) || 1e-9, e = (l - r.seg) / l
      const wa = i === 1 ? 0 : .5, wb = i === n - 1 ? 0 : .5, w = wa + wb
      if (w === 0) continue
      s[X + i - 1] += qx * e * wa / w; s[Y + i - 1] += qy * e * wa / w
      s[X + i] -= qx * e * wb / w; s[Y + i] -= qy * e * wb / w
    }
    return
  }
  // follow the leader: every node exactly one segment below the one before it (the previous positions stay, so the
  // projection takes the stretch out of the velocity too, as any position-based constraint does)
  for (let i = 1; i < n; i++) {
    const ax = s[X + i - 1], ay = s[Y + i - 1], qx = s[X + i] - ax, qy = s[Y + i] - ay, l = Math.sqrt(qx * qx + qy * qy)
    const ux = l > 1e-9 ? qx / l : 0, uy = l > 1e-9 ? qy / l : 1
    s[X + i] = ax + ux * r.seg; s[Y + i] = ay + uy * r.seg
  }
}
