/**
 * The oldschool board's plane-deformation cards (src/engine/oldschool/deform.ts): a brick tunnel, a five-petal
 * flower, a floor to the horizon and a three-armed star. Each is a pure function of t. As in the 1999 effect the
 * formulas go into a look-up table once per card (`deformLUT`, 2×2 samples per dot, with a static fog per sample)
 * and each frame only scrolls the texture. Dots sit on a coarse lattice, so dot size is light.
 */
import { deformFloor, deformFlower, deformLUT, deformStar, deformTunnel, wrap01, type Deformation, type UV } from '../../engine/oldschool/deform'
import { dsin, ihash } from '../../engine/noise/dmath'
import { checkersTriangle } from '../../engine/filter/checkers'
import { layer, type WidgetPreset } from '../types'
import { ACTIVE, BODY_BOTTOM, BODY_TOP, CREDIT_DEFORM, FAINT, IDLE, MID, T, VALUE, caption, clamp01, dotCentre, footer, frac, pad, plate, plateGeom, tile, type Ink, type PlateGeom } from './oldschool-kit'

const K = 2
/** 2×2 supersample offsets inside one lattice dot, in card cells. */
const SS: readonly [number, number][] = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]]
const CX = 71.5, CY = (BODY_TOP + BODY_BOTTOM) / 2, HALF = 72
/** Screen coordinates of card cell (x, y): [−1, 1] across the card, square pixels, centred on the body. */
const sx = (x: number) => (x - CX) / HALF, sy = (y: number) => (y - CY) / HALF

/** Tone by light: bright near dots white, the middle distance grey, the far end dim. */
const toneOf = (v: number) => (v > .62 ? VALUE : v > .3 ? IDLE : MID)

/** A card's table: (u, v) and a fog weight per sample, 4 samples per plate dot, built on first use. */
interface Table { uv: Float32Array; fog: Float32Array }
/**
 * `screen(x, y)` maps a card cell to the formula's (x, y); `fog(px, py, u)` weights a sample (0 skips it).
 * Samples where the formula has no value (u or v non-finite) get fog 0.
 */
function table(geom: PlateGeom, d: Deformation, screen: (x: number, y: number, out: UV) => UV, fog: (px: number, py: number, u: number) => number): () => Table {
  let tab: Table | undefined
  return () => {
    if (tab) return tab
    const n = geom.cols * geom.rows, p: UV = [0, 0]
    const at = (i: number, j: number, out: UV) => { const [x, y] = dotCentre(geom, j); return screen(x + SS[i][0], y + SS[i][1], out) }
    const uv = deformLUT(SS.length, n, d, at), w = new Float32Array(n * SS.length)
    for (let k = 0; k < w.length; k++) {
      const u = uv[2 * k], v = uv[2 * k + 1]
      at(k % SS.length, Math.floor(k / SS.length), p)
      w[k] = u === u && v === v ? fog(p[0], p[1], u) : 0
    }
    return (tab = { uv, fog: w })
  }
}
const square = (x: number, y: number, out: UV): UV => { out[0] = sx(x); out[1] = sy(y); return out }
const PLATE = plateGeom(K)

