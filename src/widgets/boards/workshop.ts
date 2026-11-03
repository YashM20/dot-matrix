/**
 * Board · WORKSHOP (M3, docs/living-matter/M-materials.md §5): nine more materials on the materials board's shell
 * (`materials-shared.ts`: the card tile, `matLight`, lazy bakes). The pure cards are here: denim, wood and leather.
 * The cards with a tap that needs time (knit, paper, ice) are in `workshop-live.ts`; the three physics worlds (sand,
 * mercury, thread) in `workshop-physics.ts`. Both keep their worlds on the main thread: the sampling worker's build
 * resolves them to stubs (vite.config.ts `mainThreadOnly`).
 *
 * Rules (M §1), as on the materials board: material from relief and one light, never hue; one red, on a live part
 * only (the working loop, the colon, the fresh frost, the rake head, the bead, the needle eye), and denim, paper and
 * leather have none; bakes on the first frame, never at import; per frame the light, the sims and lookups only,
 * the lit surfaces cached per light (LRU of 8, M3.10) so the sun and the tilt hub's buckets hit across frames.
 */
import { ambientOcclusion, cardMask, insetDistance, stitch, tangentSDF, tonedLayer, twill, weaveRelief, type TangentRaster } from '../../engine/matter'
import { woodRings } from '../../engine/matter/wood'
import { leatherCells } from '../../engine/matter/leather'
import { anisoSpec } from '../../engine/matter/aniso'
import { heightRaster, normalRaster, stackHeights, type HeightRaster, type NormalRaster } from '../../engine/light/height'
import { illuminate, lambert, type Light, type Vec3 } from '../../engine/light/shade'
import { sdfBox } from '../../engine/light/sdf'
import { fbm2 } from '../../engine/noise/gradient'
import { stbn } from '../../engine/halftone/mask'
import { createRaster, rasterWindow, type Raster } from '../../engine/raster/raster'
import type { CellBounds, Layer } from '../../engine/types'
import { lightSource } from '../../site/light'
import { TILE, layer, type WidgetPreset } from '../types'
import { cite, L15, LG15, LIGHT_DEFAULTS, lightKey, lru, matLight, mod, once, pad2, scratch, snapTorch, T, tile, toCard15, toLattice15, type Box, type Pt } from './materials-shared'
import { matKnit, matPaper, matIce, liveHooks } from './workshop-live'
import { matSand, matMercury, matThread, physicsHooks } from './workshop-physics'
import { matLichtenberg, plateHooks } from './workshop-plate'
import { matErosion, stoneHooks } from './workshop-stone'
import { matFrost, frostHooks } from './workshop-frost'
import { matKintsugi, kintsugiHooks } from './workshop-kintsugi'
import { matMud, mudHooks } from './workshop-mud'

const COLS = TILE.cols
/** Tone indices of `tonedLayer` (SURFACE_TONES): faint, mid, idle, value. */
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
/** A lit value → its matte band (MATTE_BANDS: faint < .3 ≤ mid < .62 ≤ idle), or −1 below .06 (void). */
const bandOf = (b: number) => (b < .06 ? -1 : b < .3 ? FAINT : b < .62 ? MID : IDLE)
/** The middle of each band's value range (a band moved by wear or sheen takes its new band's size). */
const BAND_MID = [.2, .46, .76, 1]
/** A lit, toned surface for one light, kept as its layer (a cache entry). */
interface Lit { values: Raster; tones: Uint8Array; layer: Layer }
const litSurface = (grid = TILE, box?: CellBounds, k?: number): Lit => {
  const values = createRaster(grid, 'card', box), tones = new Uint8Array(grid.cols * grid.rows)
  return { values, tones, layer: tonedLayer(values, tones, k) }
}

