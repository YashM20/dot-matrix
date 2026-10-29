/**
 * MATERIALS, M2 glass (docs/living-matter/M-materials.md §4.2): a liquid-glass lens over a dense clock (`mat-lens`, the
 * board's one GPU card) and a stained-glass rose window lit by the sun (`mat-window`). Both bend or filter light, never
 * hue: the lens moves the *sampled value* under fixed dots (glass v2, `engine/matter/glass.ts`), the window is panes of
 * three transmittances behind lead came.
 */
import { BEZEL, lensOffset, liquidGlass, snellLUT, voronoiSites, type LiquidGlassOptions } from '../../engine/matter'
import { gpuValues } from '../../engine/renderer/webgl/passes'
import { voronoi2, voronoiBorder2 } from '../../engine/noise/voronoi'
import { stbn } from '../../engine/halftone/mask'
import { hourOf } from '../../engine/light/material'
import { sceneLight } from '../../engine/light/input'
import type { Light, Vec3 } from '../../engine/light/shade'
import { hash01 } from '../../engine/math'
import { createRaster, sample } from '../../engine/raster/raster'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import type { Field, Tone } from '../../engine/types'
import { TILE, layer, type WidgetContext, type WidgetPreset } from '../types'
import { DEG, L15, LG15, LIGHT_DEFAULTS, T, cite, matLight, once, pad2, toCard15, valuedSites, tile, type Box, type Pt } from './materials-shared'
import { surfaceLayer, tonedLayer } from '../../engine/matter/surface'

const COLS = TILE.cols, W1 = TILE.cols - 1, H1 = TILE.rows - 1

