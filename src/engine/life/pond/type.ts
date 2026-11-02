/**
 * The TYPE look (L3.4): the koi scene in 5×7 font glyphs on 6×8 tiles. `drawKoiPond` (`draw.ts`) hands a raster on
 * this grid here; water, bank and shore are baked once per grid.
 */
import { dcos, dsin, fbm2, ihash, noise2, TAU, voronoi2 } from '../../noise'
import { rippleGrad } from '../ripple'
import { bodyRaster, markingAt, MARK_RED, MARK_SUMI, PART_BODY, profileAt } from '../body'
import { nightness, nightTile } from '../sky'
import {
  clearTiles, edgeOfGradient, edgeOfTangent, flickerOn, FONT57, glyphOf, matchTile, putGlyph,
  T_ACTIVE, T_FAINT, T_IDLE, T_MID, T_VALUE, type TileGrid, type TileRaster,
} from '../glyphTiles'
import { GULP_SHOW, K_BEAT, K_GULP, K_PHASE, K_Z, KOI_LIGHT, KS, PEL_EATEN, PEL_FALLING, PEL_FLOATING, PEL_SINKING, type KoiPond } from './layout'
import { pelletViews } from './views'
import { body, grad, moonColumn, sgrad, stepDown, surfaceLine, tileOrder, WL, type KoiDrawOpts } from './paint'

/** The TYPE look's tile grid: 24 × 16 tiles of 6 × 8 card cells (a 5×7 glyph + gutter) from card row 12. */
export const KOI_TYPE_TILES: TileGrid = { cols: 24, rows: 16, pitch: 6, pitchY: 8, ox: 0, oy: 12 }
interface TypeBake { water: Uint8Array; bank: Int16Array; shore: Int16Array; rx: Float32Array; ry: Float32Array }
const typeBakes = new WeakMap<KoiPond, Map<string, TypeBake>>()
/** Font glyphs by density, for stones and koi interiors (FONT57 has no ramp order of its own that reads as density). */
const TYPE_RAMP = ['.', ':', '+', '*', '%', '#'].map(c => glyphOf(FONT57, c))
const TYPE_BODY = ['*', '#', '●'].map(c => glyphOf(FONT57, c))
const F_TILDE = glyphOf(FONT57, '~'), F_COLON = glyphOf(FONT57, ':'), F_DOT = glyphOf(FONT57, '.'), F_O = glyphOf(FONT57, 'o')
const F_STAR = glyphOf(FONT57, '*'), F_PLUS = glyphOf(FONT57, '+'), F_DASH = glyphOf(FONT57, '-'), F_RING = glyphOf(FONT57, '○')
/** Card-cell centre of a TYPE tile's glyph (5 × 7 from the tile's corner). */
const glyphCx = (g: TileGrid, tx: number) => g.ox + tx * g.pitch + 2, glyphCy = (g: TileGrid, ty: number) => g.oy + ty * (g.pitchY ?? g.pitch) + 3
/** Water, bank and shore of the scene on another tile grid, baked once per grid; plus each tile's ripple coordinates. */
function typeBake(p: KoiPond, g: TileGrid): TypeBake {
  let m = typeBakes.get(p)
  if (!m) typeBakes.set(p, (m = new Map()))
  const key = `${g.cols}x${g.rows}/${g.pitch}x${g.pitchY}@${g.ox},${g.oy}`
  const hit = m.get(key)
  if (hit) return hit
  const n = g.cols * g.rows, kt = p.spec.tiles, sdf = p.spec.sdf, seed = p.spec.seed
  const b: TypeBake = { water: new Uint8Array(n), bank: new Int16Array(n).fill(-1), shore: new Int16Array(n).fill(-1), rx: new Float32Array(n), ry: new Float32Array(n) }
  for (let ty = 0; ty < g.rows; ty++) for (let tx = 0; tx < g.cols; tx++) {
    const i = ty * g.cols + tx, x = glyphCx(g, tx), y = glyphCy(g, ty), d = sdf(x, y)
    b.rx[i] = (x - kt.ox - 1.5) / kt.pitch; b.ry[i] = (y - kt.oy - 1.5) / kt.pitch
    if (d < 0) {
      b.water[i] = 1
      if (d > -4.5) b.shore[i] = edgeOfGradient(FONT57, sdf(x + 1, y) - sdf(x - 1, y), sdf(x, y + 1) - sdf(x, y - 1)).index
      continue
    }
    const vo = voronoi2(x / 9, y / 9, seed, 'l2')
    if (vo.f2 - vo.f1 < .1) continue
    const lv = .3 * (fbm2(x / 9, y / 9, 3, seed) * .5 + .5) + .6 * (1 - Math.min(1, vo.f1 * 1.4))
    b.bank[i] = TYPE_RAMP[Math.max(0, Math.min(TYPE_RAMP.length - 1, Math.floor(lv * TYPE_RAMP.length)))].index
  }
  m.set(key, b)
  return b
}
const tsub = new Float32Array(16)
/**
 * The TYPE look (L3.4): the same world drawn in 5×7 font glyphs on 6×8 tiles. Water slopes are font line glyphs,
 * crests `~`, calm water `.` twinkles; the bank is font density glyphs; koi interiors are density glyphs by shade
 * (`= * % #`), edges and fins the best-matching font glyph; red markings stay the one accent. No lattice dots: on a
 * font grid every mark is a glyph.
 */
