/**
 * Deterministic synthetic camera (tests, fixtures, goldens): a scripted hand path and an RGBA frame of a
 * hand-like shape (palm, four fingers, thumb, forearm) moving over a static scene with a still face-like
 * skin blob as a distractor and a little sensor noise. A pinch curls the index into a ring with the thumb.
 * Pure functions of `t`, so Node (verify) and the browser test (`canvas.captureStream()`) see the same video.
 */
export interface HandPose {
  /** Palm centre, normalised frame coords in the *mirrored* (display) frame. */
  x: number; y: number
  /** 0 open … 1 pinched (thumb–index ring). */
  pinch: number
}

/** Seconds per pinch cycle and the pinched window inside it. */
export const PINCH_CYCLE = 3, PINCH_ON: [number, number] = [1.9, 2.7]

/** The scripted hand: a slow Lissajous sweep, pinching for .8 s of every 3 s (starts after 0.6 s off-frame). */
export function handPath(t: number): HandPose {
  const ph = t % PINCH_CYCLE
  return {
    x: .5 + .26 * Math.sin(2 * Math.PI * t / 6.4),
    y: .5 + .15 * Math.sin(2 * Math.PI * t / 4.1 + 1),
    pinch: ph >= PINCH_ON[0] && ph < PINCH_ON[1] ? 1 : 0,
  }
}

const hash = (x: number, y: number, s: number) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296 }
/** Distance from p to the segment a–b. */
const seg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
  const vx = bx - ax, vy = by - ay, k = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)))
  return Math.hypot(px - ax - vx * k, py - ay - vy * k)
}

/** Is (x, y) (pixels) on the hand at `pose`? `S` = hand size in pixels. Returns a shade 0.8..1 or 0. */
export function handAt(x: number, y: number, cx: number, cy: number, S: number, pinch: number): number {
  const dx = x - cx, dy = y - cy
  // palm
  if ((dx / (.36 * S)) ** 2 + (dy / (.4 * S)) ** 2 < 1) return .95 - .1 * (dy / S)
  // forearm down to the frame edge
  if (dy > 0 && Math.abs(dx + dy * .08) < .24 * S) return .85
  const fw = .085 * S, top = cy - .3 * S
  // middle, ring, little fingers (always up)
  const fingers: [number, number][] = [[-.04, .62], [.13, .56], [.28, .44]]
  for (const [ox, len] of fingers) if (seg(x, y, cx + ox * S, top, cx + ox * S * 1.15, top - len * S) < fw) return .9
  if (pinch < .5) {
    // index up, thumb out to the side
    if (seg(x, y, cx - .2 * S, top, cx - .25 * S, top - .58 * S) < fw) return .9
    if (seg(x, y, cx - .3 * S, cy + .05 * S, cx - .62 * S, cy - .32 * S) < fw * 1.15) return .88
  } else {
    // thumb and index meet in a ring left of the palm top
    const rx = cx - .4 * S, ry = top - .14 * S, d = Math.hypot(x - rx, y - ry)
    if (d < .25 * S && d > .12 * S) return .9
  }
  return 0
}

export interface SynthOptions {
  /** Draw the mirror image (what the tracker sees after the camera's mirror); false = raw camera view. */
  mirrored?: boolean
  /** Hand size as a fraction of the frame height. */
  size?: number
  /** Sensor noise amplitude, 0..255. */
  noise?: number
  /** Frame index for the noise pattern. */
  frame?: number
  /** Hide the hand (empty scene). */
  noHand?: boolean
  /** Ground truth: set to 1 on hand pixels (w·h). */
  truth?: Uint8Array
  /** Draw this pose instead of the scripted path (a test steering the hand). */
  pose?: HandPose
}

const SKIN: [number, number, number] = [226, 170, 138], FACE: [number, number, number] = [206, 158, 128]

/** Render the synthetic scene at `t` into `out` (RGBA, `w`×`h`). Returns the pose drawn. */
export function synthFrame(out: Uint8ClampedArray, w: number, h: number, t: number, opts: SynthOptions = {}): HandPose {
  const { mirrored = true, size = .3, noise = 4, frame = Math.round(t * 30), noHand = false, truth } = opts
  const pose = opts.pose ?? handPath(t), S = size * h
  // the pose lives in the mirrored frame; the raw camera sees it flipped
  const hx = (mirrored ? pose.x : 1 - pose.x) * w, hy = pose.y * h
  const fcx = (mirrored ? .2 : .8) * w, fcy = .34 * h, fr = .13 * h
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const j = (y * w + x) * 4
    // backdrop: cool grey, lit from the top, with fixed texture
    const tex = (hash(x >> 2, y >> 2, 7) - .5) * 14, lit = 1 - .35 * (y / h)
    let r = (84 + tex) * lit, g = (94 + tex) * lit, b = (108 + tex) * lit
    // a seated person: dark shirt and a still face (skin) — distractors that never move
    const fdx = (x - fcx) / fr, fdy = (y - fcy) / (fr * 1.25)
    if (y > fcy + fr * 1.3 && Math.abs(x - fcx) < .28 * w - (y - fcy) * .02 + (y - fcy - fr * 1.3) * .6) { r = 40; g = 44; b = 58 }
    if (fdx * fdx + fdy * fdy < 1) { const s = .85 + .15 * (1 - fdx); r = FACE[0] * s; g = FACE[1] * s; b = FACE[2] * s }
    if (!noHand) {
      const s = handAt(x, y, hx, hy, S, pose.pinch)
      if (s) { r = SKIN[0] * s; g = SKIN[1] * s; b = SKIN[2] * s }
      if (truth) truth[y * w + x] = s ? 1 : 0
    }
    const nz = noise ? (hash(x, y, frame) - .5) * 2 * noise : 0
    out[j] = r + nz; out[j + 1] = g + nz; out[j + 2] = b + nz; out[j + 3] = 255
  }
  return pose
}

/**
 * The pointer point the tracker is meant to find, from a ground-truth hand mask: the centroid of the hand's
 * top square (as wide as the hand, measured from its top). Normalised frame coords; NaN when empty.
 */
export function truthPoint(truth: Uint8Array, w: number, h: number): [number, number] {
  let x0 = w, x1 = -1, y0 = h
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (truth[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y }
  if (x1 < 0) return [NaN, NaN]
  const y1 = Math.min(h - 1, y0 + Math.round((x1 - x0 + 1) * 1.1) - 1)
  let n = 0, sx = 0, sy = 0
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (truth[y * w + x]) { n++; sx += x; sy += y }
  return [(sx / n + .5) / w, (sy / n + .5) / h]
}
