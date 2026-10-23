/**
 * C6 hand tracker checks on the deterministic synthetic camera (src/vision/synthetic.ts), Node only.
 *
 *   npx tsx scripts/vision.ts        # report: pointer error, pinch agreement, ms per frame
 *
 * Also run from verify.ts (`visionChecks`).
 */
import { createHandTracker } from '../src/vision/tracker'
import { handPath, synthFrame } from '../src/vision/synthetic'
import { OneEuro } from '../src/vision/oneEuro'

type Assert = (name: string, ok: boolean, detail?: string) => void

export interface TrackReport { meanErr: number; p95Err: number; biasX: number; biasY: number; pinchAgree: number; presentShare: number; ms: number; frames: number }

/** Track `secs` of synthetic video at 30 fps on a `w`×`h` frame; errors in fractions of the frame width. */
export function trackSynthetic(secs = 12, w = 128, h = 96, opts: { noise?: number; size?: number } = {}): TrackReport {
  const tr = createHandTracker(w, h), buf = new Uint8ClampedArray(w * h * 4)
  const errs: number[] = []
  let bx = 0, by = 0, agree = 0, judged = 0, present = 0, ms = 0, frames = 0
  // the hand enters after a second of empty scene (the background model learns the room with the face in it)
  for (let f = 0; f < 30; f++) { synthFrame(buf, w, h, f / 30, { ...opts, noHand: true, frame: f }); tr.push(buf, f / 30) }
  for (let f = 30; f < secs * 30; f++) {
    const t = f / 30, pose = synthFrame(buf, w, h, t, { ...opts, frame: f })
    const a = performance.now(), o = tr.push(buf, t)
    ms += performance.now() - a; frames++
    if (f < 45) continue // let the track lock on
    if (o.present) {
      present++
      const ex = pose.x, ey = pose.y // the palm centre
      const dx = o.x - ex, dy = (o.y - ey) * h / w
      errs.push(Math.hypot(dx, dy)); bx += dx; by += dy
    }
    // pinch: judge frames away from the transitions (debounce + smoothing lag ≤ 3 frames)
    const ph = t % 3, edge = [1.9, 2.7, 0, 3].some(e => Math.abs(ph - e) < .12)
    if (!edge) { judged++; if (o.pinch === (pose.pinch > .5)) agree++ }
  }
  errs.sort((a, b) => a - b)
  const n = errs.length || 1
  return { meanErr: errs.reduce((s, e) => s + e, 0) / n, p95Err: errs[Math.floor(n * .95)] ?? 1, biasX: bx / n, biasY: by / n, pinchAgree: agree / (judged || 1), presentShare: present / Math.max(1, frames - 15), ms: ms / frames, frames }
}

export function visionChecks(assert: Assert): void {
  // One Euro: passes the first sample, smooths jitter at rest, follows a fast ramp closely
  const f = new OneEuro({ minCutoff: 1, beta: 2 })
  let jit = 0
  for (let i = 0; i < 60; i++) { const v = f.filter(.5 + (i % 2 ? .01 : -.01), i / 60); if (i > 30) jit = Math.max(jit, Math.abs(v - .5)) }
  const g = new OneEuro({ minCutoff: 1, beta: 2 })
  let lag = 0
  for (let i = 0; i < 60; i++) { const x = i / 60, v = g.filter(x, i / 60); if (i > 20) lag = Math.max(lag, x - v) }
  assert('vision one-euro: jitter at rest damped ≥ 3×, lag on a 1 unit/s ramp ≤ .06', jit < .0034 && lag < .06, `jitter ${jit.toFixed(4)}, lag ${lag.toFixed(3)}`)

  const r = trackSynthetic()
  assert('vision tracker (synthetic hand, 128×96, 30 fps): hand found ≥ 95% of frames, mean pointer error ≤ 3% of the frame width, p95 ≤ 6%',
    r.presentShare >= .95 && r.meanErr <= .03 && r.p95Err <= .06, `present ${(r.presentShare * 100).toFixed(1)}%, mean ${(r.meanErr * 100).toFixed(2)}%, p95 ${(r.p95Err * 100).toFixed(2)}%, bias ${(r.biasX * 100).toFixed(1)}/${(r.biasY * 100).toFixed(1)}%`)
  assert('vision tracker: pinch state agrees with the script on ≥ 90% of frames (transitions excluded)', r.pinchAgree >= .9, `${(r.pinchAgree * 100).toFixed(1)}%`)
  assert('vision tracker: ≤ 2 ms per 128×96 frame (main thread is fine, no worker)', r.ms <= 2, `${r.ms.toFixed(3)} ms`)
  // the still face never becomes the hand: with no hand in the scene nothing is tracked
  const tr = createHandTracker(128, 96), buf = new Uint8ClampedArray(128 * 96 * 4)
  let ghost = 0
  for (let i = 0; i < 120; i++) { synthFrame(buf, 128, 96, i / 30, { noHand: true, frame: i }); if (tr.push(buf, i / 30).present) ghost++ }
  assert('vision tracker: an empty scene with a still face tracks nothing', ghost === 0, `${ghost} ghost frames`)
  void handPath
}

if (process.argv[1]?.endsWith('vision.ts')) {
  for (const [label, o] of [['default', {}], ['noisy (±10)', { noise: 10 }], ['small hand (.2 h)', { size: .2 }], ['80×60', { w: 80, h: 60 }]] as const) {
    const { w = 128, h = 96, ...rest } = o as { w?: number; h?: number; noise?: number; size?: number }
    const r = trackSynthetic(12, w, h, rest)
    console.log(`${label.padEnd(18)} present ${(r.presentShare * 100).toFixed(1)}%  mean ${(r.meanErr * 100).toFixed(2)}%  p95 ${(r.p95Err * 100).toFixed(2)}%  bias ${(r.biasX * 100).toFixed(1)},${(r.biasY * 100).toFixed(1)}%  pinch ${(r.pinchAgree * 100).toFixed(1)}%  ${r.ms.toFixed(3)} ms`)
  }
}
