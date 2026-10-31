/**
 * The mirror board's test portrait (a deterministic head-and-shoulders study in card cells), in its own module so the
 * boards that borrow it (squares) don't pull the whole mirror board into their chunk. Moved verbatim from mirror.ts.
 */
import { clamp } from '../../engine/math'

// ── test portrait: a head-and-shoulders study in card cells. Soft key light from the upper left (wrapped
// lambert), the backdrop brighter on the shadow side so both cheeks separate from it, spanning void →
// mid → highlight like a real webcam frame ─────────────────────────────────────────────────────────────
export const HX = 72, HY = 64, RX = 30, RY = 38
const L = (() => { const x = -.45, y = -.4, z = .8, n = Math.hypot(x, y, z); return [x / n, y / n, z / n] })()
const H = (() => { const x = L[0], y = L[1], z = L[2] + 1, n = Math.hypot(x, y, z); return [x / n, y / n, z / n] })()
export const ell = (x: number, y: number, cx: number, cy: number, rx: number, ry: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2
/** Shoulder line: high at the neck, falling off to both sides. */
export const shoulder = (x: number) => 114 + 20 * (1 - Math.exp(-(((x - HX) / 40) ** 2)))
/** Wrapped lambert (soft studio light): the terminator falls past 90°, so the shadow side keeps some form. */
const wrapLit = (nx: number, ny: number, nz: number) => Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2] + .35) / 1.35)

/** Luma of the test portrait at card cell (x, y). `eyes` 1 = open, 0 = closed (blink). */
export function portrait(x: number, y: number, eyes = 1): number {
  // backdrop: dark behind the lit cheek, a soft glow behind the shadow side, a little lighter at the top
  let lum = .02 + .34 * Math.exp(-((x - 116) ** 2 + (y - 46) ** 2) / (2 * 34 ** 2)) + .04 * clamp(1 - y / 110)
  // torso: knit lit from the left, a V-neck of skin
  const st = shoulder(x)
  if (y >= st) {
    const lit = clamp(1 - (x - 10) / 130)
    lum = .14 + .34 * lit * lit + .03 * Math.sin(x * 1.4 + y * .5)
    if (y - st < 1.5 && x < HX - 10) lum += .2
    if (Math.abs(x - HX) < 10 - (y - st) * .12 - Math.max(0, y - st - 16) && y - st < 26) lum = .3 + .2 * clamp((HX + 8 - x) / 20)
  }
  // neck: skin in the jaw's shadow, the right side darker
  if (Math.abs(x - HX) < 12.5 && y > HY + RY * .5 && y < st + 3) {
    const shade = clamp((y - (HY + RY * .8)) / 9)
    lum = (.16 + .3 * shade) * (x < HX + 2 ? 1 : .7)
  }
  // ears
  for (const s of [-1, 1]) if (ell(x, y, HX + s * RX * .98, HY + 4, 4, 7) < 1) lum = s < 0 ? .5 : .22
  // head: a jaw-tapered ellipsoid
  const Y = (y - HY) / RY, rx = RX * (Y > 0 ? 1 - .25 * Y * Y : 1 - .05 * Y * Y), X = (x - HX) / rx, q = X * X + Y * Y
  // hair: a volume over the skull's top and sides, side-swept (lower on the right)
  const hq = ell(x, y, HX + 1, HY - 4, RX + 4, RY + 4), inHead = q < 1
  if (hq < 1 && Y < .05 && (!inHead || Y < -.5 + .3 * X * X + .08 * X)) {
    const nx = (x - HX - 1) / (RX + 4), ny = (y - HY + 4) / (RY + 4), nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))
    const lam = wrapLit(nx, ny, nz)
    // strands: a fine sweep across the crown, brighter where lit
    return clamp(.1 + .32 * lam * lam + .07 * lam * Math.sin(x * .8 - y * .45 + 2 * Math.sin(y * .15)))
  }
  if (!inHead) return lum
  const nz = Math.sqrt(Math.max(0, 1 - q)), nx = X, ny = Y * .85, nn = Math.hypot(nx, ny, nz) || 1
  const lam = wrapLit(nx / nn, ny / nn, nz / nn), spec = Math.max(0, (nx * H[0] + ny * H[1] + nz * H[2]) / nn) ** 30
  lum = .12 + .7 * lam + .2 * spec
  // cheekbone highlight on the lit side
  lum += .06 * Math.exp(-(((X + .45) / .2) ** 2 + ((Y - .12) / .16) ** 2))
  const ax = Math.abs(X), side = X < 0 ? 1 : .75
  // brows
  // brows: arched, thinning toward the temples
  if (ax > .14 && ax < .62 && Math.abs(Y + .31 - 1.1 * (ax - .36) ** 2) < .036 * (1 - .5 * clamp((ax - .36) / .26))) lum *= .3
  // eye sockets, then the eyes
  const sock = ((ax - .36) / .26) ** 2 + ((Y + .12) / .14) ** 2
  if (sock < 1) lum *= .6 + .4 * sock
  if (eyes > .5) {
    const white = ((ax - .36) / .16) ** 2 + ((Y + .12) / .062) ** 2, iris = ((ax - .35) / .07) ** 2 + ((Y + .118) / .07) ** 2
    if (white < 1) lum = .62 * side
    if (iris < 1) lum = .05
    // one catch-light per eye, up and left of the pupil
    if (Math.abs(X - (Math.sign(X) * .35 - .03)) < .03 && Math.abs(Y + .14) < .022) lum = .9
  } else if (Math.abs(Y + .1) < .02 && ax > .22 && ax < .5) lum = .06
  // nose: shadow down the right of the bridge, a lit tip, nostrils, the shadow under it
  if (X > .04 && X < .16 && Y > -.04 && Y < .34) lum *= .6
  if (((X + .02) / .08) ** 2 + ((Y - .3) / .05) ** 2 < 1) lum = Math.min(1, lum + .14)
  if (((ax - .09) / .045) ** 2 + ((Y - .38) / .025) ** 2 < 1) lum = .08
  if (Y > .4 && Y < .45 && ax < .12) lum *= .7
  // mouth: a dark parting line, a shaded upper lip and a lit lower lip, the chin's shadow under it
  const ym = .6 + .14 * X * X
  if (ax < .28 && Math.abs(Y - ym) < .022) lum = .08
  else if (ax < .25 && Y < ym && Y > ym - .06) lum *= .78
  else if (ax < .2 && Y > ym && Y < ym + .07) lum = Math.min(1, lum * 1.1)
  if (ax < .24 && Y > ym + .1 && Y < ym + .14) lum *= .82
  return clamp(lum)
}
