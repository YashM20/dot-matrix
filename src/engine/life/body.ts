/**
 * A fish body in spine space (docs/living-matter/L-pond.md §L1 "Body"): s runs along the body (0 = snout, 1 = tail
 * tip), v is the signed lateral offset (cells, + = left of the swim direction).
 * - Width profile B(s) = halfWidth·L·√s·(1 − s)^1.15 / .3634 (peak 1 at s = .303), read from a 257-entry LUT.
 * - Swim wave (render-time): Videler's carangiform envelope A(s) = L(.02 − .0825 s + .1625 s²)·beat (0.1 L at the
 *   tail), wave number k = 2π/1.1 per body length, displacing spine nodes along their normals.
 * - `bodyRaster` forward-splats the posed body over card cells: per cell the nearest spine point (min |v|), then
 *   inside B(s), a fin or the tail fan.
 * - `koiPattern` bakes the markings (kohaku red where fbm2 > 0: the plan's .12 gave 10–30 % red over seeds, 0 gives 30–50 %) (kohaku, sanke, showa, tancho) into a 64 × 16 LUT once per koi; frames only read it.
 * - Tail beat from the Strouhal number: f = St·U / (2·A_tail), St = .3 (Taylor, Nudds & Thomas 2003).
 */
import { dcos, dpow, dsin, fbm2 } from '../noise'
import type { Chain } from './chain'

export interface BodySpec {
  /** Body length L in cells. */
  length: number
  /** Peak half-width × L (default .11). */
  halfWidth?: number
  fins: boolean
  tail: boolean
}

/** 1,024 intervals: (1 − s)^1.15 bends hard near the tail, and 256 left a 2.4e-4 interpolation error there. */
const LUT_N = 1024
/**
 * (1 − s)^1.15 / .3634 on 257 points of [0, 1], built with dpow (the same bits in every engine). The √s factor is
 * applied exactly per call: its infinite slope at s = 0 is what a linear LUT can't follow.
 */
const WIDTH_LUT = (() => {
  const t = new Float64Array(LUT_N + 1)
  for (let i = 0; i <= LUT_N; i++) t[i] = dpow(1 - i / LUT_N, 1.15) / .3634
  return t
})()
/** The normalised profile √s·(1 − s)^1.15 / .3634 at s (LUT, linear interpolation; 0 outside [0, 1]). */
export function profileAt(s: number): number {
  if (!(s > 0) || s >= 1) return 0
  const f = s * LUT_N, i = Math.floor(f), a = WIDTH_LUT[i]
  return Math.sqrt(s) * (a + (WIDTH_LUT[i + 1] - a) * (f - i))
}
/** Half-width B(s) in cells. */
export const widthAt = (b: BodySpec, s: number): number => (b.halfWidth ?? .11) * b.length * profileAt(s)

/** Wave number of the swim wave per body length (Videler: one wave every 1.1 L). */
export const WAVE_K = (2 * Math.PI) / 1.1
/** Lateral swim offset at s (cells). */
export function waveAt(b: BodySpec, s: number, phase: number, beat: number): number {
  const amp = b.length * (.02 - .0825 * s + .1625 * s * s) * beat
  return amp * dsin(phase - WAVE_K * s)
}
/** Tail-beat frequency (Hz) from Strouhal St = f·A_pp / U with A_pp = 2·A_tail = .2 L: f = St·U / (.2 L). */
export const tailBeatHz = (speed: number, length: number, st = .3): number => (st * speed) / (2 * .1 * length)

