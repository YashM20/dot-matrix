/**
 * 01 KOI (docs/living-matter/L-pond.md §L1 "Card pond-koi"): six koi in a pond of glyph tiles.
 * Wave-equation water draws its slopes as line glyphs, crests as '=', calm water as a few twinkling dots; the bank is
 * Voronoi stones in density glyphs; koi swim by burst and glide on argonaut spines, their interiors as lattice-4
 * dots (style B, the L1.0 default) with glyph-matched edges; three lily pads drift over them. The one accent is the
 * koi's red markings. Tap to feed (pellets land with ripples, nearby koi startle), hold still to make them curious,
 * hold a press to lure them. Pristine and looped (48 s) until touched; heals back 4 s after the last input,
 * once the food is gone and the loop seam is not near (#90); the koi swim back to their places over 6 s.
 * X1 #5: the pond of the day (`day`: the koi's varieties, the pads, the weather) and the ageing pond (`age`, opt-in:
 * fry hatch every 10 days of visits and grow by von Bertalanffy); day 0, age 0 is the canonical pond the goldens pin.
 */
import { ELIAS_WATER } from '../../creditSources'
import { createKoiPond, createTileRaster, drawKoiPond, KOI_TYPE_TILES, koiView, pelletViews, pondGlobals, tileLayers, type KoiDrawOpts, type KoiPond, type KoiPondSpec, type TileGrid } from '../../../engine/life'
import { sceneLight } from '../../../engine/light/input'
import { dexp, ihash } from '../../../engine/noise/dmath'
import { noise2 } from '../../../engine/noise/gradient'
import type { KoiKind } from '../../../engine/life'
import { worldAt } from '../../../engine/physics/world'
import type { Layer } from '../../../engine/types'
import { simAtStep } from '../../../engine/sim/sim'
import { sampleLayers } from '../../../engine/sampler/gridSampler'
import { dot480 } from '../../../engine/theme/tokens'
import type { WidgetContext, WidgetPreset } from '../../types'
import { caption, frameOf, hourNow, mainThread, T, tile, timeOfDay, touch } from './shared'

/** Tiles: 36 × 33 at pitch 4 from card row 11 (a glyph is 3 dots + a 1-cell gutter). The ripple grid is the tile grid. */
export const KOI_TILES: TileGrid = { cols: 36, rows: 33, pitch: 4, ox: 0, oy: 11 }
const ROCKS: [number, number, number][] = [[28, 118, 9], [121, 30, 7]]
/** Pond SDF in card cells (< 0 = water): a superellipse (|x−72|/66)⁴ + (|y−77|/62)⁴ − 1 (× 30), minus two rocks. */
export function koiSdf(x: number, y: number): number {
  const ex = (x - 72) / 66, ey = (y - 77) / 62, e2 = ex * ex, f2 = ey * ey
  let d = (e2 * e2 + f2 * f2 - 1) * 30
  for (const [cx, cy, r] of ROCKS) { const dx = x - cx, dy = y - cy, k = r - Math.sqrt(dx * dx + dy * dy); if (k > d) d = k }
  return d
}
export const KOI_SPEC: KoiPondSpec = {
  seed: 480, tiles: KOI_TILES, card: { cols: 144, rows: 144 }, sdf: koiSdf,
  koi: [{ kind: 'kohaku', length: 46 }, { kind: 'kohaku', length: 43 }, { kind: 'sanke', length: 41 }, { kind: 'kohaku', length: 40 }, { kind: 'showa', length: 44 }, { kind: 'tancho', length: 37 }],
  feeds: [[6, 52, 70, 6], [28, 96, 96, 5]],
  kisses: [[21, 1], [46.5, 4]],
  pads: [[44, 42, 10], [100, 116, 8.5], [118, 72, 7]],
  lead: 12, period: 48, seam: 3,
}
const KINDS: KoiKind[] = ['kohaku', 'sanke', 'showa', 'tancho']
/** Fry hatch every FRY_EVERY days of visits, at most FRY_MAX (9 fish in all); a fry grows as L(a) = L∞(1 − e^(−k(a + a₀))). */
export const FRY_EVERY = 10, FRY_MAX = 3, FRY_LINF = 34, FRY_K = .05, FRY_A0 = 6
/** Lengths of the fry at age `age` (days of visits), oldest first; whole cells, so a world is rebuilt only when one grows a cell. */
export function fryLengths(age: number): number[] {
  const n = Math.min(FRY_MAX, Math.floor(age / FRY_EVERY)), out: number[] = []
  for (let i = 0; i < n; i++) out.push(Math.round(FRY_LINF * (1 - dexp(-FRY_K * (age - (i + 1) * FRY_EVERY + FRY_A0)))))
  return out
}
/** The day's weather from the day index: calm, wind or rain, changing smoothly from day to day (noise over day/5). */
export function weatherOf(day: number): 'calm' | 'wind' | 'rain' {
  if (!day) return 'calm'
  const w = noise2(day / 5, .5, 480)
  return w < -.22 ? 'rain' : w > .28 ? 'wind' : 'calm'
}
/**
 * The pond of day `day` aged `age` days of visits (X1 #5). Day 0 and age 0 is KOI_SPEC itself. Another day re-seeds
 * the world (paths, markings, dives), draws the six varieties and the pads' places from that seed, and sets the
 * weather; age adds fry (the founding six keep their lengths: the pond is 2.4 adult lengths wide already).
 */
