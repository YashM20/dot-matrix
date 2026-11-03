/**
 * FACES, the drawing: one face as a lit halftone on fixed dot sites, the afterlight face's technique (a lattice of
 * sites, dot size = light). The head is an SDF inflated into a dome and lit by one light; eyes, lids, brows, mouth and
 * cheeks are shapes in head space that set each site's value and tone in the same field. Every edge is soft over about
 * one lattice step, so a pupil that moves less than a step still moves: the dots on its rim shrink and grow.
 * Two inks: a grey head (`skin: 'grey'`) wears bright features (white eyes ringed in dark, white strokes for brows,
 * lips and shut eyes, dark pupils and mouths); a white head (`'white'`, a vinyl toy) wears dark ones (dot eyes, holes).
 * Tones: grey skin `idle` / `mid`, white skin `value` / `idle` / `mid` (dithered where they meet), features `value`,
 * the blush `active` (the board's one red). Each frame shades every site once and groups them into one layer per tone.
 */
import type { Layer, Tone } from '../../engine/types'
import { clamp, hash01, smoothstep } from '../../engine/math'

export type Pt = [number, number]
/** Signed distance in head space (cells, origin at the head centre, y down), negative inside. */
export type Sdf = (x: number, y: number) => number

/** Site pitch and dot size (card cells): about the afterlight face's 2.52 × 2.72. */
export const PITCH = 2.6, SIZE = 2.5
const SOFT = PITCH * .45, SPAN = 143
/**
 * Half the thickness of a shut eye's line and of the lips, and the dark ring round a bright eye. A band only reads
 * fully lit (or fully dark) where it is wider than its two soft edges, 2 · SOFT ≈ 2.3 cells.
 */
const LINE = 1.7, STROKE = 2.4, RING = 3

/** One character's build. All lengths in cells, head space. */
export interface Look {
  head: Sdf
  /** Inflation radius: how far in from the outline the head is fully round. */
  R: number
  /** Head centre on the card. */
  cx: number; cy: number
  skin: 'grey' | 'white'
  /** Eye centres at (±dx, y), ellipse radii, pupil radius; `dot` eyes are dark ovals that move as a whole. */
  eye: { dx: number; y: number; rx: number; ry: number; pupil: number; dot?: boolean }
  /** Brows: gap above the eye, half length, thickness, arch. */
  brow?: { gap: number; half: number; w: number; arch: number }
  /** Mouth centre height, half width, smile depth; `cat` draws a closed mouth as two small arcs. */
  mouth: { y: number; half: number; depth: number; cat?: boolean }
  /** Cheeks (the blush): centres at (±dx, y), radius. */
  cheek: { dx: number; y: number; r: number }
  /** A soft shadow under the nose, if any. */
  nose?: { y: number; r: number }
  /** Discs that scale the skin: [x, y, r, k, parallax weight (default 1)]; k = 0 is a hole, k < 1 a shade. */
  patches?: [number, number, number, number, number?][]
  /** How far the features run ahead of the outline when the head turns fully. */
  parallax: Pt
  /** Specular strength: a vinyl toy shines, skin barely. */
  gloss: number
  /** Light that reaches the side turned away (default .3); higher evens the face out. */
  ambient?: number
}

/** One frame of expression. Pairs are [left, right] eye. */
export interface Pose {
  /** Where the pupils point, each axis -1..1. */
  gx: number; gy: number
  /** Head turn (features parallax), -1..1. */
  turnX: number; turnY: number
  /** Upper lid: 0 open, 1 shut. */
  lid: Pt
  /** The shut line's bend: + arches up (a happy ^), - sags (asleep). */
  curve: Pt
  /** Eye and pupil scale. */
  wide: number; pupil: number
  /** Brow raise (cells up) and slant (cells, + drops the outer end). */
  brow: Pt; slant: Pt
  /** Mouth: smile -1..1, open 0..1, width scale, sideways offset. */
  smile: number; open: number; mouthW: number; mouthX: number
  blush: number
  /** Head bob (cells, + down), tilt (radians), squash (1 = none, < 1 flatter). */
  bob: number; tilt: number; squash: number
  /** Light level 0..1 and side: 1 = upper right (the day), -1 = upper left (the moon). */
  light: number; side: number
}