// ── 02 DENIM ─ 3/1 twill: the warp on the face, the white weft behind it ───────────────────────────────────
// Card pitch, crossing 3 (a 2-cell thread and a 1-cell void). Warp threads take the lit bands, the weft stays faint
// (denim's white weft barely shows); five curved whiskers and a patchy fade lower the warp a band (wear, baked).
// A front pocket's opening (a 1-cell void curve) with a double topstitch in value, a copper rivet, and the selvedge
// outseam: a 2-cell white `value` line, not red (M §10.2: the red redline is an owner option and ships off).
export const DENIM = { box: [2, 12, 141, 141] as Box, crossing: 3, lift: 1, seam: 135, selvedge: [136, 137] as const, pocket: { cx: 132, cy: 12, a: 58, b: 56 }, rivet: { x: 77, y: 17, r: 3.2 } }
/** A polyline along the pocket's ellipse grown by `off` cells. */
function pocketLine(off: number): Pt[] {
  const { cx, cy, a, b } = DENIM.pocket, out: Pt[] = []
  for (let k = 0; k <= 48; k++) { const t = (k / 48) * Math.PI / 2; out.push([cx - (a + off) * Math.cos(t), cy + (b + off) * Math.sin(t)]) }
  return out.filter(([x, y]) => x >= DENIM.box[0] && x < DENIM.seam - 1 && y <= DENIM.box[3])
}
/** The five whiskers: curved strokes rising to the right from the lower left, as (x0, y0, length). */
const WHISKERS: readonly (readonly [number, number, number])[] = [[6, 92, 58], [10, 103, 66], [8, 114, 54], [16, 124, 60], [12, 134, 44]]
/**
 * fBm sampled every `step` cells over the card and read back bilinearly: a bake's smooth noise at a ninth of the
 * cost (the wear's breakup is ≥ 9 cells a noise unit, so a 3-cell grid loses nothing visible).
 */
interface NoiseGrid { G: Float64Array; gw: number; step: number }
function noiseGrid(sx: number, sy: number, seed: number, step = 3): NoiseGrid {
  const gw = Math.ceil(COLS / step) + 2, gh = Math.ceil(TILE.rows / step) + 2, G = new Float64Array(gw * gh)
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) G[j * gw + i] = fbm2(step * i / sx, step * j / sy, 3, seed)
  return { G, gw, step }
}
/** A noise grid read bilinearly at cell (c, r) (module level: a closure per grid cost ~10× in the first frame). */
function gridAt(g: NoiseGrid, c: number, r: number): number {
  const { G, gw, step } = g, fx = c / step, fy = r / step, i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, a = j * gw + i
  const top = G[a] + (G[a + 1] - G[a]) * tx, bot = G[a + gw] + (G[a + gw + 1] - G[a + gw]) * tx
  return top + (bot - top) * ty
}
/** The whiskers, stamped along each stroke (a band of ± 2.4 · taper cells round its centre line, fBm-broken). */
function whiskers(kind: Uint8Array, wear: Uint8Array, fine: NoiseGrid): void {
  for (let q = 0; q < WHISKERS.length; q++) {
    const x0 = WHISKERS[q][0], y0 = WHISKERS[q][1], len = WHISKERS[q][2]
    for (let c = Math.ceil(x0), c1 = Math.min(DENIM.seam - 1, x0 + len); c <= c1; c++) {
      const u = (c - x0) / len, y = y0 - .32 * (c - x0) + .0022 * (c - x0) * (c - x0), w = 2.4 * Math.sin(Math.PI * Math.min(1, u * 1.15))
      for (let r = Math.max(DENIM.box[1], Math.floor(y - w)), r1 = Math.min(DENIM.box[3], Math.ceil(y + w)); r <= r1; r++) {
        const i = r * COLS + c
        if (Math.abs(r - y) < w && kind[i] === 0 && gridAt(fine, c, r) > -.25) wear[i] = 1
      }
    }
  }
}
interface DenimGeo { n: NormalRaster; t: TangentRaster; warp: Raster; wear: Uint8Array; kind: Uint8Array }
/** Cell kinds over the denim: 0 cloth, 1 the pocket opening (void), 2 topstitch, 3 the seam gap (void), 4 selvedge, 5 rivet, 6 its rim gap. */
const denimGeo = once((): DenimGeo => {
  const r = weaveRelief(twill(3, 4, 1), TILE, { box: DENIM.box, crossing: DENIM.crossing, lift: DENIM.lift })
  // no AO: the weave's crevices are its void gap already (and AO was a fifth of the cold frame)
  const n = normalRaster(r.height)
  const N = COLS * TILE.rows, wear = new Uint8Array(N), kind = new Uint8Array(N), stitches = createRaster(TILE)
  for (const off of [3, 6]) {
    const st = stitch(pocketLine(off), { length: 3, gap: 1, width: 1.2 })
    for (let k = 0; k < st.count; k++) stampSeg(stitches.data, st.segs[4 * k], st.segs[4 * k + 1], st.segs[4 * k + 2], st.segs[4 * k + 3], .6)
  }
  const [x0, y0, x1, y1] = DENIM.box, { x: rx, y: ry, r: rr } = DENIM.rivet
  const fine = noiseGrid(9, 9, 23), broad = noiseGrid(38, 30, 29, 6)
  // what depends on the column alone, once a column: the pocket's u², each noise grid's column and fraction
  const U2 = new Float64Array(COLS), BK = new Int32Array(COLS), BT = new Float64Array(COLS), FK = new Int32Array(COLS), FT = new Float64Array(COLS)
  for (let c = 0; c < COLS; c++) {
    const u = (c - DENIM.pocket.cx) / DENIM.pocket.a, bx = c / broad.step, fx = c / fine.step
    U2[c] = u * u; BK[c] = Math.floor(bx); BT[c] = bx - Math.floor(bx); FK[c] = Math.floor(fx); FT[c] = fx - Math.floor(fx)
  }
  const at: DenimCols = { U2, BK, BT, FK, FT }
  for (let row = y0; row <= y1; row++) denimKindRow(kind, wear, stitches.data, row, x0, x1, rx, ry, rr, fine, broad, at)
  whiskers(kind, wear, fine)
  return { n, t: r.tangent, warp: r.warp, wear, kind }
})
/** The pocket opening's band, |ρ − 1| · min(a, b) < .6, as bounds on ρ² a little wider (a cell outside them is not on it). */
const POCKET_Q = (() => { const d = 1.01 * .6 / Math.min(DENIM.pocket.a, DENIM.pocket.b); return [(1 - d) * (1 - d), (1 + d) * (1 + d)] as const })()
/**
 * Row `row` of the kinds and the fade (the bake of the card's first frame, so in code not yet optimised: few ops a
 * cell; what only depends on the row is taken once a row). The pocket opening is where the ellipse "radius"
 * ρ = √(u² + v²) (1 on the curve) has |ρ − 1| · min(a, b) < .6, its root taken only near the curve; the rivet's
 * root only near the rivet. The faded patches: wear where the broad noise (`gridAt`, inline) is over .3 and the fine
 * one over 0 breaks it up.
 */
