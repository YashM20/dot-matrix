/**
 * MATERIALS, M2 craft (docs/living-matter/M-materials.md §4.2, §4.4): an embroidered patch whose border is still
 * being sewn (`mat-patch`) and a wax candle clock that burns down over the day (`mat-candle`, after X-advanced #14:
 * wrap diffuse + transmission through thin wax, drips as track L's Verlet ropes, `engine/life/chain.ts`).
 */
import { anisoSpec, stitch, surfaceLayer, type Stitches, type TangentRaster } from '../../engine/matter'
import { createRope, ropeInit, ropeStep } from '../../engine/life/chain'
import { normalRaster, type HeightRaster, type NormalRaster } from '../../engine/light/height'
import { lambert, type Light, type Vec3 } from '../../engine/light/shade'
import { hourOf } from '../../engine/light/material'
import { curl2 } from '../../engine/noise/gradient'
import { twill } from '../../engine/matter/weave'
import { createRaster, sample, type Raster } from '../../engine/raster/raster'
import type { CellBounds } from '../../engine/types'
import { TILE, layer, type WidgetPreset } from '../types'
import { L15, LG15, LIGHT_DEFAULTS, T, cap, cite, matLight, mod, once, pad2, scratch, snapTorch, tile, toCard15, valuedSites, type Pt } from './materials-shared'

const COLS = TILE.cols