export const restPose = (): Pose => ({
  gx: 0, gy: 0, turnX: 0, turnY: 0, lid: [0, 0], curve: [0, 0], wide: 1, pupil: 1, brow: [0, 0], slant: [0, 0],
  smile: 0, open: 0, mouthW: 1, mouthX: 0, blush: 0, bob: 0, tilt: 0, squash: 1, light: 1, side: 1,
})

// ── SDF helpers ─────────────────────────────────────────────────────────────
export const sdCircle = (cx: number, cy: number, r: number): Sdf => (x, y) => Math.hypot(x - cx, y - cy) - r
/** Superellipse (n = 2 is an ellipse), distance approximated by the scaled norm. */
export const sdBlob = (a: number, b: number, n = 2): Sdf => {
  const m = Math.min(a, b)
  return n === 2 ? (x, y) => (Math.hypot(x / a, y / b) - 1) * m : (x, y) => (Math.pow(Math.abs(x / a) ** n + Math.abs(y / b) ** n, 1 / n) - 1) * m
}
/** Smooth union (polynomial smin), `k` cells of blend. */
export const smooth = (k: number, ...fs: Sdf[]): Sdf => (x, y) => {
  let d = fs[0](x, y)
  for (let i = 1; i < fs.length; i++) { const e = fs[i](x, y), h = clamp(.5 + .5 * (e - d) / k); d = e + (d - e) * h - k * h * (1 - h) }
  return d
}

/** Every lattice site the head can reach (rest outline + `margin`: bob, turn, tilt, a hop), below the label row. */
export function sitesFor(look: Look, margin = 11): Pt[] {
  const out: Pt[] = []
  for (let j = -30; j <= 30; j++) for (let i = -30; i <= 30; i++) {
    const x = look.cx + i * PITCH, y = look.cy + j * PITCH
    if (x < 1 || y < 11 || x > 142 || y > 142) continue
    if (look.head(x - look.cx, y - look.cy) < margin) out.push([+x.toFixed(2), +y.toFixed(2)])
  }
  return out
}

/** A site's lookup key: its position to a twentieth of a cell. */
const keyOf = (x: number, y: number) => Math.round(x * 20) * 4096 + Math.round(y * 20)
/** Coverage of `d < 0` with a soft edge (1 inside). */
const inside = (d: number) => 1 - smoothstep(-SOFT, SOFT, d)
/** Skin tone by value; each site's band edge is jittered by its own hash, so neighbouring bands dither into each other. */
function skinTone(skin: Look['skin'], v: number, x: number, y: number): Tone {
  const h = hash01(Math.round(x * 10), Math.round(y * 10), 5)
  if (skin === 'grey') return v >= .36 + .1 * h ? 'idle' : 'mid'
  return v >= .5 + .12 * h ? 'value' : v >= .26 + .08 * h ? 'idle' : 'mid'
}

interface Eye { cx: number; cy: number; rx: number; ry: number; pr: number; px: number; py: number; lid: number; curve: number }
/** The upper lid's height (eye space) at `ex`: from just above the eye down to the shut line. */
const lidLine = (v: Eye, ex: number) => {
  const s = clamp(ex / v.rx, -1, 1), shut = .22 * v.ry - v.curve * .55 * v.ry * (1 - s * s)
  return -v.ry * 1.05 + (shut + v.ry * 1.05) * v.lid
}

// the last `arc` call's inside, curve, opening and position along it (the mouth's interior and tongue read them)
let arcIn = 0, arcBase = 0, arcH = 0, arcS = 0
/** Distance to a mouth of half width `half`: a stroke along a smile curve, opened downward by `open` (0..1). */
function arc(ax: number, my: number, half: number, depth: number, open: number, smile: number): number {
  const s = ax / half, bow = Math.max(0, 1 - s * s), base = smile * depth * bow, h = open * half * .9 * Math.sqrt(bow)
  const up = base - h * .25, lo = base + h
  arcIn = h > .6 ? Math.max(up - my, my - lo, (Math.abs(s) - .9) * half) : Infinity
  arcBase = base; arcH = h; arcS = s
  return Math.max(up - STROKE - my, my - lo - STROKE, (Math.abs(s) - 1) * half)
}