// ── 01 TUNNEL ── the off-axis tunnel (u = .3/(r + .5x) deep, v = 3a/π around) lined with staggered bricks. The camera
// flies in at 1.6 depth units a second; every 1.5 units one brick pair is lit red and comes at you from the dark.
const RINGS = 6, BRICKS = 4, SPEED = 1.6, RED_EVERY = 1.5, RED_PHASE = .5
const tunnelTable = table(PLATE, deformTunnel, square, (_x, _y, u) => (u > 0 ? 1 / (1 + .3 * u * u) : 0))
function tunnelInk(t: number): (x: number, y: number, ink: Ink, i: number) => void {
  const du = SPEED * t, dv = .04 * t, { uv, fog } = tunnelTable()
  // the red brick's ring (unwrapped): each RED_EVERY depth units a new one appears at the far end; the phase puts it
  // near the viewer at the golden frame (t = 1.3, depth ≈ .42), where a brick is a dozen dots across
  const redRing = (Math.floor((du + RED_PHASE) / RED_EVERY) + 1) * RED_EVERY * RINGS - RED_PHASE * RINGS, redCol = 2
  return (_x, _y, ink, i) => {
    let s = 0, red = 0, lit = 0
    for (let k = i * 4; k < i * 4 + 4; k++) {
      const f = fog[k]
      if (!f) continue
      // brick texture: rings along depth, every other ring offset half a brick; mortar reads 0
      const u = uv[2 * k] + du, v = uv[2 * k + 1] + dv, ring = Math.floor(u * RINGS), bv = v * BRICKS + (ring & 1) * .5
      if (frac(u * RINGS) < .18 || frac(bv) < .12) continue
      s += f
      // one brick in seven is glazed (drawn white): picked by its ring and column, so it keeps its place as it flies past
      if (ihash(ring, Math.floor(wrap01(v) * BRICKS + (ring & 1) * .5), 7) % 7 === 0) lit++
      // the red pair: its ring and column in unwrapped texture space, so it exists once in the whole tunnel
      if (ring === redRing && Math.floor(bv) >> 1 === redCol) red++
    }
    const v = s / 4
    if (red) { ink.v = Math.max(.8, v); ink.tone = ACTIVE; return }
    ink.v = v < .08 ? 0 : v; ink.tone = lit >= 2 && v > .3 ? VALUE : v > .62 ? IDLE : v > .3 ? MID : FAINT
  }
}
export const osTunnel: WidgetPreset = {
  id: 'os-tunnel', name: 'Oldschool Tunnel', label: 'TUNNEL', ...tile, credit: CREDIT_DEFORM,
  layers: ctx => [
    caption('U=.3/(R+.5X)'),
    layer(plate(K, tunnelInk(ctx.t))),
    ...footer(`RING ${pad(SPEED * ctx.t * RINGS, 4)}`, 'V=3A/PI'),
  ],
}

// ── 02 BLOOM ── the flower tunnel (u = 1/(r + .5 + .5 sin 5a)): its depth isolines are five-petal outlines, drawn as
// lit bands that breathe in and out as the texture scrolls back and forth along depth; alternate tenths of a turn
// a shade darker. The centre, where depth runs to infinity, fades out.
const bloomTable = table(PLATE, deformFlower, square, (px, py, u) => u > 0 ? clamp01(2.2 / (u * u)) * clamp01(Math.sqrt(px * px + py * py) * 5 - .2) : 0)
function bloomInk(t: number): (x: number, y: number, ink: Ink, i: number) => void {
  const du = .35 * dsin(.8 * t) + .3 * t, dv = .03 * t, { uv, fog } = bloomTable()
  return (_x, _y, ink, i) => {
    let s = 0, seg = 0
    for (let k = i * 4; k < i * 4 + 4; k++) {
      const f = fog[k]
      if (!f) continue
      if (frac(wrap01(uv[2 * k] * .5 - du) * 5) < .45) s += f
      seg += Math.floor(wrap01(uv[2 * k + 1] / 6 + dv) * 10) & 1
    }
    const v = s / 4
    ink.v = v < .08 ? 0 : v; ink.tone = seg >= 2 ? (v > .5 ? IDLE : MID) : toneOf(v)
  }
}
export const osBloom: WidgetPreset = {
  id: 'os-bloom', name: 'Oldschool Bloom', label: 'BLOOM', ...tile, credit: CREDIT_DEFORM,
  layers: ctx => [
    caption('U=1/(R+.5+.5SIN5A)'),
    layer(plate(K, bloomInk(ctx.t))),
    ...footer('5 PETALS', 'V=3A/PI'),
  ],
}