// ── 06 LENS ─ a drop of glass slides over a dense clock and bends it ──────────────────────────────────────
// Behind: a faint floor of dots every second cell (the "screen" that shows the warp), 60 dial ticks on a ring and the
// hero time on a 1.5 lattice. The lens (a pill, squircle bezel, n 1.5) reads them at refracted points: dots stay on
// the grid, values slide. The screen is one GPU layer at density 2 (Canvas fallback: the same field at card pitch).
export const LENS = { hw: 30, hh: 20, radius: 20, bezel: 12, thickness: 6, base: 2, ior: 1.5, magnify: 1.06, frost: 0 }
/** The xy control's box (the card below the label): lx 0..1 left → right, ly 0..1 bottom → top. */
const LENS_BOX: Box = [0, 12, 144, 132]
const DIAL = { cx: 72, cy: 78, r: 58 }
const HERO = { k: 1.5, row: 68 }
/** The lens centre (card cells) for the card's data, kept inside the card below the label. */
export function lensCentre(data: Record<string, number>): Pt {
  const x = LENS_BOX[0] + (data.lx ?? .6944) * LENS_BOX[2], y = LENS_BOX[1] + LENS_BOX[3] - (data.ly ?? .5606) * LENS_BOX[3]
  return [Math.max(LENS.hw + 2, Math.min(141 - LENS.hw, x)), Math.max(14 + LENS.hh, Math.min(141 - LENS.hh, y))]
}
const lensLUT = once(() => snellLUT(BEZEL.squircle, { bezel: LENS.bezel, thickness: LENS.thickness, base: LENS.base, ior: LENS.ior }))
/** The rim light for this frame: kube's −60° at rest, toward a hovering pointer, nudged by the tilt offset (tx, ty; never gx/gy). */
export function lensRim(ctx: WidgetContext, c: Pt): { angle: number; power: number } {
  const p = ctx.pointers?.find(q => q.inside && !q.up && !q.down), tx = ctx.data.tx ?? 0, ty = ctx.data.ty ?? 0
  const angle = p && Math.hypot(p.x - c[0], p.y - c[1]) > 1 ? Math.atan2(p.y - c[1], p.x - c[0]) : -60 * DEG + 25 * DEG * tx
  return { angle, power: 3 - Math.max(0, Math.min(1, ty)) }
}
/** The dial's ticks at card pitch (5-minute ticks 1 with an inner dot, the others .75), on whole cells. Baked once. */
const dialTicks = once(() => {
  const r = createRaster(TILE)
  for (let k = 0; k < 60; k++) {
    const a = k * 6 * DEG, x = Math.round(DIAL.cx + DIAL.r * Math.sin(a)), y = Math.round(DIAL.cy - DIAL.r * Math.cos(a))
    r.data[y * COLS + x] = k % 5 ? .75 : 1
    if (k % 5 === 0) { const xi = Math.round(DIAL.cx + (DIAL.r - 2) * Math.sin(a)), yi = Math.round(DIAL.cy - (DIAL.r - 2) * Math.cos(a)); r.data[yi * COLS + xi] = 1 }
  }
  return r
})
/** Bilinear read of a card-pitch raster at a point in cells (0 off the card). */
function bilinear(D: Float32Array, x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
  if (i < -1 || j < -1 || i > W1 || j > H1) return 0
  const at = (c: number, r: number) => (c < 0 || r < 0 || c > W1 || r > H1 ? 0 : D[r * COLS + c])
  const a = at(i, j), b = at(i + 1, j), c = at(i, j + 1), d = at(i + 1, j + 1)
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy
}
/** The hero time on its lattice, as a bitmap read bilinearly (so under the glass it warps smoothly), plus its keep-out on card pitch. */
interface Hero { key: string; lc: number; lr: number; ox: number; oy: number; bits: Float32Array; near: Uint8Array; box: Box }
const heroes = new Map<string, Hero>()
export function lensHero(hh: string, mm: string): Hero {
  const key = `${hh}:${mm}`, hit = heroes.get(key)
  if (hit) return hit
  const big = T.big(key, DIAL.cx, HERO.row - 10.5, { lattice: HERO.k, smooth: true, align: 'center' }), [ox, oy] = big.origin!
  const g = latticeGrid(TILE, HERO.k, [ox, oy]), lc = g.cols, lr = g.rows, bits = new Float32Array(lc * lr), near = new Uint8Array(COLS * TILE.rows)
  const b = big.field.bounds ?? [0, 0, lc - 1, lr - 1], i0 = Math.max(0, Math.floor(b[0])), j0 = Math.max(0, Math.floor(b[1])), i1 = Math.min(lc - 1, Math.ceil(b[2])), j1 = Math.min(lr - 1, Math.ceil(b[3]))
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const v = big.field(i / (lc - 1), j / (lr - 1))
    if (!(v > 0)) continue
    bits[j * lc + i] = v
    // the floor stays clear within 2 cells of a lit glyph dot (its own 1.5-cell footprint and a moat)
    const x = ox + (i + .5) * HERO.k - .5, y = oy + (j + .5) * HERO.k - .5
    for (let r = Math.max(0, Math.floor(y - 2)); r <= Math.min(H1, Math.ceil(y + 2)); r++) for (let c = Math.max(0, Math.floor(x - 2)); c <= Math.min(W1, Math.ceil(x + 2)); c++) near[r * COLS + c] = 1
  }
  const h: Hero = { key, lc, lr, ox, oy, bits, near, box: [i0, j0, i1, j1] }
  heroes.set(key, h)
  if (heroes.size > 2) heroes.delete(heroes.keys().next().value!)
  return h
}
/**
 * The floor: a dot every second cell, × .5 (faint). A narrow tent (radius ½ cell) round each dot, so a sample that the
 * glass moves off a dot by more than half a cell reads nothing: under the lens the screen stays dots, bent, not a haze.
 */
