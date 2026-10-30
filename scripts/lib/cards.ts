/**
 * Shared preset → dots → raster path for the headless instruments. Matches the app: a card is
 * `withChrome(preset)(ctx)` sampled with `sampleLayers` on the preset's own grid and style, dot480 theme.
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { squircleExponent } from '../../src/engine/renderer/shapePath'
import type { DotInstance, DotStyle } from '../../src/engine/types'
import { boards, withChrome, type WidgetContext, type WidgetPreset } from '../../src/widgets'
import { Raster } from './raster'
import { median, pitchOf, theme, visible } from './stats'
export { litCentroid, median, pitchOf, quantile, theme, visible } from './stats'

/** Every preset once, in board order (an id that appears on several boards is listed once). */
export function uniquePresets(): WidgetPreset[] {
  const seen = new Set<string>(), out: WidgetPreset[] = []
  for (const b of boards) for (const p of b.items) if (!seen.has(p.id)) { seen.add(p.id); out.push(p) }
  return out
}

/** Deterministic t values a, a+step, … ≤ b (index-based, so no float drift accumulates). */
export function timeRange(spec: string): number[] {
  const [a, b, step] = spec.split(':').map(Number)
  if (![a, b, step].every(Number.isFinite) || step <= 0 || b < a) throw new Error(`bad --t range "${spec}", want a:b:step`)
  const n = Math.floor((b - a) / step + 1e-9)
  return Array.from({ length: n + 1 }, (_, i) => +(a + i * step).toFixed(6))
}

/** Extra frame-context fields merged over the default `{ t, since, data }` (e.g. `hover` / `pressed` / `focus`); `data` merges over the defaults. */
export type CtxExtra = Partial<WidgetContext>
export const sampleCard = (p: WidgetPreset, t: number, style: DotStyle = p.style, since?: number, extra: CtxExtra = {}): DotInstance[] =>
  sampleLayers(withChrome(p)({ t, since, ...extra, data: { ...p.defaults, ...extra.data } }), p.grid, style, theme)

export const PAD = 14 // card padding in output px, like the CSS card
export interface RenderOptions {
  /** Output pixels per CSS pixel. */
  px: number
  t: number
  /** Every lit dot solid white at full (sizeMax) size — the silhouette test. */
  silhouette?: boolean
  /** Seconds since the last tick (tick-burst cards, e.g. the home-clock split-flap). */
  since?: number
  /** Extra frame-context fields (snap `--ctx '<json>'`). */
  ctx?: CtxExtra
}
export interface RenderedCard { raster: Raster; dots: DotInstance[]; /** card px → raster px */ map: (x: number, y: number) => [number, number] }

export function renderCardFull(p: WidgetPreset, { px, t, silhouette = false, since, ctx }: RenderOptions): RenderedCard {
  // bleed cards have no padding, so scale their dots up to fill the same footprint
  const base = pitchOf(p) * px, pitch = p.bleed ? base + (PAD * 2) / p.grid.cols : base, k = (pitch / base) * px
  const w = Math.round(p.grid.cols * pitch), h = Math.round(p.grid.rows * pitch)
  // silhouette: same lit set (same quantization), but every dot at full radius
  const style: DotStyle = silhouette ? { ...p.style, sizeMin: p.style.sizeMax, sizeCurve: undefined, opacityMode: 'fromValue' } : p.style
  const dots = sampleCard(p, t, style, since, ctx)
  const pad = p.bleed ? 0 : PAD
  const card = new Raster(w + pad * 2, h + pad * 2, theme.bg)
  card.rect(0, 0, card.w, card.h, silhouette ? '#000000' : theme.surface, 14, '#26292d')
  const n = squircleExponent(p.style.cornerRoundness ?? 0), joined = new Map<string, Float32Array>()
  for (const d of dots) if (visible(d)) {
    const color = silhouette ? '#ffffff' : d.color, alpha = silhouette ? 1 : d.opacity
    const shape = d.shape === 'circle' ? 2 : d.shape === 'square' ? 40 : d.shape === 'squircle' && d.roundness !== undefined ? squircleExponent(d.roundness) : n
    // joined and rect cells (squares Q1, Q2): coverage per (colour, opacity), blended once per group like a Canvas fill
    if ((d.join !== undefined && d.joint) || d.aspect !== undefined) {
      const key = `${color}|${alpha}`, g = d.joint, hs = d.r * k * (d.aspect ?? 1)
      let cov = joined.get(key)
      if (!cov) joined.set(key, (cov = new Float32Array(card.w * card.h)))
      if (g && d.join !== undefined) card.coverJoined(cov, pad + d.x * k, pad + d.y * k, d.r * k, d.join, { hx: g.hx * k, hy: g.hy * k, ro: g.ro, ri: g.ri * k, seam: g.seam * k }, hs)
      else card.coverRect(cov, pad + d.x * k, pad + d.y * k, d.r * k, hs, d.shape === 'square' ? Infinity : shape)
      continue
    }
    card.dot(pad + d.x * k, pad + d.y * k, d.r * k, shape, color, alpha)
  }
  for (const [key, cov] of joined) { const cut = key.lastIndexOf('|'); card.blendCoverage(cov, key.slice(0, cut), +key.slice(cut + 1)) }
  return { raster: card, dots, map: (x, y) => [pad + x * k, pad + y * k] }
}
export const renderCard = (p: WidgetPreset, o: RenderOptions): Raster => renderCardFull(p, o).raster

/** Cards tiled `columns` wide on the board background, each centred in a max-size cell. */
export function sheet(cards: Raster[], columns: number, gap = 12): Raster {
  const cw = Math.max(...cards.map(c => c.w)), ch = Math.max(...cards.map(c => c.h)), rows = Math.ceil(cards.length / columns)
  const s = new Raster(columns * cw + (columns + 1) * gap, rows * ch + (rows + 1) * gap, theme.bg)
  cards.forEach((c, i) => s.paste(c, Math.round(gap + (i % columns) * (cw + gap) + (cw - c.w) / 2), Math.round(gap + Math.floor(i / columns) * (ch + gap) + (ch - c.h) / 2)))
  return s
}

/** Median wall time of `runs` calls (after one warm-up call). */
export function timeMedian(fn: () => unknown, runs = 5): number {
  fn()
  const ms: number[] = []
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); fn(); ms.push(performance.now() - t0) }
  return median(ms)
}