// ── the raster ──────────────────────────────────────────────────────────────────────────────────────
export const PART_NONE = 0, PART_BODY = 1, PART_FIN = 2, PART_TAIL = 3
export interface BodyRaster {
  /** Box in card cells: cell (x0 + i, y0 + j) is entry j·w + i. */
  x0: number; y0: number; w: number; h: number
  /** 1 inside the body, a fin or the tail, else 0. */
  cover: Float32Array
  /** Spine coordinate and signed lateral offset (cells) of the nearest spine point. */
  s: Float32Array; v: Float32Array
  /** Unit screen-space normal of the spine there (left of the swim direction). */
  nx: Float32Array; ny: Float32Array
  /** PART_* per cell. */
  part: Uint8Array
  /** Most cells the box may hold. */
  cap: number
  /** The posed spine (render-time wave applied), one point per chain node. */
  px: Float64Array; py: Float64Array
}
export function createBodyRaster(cap = 96 * 96, nodes = 64): BodyRaster {
  return {
    x0: 0, y0: 0, w: 0, h: 0, cap,
    cover: new Float32Array(cap), s: new Float32Array(cap), v: new Float32Array(cap), nx: new Float32Array(cap), ny: new Float32Array(cap), part: new Uint8Array(cap),
    px: new Float64Array(nodes), py: new Float64Array(nodes),
  }
}

/** Tail fan: s ∈ [.86, 1.06], half-width 1.6 + 4.4·((s − .86)/.2) cells, minus a V notch |v| < 3·((s − .96)/.1) past s = .96. */
const TAIL_S0 = .86, TAIL_S1 = 1.06
function inTail(s: number, av: number): boolean {
  if (s < TAIL_S0 || s > TAIL_S1) return false
  if (av > 1.6 + 4.4 * ((s - TAIL_S0) / .2)) return false
  return !(s > .96 && av < 3 * ((s - .96) / .1))
}
/** Fins: pectoral at s = .19 (a .07 L along, b .05 L), pelvic at s = .47 (a .045 L, b .03 L); swept back 35°. */
const FINS = [{ s: .19, a: .07, b: .05 }, { s: .47, a: .045, b: .03 }] as const
const SWEEP_C = dcos(35 * Math.PI / 180), SWEEP_S = dsin(35 * Math.PI / 180), FLAP = 12 * Math.PI / 180

/** Posed spine point and tangent at s (interpolated between posed nodes), into `o` [x, y, tx, ty] (tangent tail-ward). */
function spineAt(out: BodyRaster, n: number, s: number, o: Float64Array) {
  const f = Math.min(n - 1.000001, Math.max(0, s * (n - 1))), i = Math.floor(f), k = f - i
  const ax = out.px[i], ay = out.py[i], bx = out.px[i + 1], by = out.py[i + 1]
  const dx = bx - ax, dy = by - ay, l = Math.sqrt(dx * dx + dy * dy) || 1
  o[0] = ax + dx * k; o[1] = ay + dy * k; o[2] = dx / l; o[3] = dy / l
}
const sp = new Float64Array(4)

/**
 * Forward-splat the posed body (chain + render-time wave) at card-cell centres. Each segment is scanned over its
 * box; a cell keeps the spine point with the smallest |v|, then cover = 1 inside B(s), a fin or the tail fan.
 * Cell (c, r) has its centre at (c, r) in card cells (the chain's units). `bulge` (cells, L3.1's gulp) widens the
 * head: + bulge at the snout, tapering to 0 at s = .25 (0, the default, leaves the body exactly as without it).
 */
