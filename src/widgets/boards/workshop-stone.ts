/**
 * WORKSHOP, the erosion stone (docs/living-matter/X-advanced.md #11, phase XM): the time in raised sandstone digits,
 * worn by rain through the day. Droplet hydraulic erosion (`engine/matter/erosion.ts`) runs on the stone's height
 * raster: RAIN.perMinute droplets for every minute since midnight, in one seeded order, so the stone at a minute is
 * a pure function of the minute. A digit is cut afresh when it changes, so each one has stood in the rain since its
 * last change: the minute's digit is crisp (and red, the card's live part), the hour's has had up to an hour of rain,
 * the colon all day. Erodibility is capped inside the glyphs so the digits still read at 23:59.
 *
 * Replays are checkpointed (every 2,000 droplets, plus the last minute shown): a new minute runs only its own
 * droplets, and a jump back starts from the nearest checkpoint below it.
 */
import { ambientOcclusion, cardMask, heightFromField, insetDistance, tonedLayer } from '../../engine/matter'
import { rain, EROSION, type ErosionParams, type Terrain } from '../../engine/matter/erosion'
import { heightRaster, normalRaster } from '../../engine/light/height'
import { illuminate, type Vec3 } from '../../engine/light/shade'
import { fbm2 } from '../../engine/noise/gradient'
import { stbn } from '../../engine/halftone/mask'
import { createRaster, type Raster } from '../../engine/raster/raster'
import type { CellBounds } from '../../engine/types'
import { TILE, layer, type WidgetPreset } from '../types'
import { cite, fnvBytes, L15, LG15, LIGHT_DEFAULTS, lightKey, lru, matLight, mod, once, pad2, snapTorch, T, tile, toCard15, toLattice15, type Pt } from './materials-shared'

const LC = LG15.cols, LR = LG15.rows
const FAINT = 0, MID = 1, IDLE = 2, VALUE = 3
/**
 * The block (1.5-lattice cells), the digits' row and lattice (card cells), rain per minute, the seed, the brush,
 * how soft a glyph is against the open stone, the checkpoint spacing (droplets), and the slope rain runs down.
 */
export const STONE = { box: [3, 10, 92, 86] as CellBounds, row: 48, k: 2, relief: 1.3, soft: .3, ck: 2000, slope: .03, seed: 1409 }
export const RAIN: ErosionParams & { perMinute: number } = { ...EROSION, radius: 2, capacity: 8, erode: .5, lifetime: 40, perMinute: 6 }
/** Where rain falls and runs: the face inside its arris (the rounded edge sheds water, it isn't carved by it). */
const RAIN_BOX: CellBounds = [STONE.box[0] + 3, STONE.box[1] + 3, STONE.box[2] - 3, STONE.box[3] - 3]
/** The four digit slots of `HH:MM` (indices into the string) and the colon. */
const SLOTS = [0, 1, 3, 4] as const

/** The stone before any cut: a block whose face falls gently toward its foot, sandstone bedding and grain. */
const baseStone = once(() => {
  const h = new Float32Array(LC * LR), [x0, y0, x1, y1] = STONE.box
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const bed = .34 * fbm2(x / 18, y / 2.8, 3, 71) + .1 * fbm2(x / 5, y / 5, 2, 73)
    // a dressed arris: the face rounds over in its outer 3 cells
    const e = Math.min(1, (Math.min(x - x0, x1 - x, y - y0, y1 - y) + .5) / 3), bev = Math.sqrt(e * (2 - e))
    h[y * LC + x] = 3 + STONE.slope * (y1 - y) + bed - .9 * (1 - bev) + .05 * stbn(x, y, 6)
  }
  return h
})
/** The block's cells (1) on the lattice. */
const blockMask = once(() => {
  const m = createRaster(LG15), [x0, y0, x1, y1] = STONE.box
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.data[y * LC + x] = 1
  m.bounds = [...STONE.box] as CellBounds
  return m
})
/** Card-cell left edge of string index i of `HH:MM` (smooth glyphs advance 12 font pixels). */
const slotX = (i: number) => 72 - (5 * 12 - 2) * STONE.k / 2 + i * 12 * STONE.k
/** Slot i's box on the lattice: the whole glyph cell (smooth: 10 × 14 dots of k cells) and 2 cells round it, so a new
 * digit dresses away every trace of the old one. */
