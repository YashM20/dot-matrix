/**
 * WORKSHOP, drying mud (docs/living-matter/X-advanced.md #3, the mud-crack variant): a slab of wet clay dries and
 * cracks into polygons. The cracks open one after another (`engine/matter/mudcrack.ts`), each from a crack already
 * there to the next one or the edge, so they meet in T-junctions. The crack opening now is the card's one red. The
 * clay is lit through M1's relief: each polygon curls up at its edges as it dries, so the crack lips catch the light,
 * and the wet slab's sheen fades as it dries. Then rain closes the cracks, newest first, and a new slab dries.
 */
import { mudCracks, type Mud } from '../../engine/matter/mudcrack'
import { tonedLayer } from '../../engine/matter'
import { normalRaster, type HeightRaster } from '../../engine/light/height'
import { illuminate, type Light, type Vec3 } from '../../engine/light/shade'
import { stbn } from '../../engine/halftone/mask'
import { hash32 } from '../../engine/math'
import { createRaster, type Raster } from '../../engine/raster/raster'
import type { CellBounds } from '../../engine/types'
import { layer, TILE, type WidgetPreset } from '../types'
import { cite, fnvBytes, LIGHT_DEFAULTS, lightKey, lru, matLight, mod, once, snapTorch, T, tile, type Pt } from './materials-shared'