export function bodyRaster(b: BodySpec, c: Chain, st: Float32Array, phase: number, beat: number, out: BodyRaster, bulge = 0): void {
  const n = c.n, L = b.length, hw = (b.halfWidth ?? .11) * L
  // pose: each node moves along its normal by the swim wave
  for (let i = 0; i < n; i++) {
    const i0 = i > 0 ? i - 1 : 0, i1 = i < n - 1 ? i + 1 : n - 1
    let tx = st[c.X + i1] - st[c.X + i0], ty = st[c.Y + i1] - st[c.Y + i0]
    const l = Math.sqrt(tx * tx + ty * ty) || 1
    tx /= l; ty /= l
    // left normal of the swim direction (swim = −tangent, since nodes run snout → tail)
    const w = waveAt(b, i / (n - 1), phase, beat)
    out.px[i] = st[c.X + i] + ty * w; out.py[i] = st[c.Y + i] - tx * w
  }
  // box
  const reach = hw + (b.fins ? .12 * L : 0) + 7
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i < n; i++) { const x = out.px[i], y = out.py[i]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y }
  let x0 = Math.floor(minX - reach), y0 = Math.floor(minY - reach), w = Math.ceil(maxX + reach) - x0 + 1, h = Math.ceil(maxY + reach) - y0 + 1
  if (!(w > 0 && h > 0) || !Number.isFinite(x0) || !Number.isFinite(y0)) { out.w = out.h = 0; return }
  if (w * h > out.cap) { const k = Math.sqrt(out.cap / (w * h)); w = Math.floor(w * k); h = Math.floor(h * k) }
  out.x0 = x0; out.y0 = y0; out.w = w; out.h = h
  const N = w * h
  out.cover.fill(0, 0, N); out.part.fill(0, 0, N); out.v.fill(Infinity, 0, N)
  const tailExt = b.tail ? (TAIL_S1 - 1) * (n - 1) : 0
  for (let i = 0; i < n - 1; i++) {
    const ax = out.px[i], ay = out.py[i], dx = out.px[i + 1] - ax, dy = out.py[i + 1] - ay
    const l = Math.sqrt(dx * dx + dy * dy)
    if (!(l > 1e-6)) continue
    const ux = dx / l, uy = dy / l, last = i === n - 2
    const tMax = last ? 1 + tailExt : 1, ex = ax + dx * tMax, ey = ay + dy * tMax
    const sMid = (i + .5) / (n - 1), R = Math.max(widthAt(b, i / (n - 1)), widthAt(b, (i + 1) / (n - 1)), widthAt(b, sMid)) + (last ? 7 : 1.5)
    const cx0 = Math.max(x0, Math.floor(Math.min(ax, ex) - R)), cx1 = Math.min(x0 + w - 1, Math.ceil(Math.max(ax, ex) + R))
    const cy0 = Math.max(y0, Math.floor(Math.min(ay, ey) - R)), cy1 = Math.min(y0 + h - 1, Math.ceil(Math.max(ay, ey) + R))
    for (let y = cy0; y <= cy1; y++) for (let x = cx0; x <= cx1; x++) {
      const qx = x - ax, qy = y - ay
      let t = (qx * ux + qy * uy) / l
      if (t < 0) t = 0; else if (t > tMax) t = tMax
      const rx = qx - ux * l * t, ry = qy - uy * l * t, d2 = rx * rx + ry * ry
      const j = (y - y0) * w + (x - x0), cur = out.v[j]
      if (d2 >= cur * cur) continue
      const d = Math.sqrt(d2)
      // + = left of the swim direction (the swim direction is −u)
      const side = ux * qy - uy * qx > 0 ? -1 : 1
      out.v[j] = side * d; out.s[j] = (i + t) / (n - 1); out.nx[j] = uy; out.ny[j] = -ux
    }
  }
  for (let j = 0; j < N; j++) {
    const v = out.v[j]
    if (v === Infinity) continue
    const s = out.s[j], av = v < 0 ? -v : v
    if (s <= 1 && (av <= hw * profileAt(s) || (bulge > 0 && s < .25 && av <= hw * profileAt(s) + bulge * (1 - s / .25)))) { out.cover[j] = 1; out.part[j] = PART_BODY }
    else if (b.tail && inTail(s, av)) { out.cover[j] = 1; out.part[j] = PART_TAIL }
  }
  if (!b.fins) return
  const flap = FLAP * beat * dsin(phase), fc = dcos(flap), fs = dsin(flap)
  for (const f of FINS) {
    spineAt(out, n, f.s, sp)
    const a = f.a * L, bb = f.b * L, B = widthAt(b, f.s)
    for (let side = 1; side >= -1; side -= 2) {
      // left normal of the swim direction = (ty, −tx) for the tail-ward tangent (tx, ty)
      const nx = sp[3] * side, ny = -sp[2] * side
      const cx = sp[0] + nx * (B + .45 * bb), cy = sp[1] + ny * (B + .45 * bb)
      // fin axis: the tail-ward tangent turned 35° toward this side, plus the flap
      let axx = sp[2] * SWEEP_C + nx * SWEEP_S, axy = sp[3] * SWEEP_C + ny * SWEEP_S
      const fx = axx * fc - axy * fs * side, fy = axx * fs * side + axy * fc
      axx = fx; axy = fy
      const r = Math.ceil(a) + 1
      for (let y = Math.max(y0, Math.floor(cy - r)); y <= Math.min(y0 + h - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(x0, Math.floor(cx - r)); x <= Math.min(x0 + w - 1, Math.ceil(cx + r)); x++) {
          const j = (y - y0) * w + (x - x0)
          if (out.part[j] === PART_BODY) continue
          const qx = x - cx, qy = y - cy, pa = (qx * axx + qy * axy) / a, pb = (qx * -axy + qy * axx) / bb
          if (pa * pa + pb * pb > 1) continue
          out.cover[j] = 1; out.part[j] = PART_FIN; out.s[j] = f.s; out.v[j] = side * (B + .45 * bb)
          out.nx[j] = nx * side; out.ny[j] = ny * side
        }
    }
  }
}