interface DenimCols { U2: Float64Array; BK: Int32Array; BT: Float64Array; FK: Int32Array; FT: Float64Array }
function denimKindRow(kind: Uint8Array, wear: Uint8Array, st: Float32Array, row: number, x0: number, x1: number, rx: number, ry: number, rr: number, fine: NoiseGrid, broad: NoiseGrid, at: DenimCols): void {
  const seam = DENIM.seam, s0 = DENIM.selvedge[0], s1 = DENIM.selvedge[1], { cy: pcy, a: pa, b: pb } = DENIM.pocket, pm = Math.min(pa, pb), [qlo, qhi] = POCKET_Q
  const dy = row - ry, dy2 = dy * dy, rivet = (dy < 0 ? -dy : dy) <= rr + 1, v = (row - pcy) / pb, v2 = v * v, { U2, BK, BT, FK, FT } = at
  const FG = fine.G, fw = fine.gw, ffy = row / fine.step, fj = Math.floor(ffy), fty = ffy - fj
  const BG = broad.G, bw = broad.gw, bfy = row / broad.step, bj = Math.floor(bfy), bty = bfy - bj
  for (let c = x0, i = row * COLS + c; c <= x1; c++, i++) {
    if (rivet) {
      const dx = c - rx
      if ((dx < 0 ? -dx : dx) <= rr + 1) {
        const d = Math.sqrt(dx * dx + dy2)
        if (d <= rr) { kind[i] = 5; continue }
        if (d <= rr + 1) { kind[i] = 6; continue }
      }
    }
    if (c >= s0 && c <= s1) { kind[i] = 4; continue }
    if (c === seam || c === s1 + 1) { kind[i] = 3; continue }
    if (c < seam) {
      const q = U2[c] + v2
      if (q > qlo && q < qhi && Math.abs(Math.sqrt(q) - 1) * pm < .6) { kind[i] = 1; continue }
    }
    if (st[i]) { kind[i] = 2; continue }
    if (c < seam) {
      // fadeAt: the broad grid over .3, then the fine one over 0 (gridAt, inline)
      let tx = BT[c], a = bj * bw + BK[c]
      let top = BG[a] + (BG[a + 1] - BG[a]) * tx, bot = BG[a + bw] + (BG[a + bw + 1] - BG[a + bw]) * tx
      if (!(top + (bot - top) * bty > .3)) { wear[i] = 0; continue }
      tx = FT[c]; a = fj * fw + FK[c]
      top = FG[a] + (FG[a + 1] - FG[a]) * tx; bot = FG[a + fw] + (FG[a + fw + 1] - FG[a + fw]) * tx
      wear[i] = top + (bot - top) * fty > 0 ? 1 : 0
    }
  }
}
/** Mark the cells within `h` of segment (ax, ay)–(bx, by); each cell newly marked is pushed to `hit` (when given). */
function stampSeg(D: Float32Array, ax: number, ay: number, bx: number, by: number, h: number, hit?: number[]): void {
  // (bounds taken once, not in the loop tests: first-frame code, where every call counts)
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, h2 = h * h + 1e-9
  const ya = Math.max(0, Math.floor(Math.min(ay, by) - h)), yb = Math.min(TILE.rows - 1, Math.ceil(Math.max(ay, by) + h))
  const xa = Math.max(0, Math.floor(Math.min(ax, bx) - h)), xb = Math.min(COLS - 1, Math.ceil(Math.max(ax, bx) + h))
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0, ex = ax + dx * t - x, ey = ay + dy * t - y
      if (ex * ex + ey * ey <= h2) { const i = y * COLS + x; if (hit && !D[i]) hit.push(i); D[i] = 1 }
    }
  }
}
/** A dome's light at (dx, dy) from its centre (radius r): Lambert of the sphere's normal, 0 outside. */
function domeLight(dx: number, dy: number, r: number, L: Light, x: number, y: number): [number, number] {
  const q = (dx * dx + dy * dy) / (r * r)
  if (q >= 1) return [0, 0]
  const nz = Math.sqrt(1 - q), nx = dx / r, ny = dy / r
  let lx: number, ly: number, lz: number
  if (Array.isArray(L)) [lx, ly, lz] = L as Vec3
  else { const at = (L as { at: Vec3 }).at; lx = at[0] - x; ly = at[1] - y; lz = at[2] - 2 * nz }
  const ll = Math.hypot(lx, ly, lz) || 1, ndl = (nx * lx + ny * ly + nz * lz) / ll
  // the mirror highlight: n·h with the eye straight above
  const hx = lx / ll, hy = ly / ll, hz = lz / ll + 1, hl = Math.hypot(hx, hy, hz) || 1
  return [Math.max(0, ndl), (nx * hx + ny * hy + nz * hz) / hl]
}
const denimScratch = scratch(2)
const denimLit = lru<Lit>(8)
function denimRow(g: DenimGeo, D: Float32Array, S: Float32Array, V: Float32Array, Tn: Uint8Array, L: Light, row: number): void {
  const [x0, , x1] = DENIM.box, W = g.warp.data, M = g.n.mask, K = g.kind, Wr = g.wear, { x: rx, y: ry, r: rr } = DENIM.rivet
  for (let c = x0, i = row * COLS + c; c <= x1; c++, i++) {
    const k = K[i]
    if (k === 0) {
      // cloth (most cells): bandOf inlined; a worn warp falls a band, an unworn idle warp in the sheen rises to value
      if (M[i] <= 0) continue
      const b = D[i]
      if (W[i]) {
        if (b < .06) continue
        const t0 = b < .3 ? FAINT : b < .62 ? MID : IDLE, t = Wr[i] ? (t0 > FAINT ? t0 - 1 : FAINT) : t0 === IDLE && S[i] >= .6 ? VALUE : t0
        V[i] = t === t0 ? b : BAND_MID[t]; Tn[i] = t
      } else if (b * .7 >= .22 && stbn(c, row) < .35) { V[i] = Math.min(.29, b * .7); Tn[i] = FAINT } // the white weft: a sparse glint between the warp floats
      continue
    }
    if (k === 1 || k === 3 || k === 6) continue
    if (k === 4) { V[i] = 1; Tn[i] = VALUE; continue }
    if (k === 2) { V[i] = .9; Tn[i] = VALUE; continue }
    if (k === 5) {
      // the copper rivet: a dome, Lambert bands, its mirror highlight in value
      const [d, h] = domeLight(c - rx, row - ry, rr, L, c, row)
      if (h > .97) { V[i] = 1; Tn[i] = VALUE } else { const b = .15 + .75 * d, t = bandOf(b); if (t >= 0) { V[i] = b; Tn[i] = t } }
    }
  }
}
export const matDenim: WidgetPreset = {
  ...tile, id: 'mat-denim', name: 'Denim',
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const L = snapTorch(matLight(ctx, { torch: { height: 40, falloff: 160 } }), 6)
    const lit = denimLit(lightKey(L), () => {
      const g = denimGeo(), [dif, spec] = denimScratch(), out = litSurface(TILE, DENIM.box)
      lambert(g.n, L, { ambient: .12, into: dif })
      anisoSpec(g.n, g.t, L, { exponent: 32, into: spec })
      for (let r = DENIM.box[1]; r <= DENIM.box[3]; r++) denimRow(g, dif.data, spec.data, out.values.data, out.tones, L, r)
      return out
    })
    return [cite('TWILL 3/1'), lit.layer]
  },
}