const floorAt = (x: number, y: number) => {
  const fx = 1 - 2 * Math.abs(x - 2 * Math.round(x / 2)), fy = 1 - 2 * Math.abs(y - 2 * Math.round(y / 2))
  return fx > 0 && fy > 0 ? .5 * fx * fy : 0
}
/** The scene behind the glass at a point (cells): ticks, then the floor outside the ring's clear band and the hero's keep-out. */
function behindAt(ticks: Float32Array, near: Uint8Array, x: number, y: number): number {
  const t = bilinear(ticks, x, y)
  if (t > 0) return t
  const dx = x - DIAL.cx, dy = y - DIAL.cy, d2 = dx * dx + dy * dy
  if (d2 > 54.5 * 54.5 && d2 < 61.5 * 61.5) return 0
  const c = Math.round(x), r = Math.round(y)
  if (c >= 0 && r >= 0 && c <= W1 && r <= H1 && near[r * COLS + c]) return 0
  return floorAt(x, y)
}
/** Where a point q behind the glass appears (p with p + offset(p) = q, a few fixed-point steps; q itself outside the lens). */
export function apparent(off: (c: number, r: number, out: Float64Array) => number, q: Pt): Pt {
  const d = new Float64Array(2)
  let p: Pt = [q[0], q[1]]
  for (let k = 0; k < 8; k++) { if (off(p[0], p[1], d) < 0 && k === 0) return p; p = [q[0] - d[0], q[1] - d[1]] }
  return p
}
const VALUE_IN = .875, MID_LO = .625
export const matLens: WidgetPreset = {
  ...tile, id: 'mat-lens', name: 'Lens', clock: true,
  defaults: { ...LIGHT_DEFAULTS, lx: .6944, ly: .5606 },
  springKeys: ['lx', 'ly'],
  controls: [{ key: 'lx', keyY: 'ly', kind: 'xy', box: LENS_BOX, label: 'Move the lens' }],
  layers: ctx => {
    const now = new Date(), c = lensCentre(ctx.data), rim = lensRim(ctx, c), hero = lensHero(pad2(now.getHours()), pad2(now.getMinutes()))
    const o: LiquidGlassOptions = { cx: c[0], cy: c[1], hw: LENS.hw, hh: LENS.hh, radius: LENS.radius, bezel: LENS.bezel, lut: lensLUT(), magnify: LENS.magnify, frost: LENS.frost, rimAngle: rim.angle, rimPower: rim.power }
    const ticks = dialTicks().data, near = hero.near, off = lensOffset(o)
    // the live second, refracted by the same offset as the scene (the scene's own tick there is cleared under it)
    const s = now.getSeconds(), a = s * 6 * DEG, q: Pt = [Math.round(DIAL.cx + DIAL.r * Math.sin(a)), Math.round(DIAL.cy - DIAL.r * Math.cos(a))], sec = apparent(off, q)
    const behind: Field = (u, v) => behindAt(ticks, near, u * W1, v * H1)
    const lens = liquidGlass(behind, TILE, o), d = new Float64Array(2)
    const step = .25
    // the screen: through + Fresnel (+1 step on the bezel) + the specular rim, minus the contact shadow and the second's cell
    const screen: Field = (u, v) => {
      const x = u * W1, y = v * H1
      if ((x - sec[0]) ** 2 + (y - sec[1]) ** 2 < 2.2) return 0
      const bez = off(x, y, d)
      if (bez < 0) {
        const val = behind(u, v)
        if (val > 0 && val <= .5) { // the floor only: cut where the lens's shadow falls (the outline moved down 3 cells)
          const sx = Math.abs(x - c[0]) - (LENS.hw - LENS.radius), sy = Math.abs(y - 3 - c[1])
          const sd = Math.hypot(Math.max(sx, 0), Math.max(sy, 0)) + Math.min(Math.max(sx, sy), 0) - LENS.radius
          if (sd < 1.5) return 0
        }
        return val
      }
      // the specular rim on the outer quarter of the bezel; the glass's edge (its outer 1.5 cells, where Fresnel climbs)
      // shows a step up even over an empty scene, on the screen's own 2-cell rhythm, so the pill reads as an outline
      if (bez < .25 && lens.rim(u, v) >= .7) return 1
      let val = lens.through(u, v)
      if (bez < .125) { const b = Math.max(val, floorAt(x, y)); return b > 0 ? Math.min(1, b + step) : 0 }
      return val > 0 ? Math.min(1, val + (lens.fresnel(u, v) >= .15 ? step : 0)) : 0
    }
    screen.bounds = [0, 12, W1, H1]
    const toneOf = (val: number, u: number, v: number): Tone => (val >= VALUE_IN ? (lens.inside(u, v) ? 'value' : 'idle') : val >= MID_LO ? 'mid' : 'faint')
    // the hero on its 1.5 lattice: each dot reads the glyph bitmap at its refracted point (bilinear: the strokes warp)
    const { lc, lr, ox, oy, bits, box } = hero
    const heroField: Field = (u, v) => {
      const i = u * (lc - 1), j = v * (lr - 1), x = ox + (i + .5) * HERO.k - .5, y = oy + (j + .5) * HERO.k - .5
      if (off(x, y, d) < 0) { const k = Math.round(j) * lc + Math.round(i); return bits[k] ?? 0 }
      const si = (x + d[0] + .5 - ox) / HERO.k - .5, sj = (y + d[1] + .5 - oy) / HERO.k - .5
      const i0 = Math.floor(si), j0 = Math.floor(sj), fx = si - i0, fy = sj - j0
      const at = (a: number, b: number) => (a < 0 || b < 0 || a >= lc || b >= lr ? 0 : bits[b * lc + a])
      const top = at(i0, j0) + (at(i0 + 1, j0) - at(i0, j0)) * fx, bot = at(i0, j0 + 1) + (at(i0 + 1, j0 + 1) - at(i0, j0 + 1)) * fx
      return top + (bot - top) * fy
    }
    // the lens can pull the hero out to its own outline: the layer covers the glyphs' box and the lens's
    const toLat = (x: number) => (x + .5 - ox) / HERO.k - .5, toLatY = (y: number) => (y + .5 - oy) / HERO.k - .5
    heroField.bounds = [Math.max(0, Math.min(box[0], Math.floor(toLat(c[0] - LENS.hw)))), Math.max(0, Math.min(box[1], Math.floor(toLatY(c[1] - LENS.hh)))), Math.min(lc - 1, Math.max(box[2], Math.ceil(toLat(c[0] + LENS.hw)))), Math.min(lr - 1, Math.max(box[3], Math.ceil(toLatY(c[1] + LENS.hh))))]
    return [
      cite('SNELL · N 1.5'),
      { field: gpuValues(screen, { density: 2 }), toneOf },
      { field: heroField, lattice: HERO.k, origin: [ox, oy], toneOf: (_val, u, v) => (lens.inside(((ox + (u * (lc - 1) + .5) * HERO.k - .5)) / W1, (oy + (v * (lr - 1) + .5) * HERO.k - .5) / H1) ? 'value' : 'idle') },
      layer(valuedSites([[sec[0], sec[1], 1]], 1.6), 'active'),
    ]
  },
}