const COLS = TILE.cols, N = COLS * TILE.rows
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
/** The slab (card cells, corner radius), the loop's parts (seconds: drying, dry, rain), cracks a slab, the offset. */
export const MUD = { box: [6, 15, 137, 130] as CellBounds, r: 7, dry: 9, hold: 2.5, rain: 1.5, cracks: 34, offset: 4.4, seed: 61 }
const CYCLE = MUD.dry + MUD.hold + MUD.rain
const slabSdf = (x: number, y: number) => {
  const [x0, y0, x1, y1] = MUD.box, r = MUD.r, qx = Math.abs(x - (x0 + x1) / 2) - ((x1 - x0) / 2 - r), qy = Math.abs(y - (y0 + y1) / 2) - ((y1 - y0) / 2 - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}
const slab = once(() => {
  const m = new Uint8Array(N), [x0, y0, x1, y1] = MUD.box
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (slabSdf(x, y) <= -.5) m[y * COLS + x] = 1
  return m
})
const muds = lru<Mud>(2)
/** Cycle c's slab, its cracks laid out (lazily, once a cycle). */
export const mudOf = (c: number) => muds(`${c}`, () => mudCracks({ cols: COLS, rows: TILE.rows, mask: slab(), seed: hash32(MUD.seed, c), cracks: MUD.cracks }))

/** The frame at t: the cycle, cells open, how dry (0 … 1), and whether it is raining. */
export function mudAt(t: number): { c: number; open: number; dry: number; phase: 'drying' | 'dry' | 'rain' } {
  const u = t + MUD.offset, c = Math.floor(u / CYCLE), p = mod(u, CYCLE), m = mudOf(c), M = m.order.length
  if (p < MUD.dry) return { c, open: Math.floor(M * p / MUD.dry), dry: p / MUD.dry, phase: 'drying' }
  if (p < MUD.dry + MUD.hold) return { c, open: M, dry: 1, phase: 'dry' }
  return { c, open: Math.floor(M * (1 - (p - MUD.dry - MUD.hold) / MUD.rain)), dry: 1, phase: 'rain' }
}
/** Cracks wholly open among the first `open` cells. */
const whole = (m: Mud, open: number) => { let k = 0; while (k < m.count && m.start[k + 1] <= open) k++; return k }

// ── relief: the slab with its first k cracks, the polygons curled up at their edges ─────────────────────────
interface Relief { n: ReturnType<typeof normalRaster>; crack: Uint8Array }
const reliefs = lru<Relief>(4)
function relief(m: Mud, c: number, k: number): Relief {
  return reliefs(`${c}|${k}`, () => {
    const s = slab(), crack = new Uint8Array(N), d = new Float32Array(N).fill(1e9)
    for (let q = 0; q < m.start[k]; q++) { crack[m.order[q]] = 1; d[m.order[q]] = 0 }
    // distance to the nearest crack (or the slab's edge): a two-pass chamfer, 1 and 1.4
    const [x0, y0, x1, y1] = MUD.box
    for (let y = y0; y <= y1; y++) for (let x = x0, i = y * COLS + x; x <= x1; x++, i++) {
      if (!s[i]) { d[i] = 0; continue }
      d[i] = Math.min(d[i], d[i - 1] + 1, d[i - COLS] + 1, d[i - COLS - 1] + 1.4, d[i - COLS + 1] + 1.4)
    }
    for (let y = y1; y >= y0; y--) for (let x = x1, i = y * COLS + x; x >= x0; x--, i--) {
      if (!s[i]) continue
      d[i] = Math.min(d[i], d[i + 1] + 1, d[i + COLS] + 1, d[i + COLS + 1] + 1.4, d[i + COLS - 1] + 1.4)
    }
    const h: HeightRaster = { ...createRaster(TILE, 'card', MUD.box), mask: new Float32Array(N) }
    for (let y = y0; y <= y1; y++) for (let x = x0, i = y * COLS + x; x <= x1; x++, i++) {
      if (!s[i]) continue
      h.mask[i] = 1
      if (crack[i]) { h.data[i] = -1; continue }
      // the curl: a polygon's rim stands up to 2.2 over its middle, over ~3 cells; grit .18
      const e = d[i] / 3
      h.data[i] = 1.6 + 2.2 / (1 + e * e) + .18 * stbn(x, y, 11)
    }
    return { n: normalRaster(h), crack }
  })
}
const lits = lru<{ D: Float32Array; P: Float32Array }>(6)
function litOf(c: number, k: number, r: Relief, L: Light) {
  return lits(`${c}|${k}|${lightKey(L)}`, () => {
    const d = createRaster(TILE), p = createRaster(TILE)
    illuminate(r.n, L, { ambient: .1, shininess: 28, into: d, intoSpecular: p })
    return { D: d.data, P: p.data }
  })
}

function shade(m: Mud, r: Relief, l: { D: Float32Array; P: Float32Array }, L: Light, wet: number, open: number, k: number): { values: Raster; tones: Uint8Array; red: Pt[] } {
  const values = createRaster(TILE, 'card', MUD.box), tones = new Uint8Array(N), V = values.data, s = slab(), red: Pt[] = []
  const dir = Array.isArray(L) ? L as Vec3 : null, Lz = dir ? dir[2] / (Math.hypot(dir[0], dir[1], dir[2]) || 1) : .8, gain = .8 / Math.max(.1, Lz)
  // the crack opening now: red; the cells it has not reached yet are still mud
  const live = new Uint8Array(N)
  for (let q = m.start[k]; q < open; q++) { live[m.order[q]] = 1; red.push([m.order[q] % COLS, (m.order[q] / COLS) | 0]) }
  const [x0, y0, x1, y1] = MUD.box
  for (let y = y0; y <= y1; y++) for (let x = x0, i = y * COLS + x; x <= x1; x++, i++) {
    if (!s[i] || r.crack[i] || live[i]) continue
    const b = Math.min(1, l.D[i] * gain)
    // the wet sheen: the specular spot in value while the slab is wet
    if (wet > 0 && l.P[i] * wet >= .2 && b >= .3) { V[i] = 1; tones[i] = VALUE; continue }
    if (b < .08 || stbn(x, y, 6) < .32) continue
    if (b < .32) { V[i] = Math.max(.14, b); tones[i] = FAINT } else if (b < .66) { V[i] = b; tones[i] = MID } else { V[i] = .62 + .3 * (b - .66) / .34; tones[i] = IDLE }
  }
  return { values, tones, red }
}

export const matMud: WidgetPreset = {
  ...tile, id: 'mat-mud', name: 'Mud',
  credit: { by: ['Steffen Bohn', 'Ludovic Pauchard', 'Yves Couder'], title: 'Hierarchical crack pattern as formed by successive domain divisions (2005)', source: 'https://doi.org/10.1103/PhysRevE.71.046214', note: 'the order the cracks form in' },
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const f = mudAt(ctx.reducedMotion ? 0 : ctx.t), m = mudOf(f.c), k = whole(m, f.open)
    const L = snapTorch(matLight(ctx, { torch: { height: 36, falloff: 160 } }), 6), r = relief(m, f.c, k)
    const out = shade(m, r, litOf(f.c, k, r, L), L, Math.max(0, 1 - 2.2 * f.dry), f.open, f.phase === 'drying' ? k : m.count)
    return [
      cite('T-JUNCTIONS'),
      tonedLayer(out.values, out.tones),
      ...(out.red.length ? [layer(T.dots(out.red, 1), 'active')] : []),
      layer(T.text(`${k} CRACKS`, 6, 135), 'faint'),
      layer(T.text(f.phase === 'drying' ? 'DRYING' : f.phase === 'dry' ? 'DRY' : 'RAIN', 138, 135, { align: 'right' }), 'faint'),
    ]
  },
}

/** Cycle c's cracks as one hash of their cells and starts (Node and Chrome must agree, bit for bit). */
export const mudHash = (c: number) => fnvBytes(mudOf(c).order, fnvBytes(mudOf(c).start))
if (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search)) (globalThis as { __mud?: unknown }).__mud = { hash: mudHash }

export const mudHooks = { MUD, mudOf, mudAt, slab, mudHash }