// ── 04 WOOD ─ a lacquered board; the time carved in it ─────────────────────────────────────────────────────
// A flat-sawn plank on the 1.5 lattice: growth rings fract(k·dist + warp) round a pith that dives under the face (the
// cathedral), latewood a band darker, ray flecks a step up, one knot. The lacquer's chatoyance is a Kajiya–Kay sheen
// along the rings (`tangentSDF(phase, 'along')`), so it slides across them with the light. HH MM is carved in as a
// V-groove (raking light, as on the marble); the colon is the live red.
const PLANK = { cx: 48, cy: 51, hw: 45, hh: 41, r: 3 }
const PLANK_SDF = sdfBox(LG15, PLANK.cx, PLANK.cy, PLANK.hw, PLANK.hh, PLANK.r)
export const WOOD = { k: 1 / 5.5, pith: { y: -30, x: 48, depth: 0, slope: .34 }, knots: [[74, 76, 8]] as [number, number, number][], heroRow: 74, heroK: 2 }
const woodBase = once(() => {
  const box: CellBounds = [PLANK.cx - PLANK.hw - 1, PLANK.cy - PLANK.hh - 1, PLANK.cx + PLANK.hw + 1, PLANK.cy + PLANK.hh + 1]
  const rings = woodRings(LG15, { k: WOOD.k, pith: WOOD.pith, knots: WOOD.knots, box })
  const plank = heightRaster(PLANK_SDF, { shape: 'round', width: 2, height: 1.2 }, LG15)
  // the lacquered face follows the rings a little: latewood stands .2 proud of earlywood
  // the latewood profile, once a cell (the face and every lighting read it): late(0) = 0 off the rings' box
  const face: HeightRaster = { ...createRaster(LG15, 'card', plank.bounds), mask: plank.mask }, R = rings.ring.data, lateOf = new Float64Array(R.length)
  for (let j = Math.max(0, box[1]); j <= Math.min(LG15.rows - 1, box[3]); j++) for (let i = j * LG15.cols + Math.max(0, box[0]), end = j * LG15.cols + Math.min(LG15.cols - 1, box[2]); i <= end; i++) lateOf[i] = late(R[i])
  const [p0, p1, p2, p3] = rasterWindow(plank)
  for (let j = p1; j <= p3; j++) for (let i = j * LG15.cols + p0, end = j * LG15.cols + p2; i <= end; i++) if (plank.mask[i] > 0) face.data[i] = plank.data[i] + .2 * lateOf[i]
  return { rings, face, lateOf, t: tangentSDF(rings.phase, LG15, 'along') }
})
/** Latewood profile over a ring (0 earlywood … 1 latewood, a smooth 40% band). */
const late = (f: number) => { const x = (f - .6) / .12; return x <= 0 ? 0 : x >= 1 ? (f > .94 ? Math.max(0, 1 - (f - .94) / .06) : 1) : x * x * (3 - 2 * x) }
export interface WoodCut { key: string; n: NormalRaster; ao: Raster; colon: Pt[] }
const woodCuts = lru<WoodCut>(2)
/** The plank with one minute carved in (LRU of 2): normals and AO; the colon's two dots (card cells). */
export function woodCut(hh: string, mm: string): WoodCut {
  const key = `${hh}:${mm}`
  return woodCuts(key, () => {
    const opts = { lattice: WOOD.heroK, smooth: true, align: 'center' as const }
    const full = cardMask(T.big(`${hh}:${mm}`, 72, WOOD.heroRow, opts), TILE), cut = cardMask(T.big(`${hh} ${mm}`, 72, WOOD.heroRow, opts), TILE)
    const pts: Pt[] = [], [f0, f1, f2, f3] = rasterWindow(full)
    for (let r = f1; r <= f3; r++) for (let c = f0; c <= f2; c++) if (full.data[r * COLS + c] && !cut.data[r * COLS + c]) pts.push([c, r])
    const midY = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length), cen = (q: Pt[]): Pt => [q.reduce((s, p) => s + p[0], 0) / q.length, q.reduce((s, p) => s + p[1], 0) / q.length]
    const top = pts.filter(p => p[1] < midY), bottom = pts.filter(p => p[1] >= midY), colon = top.length && bottom.length ? [cen(top), cen(bottom)] : []
    const h = stackHeights(woodBase().face, heightRaster(insetDistance(toLattice15(cut)), { shape: 'linear', width: 1.6, height: -1.8 }))
    return { key, n: normalRaster(h), ao: ambientOcclusion(h, { radius: 2, strength: .7 }), colon }
  })
}
const woodScratch = scratch(3, LG15)
const woodLit = lru<Lit>(8)
/** Row j of the lit plank (first-frame code: `late` read from its table, bandOf and min / max inline; the same values). */
function woodRow(e: WoodCut, lateOf: Float64Array, fleck: Float32Array, D: Float32Array, P: Float32Array, K: Float32Array, V: Float32Array, Tn: Uint8Array, gain: number, j: number): void {
  const M = e.n.mask, A = e.ao.data
  for (let i = j * LG15.cols, end = i + LG15.cols; i < end; i++) {
    if (M[i] < .5) continue
    const fl = fleck[i], x = D[i] - .1, y = (x > 0 ? x : 0) * gain, b = (y < 1 ? y : 1) * (1 - .62 * lateOf[i]) * (fl === 2 ? .45 : fl === 1 ? 1.18 : 1) * A[i]
    if (b < .06) continue
    const t0 = b < .3 ? FAINT : b < .62 ? MID : IDLE
    // the lacquer: the polish (Phong) in value, the chatoyance along the rings a step up
    const t = P[i] >= .7 && b >= .3 ? VALUE : K[i] >= .8 && t0 < IDLE && b >= .3 ? t0 + 1 : t0
    V[i] = t === t0 ? b : BAND_MID[t]; Tn[i] = t
  }
}
export const matWood: WidgetPreset = {
  ...tile, id: 'mat-wood', name: 'Wood', clock: true,
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const now = new Date(), e = woodCut(pad2(now.getHours()), pad2(now.getMinutes()))
    const L = snapTorch(matLight(ctx, { lattice: L15, torch: { height: 16, falloff: 120 }, rake: true }), 2)
    const lit = woodLit(`${e.key}|${lightKey(L)}`, () => {
      const b = woodBase(), [dif, spe, kk] = woodScratch(), out = litSurface(LG15, e.n.bounds, L15)
      illuminate(e.n, L, { ambient: .1, shininess: 30, into: dif, intoSpecular: spe })
      anisoSpec(e.n, b.t, L, { exponent: 24, into: kk })
      // the flat face reads at ~.6 whatever the (raked) light, as on the marble
      const Ld = Array.isArray(L) ? L as readonly number[] : [0, 0, 1], Lz = Ld[2] / (Math.hypot(Ld[0], Ld[1], Ld[2]) || 1), gain = .7 / (.9 * Math.max(.05, Lz))
      const [, r0, , r1] = e.n.bounds ?? [0, 0, 0, LG15.rows - 1]
      for (let j = r0; j <= r1; j++) woodRow(e, b.lateOf, b.rings.fleck.data, dif.data, spe.data, kk.data, out.values.data, out.tones, gain, j)
      return out
    })
    const on = ctx.reducedMotion || mod(ctx.t, 1) < .5
    return [cite('GROWTH RINGS'), lit.layer, ...(on && e.colon.length ? [layer(T.dots(e.colon, 2), 'active')] : [])]
  },
}

