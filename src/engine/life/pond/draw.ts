/**
 * Drawing the koi scene into a glyph-tile raster (docs/living-matter/L-pond.md §L1): bank stones, water glyphs, foam,
 * shadows, koi bodies (style B lattice dots or style A micro-glyphs), pellets and lily pads. A raster on another
 * tile grid goes to the TYPE look (`type.ts`). Render-only: nothing here writes the state.
 */
import { dcos, dsin, ihash, noise2, TAU } from '../../noise'
import { rippleGrad } from '../ripple'
import { bodyRaster, markingAt, MARK_RED, MARK_SUMI, PART_BODY, profileAt } from '../body'
import { nightness, nightTile } from '../sky'
import {
  clearTiles, EDGE3, edgeOfGradient, edgeOfTangent, flickerOn, glyphOf, matchTile, putBig, putGlyph, RAMP3, rampGlyph, SHAPE3,
  T_ACTIVE, T_FAINT, T_IDLE, T_MID, T_VALUE, type TileRaster,
} from '../glyphTiles'
import { GULP_SHOW, K_BEAT, K_GULP, K_HX, K_HY, K_PHASE, K_Z, KOI_LIGHT, KS, PEL_EATEN, PEL_FALLING, PEL_FLOATING, PEL_SINKING, type KoiPond } from './layout'
import { pelletViews } from './views'
import { body, grad, moonColumn, sgrad, stepDown, surfaceLine, tileOrder, WL, type KoiDrawOpts } from './paint'
import { drawKoiType } from './type'

const sub16 = new Float32Array(16)
/** Per-koi tile list, filled before drawing (shadows first, then bodies). */
interface KoiTiles { n: number; ti: Int32Array; cover: Float32Array; s: Float32Array; vn: Float32Array; shade: Float32Array; part: Uint8Array; sub: Float32Array }
const koiTiles: KoiTiles[] = []
const tilesFor = (k: number): KoiTiles => (koiTiles[k] ??= { n: 0, ti: new Int32Array(512), cover: new Float32Array(512), s: new Float32Array(512), vn: new Float32Array(512), shade: new Float32Array(512), part: new Uint8Array(512), sub: new Float32Array(512 * 16) })
/** A body tile at least this covered is an interior tile (style B: one lattice dot). The plan's .85 left a 3-tile-wide koi mostly edge glyphs. */
const INTERIOR = .6
/** The light this frame's koi are shaded by (drawKoiPond's `light`, else KOI_LIGHT). */
let kl: readonly [number, number, number] = KOI_LIGHT

/**
 * Draw the scene state at t into `r` (water, foam, shadows, koi, pellets, pads), day/night from `hour` (sky.ts:
 * night 21–05, ramps at dusk and dawn; by day nothing changes). Values sit on quantize steps (.6, .8, 1); the only
 * accent is the red marking of a koi (`active`, never activeDim). A raster on another tile grid than the scene's
 * (L3.4's TYPE grid, `KOI_TYPE_TILES`) is drawn in 5×7 font glyphs by `drawKoiType`.
 */
