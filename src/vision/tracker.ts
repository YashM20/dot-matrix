/**
 * Dependency-free hand tracker (WEB-PLAN C6) on a small mirrored RGBA camera frame (~96×72).
 *
 *   skin      YCbCr box (Cr 135–180, Cb 80–135, Y > 40): cheap, lighting-tolerant-ish, colour-blind to grey walls
 *   change    per-pixel background model (running mean of luma, selective update) + a motion history image
 *   mask      skin ∧ differs from the background; 3×3 majority clean-up (motion only weighs candidates)
 *   blobs     4-connected components; the hand = the biggest moving blob, strongly biased to the last track
 *             (a still face was there from frame 0, so it sits in the background model and never wins)
 *   point     the palm centre (largest inscribed disc, chamfer distance transform): steady while fingers
 *             curl or pinch, and the narrower forearm never wins; One Euro smoothed
 *   pinch     a thumb–index ring shows up as a hole in the hand, a grab as the hand's area collapsing
 *             against its recent open size; hysteresis + two-frame debounce
 *
 * When the frame has almost no skin (gloves, coloured light) it falls back to a motion-only mask.
 * Runs in about a millisecond at 96×72 on a laptop, so it stays on the main thread (no worker needed).
 */
import { components, largestHole, majority, palmCentre, type Blob } from './blobs'
import { OneEuro } from './oneEuro'

export interface HandObservation {
  /** A hand is being tracked (kept through gaps up to `holdSecs`). */
  present: boolean
  /** Smoothed pointer point, normalised frame coords (0..1, mirrored like the frame). */
  x: number; y: number
  /** Unsmoothed point of this frame (NaN when nothing was found). */
  rawX: number; rawY: number
  /** Pinch / grab state after hysteresis. */
  pinch: boolean
  /** 0..1 evidence for a pinch this frame. */
  pinchScore: number
  /** Hand area as a fraction of the frame. */
  area: number
  /** Which mask found the hand: skin-gated, or the motion-only fallback. */
  mode: 'skin' | 'motion' | 'none'
}

export interface HandTrackerOptions {
  /** Seconds a lost hand stays `present` at its last point. */
  holdSecs?: number
  /** Luma difference (0..255) from the background that counts as foreground. */
  fgThreshold?: number
  /** Frame-to-frame luma difference (0..255) that counts as motion. */
  motionThreshold?: number
}