// ── 05 LEATHER ─ a wallet corner: pebble grain, burnished edges, saddle stitching ─────────────────────────────
// Card pitch. Pebble grain from Worley cells (creases = cell borders), a burnished rounded edge, a pocket sewn on
// across the lower half (its own edge, a step up), saddle stitching round the outline and along the pocket mouth:
// each stitch slanted 30° (the saddle stitch's lay), idle thread in AO pits. Debossed HAND SEWN. No red (M §10.3: the
// awl as a live action is an owner option and ships off).
export const LEATHER = { cx: 72, cy: 79, hw: 58, hh: 56, r: 16, pocket: 84, inset: 6, slant: 30 * Math.PI / 180 }
const outerSdf = (x: number, y: number) => {
  const qx = Math.abs(x - LEATHER.cx) - (LEATHER.hw - LEATHER.r), qy = Math.abs(y - LEATHER.cy) - (LEATHER.hh - LEATHER.r)
  const ax = qx > 0 ? qx : 0, ay = qy > 0 ? qy : 0
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - LEATHER.r
}
const roundEdge = (inset: number, w: number) => { const t = 1 - Math.max(0, Math.min(1, inset / w)); return Math.sqrt(1 - t * t) }
interface LeatherGeo { n: NormalRaster; ao: Raster; thread: Uint8Array; text: Uint8Array }
const LBOX: CellBounds = [LEATHER.cx - LEATHER.hw, LEATHER.cy - LEATHER.hh, LEATHER.cx + LEATHER.hw, LEATHER.cy + LEATHER.hh]
/** The stitch lines: round the outline at the inset, and across the pocket mouth (cells). */
export const leatherStitches = once(() => {
  // the outline's iso-line at −inset: the same rounded box, shrunk (corner radius r − inset), walked analytically
  const { cx, cy, hw, hh, r, inset } = LEATHER, ix = hw - r, iy = hh - r, rr = r - inset, loop: Pt[] = []
  for (const [sx, sy, a0] of [[1, -1, -90], [1, 1, 0], [-1, 1, 90], [-1, -1, 180]] as const) {
    for (let k = 0; k <= 8; k++) { const a = (a0 + k * 90 / 8) * Math.PI / 180; loop.push([cx + sx * ix + rr * Math.cos(a), cy + sy * iy + rr * Math.sin(a)]) }
  }
  const y = LEATHER.pocket + 4, mouth: Pt[] = [[LBOX[0] + LEATHER.inset + 3, y], [LBOX[2] - LEATHER.inset - 3, y]]
  return [stitch(loop, { length: 3, gap: 1, width: 1.4 }, true), stitch(mouth, { length: 3, gap: 1, width: 1.4 })]
})
const leatherGeo = once((): LeatherGeo => {
  const N = COLS * TILE.rows, h: HeightRaster = { ...createRaster(TILE, 'card', LBOX), mask: new Float32Array(N) }, thread = new Uint8Array(N), text = new Uint8Array(N)
  // the grain over the whole box at once (leatherAt's values, its Worley points tabled per lattice cell)
  const G = leatherCells(COLS, LBOX)
  for (let r = LBOX[1]; r <= LBOX[3]; r++) leatherRow(h.data, h.mask, G, r)
  // the saddle stitches: each chord turned 30° about its middle, a raised thread; its two holes are pits
  const tm = createRaster(TILE), holes: Pt[] = [], stamped: number[] = [], co = Math.cos(LEATHER.slant), si = Math.sin(LEATHER.slant)
  for (const st of leatherStitches()) for (let k = 0; k < st.count; k++) {
    const ax = st.segs[4 * k], ay = st.segs[4 * k + 1], bx = st.segs[4 * k + 2], by = st.segs[4 * k + 3], mx = (ax + bx) / 2, my = (ay + by) / 2
    const hx = (bx - ax) / 2, hy = (by - ay) / 2, rx = hx * co - hy * si, ry = hx * si + hy * co
    stampSeg(tm.data, mx - rx, my - ry, mx + rx, my + ry, .7, stamped)
    holes.push([mx - rx * 1.25, my - ry * 1.25], [mx + rx * 1.25, my + ry * 1.25])
  }
  for (const i of stamped) if (h.mask[i]) { h.data[i] += .55; thread[i] = 1 }
  for (const [x, y] of holes) { const c = Math.round(x), r = Math.round(y), i = r * COLS + c; if (h.mask[i] && !thread[i]) h.data[i] -= .7 }
  // HAND SEWN, debossed into the pocket: void letters in a shallow pit
  const deb = cardMask({ field: T.text('HAND SEWN', 72, 112, { align: 'center' }) }, TILE)
  const [d0, d1, d2, d3] = rasterWindow(deb)
  for (let r = d1; r <= d3; r++) for (let i = r * COLS + d0, end = r * COLS + d2; i <= end; i++) if (deb.data[i] && h.mask[i]) { h.data[i] -= .5; text[i] = 1 }
  return { n: normalRaster(h), ao: ambientOcclusion(h, { radius: 1.2, strength: .6 }), thread, text }
})
/**
 * Row r of the wallet: height and mask. `outerSdf` inlined (its row half once a row, its abs / max / min as compares on
 * integer cells: the same values); more than 4 cells in, the edge terms are flat (roundEdge = 1, the grain at full
 * depth) and the pocket's is the row's own. The same values with a few ops a cell: this bake runs on the card's first
 * frame, in code that has not been optimised yet, where every op and call counts.
 */