function slotBox(i: number): CellBounds {
  const x0 = slotX(i), x1 = x0 + 10 * STONE.k, y0 = STONE.row, y1 = y0 + 14 * STONE.k
  return [Math.floor((x0 + .5) / L15) - 2, Math.floor((y0 + .5) / L15) - 2, Math.ceil((x1 + .5) / L15) + 1, Math.ceil((y1 + .5) / L15) + 1]
}
/** One glyph as raised relief on the lattice: its height (0 off it) and its 1.5-lattice mask. Cached per character. */
const glyphs = new Map<string, { h: Float32Array; m: Raster; box: CellBounds }>()
function glyph(ch: string, i: number) {
  const key = `${ch}|${i}`, hit = glyphs.get(key)
  if (hit) return hit
  const m = toLattice15(cardMask(T.big(ch, slotX(i), STONE.row, { lattice: STONE.k, smooth: true, mask: true }), TILE))
  const hr = heightRaster(insetDistance(m), { shape: 'round', width: 1.4, height: STONE.relief })
  const g = { h: Float32Array.from(hr.data, (v, j) => (hr.mask[j] > 0 ? v : 0)), m, box: slotBox(i) }
  glyphs.set(key, g)
  return g
}
/** The time at minute m of the day as `HH:MM`. */
export const hhmm = (m: number) => `${pad2(Math.floor(m / 60) % 24)}:${pad2(m % 60)}`
/** Cut string index i of `s` afresh: its slot dressed back to the pristine stone, the glyph raised on it, made hard. */
function cut(t: Terrain, s: string, i: number): void {
  const g = glyph(s[i], i), base = baseStone(), [c0, r0, c1, r1] = g.box
  for (let y = r0; y <= r1; y++) for (let x = c0; x <= c1; x++) {
    const j = y * LC + x
    t.h[j] = base[j] + g.h[j]; t.soft![j] = g.m.data[j] ? STONE.soft : 1
  }
}

interface Stone { m: number; t: Terrain }
const checkpoints = new Map<number, Float32Array[]>()
let last: Stone | null = null
const fresh = (): Stone => {
  const t: Terrain = { cols: LC, rows: LR, h: Float32Array.from(baseStone()), soft: new Float32Array(LC * LR).fill(1), region: RAIN_BOX }
  const s = hhmm(0)
  for (const i of [...SLOTS, 2]) cut(t, s, i)
  return { m: 0, t }
}
const MIN_PER_CK = Math.round(STONE.ck / RAIN.perMinute)
/** Advance a stone one minute: that minute's rain, then the digits that change cut afresh. */
function minuteOn(s: Stone): void {
  rain(s.t, s.m * RAIN.perMinute, (s.m + 1) * RAIN.perMinute, STONE.seed, RAIN)
  const a = hhmm(s.m), b = hhmm(s.m + 1)
  s.m++
  for (const i of SLOTS) if (a[i] !== b[i]) cut(s.t, b, i)
  if (s.m % MIN_PER_CK === 0 && !checkpoints.has(s.m)) checkpoints.set(s.m, [Float32Array.from(s.t.h), Float32Array.from(s.t.soft!)])
}
/** The stone at minute m of the day (0 … 1439): from the last one shown, or the nearest checkpoint below. */
export function stoneAt(m: number): Stone {
  if (last && last.m === m) return last
  let s: Stone
  if (last && last.m < m && m - last.m <= MIN_PER_CK) s = last
  else {
    let best = 0
    for (const k of checkpoints.keys()) if (k <= m && k > best) best = k
    s = fresh()
    const c = checkpoints.get(best)
    if (c) { s.t.h.set(c[0]); s.t.soft!.set(c[1]); s.m = best }
  }
  while (s.m < m) minuteOn(s)
  last = s
  return s
}
/** Forget every replay (checks: a cold day). */
export function stoneReset(): void { checkpoints.clear(); last = null }