// ── 09 PATCH ─ a satin-stitched patch; the needle is still sewing its border ────────────────────────────
// Card pitch. A quiet twill ground (2/3, crossing 3) in faint, a satin-stitched bolt (stitches run across each column,
// so each column catches the light on its own: Kajiya–Kay p 24 along the stitch), a merrowed edge wrapped radially,
// and a running stitch round the inside that the needle (the live red) sews one lap per 24 s.
export const PATCH = { cx: 72, cy: 78, r: 58, edge: 55, ground: 53.5, run: 50 }
const PBOX: CellBounds = [PATCH.cx - 59, PATCH.cy - 59, PATCH.cx + 59, PATCH.cy + 59]
/** The bolt, 7 vertices round its outline (cells from the patch centre): about 36 × 68 cells. */
export const BOLT: Pt[] = [[-2, -34], [-18, 4], [-3, 4], [-10, 34], [18, -8], [3, -8], [14, -34]]
/** Signed distance to the bolt (cells, < 0 inside): the nearest edge, the sign by the even–odd rule. */
export function boltSdf(x: number, y: number): number {
  const px = x - PATCH.cx, py = y - PATCH.cy, n = BOLT.length
  let d = Infinity, inside = false
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [ax, ay] = BOLT[j], [bx, by] = BOLT[i], ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey))), dx = wx - ex * t, dy = wy - ey * t
    d = Math.min(d, dx * dx + dy * dy)
    if ((ay > py) !== (by > py) && px < ax + (py - ay) * ex / ey) inside = !inside
  }
  return (inside ? -1 : 1) * Math.sqrt(d)
}
interface PatchGeo { n: NormalRaster; t: TangentRaster; ground: Raster; run: Stitches }
/** Row r of the patch: the bolt's satin relief (round, grooved every 3 cells along the column), the merrow, the twill ground. */
function patchRow(sd: Float32Array, H: Float32Array, M: Float32Array, TX: Float32Array, TY: Float32Array, G: Float32Array, r: number): void {
  const dd = twill(2, 3)
  for (let c = PBOX[0], i = r * COLS + c; c <= PBOX[2]; c++, i++) {
    const dx = c - PATCH.cx, dy = r - PATCH.cy, rr = Math.sqrt(dx * dx + dy * dy), s = sd[i]
    if (rr > PATCH.r) continue
    if (s < 0) {
      // across the column: the SDF's gradient (central differences; the medial ridge keeps its left neighbour's)
      let gx = (sd[i + 1] - sd[i - 1]) / 2, gy = (sd[i + COLS] - sd[i - COLS]) / 2, g = Math.hypot(gx, gy)
      if (g < 1e-3) { gx = TX[i - 1] || 1; gy = TY[i - 1]; g = Math.hypot(gx, gy) }
      TX[i] = gx / g; TY[i] = gy / g
      const inset = Math.min(1, -s / 3), along = (dx * -TY[i] + dy * TX[i]) / 3
      H[i] = 1.4 * Math.sqrt(1 - (1 - inset) * (1 - inset)) - (along - Math.floor(along) < .34 ? .3 : 0)
      M[i] = 1
    } else if (rr >= PATCH.edge) {
      const k = (rr - (PATCH.edge + PATCH.r) / 2) / 1.5, arc = Math.atan2(dy, dx) * rr / 3
      H[i] = .9 * Math.sqrt(Math.max(0, 1 - k * k)) - (arc - Math.floor(arc) < .34 ? .25 : 0)
      M[i] = 1; TX[i] = dx / rr; TY[i] = dy / rr // the merrow wraps the edge radially
    } else if (rr < PATCH.ground && s > 2 && Math.abs(rr - PATCH.run) > 1.6) {
      // twill 2/3 at 3 cells a crossing: a 2-cell thread and a 1-cell void, the warp up where the drawdown says
      const a = c - PBOX[0], b = r - PBOX[1], up = dd(Math.floor(a / 3), Math.floor(b / 3))
      if ((up ? a % 3 : b % 3) !== 2) G[i] = .2
    }
  }
}
const patchGeo = once((): PatchGeo => {
  const n = COLS * TILE.rows, sd = new Float32Array(n).fill(9), H = new Float32Array(n), M = new Float32Array(n), TX = new Float32Array(n), TY = new Float32Array(n)
  const ground = createRaster(TILE, 'card', PBOX)
  // the bolt's distance only over its own box (it is far from the patch edge)
  for (let r = PATCH.cy - 38; r <= PATCH.cy + 38; r++) for (let c = PATCH.cx - 22; c <= PATCH.cx + 22; c++) sd[r * COLS + c] = boltSdf(c, r)
  for (let r = PBOX[1]; r <= PBOX[3]; r++) patchRow(sd, H, M, TX, TY, ground.data, r)
  const h: HeightRaster = { ...createRaster(TILE, 'card', PBOX), mask: M }
  h.data.set(H)
  const ring: Pt[] = Array.from({ length: 160 }, (_, k) => { const a = k / 160 * 2 * Math.PI - Math.PI / 2; return [PATCH.cx + PATCH.run * Math.cos(a), PATCH.cy + PATCH.run * Math.sin(a)] })
  return { n: normalRaster(h), t: { grid: TILE, x: TX, y: TY, bounds: PBOX }, ground, run: stitch(ring, { length: 3, gap: 2 }, true) }
})
/** The needle's lap: unpick over 0.6 s, then sew one lap in 24 s; t = 0 is the moment a lap completes (all sewn). */
export const SEW = { unpick: .6, lap: 24 }
export function sewing(t: number, count: number, total: number): { phase: number; sewn: number; s: number } {
  const tau = mod(t, SEW.unpick + SEW.lap)
  if (tau < SEW.unpick) return { phase: 1, sewn: Math.ceil(count * (1 - tau / SEW.unpick)), s: 0 }
  const phase = (tau - SEW.unpick) / SEW.lap
  return { phase, sewn: Math.floor(phase * count), s: phase * total }
}
/** The light turned a quarter about the patch centre (the TURN toggle: each stitch direction catches the light anew). */
function turned(L: Light): Light {
  if (Array.isArray(L)) { const v = L as Vec3; return [-v[1], v[0], v[2]] }
  const at = (L as { at: Vec3; falloff?: number }).at, dx = at[0] - PATCH.cx, dy = at[1] - PATCH.cy
  return { ...(L as object), at: [PATCH.cx - dy, PATCH.cy + dx, at[2]] }
}
const patchScratch = scratch(5)
let satinKey = ''
export const matPatch: WidgetPreset = {
  ...tile, id: 'mat-patch', name: 'Patch',
  defaults: { ...LIGHT_DEFAULTS, turn: 0 },
  controls: [{ key: 'turn', kind: 'toggle', box: [PBOX[0], PBOX[1], PBOX[2] - PBOX[0], PBOX[3] - PBOX[1]], label: 'Turn the patch in the light' }],
  layers: ctx => {
    const g = patchGeo(), [dif, spec, body, rim, core] = patchScratch()
    let L = snapTorch(matLight(ctx, { torch: { height: 36, falloff: 160 } }), 3)
    if ((ctx.data.turn ?? 0) >= .5) L = turned(L)
    // the satin depends on the light alone: re-shade only when it changes (the sun holds for minutes; a torch snaps to 3 cells)
    const key = JSON.stringify(L)
    if (key !== satinKey) {
      satinKey = key
      lambert(g.n, L, { ambient: .1, into: dif })
      anisoSpec(g.n, g.t, L, { exponent: 24, into: spec })
      body.data.fill(0); rim.data.fill(0); core.data.fill(0)
      const [c0, r0, c1, r1] = g.n.bounds ?? PBOX
      for (let r = r0; r <= r1; r++) satinRow(g.n.mask, dif.data, spec.data, body.data, rim.data, core.data, r, c0, c1)
      body.bounds = rim.bounds = core.bounds = g.n.bounds
    }
    // the running stitch: sewn dashes idle, the rest only needle holes, the needle red with a short thread behind it
    const st = g.run, sw = sewing(ctx.t, st.count, st.total), sewn: Pt[] = [], holes: Pt[] = []
    for (let k = 0; k < st.count; k++) {
      const x0 = st.segs[4 * k], y0 = st.segs[4 * k + 1], x1 = st.segs[4 * k + 2], y1 = st.segs[4 * k + 3]
      if (k < sw.sewn) sewn.push([x0, y0], [(x0 + x1) / 2, (y0 + y1) / 2], [x1, y1])
      else holes.push([x0, y0], [x1, y1])
    }
    const needle = st.at(sw.s), tail: Pt[] = [1.5, 3, 4.5].map(b => { const p = st.at(sw.s - b); return [p[0], p[1]] })
    return [
      cite('SATIN · KAJIYA-KAY'),
      surfaceLayer([[body, [[.06, .62, 'mid'], [.62, 2, 'idle']]], [rim, 'idle'], [core, 'value'], [g.ground, 'faint']]),
      layer(T.dots(holes, .7), 'faint'), layer(T.dots(sewn, .9), 'idle'),
      ...(sw.phase < 1 ? [layer(T.dots(tail, .8), 'mid')] : []),
      layer(valuedSites([[needle[0], needle[1], 1]], 2), 'active'),
    ]
  },
}
/** Row r of the satin: the body mid / idle (.3 + .45·Lambert), the stitch sheen +1 step at .3 and +2 (value) at .6. */
function satinRow(M: Float32Array, D: Float32Array, S: Float32Array, B: Float32Array, R: Float32Array, C: Float32Array, r: number, c0: number, c1: number): void {
  for (let c = c0, i = r * COLS + c0; c <= c1; c++, i++) {
    if (!(M[i] > .5)) continue
    const b = .3 + .45 * D[i], s = S[i]
    if (s >= .6) C[i] = Math.min(1, b + .5)
    else if (s >= .3) R[i] = Math.min(1, b + .25)
    else B[i] = b
  }
}