function leatherRow(H: Float32Array, M: Float32Array, G: Float64Array, r: number): void {
  const { cx, cy, hw, hh, r: R, pocket } = LEATHER, ex = hw - R, qy = Math.abs(r - cy) - (hh - R), ay = qy > 0 ? qy : 0, ay2 = ay * ay
  const pocketIn = r - pocket, crease = Math.abs(pocketIn) > 2
  // the pocket's lift for a cell more than 4 in (min(inset, pocketIn + .5) is pocketIn + .5 there, or saturated)
  const lift = pocketIn >= 0 ? .9 * roundEdge(Math.min(4, pocketIn + .5), 2.5) : 0
  for (let c = LBOX[0], i = r * COLS + c; c <= LBOX[2]; c++, i++) {
    const dx = c - cx, qx = (dx < 0 ? -dx : dx) - ex, ax = qx > 0 ? qx : 0, m = qx > qy ? qx : qy, s = Math.sqrt(ax * ax + ay2) + (m < 0 ? m : 0) - R
    if (s > 0) continue
    const inset = -s
    if (inset > 4) {
      const grain = .42 * G[i]
      H[i] = pocketIn >= 0 ? 1.1 + grain + lift : 1.1 + grain
      // the creases (the Worley borders) are void, away from the burnished edge: the grain reads as pebbles
      M[i] = grain < .18 && crease ? 0 : 1
      continue
    }
    const grain = .42 * G[i] * Math.min(1, inset / 4)
    let h = 1.1 * roundEdge(inset, 3) + grain
    if (pocketIn >= 0) h += .9 * roundEdge(Math.min(inset, pocketIn + .5), 2.5)
    H[i] = h
    M[i] = 1
  }
}
const leatherScratch = scratch(2)
const leatherLit = lru<Lit>(8)
function leatherShadeRow(g: LeatherGeo, D: Float32Array, P: Float32Array, V: Float32Array, Tn: Uint8Array, r: number): void {
  const M = g.n.mask, A = g.ao.data, X = g.text, Th = g.thread
  for (let c = LBOX[0], i = r * COLS + c; c <= LBOX[2]; c++, i++) {
    if (M[i] <= 0 || X[i]) continue
    const b = D[i] * A[i] * A[i]
    if (Th[i]) { const t = P[i] >= .3 || b >= .5 ? VALUE : IDLE; V[i] = t === VALUE ? 1 : Math.max(.7, b); Tn[i] = t; continue }
    // bandOf inlined; the burnish: a step up (mid → idle) where the sheen crosses
    const v = b * .85
    if (v < .06) continue
    if (v < .3) { V[i] = v; Tn[i] = FAINT } else if (v < .62 && !(P[i] >= .5)) { V[i] = v; Tn[i] = MID } else if (v < .62) { V[i] = BAND_MID[IDLE]; Tn[i] = IDLE } else { V[i] = v; Tn[i] = IDLE }
  }
}
export const matLeather: WidgetPreset = {
  ...tile, id: 'mat-leather', name: 'Leather',
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const L = snapTorch(matLight(ctx, { torch: { height: 36, falloff: 150 } }), 6)
    const lit = leatherLit(lightKey(L), () => {
      const g = leatherGeo(), [dif, spe] = leatherScratch(), out = litSurface(TILE, LBOX)
      illuminate(g.n, L, { ambient: .12, shininess: 14, into: dif, intoSpecular: spe })
      for (let r = LBOX[1]; r <= LBOX[3]; r++) leatherShadeRow(g, dif.data, spe.data, out.values.data, out.tones, r)
      return out
    })
    return [cite('SADDLE STITCH'), lit.layer]
  },
}

/** M3: knit, denim, paper; wood, leather, sand; ice, mercury, thread (the plan's order, three a row). */
export const workshopBoard = [matKnit, matDenim, matPaper, matWood, matLeather, matSand, matIce, matMercury, matThread, matLichtenberg, matErosion, matFrost, matKintsugi, matMud]
/** Live data for the board: the light / tilt hub (F0), subscribed while the board is open. */
export const workshopSources = [lightSource]
/** The board's internals, for the checks (`scripts/materials.ts`). */
export const workshopHooks = { DENIM, denimGeo, WOOD, woodBase, woodCut, LEATHER, leatherGeo, leatherStitches, outerSdf, toCard15, ...liveHooks, ...physicsHooks, ...plateHooks, ...stoneHooks, ...frostHooks, ...kintsugiHooks, ...mudHooks }