// ── markings ────────────────────────────────────────────────────────────────────────────────────────
export type KoiKind = 'kohaku' | 'sanke' | 'showa' | 'tancho'
export const MARK_WHITE = 0, MARK_RED = 1, MARK_SUMI = 2
export const PATTERN_S = 64, PATTERN_V = 16
/** fbm2 calls made by pattern bakes (the checks: frames never call it). */
export const patternStats = { fbmCalls: 0 }
const fbm = (x: number, y: number, o: number, seed: number) => { patternStats.fbmCalls++; return fbm2(x, y, o, seed) }
const patterns = new Map<string, Uint8Array>()
/** Kohaku red (s ∈ [.06, .84], fbm2 > 0) and sumi (s > .25, fbm2 > th): plain functions, not per-cell closures. */
const redAt = (s: number, vn: number, seed: number) => s >= .06 && s <= .84 && fbm(3.2 * s, 1.4 * vn + 11, 4, seed) > 0
const sumiAt = (s: number, vn: number, seed: number, th: number) => s > .25 && fbm(7 * s, 3 * vn, 3, seed + 9) > th
/**
 * The koi's marking LUT, baked once at spawn: 64 (s ∈ [0, 1)) × 16 (vn ∈ [−1, 1]) bytes, row-major in s,
 * 0 white, 1 red, 2 sumi. Pure in (kind, seed); memoised on that key. Render-only, so it is not world state.
 */
export function koiPattern(kind: KoiKind, seed: number): Uint8Array {
  const key = `${kind}|${seed}`, hit = patterns.get(key)
  if (hit) return hit
  const lut = new Uint8Array(PATTERN_S * PATTERN_V)
  for (let i = 0; i < PATTERN_S; i++) for (let j = 0; j < PATTERN_V; j++) {
    const s = (i + .5) / PATTERN_S, vn = -1 + (2 * (j + .5)) / PATTERN_V
    let m = MARK_WHITE
    if (kind === 'kohaku') m = redAt(s, vn, seed) ? MARK_RED : MARK_WHITE
    else if (kind === 'sanke') m = sumiAt(s, vn, seed, .45) ? MARK_SUMI : redAt(s, vn, seed) ? MARK_RED : MARK_WHITE
    else if (kind === 'showa') m = sumiAt(s, vn, seed, .1) ? MARK_SUMI : redAt(s, vn, seed) ? MARK_RED : MARK_WHITE
    else { const a = (s - .13) / .085, c = vn / .7; m = a * a + c * c < 1 ? MARK_RED : MARK_WHITE }
    lut[i * PATTERN_V + j] = m
  }
  patterns.set(key, lut)
  return lut
}
/** Nearest-cell read of the LUT (no interpolation: marking edges stay crisp at tile resolution). */
export function markingAt(lut: Uint8Array, s: number, vn: number): 0 | 1 | 2 {
  const i = Math.min(PATTERN_S - 1, Math.max(0, Math.floor(s * PATTERN_S)))
  const j = Math.min(PATTERN_V - 1, Math.max(0, Math.floor((vn + 1) * .5 * PATTERN_V)))
  return lut[i * PATTERN_V + j] as 0 | 1 | 2
}