export function koiSpecFor(day: number, age: number): KoiPondSpec {
  const fry = fryLengths(age)
  if (!day && !fry.length) return KOI_SPEC
  const seed = day ? ihash(480, day, 0x6b) & 0xffffff : KOI_SPEC.seed, u = (k: number) => ihash(seed, k, 0x70) / 4294967296
  const koi = day ? KOI_SPEC.koi.map((k, i) => ({ kind: KINDS[Math.floor(u(i) * 4)], length: k.length })) : [...KOI_SPEC.koi]
  for (let i = 0; i < fry.length; i++) koi.push({ kind: KINDS[Math.floor(u(20 + i) * 4)], length: fry[i] })
  const pads = day ? (KOI_SPEC.pads ?? []).map(([x, y, r], i): [number, number, number] => {
    // move each pad up to 14 cells, keeping it 4 cells inside the water
    for (let k = 0; k < 8; k++) { const nx = x + (u(40 + 2 * i + 16 * k) - .5) * 28, ny = y + (u(41 + 2 * i + 16 * k) - .5) * 28; if (koiSdf(nx, ny) < -r - 4) return [nx, ny, r] }
    return [x, y, r]
  }) : KOI_SPEC.pads
  const weather = weatherOf(day)
  return { ...KOI_SPEC, seed, koi, pads, ...(weather === 'rain' ? { rain: 2.5 } : weather === 'wind' ? { wind: 3 } : {}) }
}
const canonical: KoiPond = createKoiPond(KOI_SPEC)
/** The pond the card drew last (canonical until a day or an age arrives); the probes and the board's world list read it. */
export let koiPond: KoiPond = canonical
let current = { key: '0|', pond: canonical }
/** The koi pond for (day, age): the canonical one for day 0 without fry; otherwise one world per (day, fry lengths), the last kept. */
export function koiFor(day: number, age: number): KoiPond {
  const key = `${day}|${fryLengths(age).join(',')}`
  // the canonical pond is always kept (benches and thumbnails read it) next to the last other one
  if (key === '0|') return (koiPond = canonical)
  if (key !== current.key) current = { key, pond: createKoiPond(koiSpecFor(day, age)) }
  return (koiPond = current.pond)
}
const raster = createTileRaster(KOI_SPEC.card, KOI_TILES)
/** The TYPE look's raster (L3.4): the same scene on 24 × 16 font tiles of 6 × 8 cells. */
const typeRaster = createTileRaster(KOI_SPEC.card, KOI_TYPE_TILES)

/** The light hub's keys at their fixture values (DESIGN.md "Light and tilt input"): declared, so the hub reaches the card. */
export const KOI_LIGHT_KEYS = { lightSrc: 0, lightAz: 0, lightEl: 7, tx: 0, ty: 0 } as const
/** The glyph style switch in the label row (L3.4): DOTS (the default) or TYPE. */
export const GLYPH_STYLES = ['DOTS', 'TYPE'] as const
const SWITCH = { x: 94, w: 50, h: 8 } as const
/**
 * The label row's right side: the time of day; while the switch is hovered, focused or pressed, or TYPE is on, the
 * switch itself (DOTS · TYPE, the chosen one in `value`, the other in `mid`). Default frames show the caption only.
 */
function labelRow(ctx: WidgetContext, sel: number, hour: number): Layer[] {
  const k = 'glyphs', shown = sel === 1 || ctx.hover === k || ctx.focus === k || ctx.pressed === k
  if (!shown) return [caption(timeOfDay(hour))]
  const wType = T.size('TYPE')[0], gap = 3
  return [
    caption('TYPE', 143, 0, 'right', sel === 1 ? 'value' : 'mid'),
    caption('DOTS', 143 - wType - gap, 0, 'right', sel === 0 ? 'value' : 'mid'),
  ]
}
/** The koi light this frame: tilt light by bucket when the hub says so (`lightSrc` 1), else the fixed L1 light. */
function koiLight(ctx: WidgetContext, hour: number): KoiDrawOpts['light'] {
  if (ctx.data.lightSrc !== 1) return undefined
  const l = sceneLight({ pointer: null, data: ctx.data, hour })
  if (!Array.isArray(l)) return undefined
  const n = Math.sqrt(l[0] * l[0] + l[1] * l[1] + l[2] * l[2]) || 1
  return [l[0] / n, l[1] / n, l[2] / n]
}