export function drawKoiPond(p: KoiPond, s: Float32Array, t: number, hour: number, r: TileRaster, opts: KoiDrawOpts = {}): void {
  const { tiles } = p.spec, { cols, rows, pitch, ox, oy } = tiles, K = p.spec.koi.length, nl = nightness(hour)
  if (r.grid.pitchY !== undefined || r.grid.cols !== cols || r.grid.rows !== rows || r.grid.pitch !== pitch) { drawKoiType(p, s, t, hour, r, opts); return }
  kl = opts.light ?? KOI_LIGHT
  clearTiles(r)
  // bank
  for (let i = 0; i < cols * rows; i++) if (p.bank[i] >= 0) putGlyph(r, i % cols, (i / cols) | 0, RAMP3.glyphs[p.bank[i]], T_FAINT, .6)
  // water
  const F = p.layout.FOAM, { fw } = p.layout
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const i = ty * cols + tx
    if (!p.water[i]) continue
    const night = nightTile(tx, ty, nl)
    if (p.shore[i] >= 0) { putGlyph(r, tx, ty, EDGE3.glyphs[p.shore[i]], night ? T_FAINT : T_MID, .8); continue }
    rippleGrad(p.ripple, s, tx, ty, grad)
    const gx = grad[1], gy = grad[2], gl = Math.sqrt(gx * gx + gy * gy)
    const foam = s[F + (ty >> 1) * fw + (tx >> 1)]
    if (gx * WL[0] + gy * WL[1] > .12) { putGlyph(r, tx, ty, EQ, T_VALUE, 1); continue }
    if (gl >= .18) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, gx, gy), night ? T_MID : T_IDLE, .8)
    else if (gl >= .08) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, gx, gy), night ? T_FAINT : T_MID, .8)
    else if (gl >= .025) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, gx, gy), T_FAINT, .6)
    else if (foam > .2) putGlyph(r, tx, ty, COLON, T_FAINT, .6)
    else if (surfaceLine(p.spec.seed, tx, ty, t * (p.spec.wind ?? 1))) putGlyph(r, tx, ty, edgeOfGradient(EDGE3, sgrad[0], sgrad[1]), T_FAINT, .6)
    else if (foam > .08 || flickerOn(tx, ty, t, night ? .07 : .035, .2)) putGlyph(r, tx, ty, DOT, T_FAINT, .6)
  }
  if (nl > 0) moonColumn(p, s, t, hour, nl, r, DASH)
  // koi tile lists (deepest first)
  tileOrder.length = 0
  for (let k = 0; k < K; k++) tileOrder.push(k)
  const zOf = (k: number) => s[p.layout.KOI + KS * k + K_Z]
  tileOrder.sort((a, b) => zOf(b) - zOf(a) || a - b)
  for (const k of tileOrder) collectTiles(p, s, k, tilesFor(k))
  // shadows
  for (const k of tileOrder) {
    const z = zOf(k), T = tilesFor(k), dx = Math.round((1 + 3 * z) / 4), dy = Math.round((1.5 + 3 * z) / 4)
    for (let q = 0; q < T.n; q++) {
      if (T.cover[q] < .5) continue
      const tx = (T.ti[q] % cols) + dx, ty = ((T.ti[q] / cols) | 0) + dy
      if (tx < cols && ty < rows && p.water[ty * cols + tx]) putGlyph(r, tx, ty, COLON, T_FAINT, .6)
    }
  }
  // bodies
  for (const k of tileOrder) drawKoi(p, s, k, tilesFor(k), t, r, nl)
  // pellets
  for (const pv of pelletViews(p, s)) {
    const tx = Math.floor((pv.x - ox) / pitch), ty = Math.floor((pv.y - oy) / pitch)
    if (pv.state === PEL_FLOATING) putGlyph(r, tx, ty, O, T_VALUE, 1)
    else if (pv.state === PEL_FALLING) putGlyph(r, tx, ty - 1, DOT, T_VALUE, .8)
    else if (pv.state === PEL_SINKING) putGlyph(r, tx, ty, DOT, T_MID, .6)
    else if (pv.state === PEL_EATEN) putGlyph(r, tx, ty, pv.age < .13 ? STAR : pv.age < .27 ? PLUS : DOT, pv.age < .2 ? T_VALUE : T_MID, .8)
  }
  // lily pads, over the koi
  const pads = p.spec.pads ?? []
  for (let i = 0; i < pads.length; i++) {
    const [bx, by, pr] = pads[i], seed = p.spec.seed
    const wt = .03 * t * (p.spec.wind ?? 1)
    let cx = bx + 6 * noise2(wt, i, seed), cy = by + 6 * noise2(wt, i + 9, seed)
    if (opts.tilt) { cx += 3 * opts.tilt[0]; cy += 3 * opts.tilt[1] }
    const na = TAU * (ihash(seed, i, 41) / 4294967296), nx = dcos(na), ny = dsin(na)
    const t0x = Math.floor((cx - pr - ox) / pitch), t1x = Math.ceil((cx + pr - ox) / pitch), t0y = Math.floor((cy - pr - oy) / pitch), t1y = Math.ceil((cy + pr - oy) / pitch)
    for (let ty = t0y; ty <= t1y; ty++) for (let tx = t0x; tx <= t1x; tx++) {
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || !p.water[ty * cols + tx]) continue
      const qx = ox + tx * pitch + 1.5 - cx, qy = oy + ty * pitch + 1.5 - cy, d = Math.sqrt(qx * qx + qy * qy)
      if (d > pr) continue
      // the notch: a 40° wedge from the centre
      if (d > 1 && (qx * nx + qy * ny) / d > .9396926) continue
      if (d > pr - 3.2) putGlyph(r, tx, ty, edgeOfTangent(EDGE3, -qy, qx), T_IDLE, .8)
      else putGlyph(r, tx, ty, rampGlyph(RAMP3, .7), T_MID, .8)
    }
  }
}
const EQ = glyphOf(EDGE3, '='), COLON = glyphOf(EDGE3, ':'), DOT = glyphOf(EDGE3, '·'), O = glyphOf(EDGE3, 'o'), STAR = glyphOf(EDGE3, '*'), PLUS = glyphOf(EDGE3, '+'), DASH = glyphOf(EDGE3, '-')