export interface HandTracker {
  readonly w: number
  readonly h: number
  /** Cleaned hand-candidate mask of the last frame (1 = skin that moved / differs from the background). */
  readonly mask: Uint8Array
  /** Track one RGBA frame (`w`×`h`, already mirrored) taken at `t` seconds. */
  push(rgba: ArrayLike<number>, t: number): HandObservation
  /** Drop the background model and the track (camera restarted). */
  reset(): void
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function createHandTracker(w: number, h: number, opts: HandTrackerOptions = {}): HandTracker {
  const { holdSecs = .3, fgThreshold = 22, motionThreshold = 14 } = opts
  const n = w * h
  const bg = new Float32Array(n), prev = new Float32Array(n), mhi = new Float32Array(n)
  const raw = new Uint8Array(n), mask = new Uint8Array(n), fgRaw = new Uint8Array(n)
  const labels = new Int32Array(n), stack = new Int32Array(n), seen = new Uint8Array(n), dt = new Uint16Array(n)
  const fx = new OneEuro({ minCutoff: 1.5, beta: 2.5 }), fy = new OneEuro({ minCutoff: 1.5, beta: 2.5 })
  let primed = false, lastSeen = -Infinity, tx = NaN, ty = NaN, sx = .5, sy = .5
  let openRef = 0, pinch = false, streak = 0, present = false
  const minArea = Math.max(12, Math.round(n * .004))

  const reset = () => { primed = false; lastSeen = -Infinity; tx = ty = NaN; openRef = 0; pinch = false; streak = 0; present = false; fx.reset(); fy.reset(); mhi.fill(0) }

  /** Pixels of blob `b` in its top square (the hand above the wrist): area, centroid and that window. */
  const topRegion = (b: Blob) => {
    const bw = b.x1 - b.x0 + 1, side = Math.min(b.y1 - b.y0 + 1, Math.round(bw * 1.1)), y1 = b.y0 + side - 1
    let area = 0, sx = 0, sy = 0, moving = 0
    for (let y = b.y0; y <= y1; y++) for (let x = b.x0; x <= b.x1; x++) {
      const i = y * w + x
      if (labels[i] === b.id) { area++; sx += x; sy += y; if (mhi[i] > .3) moving++ }
    }
    return { area, cx: area ? sx / area : b.cx, cy: area ? sy / area : b.cy, y1, moving }
  }

  const push = (px: ArrayLike<number>, t: number): HandObservation => {
    let skinCount = 0
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = px[j], g = px[j + 1], b = px[j + 2]
      const Y = .299 * r + .587 * g + .114 * b, cb = 128 - .1687 * r - .3313 * g + .5 * b, cr = 128 + .5 * r - .4187 * g - .0813 * b
      if (!primed) { bg[i] = Y; prev[i] = Y }
      const isFg = Math.abs(Y - bg[i]) > fgThreshold
      mhi[i] = Math.abs(Y - prev[i]) > motionThreshold ? 1 : mhi[i] * .85
      const skin = Y > 40 && cr > 135 && cr < 180 && cb > 80 && cb < 135
      if (skin) skinCount++
      raw[i] = skin && isFg ? 1 : 0
      fgRaw[i] = isFg || mhi[i] > .5 ? 1 : 0
      // selective update: the background learns fast where nothing is in front of it, slowly under a subject
      bg[i] += (Y - bg[i]) * (isFg ? .003 : .03)
      prev[i] = Y
    }
    primed = true
    let mode: HandObservation['mode'] = 'skin'
    if (skinCount < n * .002) {
      // no skin anywhere: track motion that also differs from the background
      mode = 'motion'
      for (let i = 0; i < n; i++) raw[i] = fgRaw[i] && mhi[i] > .3 ? 1 : 0
    }
    majority(raw, w, h, mask)
    const blobs = components(mask, w, h, labels, stack, minArea)

    // pick the hand: big, moving, near the last track
    let best: Blob | null = null, bestScore = 0, bestTop: ReturnType<typeof topRegion> | null = null
    const tracking = tx === tx, sigma = .22 * w
    for (const b of blobs) {
      const top = topRegion(b)
      const motion = top.moving / Math.max(1, top.area)
      let score = top.area * (.15 + motion)
      if (tracking) { const d2 = (top.cx - tx) ** 2 + (top.cy - ty) ** 2; score *= .25 + Math.exp(-d2 / (2 * sigma * sigma)) }
      if (score > bestScore) { bestScore = score; best = b; bestTop = top }
    }
    // a candidate that never moved since the track was lost is scenery
    if (best && bestTop && !tracking && bestTop.moving < bestTop.area * .05) best = null

    let rawX = NaN, rawY = NaN, pinchScore = 0, area = 0
    if (best && bestTop) {
      lastSeen = t; present = true
      tx = bestTop.cx; ty = bestTop.cy
      const bw = best.x1 - best.x0 + 1, [pcx, pcy] = palmCentre(labels, best.id, w, best.x0, best.y0, best.x1, Math.min(best.y1, best.y0 + 2 * bw), dt)
      rawX = (pcx + .5) / w; rawY = (pcy + .5) / h
      sx = fx.filter(rawX, t); sy = fy.filter(rawY, t)
      area = bestTop.area / n
      // pinch evidence: a hole in the hand's top square, or its area well under the recent open size
      const hole = largestHole(labels, best.id, w, best.x0, best.y0, best.x1, bestTop.y1, seen, stack, Math.max(2, Math.round(bestTop.area * .012)))
      openRef = Math.max(bestTop.area, openRef * .985)
      const ratio = bestTop.area / Math.max(1, openRef)
      pinchScore = hole ? 1 : clamp01((.78 - ratio) / .2)
    } else if (t - lastSeen > holdSecs) {
      present = false; tx = ty = NaN; openRef = 0; fx.reset(); fy.reset()
      pinchScore = 0
    } else pinchScore = pinch ? 1 : 0
    // hysteresis + debounce: two frames over .6 to close, two under .3 to open
    const want = pinch ? pinchScore > .3 : pinchScore > .6
    if (want !== pinch) { if (++streak >= 2) { pinch = want; streak = 0 } } else streak = 0
    if (!present) pinch = false
    return { present, x: sx, y: sy, rawX, rawY, pinch, pinchScore, area, mode: best ? mode : 'none' }
  }

  return { w, h, mask, push, reset }
}