export const pondKoi: WidgetPreset = {
  id: 'pond-koi', name: 'Pond Koi', label: '01  KOI', ...tile, fps: 30,
  credit: [
    { by: ['Dao Ho'], title: 'daoho.dev koi pond', source: 'https://www.daoho.dev/', note: 'the pond this board is after; none of its code' },
    { by: ['argonautcode'], title: 'animal-proc-anim', source: 'https://github.com/argonautcode/animal-proc-anim', note: 'the follow-the-leader spine' },
    { by: ['Craig W. Reynolds'], title: 'Steering behaviors for autonomous characters (1999)', source: 'https://www.red3d.com/cwr/steer/gdc99/', note: 'how the koi steer' },
    ELIAS_WATER,
  ],
  defaults: { glyphs: 0, ...KOI_LIGHT_KEYS, day: 0, age: 0 },
  controls: [
    ...touch('koi', 'Feed the koi'),
    { key: 'glyphs', kind: 'segmented', options: 2, optionLabels: ['Dots', 'Type'], box: [SWITCH.x, 0, SWITCH.w, SWITCH.h], label: 'Glyph style' },
  ],
  layers: ctx => {
    mainThread()
    const pond = koiFor(ctx.data.day ?? 0, ctx.data.age ?? 0)
    const s = worldAt(pond.world, ctx.t, frameOf(ctx, 'koi', undefined, true)), hour = hourNow(), sel = ctx.data.glyphs === 1 ? 1 : 0
    const tx = ctx.data.tx ?? 0, ty = ctx.data.ty ?? 0, r = sel ? typeRaster : raster
    drawKoiPond(pond, s, ctx.t, hour, r, { light: koiLight(ctx, hour), tilt: tx || ty ? [tx, ty] : undefined })
    return [...labelRow(ctx, sel, hour), ...tileLayers(r)]
  },
}

/** FNV-1a 32 over the float bits of a state (the probe compares Chrome's pristine run with Node's). */
export function stateHash(a: Float32Array): string {
  let h = 0x811c9dc5
  const u = new Uint32Array(a.buffer, a.byteOffset, a.length)
  for (let i = 0; i < u.length; i++) { const w = u[i]; for (let b = 0; b < 4; b++) { h ^= (w >>> (8 * b)) & 0xff; h = Math.imul(h, 0x01000193) >>> 0 } }
  return h.toString(16).padStart(8, '0')
}
// the browser probe (scripts/life-browser.ts) sets __POND_PROBE__ before the page loads: the app's canonical URL
// drops unknown query params before this chunk runs, so `?probe=1` alone only works on a direct load
const probing = (globalThis as { __POND_PROBE__?: boolean }).__POND_PROBE__ || (typeof location !== 'undefined' && /[?&]probe=1(&|$)/.test(location.search))
if (probing) {
  (globalThis as { __pond?: unknown }).__pond = {
    mode: () => koiPond.world.mode,
    /** Koi in the pond drawn last (fry included). */
    koi: () => koiPond.spec.koi.length,
    pellets: () => (koiPond.world.mode === 'pristine' ? 0 : pelletViews(koiPond, koiPond.world.live).length),
    lure: () => (koiPond.world.mode === 'pristine' ? 0 : pondGlobals(koiPond, koiPond.world.live).lure),
    hash: (n: number) => stateHash(simAtStep(koiPond.world.sim, n)),
    /** Median ms of `layers` + sample for `frames` pristine frames (a fresh t range, so each frame steps the world once). */
    bench: (frames = 30) => {
      const ms: number[] = [], t0 = 100 + Math.random() * 10
      for (let i = 0; i < frames; i++) { const a = performance.now(); sampleLayers(pondKoi.layers({ t: t0 + i / 30, data: {} }), pondKoi.grid, pondKoi.style, dot480); ms.push(performance.now() - a) }
      return ms.sort((a, b) => a - b)[frames >> 1]
    },
  }
}

/** Read-outs for the checks (scripts/life.ts) and the browser probe. */
export const koiProbe = {
  get pond() { return koiPond }, raster, typeRaster,
  koi: (s: Float32Array) => koiPond.spec.koi.map((_, i) => koiView(koiPond, s, i)),
  pellets: (s: Float32Array) => pelletViews(koiPond, s),
  globals: (s: Float32Array) => pondGlobals(koiPond, s),
}