// ── 11 CANDLE ─ a candle clock that burns down over the day; the flame is the live red ──────────────────
// A wax pillar on the 1.5 lattice: wrap diffuse (n·L + .5) / 1.5 under the board light, plus light transmitted from
// the flame through thin wax, e^(−.35·thickness) (thickness = the distance to the silhouette), so the rim near the
// flame glows. It stands 96 cells at midnight and loses 4 an hour; hour notches run down its side. Three drips are
// Verlet ropes (track L's `ropeStep`) run once to rest and frozen.
export const CANDLE = { cx: 72, x0: 48, x1: 96, base: 130, full: 34, perHour: 4 }
const C_R = (CANDLE.x1 - CANDLE.x0) / 2
/** The top of the wax (card row) at a fractional hour. */
export const candleTop = (hour: number) => CANDLE.full + CANDLE.perHour * (((hour % 24) + 24) % 24)
/** The drips: polylines (cells from the rim at their anchor), from ropes that ran to rest under gravity and a slight flow. */
export const candleDrips = once(() => [[-18, 7], [9, 12], [17, 5]].map(([ax, len], k) => {
  const rope = createRope(10, 2.1, { drag: .08, iters: 6 }), s = new Float32Array(4 * 10)
  ropeInit(rope, s, 0, 0)
  const flow = (x: number, y: number, out: Float32Array) => { out[0] = 4 * Math.sin(.45 * y + 1.7 * k) - .2 * x; out[1] = 0 }
  for (let i = 0; i < 150; i++) ropeStep(rope, s, 1 / 30, 0, 0, 0, 80, flow)
  const pts: Pt[] = []
  let run = 0
  for (let i = 0; i < 10 && run <= len; i++) { pts.push([ax + s[rope.X + i], s[rope.Y + i]]); if (i) run += Math.hypot(s[rope.X + i] - s[rope.X + i - 1], s[rope.Y + i] - s[rope.Y + i - 1]) }
  return pts
}))
const segDist = (px: number, py: number, a: Pt, b: Pt) => {
  const ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((px - a[0]) * ex + (py - a[1]) * ey) / (ex * ex + ey * ey || 1)))
  return Math.hypot(px - a[0] - ex * t, py - a[1] - ey * t)
}
/** Lattice row j of the wax: wrap diffuse + flame transmission, notches a step down, drips a step up (tones by value bands). */
function waxRow(V: Float32Array, j: number, top: number, hour: number, L: Vec3 | null, torchAt: Vec3 | null, fx: number, fy: number, drips: Pt[][]): void {
  const y = toCard15(j)
  if (y < top || y > CANDLE.base) return
  for (let i = Math.ceil((CANDLE.x0 + .5) / L15 - .5); toCard15(i) <= CANDLE.x1; i++) {
    const x = toCard15(i), nx = (x - CANDLE.cx) / C_R, k = j * LG15.cols + i
    if (Math.abs(nx) > 1) continue
    // the side is a cylinder; the top 3 cells round over toward the light above
    const lip = Math.max(0, 1 - (y - top) / 3), nz0 = Math.sqrt(1 - nx * nx), ny = -.4 * lip, nz = nz0 * (1 - .2 * lip)
    let lx = 0, ly = 0, lz = 1
    if (torchAt) { const dx = torchAt[0] - x, dy = torchAt[1] - y, dz = torchAt[2], l = Math.hypot(dx, dy, dz) || 1; lx = dx / l; ly = dy / l; lz = dz / l } else if (L) { lx = L[0]; ly = L[1]; lz = L[2] }
    const ndl = nx * lx + ny * ly + nz * lz, wrap = Math.max(0, (ndl + .5) / 1.5)
    const thick = Math.max(0, Math.min(x - CANDLE.x0, CANDLE.x1 - x, y - top)), d = Math.hypot(x - fx, y - fy)
    const trans = Math.exp(-.35 * thick) / (1 + (d / 16) ** 2)
    let v = .2 + .48 * wrap + 1.2 * trans
    // hour notches on the left of the front: one per hour still to burn (period 4 cells)
    const h = (y - CANDLE.full) / CANDLE.perHour
    if (x < CANDLE.x0 + 7 && h > hour && Math.abs(h - Math.round(h)) * CANDLE.perHour < .8) v -= .25
    for (const pts of drips) for (let q = 1; q < pts.length; q++) if (segDist(x, y - top, pts[q - 1], pts[q]) < 1.4) { v += .14; q = pts.length }
    v = Math.min(1, v)
    if (v < .06) continue
    V[k] = v
  }
}
/** The flame on the 1.5 lattice: a teardrop over the wick, swaying and stretching with curl noise (pure in t). */
function flameInto(F: Float32Array, t: number, fx: number, tip: number, base: number): void {
  const sway = curl2(.37, .11, t, 7)[0] * 1.1, stretch = 1 + .08 * curl2(.71, .29, t, 8)[1], tipY = base - (base - tip) * stretch
  for (let j = Math.floor((tipY + .5) / L15 - .5); toCard15(j) <= base; j++) {
    const y = toCard15(j), u = (y - tipY) / (base - tipY)
    if (u < 0 || u > 1) continue
    const hw = 3.6 * Math.sin(Math.PI * u ** .75), xc = fx + sway * (1 - u) ** 2
    for (let i = Math.floor((xc - hw + .5) / L15 - .5); toCard15(i) <= xc + hw; i++) {
      const dx = Math.abs(toCard15(i) - xc)
      if (dx < hw) F[j * LG15.cols + i] = .5 + .5 * (1 - dx / hw) * Math.min(1, .4 + u)
    }
  }
}
const candleScratch = once(() => ({ wax: createRaster(LG15), flame: createRaster(LG15) }))
export const matCandle: WidgetPreset = {
  ...tile, id: 'mat-candle', name: 'Candle', clock: true,
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const now = new Date(), hour = hourOf(now), top = candleTop(hour), S = candleScratch(), drips = candleDrips()
    const L = matLight(ctx, { lattice: L15, torch: { height: 30, falloff: 120 } }), torchAt = Array.isArray(L) ? null : (L as { at: Vec3 }).at
    const dir = Array.isArray(L) ? (() => { const v = L as Vec3, l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l] as Vec3 })() : null
    // the torch arrives in lattice cells (matLight maps it): back to card cells for the wax
    const torchCard: Vec3 | null = torchAt ? [toCard15(torchAt[0]), toCard15(torchAt[1]), torchAt[2]] : null
    const fx = CANDLE.cx, base = top - 2.5, fy = top - 7
    S.wax.data.fill(0); S.flame.data.fill(0)
    for (let j = 0; j < LG15.rows; j++) waxRow(S.wax.data, j, top, hour, dir, torchCard, fx, fy, drips)
    flameInto(S.flame.data, ctx.reducedMotion ? 0 : ctx.t, fx, top - 17, base)
    const fj = Math.max(0, Math.floor((top - 22) / L15)), fi = Math.floor((fx - 8) / L15)
    S.flame.bounds = [fi, fj, fi + Math.ceil(16 / L15), Math.min(LG15.rows - 1, fj + Math.ceil(24 / L15))]
    const marks = [6, 12, 18].filter(h => h > hour).map(h => layer(cap(String(h), CANDLE.x1 + 4, CANDLE.full + CANDLE.perHour * h - 2), 'faint'))
    return [
      cite('WAX · SUBSURFACE'),
      layer(T.text(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`, 0, 134), 'faint'),
      ...marks,
      surfaceLayer([[S.wax, [[.06, .3, 'faint'], [.3, .62, 'mid'], [.62, .86, 'idle'], [.86, 2, 'value']]]], L15),
      layer(T.dots([[fx, top - 1.5]], 1), 'mid'),
      { field: sample(S.flame), tone: 'active', lattice: L15, origin: [0, 0] },
    ]
  },
}

export const wearHooks = { PATCH, BOLT, boltSdf, patchGeo, sewing, SEW, CANDLE, candleTop, candleDrips }