/** Splat koi k and reduce it to tiles: cover, mean (s, vn), shade and dominant part per tile. */
function collectTiles(p: KoiPond, s: Float32Array, k: number, T: KoiTiles) {
  const { cols, rows, pitch, ox, oy } = p.spec.tiles, o = p.layout.KOI + KS * k, b = p.bodies[k]
  bodyRaster(b, p.chains[k], s, s[o + K_PHASE], s[o + K_BEAT], body, s[o + K_GULP] > GULP_SHOW ? 1 : 0)
  T.n = 0
  if (!body.w) return
  const hw = (b.halfWidth ?? .11) * b.length
  const tx0 = Math.max(0, Math.floor((body.x0 - ox) / pitch)), tx1 = Math.min(cols - 1, Math.floor((body.x0 + body.w - 1 - ox) / pitch))
  const ty0 = Math.max(0, Math.floor((body.y0 - oy) / pitch)), ty1 = Math.min(rows - 1, Math.floor((body.y0 + body.h - 1 - oy) / pitch))
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    let cov = 0, ss = 0, vv = 0, sh = 0, nb = 0, nf = 0
    const q = T.n
    if (q >= T.ti.length) return
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const cx = ox + tx * pitch + i, cy = oy + ty * pitch + j, bx = cx - body.x0, by = cy - body.y0
      let c = 0
      if (bx >= 0 && by >= 0 && bx < body.w && by < body.h) {
        const bi = by * body.w + bx
        c = body.cover[bi]
        if (c > 0) {
          const sv = body.s[bi], B = hw * profileAt(Math.min(.999, sv))
          let vn = B > 1e-6 ? body.v[bi] / B : 0
          if (vn > 1) vn = 1; else if (vn < -1) vn = -1
          const nz = Math.sqrt(1 - vn * vn), dot = vn * (body.nx[bi] * kl[0] + body.ny[bi] * kl[1]) + nz * kl[2]
          ss += sv; vv += vn; sh += .35 + .65 * (dot > 0 ? dot : 0)
          if (body.part[bi] === PART_BODY) nb++; else nf++
        }
      }
      T.sub[q * 16 + j * 4 + i] = c; cov += c
    }
    if (cov < .5) continue
    const m = nb + nf
    T.ti[q] = ty * cols + tx; T.cover[q] = cov / 16; T.s[q] = ss / m; T.vn[q] = vv / m; T.shade[q] = sh / m
    T.part[q] = nb >= nf ? PART_BODY : 2
    T.n++
  }
}