export function drawKoiType(p: KoiPond, s: Float32Array, t: number, hour: number, r: TileRaster, opts: KoiDrawOpts) {
  const g = r.grid, { cols, rows } = g, py = g.pitchY ?? g.pitch, K = p.spec.koi.length, nl = nightness(hour), bk = typeBake(p, g)
  const kl = opts.light ?? KOI_LIGHT
  clearTiles(r)
  for (let i = 0; i < cols * rows; i++) if (bk.bank[i] >= 0) putGlyph(r, i % cols, (i / cols) | 0, FONT57.glyphs[bk.bank[i]], T_FAINT, .6)
  const F = p.layout.FOAM, { fw, fh } = p.layout
  for (let ty = 0; ty < rows; ty++) for (let tx = 0; tx < cols; tx++) {
    const i = ty * cols + tx
    if (!bk.water[i]) continue
    const night = nightTile(tx, ty, nl)
    if (bk.shore[i] >= 0) { putGlyph(r, tx, ty, FONT57.glyphs[bk.shore[i]], night ? T_FAINT : T_MID, .8); continue }
    rippleGrad(p.ripple, s, bk.rx[i], bk.ry[i], grad)
    const gx = grad[1], gy = grad[2], gl = Math.sqrt(gx * gx + gy * gy)
    const fx = Math.max(0, Math.min(fw - 1, Math.round(bk.rx[i] / 2))), fy = Math.max(0, Math.min(fh - 1, Math.round(bk.ry[i] / 2))), foam = s[F + fy * fw + fx]
    if (gx * WL[0] + gy * WL[1] > .12) { putGlyph(r, tx, ty, F_TILDE, T_VALUE, 1); continue }
    if (gl >= .18) putGlyph(r, tx, ty, edgeOfGradient(FONT57, gx, gy), night ? T_MID : T_IDLE, .8)
    else if (gl >= .08) putGlyph(r, tx, ty, edgeOfGradient(FONT57, gx, gy), night ? T_FAINT : T_MID, .8)
    else if (gl >= .025) putGlyph(r, tx, ty, edgeOfGradient(FONT57, gx, gy), T_FAINT, .6)
    else if (foam > .2) putGlyph(r, tx, ty, F_COLON, T_FAINT, .6)
    else if (surfaceLine(p.spec.seed, bk.rx[i], bk.ry[i], t * (p.spec.wind ?? 1))) putGlyph(r, tx, ty, edgeOfGradient(FONT57, sgrad[0], sgrad[1]), T_FAINT, .6)
    else if (foam > .08 || flickerOn(tx, ty, t, night ? .07 : .035, .2)) putGlyph(r, tx, ty, F_DOT, T_FAINT, .6)
  }
  if (nl > 0) moonColumn(p, s, t, hour, nl, r, F_DASH, bk.water, bk.shore, (tx, ty) => { const i = ty * cols + Math.max(0, Math.min(cols - 1, tx)); return [bk.rx[i], bk.ry[i]] })
  // koi, deepest first: splat the body, then per font tile its cover, mean (s, v/B), shade and part
  tileOrder.length = 0
  for (let k = 0; k < K; k++) tileOrder.push(k)
  const zOf = (k: number) => s[p.layout.KOI + KS * k + K_Z]
  tileOrder.sort((a, b) => zOf(b) - zOf(a) || a - b)
  for (const k of tileOrder) {
    const o = p.layout.KOI + KS * k, b = p.bodies[k], z = zOf(k), deep = z > .6, dz = z > .45 ? 1 : 0, lut = p.markings[k]
    bodyRaster(b, p.chains[k], s, s[o + K_PHASE], s[o + K_BEAT], body, s[o + K_GULP] > GULP_SHOW ? 1 : 0)
    if (!body.w) continue
    const hw = (b.halfWidth ?? .11) * b.length
    const tx0 = Math.max(0, Math.floor((body.x0 - g.ox) / g.pitch)), tx1 = Math.min(cols - 1, Math.floor((body.x0 + body.w - 1 - g.ox) / g.pitch))
    const ty0 = Math.max(0, Math.floor((body.y0 - g.oy) / py)), ty1 = Math.min(rows - 1, Math.floor((body.y0 + body.h - 1 - g.oy) / py))
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      let cov = 0, ss = 0, vv = 0, sh = 0, nb = 0, nf = 0
      tsub.fill(0)
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) {
        const bx = g.ox + tx * g.pitch + x - body.x0, by = g.oy + ty * py + y - body.y0
        if (bx < 0 || by < 0 || bx >= body.w || by >= body.h) continue
        const bi = by * body.w + bx, c = body.cover[bi]
        if (!(c > 0)) continue
        cov += c
        const sv = body.s[bi], B = hw * profileAt(Math.min(.999, sv))
        let vn = B > 1e-6 ? body.v[bi] / B : 0
        if (vn > 1) vn = 1; else if (vn < -1) vn = -1
        const nz = Math.sqrt(1 - vn * vn), dot = vn * (body.nx[bi] * kl[0] + body.ny[bi] * kl[1]) + nz * kl[2]
        ss += sv; vv += vn; sh += .35 + .65 * (dot > 0 ? dot : 0)
        if (body.part[bi] === PART_BODY) nb++; else nf++
      }
      const cover = cov / 35
      if (cover < .15) continue
      // the matcher's 16 samples, at the alphabet's own descriptor points
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const bx = g.ox + tx * g.pitch + Math.floor(((i + .5) * 5) / 4) - body.x0, by = g.oy + ty * py + Math.floor(((j + .5) * 7) / 4) - body.y0
        tsub[j * 4 + i] = bx >= 0 && by >= 0 && bx < body.w && by < body.h ? body.cover[by * body.w + bx] : 0
      }
      const m = nb + nf, fin = nf > nb, mark = fin ? 0 : markingAt(lut, ss / m, vv / m), red = mark === MARK_RED, sumi = mark === MARK_SUMI
      const dark = nl > 0 && nightTile(tx, ty, nl) ? 1 : 0
      const tone = red ? T_ACTIVE : sumi ? T_MID : (deep ? T_IDLE : T_VALUE) - dark
      if (cover < .55 || fin) { putGlyph(r, tx, ty, matchTile(FONT57, tsub), tone, stepDown(.8, dz)); continue }
      const shade = sh / m, gi = Math.max(0, Math.min(TYPE_BODY.length - 1, Math.floor(shade * TYPE_BODY.length)))
      putGlyph(r, tx, ty, TYPE_BODY[gi], tone, stepDown(shade >= .75 ? 1 : shade >= .5 ? .8 : .6, dz + (red && deep ? 1 : 0)) || .6)
    }
  }
  // pellets
  for (const pv of pelletViews(p, s)) {
    const tx = Math.floor((pv.x - g.ox) / g.pitch), ty = Math.floor((pv.y - g.oy) / py)
    if (pv.state === PEL_FLOATING) putGlyph(r, tx, ty, F_O, T_VALUE, 1)
    else if (pv.state === PEL_FALLING) putGlyph(r, tx, ty, F_DOT, T_VALUE, .8)
    else if (pv.state === PEL_SINKING) putGlyph(r, tx, ty, F_DOT, T_MID, .6)
    else if (pv.state === PEL_EATEN) putGlyph(r, tx, ty, pv.age < .2 ? F_STAR : F_PLUS, pv.age < .2 ? T_VALUE : T_MID, .8)
  }
  // lily pads, over the koi: a ring of font line glyphs around `%`, the notch left open
  const pads = p.spec.pads ?? []
  for (let i = 0; i < pads.length; i++) {
    const [bx, by, pr] = pads[i], seed = p.spec.seed
    const wt = .03 * t * (p.spec.wind ?? 1)
    let cx = bx + 6 * noise2(wt, i, seed), cy = by + 6 * noise2(wt, i + 9, seed)
    if (opts.tilt) { cx += 3 * opts.tilt[0]; cy += 3 * opts.tilt[1] }
    const na = TAU * (ihash(seed, i, 41) / 4294967296), nx = dcos(na), ny = dsin(na)
    for (let ty = Math.floor((cy - pr - g.oy) / py); ty <= Math.ceil((cy + pr - g.oy) / py); ty++) for (let tx = Math.floor((cx - pr - g.ox) / g.pitch); tx <= Math.ceil((cx + pr - g.ox) / g.pitch); tx++) {
      if (tx < 0 || ty < 0 || tx >= cols || ty >= rows || !bk.water[ty * cols + tx]) continue
      const qx = glyphCx(g, tx) - cx, qy = glyphCy(g, ty) - cy, d = Math.sqrt(qx * qx + qy * qy)
      if (d > pr + 1) continue
      if (d > 1 && (qx * nx + qy * ny) / d > .9396926) continue
      if (d > pr - 3.5) putGlyph(r, tx, ty, edgeOfTangent(FONT57, -qy, qx), T_IDLE, .8)
      else putGlyph(r, tx, ty, F_RING, T_MID, .8)
    }
  }
}