// ── 03 FLOOR ── u = x/|y|, v = 1/|y| below the horizon: grid lines running toward the viewer, fading into the
// distance, under a red sun cut by the classic horizontal bands.
const HORIZON = 78
const FLOOR = plateGeom(K, HORIZON, BODY_BOTTOM)
const floorTable = table(FLOOR, deformFloor, (x, y, out) => { out[0] = sx(x); out[1] = (y - HORIZON) / HALF; return out }, (_x, py) => (py > 0 ? clamp01((py - .03) * 3.2) : 0))
function floorInk(t: number): (x: number, y: number, ink: Ink, i: number) => void {
  const dv = 2 * t, { uv, fog } = floorTable()
  return (_x, _y, ink, i) => {
    let s = 0
    for (let k = i * 4; k < i * 4 + 4; k++) if (fog[k] && (frac(uv[2 * k] * 1.5 + .5) < .16 || frac(uv[2 * k + 1] + dv) < .18)) s += fog[k]
    const v = s / 4
    ink.v = v < .06 ? 0 : v; ink.tone = toneOf(v)
  }
}
/** The sun: a half disc of big dots on the horizon, cut by bands that get closer toward its base. */
const SUN = { x: 71.5, y: HORIZON - 1, r: 31 }, SUN_K = 3, GAPS = new Set([1, 3, 6])
function sunInk(x: number, y: number, ink: Ink): void {
  const dx = x - SUN.x, dy = y - SUN.y
  if (dx * dx + dy * dy > SUN.r * SUN.r) return
  if (GAPS.has(Math.round((HORIZON - 2.5 - y) / SUN_K))) return
  ink.v = 1; ink.tone = ACTIVE
}
/** Stars: a few fixed dots in the sky, one at a time blinking out. */
const STARS: [number, number][] = [[12, 22], [31, 40], [52, 17], [96, 26], [118, 15], [134, 44], [22, 60], [125, 62], [80, 30], [6, 38]]
export const osFloor: WidgetPreset = {
  id: 'os-floor', name: 'Oldschool Floor', label: 'FLOOR', ...tile, credit: CREDIT_DEFORM,
  layers: ctx => {
    const tw = Math.floor(ctx.t * 2) % STARS.length
    return [
      caption('U=X/ABS(Y)'),
      layer(plate(SUN_K, sunInk, BODY_TOP, HORIZON - 2)),
      layer(T.dots(STARS.filter((_, i) => i !== tw), 1), 'mid'),
      layer(plate(K, floorInk(ctx.t), HORIZON, BODY_BOTTOM)),
      ...footer(`MILE ${pad(ctx.t * 2, 4)}`, 'V=1/ABS(Y)'),
    ]
  },
}

// ── 06 STAR ── the three-armed star (u = .02y + .03 cos 3a / r): a fine checker spun out along three arms, scrolling
// so the arms seem to turn. The centre, where the formula runs to infinity, fades to black, and so do the corners.
const starTable = table(PLATE, deformStar, square, (px, py) => { const r = Math.sqrt(px * px + py * py); return clamp01(r * 4 - .15) * clamp01((1.05 - r) * 2.2) })
/** Checker cells per unit of (u, v), and the dot's footprint in sample steps (samples sit one cell apart, a dot is K). */
const STAR_N = 14
function starInk(t: number): (x: number, y: number, ink: Ink, i: number) => void {
  const du = .9 * t, dv = -.35 * t, { uv, fog } = starTable()
  return (_x, _y, ink, i) => {
    const k = i * 4
    if (!(fog[k] && fog[k + 1] && fog[k + 2] && fog[k + 3])) return
    // the dot's centre and footprint from its four samples (the LUT's finite differences), in checker cells
    const u0 = uv[2 * k], v0 = uv[2 * k + 1], u1 = uv[2 * k + 2], v1 = uv[2 * k + 3], u2 = uv[2 * k + 4], v2 = uv[2 * k + 5], u3 = uv[2 * k + 6], v3 = uv[2 * k + 7]
    const cu = (u0 + u1 + u2 + u3) * .25 * STAR_N + du, cv = (v0 + v1 + v2 + v3) * .25 * STAR_N + dv
    const xu = (u1 - u0 + u3 - u2) * .5 * K * STAR_N, xv = (v1 - v0 + v3 - v2) * .5 * K * STAR_N
    const yu = (u2 - u0 + u3 - u1) * .5 * K * STAR_N, yv = (v2 - v0 + v3 - v1) * .5 * K * STAR_N
    // triangle-filtered checkers (IQ4): a cell edge crossing the dot gives a part value, so the arms' edges taper
    const c = checkersTriangle(cu, cv, xu, xv, yu, yv), f = (fog[k] + fog[k + 1] + fog[k + 2] + fog[k + 3]) * .25, v = c * f
    ink.v = v < .12 ? 0 : v
    ink.tone = (Math.floor(cu) & 1) ? (v > .55 ? VALUE : MID) : v > .55 ? IDLE : MID
  }
}
export const osStar: WidgetPreset = {
  id: 'os-star', name: 'Oldschool Star', label: 'STAR', ...tile, credit: CREDIT_DEFORM,
  layers: ctx => [
    caption('U=.02Y+.03COS3A/R'),
    layer(plate(K, starInk(ctx.t))),
    ...footer('', 'V=.02X+.03SIN3A/R'),
  ],
}