/** The face's layers for one pose: the halftone head on `sites`, and one glint dot per open eye. */
export function faceLayers(look: Look, pose: Pose, sites: Pt[]): Layer[] {
  const ct = Math.cos(pose.tilt), st = Math.sin(pose.tilt), sq = pose.squash, sx = Math.sqrt(sq)
  const hx = look.cx + pose.turnX * 1.6, hy = look.cy + pose.bob + pose.turnY * 1.2
  const fx = pose.turnX * look.parallax[0], fy = pose.turnY * look.parallax[1]
  const bright = look.skin === 'grey', ink = Math.max(.62, pose.light)
  // the light, mostly frontal so the features stay lit, and the half vector for the sheen
  let Lx = .38 * pose.side, Ly = -.42, Lz = .82
  const ln = Math.hypot(Lx, Ly, Lz); Lx /= ln; Ly /= ln; Lz /= ln
  let Hx = Lx, Hy = Ly, Hz = Lz + 1
  const hn = Math.hypot(Hx, Hy, Hz); Hx /= hn; Hy /= hn; Hz /= hn
  const { eye: E, R, head } = look, amb = look.ambient ?? .3
  const eyes: Eye[] = [-1, 1].map((s, i) => {
    const rx = E.rx * pose.wide, ry = E.ry * pose.wide
    let cx = s * E.dx + fx, cy = E.y + fy
    // dot eyes look by moving; white eyes by moving the pupil
    if (E.dot) { cx += pose.gx * rx * .5; cy += pose.gy * ry * .35 }
    const pr = E.dot ? Math.min(rx, ry) * .55 : E.pupil * pose.pupil
    const px = E.dot ? cx : cx + pose.gx * (rx - pr - 1) * .85, py = E.dot ? cy : cy + pose.gy * (ry - pr - 1) * .75
    return { cx, cy, rx, ry, pr, px, py, lid: clamp(pose.lid[i]), curve: pose.curve[i] }
  })
  const mw = look.mouth.half * pose.mouthW, mcx = pose.mouthX + fx, mcy = look.mouth.y + fy

  let value = 0, tone: Tone | undefined
  /** Shade card cell (x, y): sets `value` and `tone`. */
  const shade = (x: number, y: number) => {
    value = 0; tone = undefined
    const dx = x - hx, dy = y - hy, lx = (dx * ct + dy * st) * sx, ly = (-dx * st + dy * ct) / sq
    const d = head(lx, ly)
    if (d > PITCH * .6) return
    // inflate the outline into a dome; the normal comes from the SDF gradient
    const e = .6, gx = (head(lx + e, ly) - d) / e, gy = (head(lx, ly + e) - d) / e
    const k0 = clamp(-d, 0, R), H = Math.sqrt(k0 * (2 * R - k0)), k = (R - k0) / Math.max(H, .5)
    let nx = gx * k, ny = gy * k
    const nl = Math.hypot(nx, ny, 1); nx /= nl; ny /= nl
    const nz = 1 / nl, lam = Math.max(0, nx * Lx + ny * Ly + nz * Lz), spec = Math.max(0, nx * Hx + ny * Hy + nz * Hz) ** 30
    let skin = clamp(pose.light * (amb + (1 - amb) * lam + look.gloss * spec) * inside(d - PITCH * .1)), lit = 0
    if (look.nose) { const n = Math.hypot((lx - fx + 1.5) / 1.4, ly - fy - look.nose.y) / look.nose.r; skin *= 1 - .4 * (1 - smoothstep(.3, 1, n)) }
    if (look.patches) for (const [px, py, pr, pk, w = 1] of look.patches) {
      const c = inside(Math.hypot(lx - fx * w - px, ly - fy * w - py) - pr)
      if (c > 0) skin *= 1 + (pk - 1) * c
    }
    // eyes: the open part (grown by LINE, so a shut eye is a line) is white with a pupil and ringed in dark, or one dark dot
    for (const v of eyes) {
      const ex = lx - v.cx, ey = ly - v.cy
      if (Math.abs(ex) > v.rx + 6 || Math.abs(ey) > v.ry + 6) continue
      const dE = (Math.hypot(ex / v.rx, ey / v.ry) - 1) * Math.min(v.rx, v.ry), s = clamp(ex / v.rx, -1, 1)
      const shut = .22 * v.ry - v.curve * .55 * v.ry * (1 - s * s), yL = v.ry * 1.05 + (shut - v.ry * 1.05) * v.lid
      const dOpen = Math.max(dE, lidLine(v, ex) - ey, ey - yL), reach = bright ? LINE + RING : LINE
      if (dOpen > reach + SOFT) { if (dE < 0) skin *= .9; continue }
      if (!bright) { value = skin * (1 - inside(dOpen - LINE)); tone = skinTone(look.skin, value, x, y); return }
      const hole = inside(Math.hypot(lx - v.px, ly - v.py) - v.pr) * inside(dOpen + .8)
      const w = inside(dOpen - LINE) * (1 - hole) * ink, beyond = smoothstep(reach - SOFT, reach + SOFT, dOpen) * skin
      value = Math.max(w, beyond); tone = w >= beyond ? 'value' : skinTone(look.skin, beyond, x, y)
      return
    }
    // brows: short arched strokes
    if (look.brow) {
      const B = look.brow
      for (let i = 0; i < 2; i++) {
        const s = i ? 1 : -1, v = eyes[i], bx = lx - (s * E.dx * 1.04 + fx)
        if (Math.abs(bx) > B.half + 3) continue
        const u = bx / B.half, by = v.cy - v.ry - B.gap - pose.brow[i] + pose.slant[i] * u * s - B.arch * (1 - u * u)
        const c = inside(Math.max(Math.abs(ly - by) - B.w / 2, Math.abs(bx) - B.half))
        if (bright) lit = Math.max(lit, c); else skin *= 1 - c
      }
    }
    // mouth: lips along a smile curve that open downward; dark inside, with a tongue when wide open
    const mx = lx - mcx, my = ly - mcy
    if (Math.abs(mx) < mw * 1.3 + 4 && Math.abs(my) < mw + 12) {
      const cat = look.mouth.cat && pose.open < .2, half = cat ? mw / 2 : mw
      const lips = inside(arc(cat ? mx + (mx < 0 ? half : -half) : mx, my, half, look.mouth.depth * (cat ? .8 : 1), cat ? 0 : pose.open, pose.smile))
      const hollow = inside(arcIn)
      if (hollow > .5 && pose.open > .35 && my > arcBase + arcH * .45 && Math.abs(arcS) < .7) { value = .5 * ink; tone = 'idle'; return }
      if (bright) { lit = Math.max(lit, lips * (1 - hollow)); skin *= 1 - hollow } else skin *= 1 - lips
    }
    skin = clamp(skin)
    const sv = skin * (1 - lit), lv = lit * ink
    if (lv > sv) { value = lv; tone = 'value'; return }
    value = sv; tone = skinTone(look.skin, sv, x, y)
    if (pose.blush > 0 && sv > .05) {
      const C = look.cheek, r = C.r * Math.sqrt(pose.blush), bx = Math.abs(lx - fx) - C.dx
      if (Math.hypot(bx / 1.3, ly - fy - C.y) < r) { value = Math.max(sv, .5); tone = 'active' }
    }
  }

  // shade every site once, then one site layer per tone; the sampler reads each site's value back by position
  const values = new Map<number, number>(), byTone = new Map<Tone, Pt[]>()
  for (const s of sites) {
    shade(s[0], s[1])
    if (value < .1 || !tone) continue
    values.set(keyOf(s[0], s[1]), value)
    const g = byTone.get(tone)
    if (g) g.push(s); else byTone.set(tone, [s])
  }
  const field = (u: number, v: number) => values.get(keyOf(u * SPAN, v * SPAN)) ?? 0
  const out: Layer[] = [...byTone].map(([t, s]) => ({ field, sites: s, size: SIZE, tone: t }))
  // a glint on each open eye, up toward the light: one free dot, so it follows the gaze smoothly
  const glints: Pt[] = []
  for (const v of eyes) {
    if (v.lid > .55 || v.curve > .4) continue
    const ex = v.px + v.pr * .42 * pose.side, ey = v.py - v.pr * .45
    if (ey - v.cy < lidLine(v, ex - v.cx) + 1.5) continue
    const wx = ex / sx, wy = ey * sq
    glints.push([hx + wx * ct - wy * st, hy + wx * st + wy * ct])
  }
  if (glints.length && pose.light > .5) out.push({ field: () => 1, sites: glints, size: E.dot ? 2 : 1.5, tone: 'value' })
  return out
}
