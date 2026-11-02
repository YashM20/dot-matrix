/**
 * The koi pond's hand-off back to the loop after a feed (issue #90). Called from scripts/life.ts (`lifeChecks`); also
 * runnable alone: `npx tsx scripts/life-heal.ts`.
 *
 * A tap drops food in a live world, away from every koi so nothing startles (a C-start escape is 2.6 L/s by design).
 * The world then runs well past the heal. No koi head may move faster than the burst speed (1 L/s) plus a margin in
 * any step, including the step where the world goes back to the pristine run; the world must end pristine with no
 * resets. Taps at a few loop phases, so an autopilot feed lands during some of the runs.
 */
import { koiView, MODE_BEND, MODE_ESCAPE, POND_DT } from '../src/engine/life'
import { simReset } from '../src/engine/sim'
import { worldAt, worldReset, type FrameInput } from '../src/engine/physics/world'
import { freezeWallClock } from './lib/freeze'

type Assert = (name: string, cond: boolean, detail?: string) => void
type PondModule = typeof import('../src/widgets/boards/pond/index')

/** The koi's burst speed, body lengths per second (BURST_U in src/engine/life/pond/koi.ts). */
const BURST = 1
/** Head speed allowed in any step: the burst speed plus this share (a healing koi swims back at up to 1.1×). */
const MARGIN = .25
/** Board times of the taps (an autopilot feed and the loop seam fall inside some runs), and seconds each run lasts. */
const TAPS = [13, 20, 28, 35, 43, 51]
const RUN = 60

export async function lifeHealChecks(assert: Assert, pond: () => Promise<PondModule>): Promise<void> {
  const { pondProbe } = await pond(), P = pondProbe.koi.pond, W = P.world, sim = W.sim, K = P.spec.koi.length
  const L = P.bodies.map(b => b.length)
  const lines: string[] = []
  let worst = 0, worstAt = '', ok = true
  for (const t0 of TAPS) {
    simReset(sim); worldReset(W)
    const resets0 = W.resets
    // the tap: the open-water point farthest from every koi head
    const s0 = worldAt(W, t0)
    let px = 72, py = 77, best = -1
    for (let y = 30; y <= 130; y += 4) for (let x = 20; x <= 124; x += 4) {
      if (P.spec.sdf(x, y) > -10) continue
      let near = Infinity
      for (let i = 0; i < K; i++) { const v = koiView(P, s0, i); near = Math.min(near, Math.hypot(v.x - x, v.y - y) / L[i]) }
      if (near > best) { best = near; px = x; py = y }
    }
    let t = t0
    const at = (f?: FrameInput) => { t += POND_DT; return worldAt(W, t, f) }
    const prev = new Float64Array(2 * K)
    const keep = (s: Float32Array) => { for (let i = 0; i < K; i++) { const v = koiView(P, s, i); prev[2 * i] = v.x; prev[2 * i + 1] = v.y } }
    keep(s0)
    let fast = 0, fastAt = '', ate = false, startled = false, pristineAt = -1, healAt = -1
    for (let k = 0; t < t0 + RUN; k++) {
      const f = k < 3 ? { pointers: [{ id: 7, x: px, y: py, down: true }] } : undefined
      const mode0 = W.mode, s = at(f)
      if (mode0 === 'live' && W.mode === 'heal' && healAt < 0) healAt = t
      if (mode0 !== 'pristine' && W.mode === 'pristine' && pristineAt < 0) pristineAt = t
      // the steps the live world takes, up to and with its hand-off (after that the pristine run is the loop itself)
      if (mode0 === 'pristine' && k > 0) { keep(s); continue }
      for (let i = 0; i < K; i++) {
        const v = koiView(P, s, i), d = Math.hypot(v.x - prev[2 * i], v.y - prev[2 * i + 1]) / (BURST * L[i] * POND_DT)
        if (v.food >= 0) ate = true
        if (v.mode === MODE_BEND || v.mode === MODE_ESCAPE) startled = true
        if (d > fast) { fast = d; fastAt = `koi ${i} at t ${(t - t0).toFixed(2)} s (${W.mode})` }
      }
      keep(s)
    }
    const end = W.mode === 'pristine' && W.resets === resets0
    if (fast > worst) { worst = fast; worstAt = `tap at ${t0} s: ${fastAt}` }
    ok &&= ate && !startled && end && fast <= 1 + MARGIN
    lines.push(`tap ${t0} s at (${px}, ${py}): ${ate ? 'ate' : 'no koi ate'}${startled ? ', startled' : ''}, heal from +${healAt < 0 ? '-' : (healAt - t0).toFixed(1)} s, pristine at +${pristineAt < 0 ? '-' : (pristineAt - t0).toFixed(1)} s, resets ${W.resets - resets0}, fastest ${fast.toFixed(2)}× burst`)
    worldReset(W)
  }
  assert(`pond-koi: after a feed the koi eat, the world heals back to the pristine run with no resets, and no head moves faster than ${1 + MARGIN}× the burst speed in any step (#90)`,
    ok, `${lines.join('; ')}; worst ${worst.toFixed(2)}× (${worstAt})`)
  simReset(sim)
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('life heal')
  await lifeHealChecks(assert, async () => { freezeWallClock(); return import('../src/widgets/boards/pond/index') })
  done()
}
