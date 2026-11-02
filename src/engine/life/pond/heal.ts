/**
 * The koi pond's heal back to the loop (#90). The world (physics/world.ts) calls the heal blend after each live step
 * with k = 1/(heal steps left); the last call has k = 1 and lands exactly on the pristine state.
 *
 * Lerping every float (the seam's blend) drags a koi's head and spine nodes toward the scripted ones while the live
 * koi keeps swimming its own way, so the gap stays open until the last steps and then closes in a rush: the fish
 * slide, bend and snap. Here a koi swims back instead. From where its head was before the step, it moves toward its
 * scripted head by at most 1.1 × the burst speed, and once there it stays with it (the scripted koi never swims
 * faster than a burst, and the pond never starts a heal that would reach the loop's seam). The spine follows the
 * head as it does when swimming, the heading turns toward the way the head moves (the script's heading once there),
 * and the other floats lerp by k. Discrete slots snap on the last two steps.
 */
import { TAU } from '../../noise'
import { chainFollow, type Chain } from '../chain'
import { turnCap, turnToward, type Agent } from '../steer'
import { K_HX, K_HY, KS, NODES, POND_DT, type PondLayout } from './layout'
import { BURST_U } from './koi'

/** Turn rate toward the scripted place or heading while healing (rad/s). */
const HEAL_TURN = turnCap(2.5, POND_DT)
/** Fastest a head moves while healing: 1.1 × the burst speed. */
const HEAL_U = 1.1 * BURST_U

/**
 * The heal blend for a pond's layout. `before` holds each head before the live step (the world writes it on live
 * steps only); `discrete` (slots that snap), `isPhase` (angles lerped on the circle) and
 * `headsAt` (heading slots) are the seam blend's tables.
 */
export function createHealBlend(lay: PondLayout, chains: Chain[], lengths: number[], before: Float32Array, discrete: Uint8Array, isPhase: Uint8Array, headsAt: number[]) {
  const K = chains.length, own = new Uint8Array(lay.size).fill(1, lay.SPINE, lay.PEL)
  for (const q of headsAt) own[q] = own[q + 1] = 1
  const a: Agent = { x: 0, y: 0, hx: 1, hy: 0, u: 0 }
  return function healBlend(x: Float32Array, y: Float32Array, k: number): void {
    for (let i = 0; i < K; i++) {
      const o = lay.KOI + KS * i, c = chains[i], L = lengths[i]
      // from where the head was before this step, toward the scripted head by at most HEAL_U (a head that is there
      // stays with it: the scripted koi never swims faster than a burst, and a heal never runs into the seam)
      const px = before[2 * i], py = before[2 * i + 1]
      const gx = y[c.X] - px, gy = y[c.Y] - py, g = Math.sqrt(gx * gx + gy * gy), room = HEAL_U * L * POND_DT
      const m = k >= 1 || g <= room ? 1 : room / g, mx = gx * m, my = gy * m, ml = Math.sqrt(mx * mx + my * my)
      chainFollow(c, x, px + mx, py + my)
      for (let q = 1; q < NODES; q++) { x[c.X + q] += (y[c.X + q] - x[c.X + q]) * k; x[c.Y + q] += (y[c.Y + q] - x[c.Y + q]) * k }
      // the heading follows the way the head moved (the script's heading once there), turning at most HEAL_TURN
      if (k >= 1) { x[o + K_HX] = y[o + K_HX]; x[o + K_HY] = y[o + K_HY]; continue }
      const dx = m >= 1 || ml < 1e-6 ? y[o + K_HX] : mx / ml, dy = m >= 1 || ml < 1e-6 ? y[o + K_HY] : my / ml
      a.hx = x[o + K_HX]; a.hy = x[o + K_HY]; turnToward(a, dx, dy, HEAL_TURN); x[o + K_HX] = a.hx; x[o + K_HY] = a.hy
    }
    for (let i = 0; i < x.length; i++) {
      if (own[i]) continue
      if (discrete[i]) { if (k >= .5) x[i] = y[i]; continue }
      if (isPhase[i]) {
        let d = y[i] - x[i]
        if (d > Math.PI) d -= TAU; else if (d < -Math.PI) d += TAU
        let v = x[i] + d * k
        if (v >= TAU) v -= TAU; else if (v < 0) v += TAU
        x[i] = v; continue
      }
      x[i] += (y[i] - x[i]) * k
    }
  }
}