function drawKoi(p: KoiPond, s: Float32Array, k: number, T: KoiTiles, t: number, r: TileRaster, nl: number) {
  const { cols } = p.spec.tiles, o = p.layout.KOI + KS * k, z = s[o + K_Z], lut = p.markings[k], lattice = p.bodyStyle === 'lattice'
  const deep = z > .6, dz = z > .45 ? 1 : 0
  for (let q = 0; q < T.n; q++) {
    const cover = T.cover[q], tx = T.ti[q] % cols, ty = (T.ti[q] / cols) | 0
    if (cover < .2) continue
    const fin = T.part[q] !== PART_BODY, mark = fin ? 0 : markingAt(lut, T.s[q], T.vn[q])
    const red = mark === MARK_RED, sumi = mark === MARK_SUMI
    // at night the whites come down a tone (value → idle, idle → mid); red stays red
    const dark = nl > 0 && nightTile(tx, ty, nl) ? 1 : 0
    let bright = red ? T_ACTIVE : sumi ? T_MID : (deep ? T_IDLE : T_VALUE) - dark
    const flick = flickerOn(tx, ty, t, .03, .25, k * .37) ? 1 : 0
    if (cover < INTERIOR) {
      for (let i = 0; i < 16; i++) sub16[i] = T.sub[q * 16 + i]
      putGlyph(r, tx, ty, matchTile(SHAPE3, sub16), bright, stepDown(.8, dz))
      continue
    }
    if (fin) { putGlyph(r, tx, ty, rampGlyph(RAMP3, .5), (deep ? T_IDLE : T_VALUE) - dark, stepDown(.8, dz)); continue }
    const shade = T.shade[q]
    if (lattice) {
      // style B: one lattice-4 dot per interior tile; shading is dot size (red stays one colour)
      let v = shade >= .75 ? 1 : shade >= .5 ? .8 : .6
      v = stepDown(v, flick + dz + (red && deep ? 1 : 0))
      if (v > 0) putBig(r, tx, ty, bright, v)
      continue
    }
    // style A: a full micro-glyph tile, the darker glyph by size contrast
    const g = rampGlyph(RAMP3, Math.min(1, .2 + .6 * (1 - shade) + flick * .12))
    if (red) {
      const bg = deep ? .8 : 1
      putGlyph(r, tx, ty, g, shade < .5 || deep ? -1 : T_ACTIVE, .6, T_ACTIVE, bg)
    } else {
      if (sumi) bright = T_MID
      putGlyph(r, tx, ty, g, sumi ? T_FAINT : deep ? T_MID : T_IDLE, stepDown(1, dz), bright, stepDown(.8, dz))
    }
  }
  // eyes (s = .06, vn = ±.55) and barbels
  const c = p.chains[k], b = p.bodies[k], { pitch, ox, oy } = p.spec.tiles
  const hx = s[o + K_HX], hy = s[o + K_HY], nx = hy, ny = -hx
  const ex = s[c.X] - hx * .06 * b.length, ey = s[c.Y] - hy * .06 * b.length, ev = .55 * (b.halfWidth ?? .11) * b.length * profileAt(.06)
  for (let side = 1; side >= -1; side -= 2) {
    const tx = Math.floor((ex + nx * ev * side - ox) / pitch), ty = Math.floor((ey + ny * ev * side - oy) / pitch)
    putGlyph(r, tx, ty, DOT, T_FAINT, .6)
    // barbel: a short stroke off the snout, swept back
    const bxv = hx * .7 + nx * side * .7, byv = hy * .7 + ny * side * .7
    const bx = s[c.X] + hx * 2 + nx * side * 3, by = s[c.Y] + hy * 2 + ny * side * 3
    const btx = Math.floor((bx - ox) / pitch), bty = Math.floor((by - oy) / pitch)
    if (btx >= 0 && bty >= 0 && btx < cols && bty < p.spec.tiles.rows && p.water[bty * cols + btx] && r.bigTone[bty * cols + btx] < 0 && !occupied(r, btx, bty)) putGlyph(r, btx, bty, edgeOfTangent(EDGE3, bxv, byv), T_MID, .8)
  }
}
/** Does the tile hold a koi pixel (a bright body tone) already? Barbels never draw over a body. */
function occupied(r: TileRaster, tx: number, ty: number): boolean {
  const { pitch, ox, oy } = r.grid
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const t = r.tone[(oy + ty * pitch + j) * r.cardW + ox + tx * pitch + i]; if (t === T_ACTIVE || t === T_VALUE) return true }
  return false
}