// ── 08 WINDOW ─ a lancet with a rose; the pane of this hour burns red ───────────────────────────────────
// Lead came on card pitch (Voronoi borders: F0 voronoi2 in the lancet, 19 custom sites in the rose), panes on the 1.5
// lattice in three transmittances × the sun's gain, a stone frame. The came is dark structure: void with mid glints.
const WIN = { x0: 22, x1: 122, spring: 70, bottom: 140, R: 54.16, frame: 4, rose: { cx: 72, cy: 52, r: 34 }, cell: 13, seed: 41 }
/** Signed distance to the lancet outline (cells, < 0 inside): a rectangle under a pointed arch of two circles. */
export function lancetSdf(x: number, y: number): number {
  const side = Math.abs(x - (WIN.x0 + WIN.x1) / 2) - (WIN.x1 - WIN.x0) / 2
  if (y > WIN.spring) return Math.max(side, y - WIN.bottom)
  // above the springing line: inside both arcs (each centred on the far side of the span)
  return Math.max(Math.hypot(x - (WIN.x0 + WIN.R), y - WIN.spring), Math.hypot(x - (WIN.x1 - WIN.R), y - WIN.spring)) - WIN.R
}
/** The rose's 19 sites: 12 petals on a ring of 24 (petal k at k o'clock, 0 at the top), 6 inner at 11, the centre. */
export const ROSE_SITES: Pt[] = [
  ...Array.from({ length: 12 }, (_, k): Pt => [WIN.rose.cx + 24 * Math.sin(k * 30 * DEG), WIN.rose.cy - 24 * Math.cos(k * 30 * DEG)]),
  ...Array.from({ length: 6 }, (_, k): Pt => [WIN.rose.cx + 11 * Math.sin((k * 60 + 30) * DEG), WIN.rose.cy - 11 * Math.cos((k * 60 + 30) * DEG)]),
  [WIN.rose.cx, WIN.rose.cy],
]
const WIN_BOX: Box = [WIN.x0, 14, WIN.x1, WIN.bottom]
export interface WindowGeo {
  /** Per card cell: 0 wall, 1 stone frame, 2 lead came, 3 moat, 4 glass. */
  kind: Uint8Array
  /** Per card cell: pane index (rose petals 0–11, rose inner 12–18, lancet panes 19+), −1 elsewhere. */
  pane: Int16Array
  /** Per pane: transmittance class (.35 / .6 / .85) and centre x. */
  cls: Float32Array
  /** Came cells (card index) and their normals, for the glints. */
  came: Int32Array; nx: Float32Array; ny: Float32Array; nz: Float32Array
  /** Per 1.5-lattice cell: the pane under its centre (−1: none, or within 2 cells of the lead). */
  lat: Int16Array
  /** The 1.5-lattice window over the glass. */
  latBox: Box
}
/** Row r of the window, cells c0 … c1: classify (frame, came, moat, glass) and keep the lead's distance for its relief. */
function windowRow(geo: WindowGeo, rose: { id: Int16Array; border: Float32Array }, lancetIds: Map<number, number>, dist: Float32Array, r: number, c0: number, c1: number): void {
  const { kind, pane } = geo, { cx, cy, r: rr } = WIN.rose, out = { f1: 0, f2: 0, x: 0, y: 0, id: 0 }
  for (let c = c0; c <= c1; c++) {
    const i = r * COLS + c, sd = lancetSdf(c, r)
    if (sd > 0) continue
    if (sd > -WIN.frame) { kind[i] = 1; continue }
    const rd = Math.hypot(c - cx, r - cy)
    let border: number, id: number
    if (rd < rr) { border = Math.min(rose.border[i], rr - rd); id = rose.id[i] }
    else {
      voronoi2(c / WIN.cell, r / WIN.cell, WIN.seed, 'l2', out)
      border = Math.min(voronoiBorder2(c / WIN.cell, r / WIN.cell, WIN.seed) * WIN.cell, rd - rr)
      let k = lancetIds.get(out.id)
      if (k === undefined) lancetIds.set(out.id, (k = 19 + lancetIds.size))
      id = k
    }
    border = Math.min(border, -sd - WIN.frame) // the lead also runs round the inside of the frame
    dist[i] = border
    pane[i] = id
    kind[i] = border < 1 ? 2 : border < 2 ? 3 : 4
  }
}
export const windowGeometry = once((): WindowGeo => {
  const n = COLS * TILE.rows, kind = new Uint8Array(n), pane = new Int16Array(n).fill(-1), dist = new Float32Array(n).fill(Infinity)
  const { cx, cy, r } = WIN.rose
  const rose = voronoiSites(ROSE_SITES, TILE, [Math.floor(cx - r), Math.floor(cy - r), Math.ceil(cx + r), Math.ceil(cy + r)])
  const lancetIds = new Map<number, number>()
  const geo = { kind, pane } as WindowGeo
  for (let row = WIN_BOX[1]; row <= WIN_BOX[3]; row++) windowRow(geo, rose, lancetIds, dist, row, WIN_BOX[0], WIN_BOX[2])
  const panes = 19 + lancetIds.size, cls = new Float32Array(panes)
  for (let k = 0; k < panes; k++) { const h = hash01(WIN.seed, k, 7); cls[k] = h < .34 ? .35 : h < .72 ? .6 : .85 }
  // the came's relief: a round profile across the lead, 1.2 high at its centre line; normals by central differences
  const cells: number[] = []
  for (let i = 0; i < n; i++) if (kind[i] === 2) cells.push(i)
  const came = Int32Array.from(cells), nx = new Float32Array(came.length), ny = new Float32Array(came.length), nz = new Float32Array(came.length)
  const h = (i: number) => { const d = dist[i]; return d < 1 ? 1.2 * Math.sqrt(1 - d * d) : 0 }
  for (let k = 0; k < came.length; k++) {
    const i = came[k], gx = (h(i + 1) - h(i - 1)) / 2, gy = (h(i + COLS) - h(i - COLS)) / 2, l = 1 / Math.sqrt(gx * gx + gy * gy + 1)
    nx[k] = -gx * l; ny[k] = -gy * l; nz[k] = l
  }
  // panes on the 1.5 lattice: a dot only where its centre lies on glass (≥ 2 cells from the lead: the moat)
  const lat = new Int16Array(LG15.cols * LG15.rows).fill(-1)
  const ia = Math.floor((WIN_BOX[0] + .5) / L15), ib = Math.ceil((WIN_BOX[2] + .5) / L15), ja = Math.floor((WIN_BOX[1] + .5) / L15), jb = Math.min(LG15.rows - 1, Math.ceil((WIN_BOX[3] + .5) / L15))
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
    const c = Math.round(toCard15(i)), r = Math.round(toCard15(j)), k = r * COLS + c
    if (kind[k] === 4) lat[j * LG15.cols + i] = pane[k]
  }
  return { kind, pane, cls, came, nx, ny, nz, lat, latBox: [ia, ja, ib, jb] }
})
/** The petal of the hour: k o'clock, 0 → 12 at the top (09:41 → petal 9, at 9 o'clock). */
export const hourPetal = (h: number) => Math.floor(h) % 12
/** The sky's gain on the glass: .35 + .65·√(sun elevation's z) by day, .25 at night (the moon). Monotone in the sun's elevation. */
export function skyGain(hour: number, L: Light): number {
  const h = ((hour % 24) + 24) % 24
  if (h < 6 || h >= 18 || !Array.isArray(L)) return .25
  const z = (L as Vec3)[2] / (Math.hypot(...(L as Vec3)) || 1)
  return .35 + .65 * Math.sqrt(Math.max(0, z))
}
/** Lattice cells i … end of one row: each pane cell's value (class × gain, the sun side brighter, the lamp, antique seed) and tone. */
function paneRow(geo: WindowGeo, V: Float32Array, Tn: Uint8Array, A: Float32Array, j: number, i0: number, i1: number, gain: number, lateral: number, lamp: Pt | null, petal: number, pressed: number, night: boolean): void {
  const { lat, cls } = geo, step = .25
  for (let i = i0; i <= i1; i++) {
    const k = j * LG15.cols + i, p = lat[k]
    if (p < 0) continue
    const x = toCard15(i), y = toCard15(j)
    let v = cls[p] * gain * (1 + lateral * (x - 72) / 48)
    if (lamp) { const d = Math.hypot(x - lamp[0], y - lamp[1]); if (d < 20) v += .3 * (1 - d / 20) }
    if (p === pressed) v += step
    // antique glass: seeds on 2×2 lattice blocks, ~6% of them a step down
    if (stbn(i >> 1, j >> 1) < .06) v -= step
    // the hour's petal: red at its own transmittance size, two size steps smaller at night (size contrast, no activeDim)
    if (p === petal) { A[k] = Math.min(1, Math.max(.75, cls[p] * gain + step) - (night ? 2 * step : 0)); continue }
    v = Math.max(0, Math.min(1, v))
    if (v < .06) continue
    V[k] = v; Tn[k] = v < .3 ? 0 : v < .62 ? 1 : 2
  }
}
/** Came glints: mid where phong(light, 30) ≥ .2 on the lead's round top, never brighter. */
function cameGlints(geo: WindowGeo, L: Light, G: Float32Array): void {
  const { came, nx, ny, nz } = geo, point = !Array.isArray(L), at = point ? (L as { at: Vec3 }).at : null
  let lx = 0, ly = 0, lz = 1
  if (!point) { const v = L as Vec3, l = Math.hypot(v[0], v[1], v[2]) || 1; lx = v[0] / l; ly = v[1] / l; lz = v[2] / l }
  for (let k = 0; k < came.length; k++) {
    const i = came[k]
    if (at) { const c = i % COLS, r = (i - c) / COLS, dx = at[0] - c, dy = at[1] - r, dz = at[2] - 1, l = Math.hypot(dx, dy, dz) || 1; lx = dx / l; ly = dy / l; lz = dz / l }
    const ndl = nx[k] * lx + ny[k] * ly + nz[k] * lz
    if (ndl <= 0) continue
    const rv = 2 * ndl * nz[k] - lz // R·V with V = (0, 0, 1)
    if (rv > 0 && rv ** 30 >= .2) G[i] = .5
  }
}
const winScratch = once(() => ({ panes: createRaster(LG15), tones: new Uint8Array(LG15.cols * LG15.rows), petal: createRaster(LG15), glints: createRaster(TILE), frame: createRaster(TILE) }))
/** The stone frame as a chamfer: the inner two cells mid (the reveal catches the light), the outer two faint. */
const frameRaster = once(() => {
  const g = windowGeometry(), r = createRaster(TILE, 'card', WIN_BOX)
  for (let row = WIN_BOX[1]; row <= WIN_BOX[3]; row++) frameRow(g.kind, r.data, row)
  return r
})
function frameRow(kind: Uint8Array, D: Float32Array, row: number): void {
  for (let c = WIN_BOX[0], i = row * COLS + c; c <= WIN_BOX[2]; c++, i++) if (kind[i] === 1) D[i] = lancetSdf(c, row) < -WIN.frame / 2 ? .42 : .24
}
export const matWindow: WidgetPreset = {
  ...tile, id: 'mat-window', name: 'Window', clock: true,
  defaults: { ...LIGHT_DEFAULTS, k: 0 },
  controls: [{ key: 'k', kind: 'button', box: [WIN.x0, 14, WIN.x1 - WIN.x0, WIN.bottom - 14], label: 'Light a pane' }],
  layers: ctx => {
    const g = windowGeometry(), s = winScratch(), now = new Date(), hour = hourOf(now)
    const sky = sceneLight({ data: ctx.data, hour }), gain = skyGain(hour, sky), night = !(hour >= 6 && hour < 18)
    const lateral = Array.isArray(sky) ? .15 * (sky as Vec3)[0] : 0
    const ptr = ctx.pointers?.find(q => q.inside && !q.up), lamp: Pt | null = ptr && !ptr.down ? [ptr.x, ptr.y] : null
    const pressed = ptr && ptr.down && (ctx.data.k ?? 0) >= .5 ? g.pane[Math.round(ptr.y) * COLS + Math.round(ptr.x)] ?? -1 : -1
    s.panes.data.fill(0); s.tones.fill(0); s.petal.data.fill(0); s.glints.data.fill(0)
    const [i0, j0, i1, j1] = g.latBox, petal = hourPetal(now.getHours())
    for (let j = j0; j <= j1; j++) paneRow(g, s.panes.data, s.tones, s.petal.data, j, i0, i1, gain, lateral, lamp, petal, pressed, night)
    s.panes.bounds = s.petal.bounds = g.latBox
    cameGlints(g, matLight(ctx, { torch: { height: 30, falloff: 160 } }), s.glints.data)
    s.glints.bounds = WIN_BOX
    return [
      cite('ROSE · LANCET'),
      surfaceLayer([[frameRaster(), [[.06, .3, 'faint'], [.3, 2, 'mid']]], [s.glints, 'mid']]),
      tonedLayer(s.panes, s.tones, L15),
      { field: sample(s.petal), tone: 'active', lattice: L15, origin: [0, 0] },
    ]
  },
}

export const glassHooks = { LENS, lensCentre, lensRim, lensHero, lensLUT, apparent, windowGeometry, hourPetal, skyGain, lancetSdf, ROSE_SITES }
