/**
 * 01 KOI (docs/living-matter/L-pond.md §L1 "Card pond-koi"): six koi in a pond of glyph tiles.
 * Wave-equation water draws its slopes as line glyphs, crests as '=', calm water as a few twinkling dots; the bank is
 * Voronoi stones in density glyphs; koi swim by burst and glide on argonaut spines, their interiors as lattice-4
 * dots (style B, the L1.0 default) with glyph-matched edges; three lily pads drift over them. The one accent is the
 * koi's red markings. Tap to feed (pellets land with ripples, nearby koi startle), hold still to make them curious,
 * hold a press to lure them. Pristine and looped (48 s) until touched; heals back 4 s after the last input.
 */
import { createKoiPond, createTileRaster, drawKoiPond, KOI_TYPE_TILES, koiView, pelletViews, pondGlobals, tileLayers, type KoiDrawOpts, type KoiPond, type KoiPondSpec, type TileGrid } from '../../../engine/life'
import { sceneLight } from '../../../engine/light/input'
import { worldAt } from '../../../engine/physics/world'
import type { Layer } from '../../../engine/types'
import { simAtStep } from '../../../engine/sim/sim'
import { sampleLayers } from '../../../engine/sampler/gridSampler'
import { dot480 } from '../../../engine/theme/tokens'
import { layer, type WidgetContext, type WidgetPreset } from '../../types'
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
export const koiPond: KoiPond = createKoiPond(KOI_SPEC)
const raster = createTileRaster(KOI_SPEC.card, KOI_TILES)
/** The TYPE look's raster (L3.4): the same scene on 24 × 16 font tiles of 6 × 8 cells. */
const typeRaster = createTileRaster(KOI_SPEC.card, KOI_TYPE_TILES)

/** The light hub's keys at their fixture values (DESIGN.md "Light and tilt input"): declared, so the hub reaches the card. */
export const KOI_LIGHT_KEYS = { lightSrc: 0, lightAz: 0, lightEl: 7, tx: 0, ty: 0 } as const
/** The glyph style switch in the label row (L3.4): DOTS (the default) or TYPE. */
export const GLYPH_STYLES = ['DOTS', 'TYPE'] as const
const SWITCH = { x: 104, w: 40, h: 9, lattice: .72 } as const
/**
 * The label row's right side: the time of day; while the switch is hovered, focused or pressed, or TYPE is on, the
 * switch itself (DOTS · TYPE, the chosen one in `value`). Default frames show the caption only (goldens unchanged).
 */
function labelRow(ctx: WidgetContext, sel: number, hour: number): Layer[] {
  const k = 'glyphs', shown = sel === 1 || ctx.hover === k || ctx.focus === k || ctx.pressed === k
  if (!shown) return [caption(timeOfDay(hour))]
  const o = { lattice: SWITCH.lattice, align: 'right' as const }, wType = T.size('TYPE', {})[0] * SWITCH.lattice, gap = 3
  return [
    layer(T.big('TYPE', 143, 1, o), sel === 1 ? 'value' : 'faint'),
    layer(T.big('DOTS', 143 - wType - gap, 1, o), sel === 0 ? 'value' : 'faint'),
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
  defaults: { glyphs: 0, ...KOI_LIGHT_KEYS },
  controls: [
    ...touch('koi', 'Feed the koi'),
    { key: 'glyphs', kind: 'segmented', options: 2, optionLabels: ['Dots', 'Type'], box: [SWITCH.x, 0, SWITCH.w, SWITCH.h], label: 'Glyph style' },
  ],
  layers: ctx => {
    mainThread()
    const s = worldAt(koiPond.world, ctx.t, frameOf(ctx, 'koi', undefined, true)), hour = hourNow(), sel = ctx.data.glyphs === 1 ? 1 : 0
    const tx = ctx.data.tx ?? 0, ty = ctx.data.ty ?? 0, r = sel ? typeRaster : raster
    drawKoiPond(koiPond, s, ctx.t, hour, r, { light: koiLight(ctx, hour), tilt: tx || ty ? [tx, ty] : undefined })
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
  pond: koiPond, raster, typeRaster,
  koi: (s: Float32Array) => KOI_SPEC.koi.map((_, i) => koiView(koiPond, s, i)),
  pellets: (s: Float32Array) => pelletViews(koiPond, s),
  globals: (s: Float32Array) => pondGlobals(koiPond, s),
}
