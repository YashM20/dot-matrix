/**
 * Board — LIGHT: the P3 Raster light stack on TILE cards (MASTER-PLAN §3.8).
 * Geometry is a signed distance → cached height + normal rasters; per frame only the light moves
 * (`lambert` / `phong`, one dot product per lattice dot). The lit surface sits on a 2× lattice so the
 * relief reads as big dots, and its tone is split into bands (faint → mid → idle, `value` for the
 * gloss), never one grey ramp. Red only on the ON AIR sign (emissive = live).
 */
import { blur, outline, rasterize, sample, type Raster } from '../../engine/raster'
import { bloom, heightRaster, illuminate, lambert, lightDir, normalRaster, phong, sdfBox, sdfCircle, sdfRing, sdfSubtract, sdfUnion, stackHeights, torch, type Light } from '../../engine/light'
import { latticeGrid } from '../../engine/sampler/gridSampler'
import { smoothstep } from '../../engine/math'
import type { Field, Layer, Tone } from '../../engine/types'
import { TILE, dim, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'

const T = layoutFor(TILE)
/** The lit surfaces' lattice: 2 card cells per dot, anchored at the card origin (72 × 72 dots). */
const K = 2, LG = latticeGrid(TILE, K), LAT = T.lattice(K, 0, 0)
/** Card cell → lattice cell (the inverse of the sampler's lattice centre mapping). */
const toLat = (c: number) => (c + .5) / K - .5
const BODY = { lattice: 1.3 }

/**
 * Tone bands of one lit field: each band is its own layer, so the shadow side drops to faint and the
 * lit side climbs to idle. Values outside a band are 0 there (the bands never overlap).
 */
const BANDS: [number, number, Tone][] = [[.06, .3, 'faint'], [.3, .62, 'mid'], [.62, 2, 'idle']]
function banded(f: Field, bands = BANDS): Layer[] {
  return bands.map(([lo, hi, tone]) => {
    const g: Field = (u, v) => { const x = f(u, v); return x >= lo && x < hi ? x : 0 }
    g.bounds = f.bounds
    return layer(LAT.at(g), tone)
  })
}
/** Gloss: the specular highlight drawn two quantize steps (+.5) above the diffuse dot under it, in `value`. */
function gloss(diffuse: Field, specular: Field, from = .12): Layer {
  const g: Field = (u, v) => { const s = specular(u, v); return s < from ? 0 : Math.min(1, diffuse(u, v) + .5 * smoothstep(from, .7, s)) }
  g.bounds = specular.bounds
  return layer(LAT.at(g), 'value')
}

// ── TORCH ───────────────────────────────────────────────────────────────────
// A round power button: a domed plate with the power glyph raised out of it. The pointer is a torch
// held over the card; without one the torch circles slowly. Keyboard: the XY control parks it.
const BTN = { cx: 35.75, cy: 37.5, r: 27 }
const glyph = sdfUnion(
  sdfSubtract(sdfRing(LG, BTN.cx, BTN.cy + 1.5, 12.5, 2.3), sdfBox(LG, BTN.cx, BTN.cy - 10, 5.6, 6)),
  sdfBox(LG, BTN.cx, BTN.cy - 6, 2.3, 8.5, 2.3),
)
const PLATE = heightRaster(sdfCircle(LG, BTN.cx, BTN.cy, BTN.r), { shape: 'round', width: 7, height: 5 }, LG)
/** A one-dot contour just outside the plate, so the button keeps its edge on the side the torch leaves dark. */
const RIM = dim(sample(outline({ ...PLATE, data: PLATE.mask }, 1, { side: 'outer' })), .45)
const BUTTON = (() => {
  const plate = PLATE
  const raised = heightRaster(glyph, { shape: 'round', width: 2.3, height: 3 }, LG)
  return normalRaster(stackHeights(plate, raised))
})()
function torchLight(ctx: WidgetContext): { light: Light; at: [number, number] } {
  const p = ctx.pointers?.find(q => q.inside && !q.up)
  let x: number, y: number
  if (p) { x = toLat(p.x); y = toLat(p.y) }
  else if (ctx.focus === 'lx') { x = ctx.data.lx * (LG.cols - 1); y = (1 - ctx.data.ly) * (LG.rows - 1) }
  else { const a = ctx.t * .45 - 2.2; x = BTN.cx + 22 * Math.sin(a); y = BTN.cy - 22 * Math.cos(a) }
  return { light: torch(x, y, 22, 160), at: [x, y] }
}
const TORCH_BANDS: [number, number, Tone][] = [[.08, .4, 'faint'], [.4, .8, 'mid'], [.8, 2, 'idle']]
export const lightTorch: WidgetPreset = {
  id: 'light-torch', name: 'Torch', group: 'composite', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  defaults: { lx: .3, ly: .7 },
  controls: [{ key: 'lx', keyY: 'ly', kind: 'xy', box: [16, 18, 112, 112], label: 'Torch position' }],
  layers: ctx => {
    const { light } = torchLight(ctx), { diffuse, specular } = illuminate(BUTTON, light, { ambient: .04, shininess: 24 })
    // the flat face sits in the mid band; only slopes turned to the torch climb to idle, the far ones fall to faint
    return [layer(LAT.at(RIM), 'mid'), ...banded(diffuse, TORCH_BANDS), gloss(diffuse, specular, .35)]
  },
}

// ── ORB ─────────────────────────────────────────────────────────────────────
// A gloss sphere under a slow sun (the board-wide light direction idea): Lambert body in three bands,
// the Phong highlight two size steps up, and a soft contact shadow cut out of a faint floor.
const ORB = { cx: 35.75, cy: 33, r: 21 }
const SPHERE = normalRaster(heightRaster(sdfCircle(LG, ORB.cx, ORB.cy, ORB.r), { width: ORB.r }, LG))
/** The orb's own coverage: the floor never shows through its dark underside. */
const BODY_MASK = sample({ ...SPHERE, data: SPHERE.mask })
const sun = (t: number) => lightDir(-.95 + .55 * Math.sin(t * .35), .78)
/** Floor: a pool of dots under the orb, fading out to the sides (a table top seen at a low angle). */
const floorDots: Field = (u, v) => {
  const x = u * (LG.cols - 1) - ORB.cx, y = v * (LG.rows - 1) - 59.5, e = Math.sqrt((x / 33) ** 2 + (y / 6.5) ** 2)
  return e > 1 ? 0 : .62 * (1 - smoothstep(.55, 1, e))
}
floorDots.bounds = [0, 52, LG.cols - 1, 67]
function contactShadow(L: readonly [number, number, number]): Field {
  // the shadow slides away from the sun along the floor; its blur is precomputed per quantized offset
  const dx = Math.round(-L[0] / Math.max(.2, L[2]) * 6)
  let f = shadows.get(dx)
  if (!f) {
    const s = rasterize((u, v) => { const x = u * (LG.cols - 1) - ORB.cx - dx, y = v * (LG.rows - 1) - 55; return (x / 13) ** 2 + (y / 3) ** 2 <= 1 ? 1 : 0 }, LG)
    shadows.set(dx, (f = sample(blurred(s))))
  }
  return f
}
const shadows = new Map<number, Field>()
const blurred = (r: Raster) => { const b = blur(r, 2.5); for (let i = 0; i < b.data.length; i++) b.data[i] = Math.min(1, b.data[i] * 1.5); return b }
export const lightOrb: WidgetPreset = {
  id: 'light-orb', name: 'Orb', group: 'composite', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  layers: ({ t }) => {
    const L = sun(t), diffuse = lambert(SPHERE, L, { ambient: .16 }), specular = phong(SPHERE, L, [0, 0, 1], 60)
    const shadow = contactShadow(L), floor: Field = (u, v) => floorDots(u, v) * (1 - shadow(u, v)) * (1 - BODY_MASK(u, v))
    floor.bounds = floorDots.bounds
    return [layer(LAT.at(floor), 'mid'), ...banded(diffuse), gloss(diffuse, specular, .3)]
  },
}

// ── ON AIR ──────────────────────────────────────────────────────────────────
// Emissive: the sign's letters are the accent, their bloom (blurred on the letters' own lattice, a
// one-dot moat cut out) glows around them in activeDim and breathes slowly, like a lamp warming.
const SIGN = { k: 1.6, text: 'ON AIR', y: 52 }
const SIGN_LAT = T.lattice(SIGN.k, 0, 0), SG = latticeGrid(TILE, SIGN.k)
const SIGN_W = T.size(SIGN.text, { smooth: true })[0], SIGN_X = Math.round((SG.cols - SIGN_W) / 2), SIGN_Y = Math.round(SIGN.y / SIGN.k)
const letters = SIGN_LAT.text(SIGN.text, SIGN_X, SIGN_Y, { smooth: true })
const GLOW_R = bloom(rasterize(letters, SG), 4.5, { strength: 1, gap: 1 })
// a lamp's halo falls off slower than a gaussian: lift the tail so the outer dots still read
for (let i = 0; i < GLOW_R.data.length; i++) GLOW_R.data[i] = GLOW_R.data[i] ** .7
const GLOW = sample(GLOW_R)
/** The sign's frame: a dotted rounded rectangle on the card pitch, in mid. */
const frame = (() => {
  const x0 = 10, y0 = 34, w = 124, h = 62, r = 10, spacing = 3.3, pts: [number, number][] = []
  const straightW = w - 2 * r, straightH = h - 2 * r, per = 2 * (straightW + straightH) + 2 * Math.PI * r, n = Math.round(per / spacing), step = per / n
  for (let i = 0; i < n; i++) {
    let d = i * step
    const seg = (len: number) => { const hit = d < len; if (!hit) d -= len; return hit }
    if (seg(straightW)) { pts.push([x0 + r + d, y0]); continue }
    if (seg(Math.PI * r / 2)) { const a = d / r; pts.push([x0 + w - r + r * Math.sin(a), y0 + r - r * Math.cos(a)]); continue }
    if (seg(straightH)) { pts.push([x0 + w, y0 + r + d]); continue }
    if (seg(Math.PI * r / 2)) { const a = d / r; pts.push([x0 + w - r + r * Math.cos(a), y0 + h - r + r * Math.sin(a)]); continue }
    if (seg(straightW)) { pts.push([x0 + w - r - d, y0 + h]); continue }
    if (seg(Math.PI * r / 2)) { const a = d / r; pts.push([x0 + r - r * Math.sin(a), y0 + h - r + r * Math.cos(a)]); continue }
    if (seg(straightH)) { pts.push([x0, y0 + h - r - d]); continue }
    const a = d / r; pts.push([x0 + r - r * Math.cos(a), y0 + r - r * Math.sin(a)])
  }
  return T.dots(pts, 1.5)
})()
export const lightOnAir: WidgetPreset = {
  id: 'light-on-air', name: 'On Air', group: 'composite', chrome: 'dots', animated: true, grid: TILE, style: tileStyle,
  layers: ({ t }) => [
    layer(frame, 'mid'),
    layer(SIGN_LAT.at(dim(GLOW, .78 + .14 * Math.sin(t * 1.7))), 'activeDim'),
    layer(SIGN_LAT.at(letters), 'active'),
    layer(T.big('STUDIO 2', 72, 116, { ...BODY, align: 'center' }), 'idle'),
  ],
}

export const lightBoard = [lightTorch, lightOrb, lightOnAir]