/** Lattice cells under the red minute digit (cleared on the stone) and its dots (card cells). */
function minuteDigit(s: string) {
  // the glyph's lattice dots (smooth: 10 × 14), each lit where its k × k card cells are
  const lf = T.big(s[4], slotX(4), STONE.row, { lattice: STONE.k, smooth: true, mask: true }), dots: Pt[] = [], m = cardMask(lf, TILE), [ox, oy] = lf.origin!, k = STONE.k
  for (let ly = 0; ly < 14; ly++) for (let lx = 0; lx < 10; lx++) {
    const cx = ox + (lx + .5) * k - .5, cy = oy + (ly + .5) * k - .5
    if (m.data[Math.round(cy) * TILE.cols + Math.round(cx)]) dots.push([cx, cy])
  }
  const g = glyph(s[4], 4), clear = new Uint8Array(LC * LR), [a0, b0, a1, b1] = g.box
  for (let y = b0; y <= b1; y++) for (let x = a0; x <= a1; x++) {
    let near = false
    for (const [px, py] of dots) if (Math.abs(toCard15(x) - px) < 1.9 && Math.abs(toCard15(y) - py) < 1.9) { near = true; break }
    if (near) clear[y * LC + x] = 1
  }
  return { dots, clear }
}
/** The lit stone for one minute and light (LRU of 4). */
const lits = lru<{ values: Raster; tones: Uint8Array; dots: Pt[] }>(4)
const dif = once(() => [createRaster(LG15), createRaster(LG15)])
function litStone(m: number, L: ReturnType<typeof matLight>) {
  return lits(`${m}|${lightKey(L)}`, () => {
    const st = stoneAt(m), raster = createRaster(LG15)
    raster.data.set(st.t.h)
    const hr = heightFromField(raster, LG15, { scale: 1, mask: blockMask() }), n = normalRaster(hr), ao = ambientOcclusion(hr, { radius: 2.5, strength: .75 })
    const [D, S] = dif()
    illuminate(n, L, { ambient: .06, shininess: 8, into: D, intoSpecular: S })
    const { dots, clear } = minuteDigit(hhmm(m))
    const values = createRaster(LG15, 'card', STONE.box), tones = new Uint8Array(LC * LR), V = values.data, A = ao.data, B = baseStone(), H = st.t.h, SO = st.t.soft!
    const Ld = Array.isArray(L) ? L as Vec3 : [0, 0, 1], Lz = Ld[2] / (Math.hypot(Ld[0], Ld[1], Ld[2]) || 1), gain = .55 / Math.max(.08, Lz)
    const [x0, y0, x1, y1] = STONE.box
    for (let y = y0; y <= y1; y++) for (let x = x0, i = y * LC + x; x <= x1; x++, i++) {
      if (clear[i]) continue
      // a digit's raised face stands out of the stone's own shadow: a band up while it is still proud (.55 cells)
      const proud = SO[i] < 1 && H[i] - B[i] > .55 ? 1.45 : 1, b = Math.min(1.2, Math.max(0, D.data[i] - .03) * gain * proud) * A[i]
      // sandstone: grain voids (blue noise) on the open face; lit walls a band up, the sun's glint in value
      if (b < .1 || (b < .5 && stbn(x, y, 2) < .18)) continue
      if (b < .32) { V[i] = .24; tones[i] = FAINT } else if (b < .66) { V[i] = .5; tones[i] = MID } else if (b < .95) { V[i] = .8; tones[i] = IDLE } else { V[i] = 1; tones[i] = VALUE }
    }
    return { values, tones, dots }
  })
}
/** This minute's rain, traced (the droplets the next minute runs, on a copy): paths in card cells. */
const traces = lru<Pt[][]>(2)
function rainPaths(m: number): Pt[][] {
  return traces(`${m}`, () => {
    const st = stoneAt(m), t: Terrain = { ...st.t, h: Float32Array.from(st.t.h), soft: Float32Array.from(st.t.soft!) }, out: Pt[][] = []
    rain(t, m * RAIN.perMinute, (m + 1) * RAIN.perMinute, STONE.seed, RAIN, (d, x, y) => { (out[d - m * RAIN.perMinute] ??= []).push([toCard15(x), toCard15(y)]) })
    return out.filter(p => p && p.length > 4)
  })
}
/** The drops running now: each path takes 1.6 s, one starting every .6 s; a head and two trailing dots. */
function drops(paths: Pt[][], t: number): Pt[] {
  const out: Pt[] = []
  if (!paths.length) return out
  for (let j = 0; j < paths.length; j++) {
    const p = paths[j], a = mod(t - j * .6, paths.length * .6) / 1.6
    if (a >= 1) continue
    const q = Math.floor(a * (p.length - 1))
    for (let k = 0; k < 3 && q - k >= 0; k++) out.push(p[q - k])
  }
  return out
}
export const matErosion: WidgetPreset = {
  ...tile, id: 'mat-erosion', name: 'Erosion', clock: true,
  credit: { by: ['Hans Theobald Beyer'], title: 'Implementation of a method for hydraulic erosion', source: 'https://www.firespark.de/resources/downloads/implementation%20of%20a%20methode%20for%20hydraulic%20erosion.pdf', note: 'the droplet model' },
  defaults: { ...LIGHT_DEFAULTS },
  layers: ctx => {
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes()
    const L = snapTorch(matLight(ctx, { lattice: L15, torch: { height: 18, falloff: 110 }, rake: true }), 2)
    const lit = litStone(m, L), d = ctx.reducedMotion ? [] : drops(rainPaths(m), ctx.t)
    return [
      cite('BEYER 2015'),
      tonedLayer(lit.values, lit.tones, L15),
      ...(d.length ? [layer(T.dots(d, .8), 'value')] : []),
      layer(T.dots(lit.dots, 1.6), 'active'),
      layer(T.text(`${(m * RAIN.perMinute).toLocaleString('en-US')} DROPS`, 6, 135), 'mid'),
      layer(T.text('SANDSTONE', 138, 135, { align: 'right' }), 'mid'),
    ]
  },
}

/** The stone at minute m as one hash of its heights (Node and Chrome must agree, bit for bit). */
export const stoneHash = (m: number) => fnvBytes(stoneAt(m).t.h)
if (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search)) (globalThis as { __stone?: unknown }).__stone = { hash: stoneHash }

export const stoneHooks = { STONE, RAIN, baseStone, glyph, hhmm, stoneAt, stoneReset, rainPaths, minuteDigit, slotX, stoneHash }
