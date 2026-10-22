/**
 * Shared preset → dots → raster path for the headless instruments. Matches the app: a card is
 * `withChrome(preset)(ctx)` sampled with `sampleLayers` on the preset's own grid and style, dot480 theme.
 */
import { dot480 } from '../../src/engine/theme/tokens'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { squircleExponent } from '../../src/engine/renderer/shapePath'
import type { DotInstance, DotStyle, ThemeTokens } from '../../src/engine/types'
import { boards, withChrome, type WidgetPreset } from '../../src/widgets'
import { Raster } from './raster'

export const theme: ThemeTokens = dot480

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

export const pitchOf = (p: WidgetPreset) => p.grid.pitch ?? theme.gridPx
export const sampleCard = (p: WidgetPreset, t: number, style: DotStyle = p.style, since?: number): DotInstance[] =>
  sampleLayers(withChrome(p)({ t, since, data: { ...p.defaults } }), p.grid, style, theme)
export const visible = (d: DotInstance) => d.opacity > 0 && d.r > 0

/** Opacity·area-weighted centroid of lit dots, in card px (grid units). */
export function litCentroid(dots: DotInstance[]): [number, number] {
  let sx = 0, sy = 0, sw = 0
  for (const d of dots) if (visible(d)) { const w = d.opacity * d.r * d.r; sx += d.x * w; sy += d.y * w; sw += w }
  return sw ? [sx / sw, sy / sw] : [NaN, NaN]
}

export const PAD = 14 // card padding in output px, like the CSS card
export interface RenderOptions {
  /** Output pixels per CSS pixel. */
  px: number
  t: number
  /** Every lit dot solid white at full (sizeMax) size — the silhouette test. */
  silhouette?: boolean
  /** Seconds since the last tick (tick-burst cards, e.g. the home-clock split-flap). */
  since?: number
}
export interface RenderedCard { raster: Raster; dots: DotInstance[]; /** card px → raster px */ map: (x: number, y: number) => [number, number] }

export function renderCardFull(p: WidgetPreset, { px, t, silhouette = false, since }: RenderOptions): RenderedCard {
  // bleed cards have no padding, so scale their dots up to fill the same footprint
  const base = pitchOf(p) * px, pitch = p.bleed ? base + (PAD * 2) / p.grid.cols : base, k = (pitch / base) * px
  const w = Math.round(p.grid.cols * pitch), h = Math.round(p.grid.rows * pitch)
  // silhouette: same lit set (same quantization), but every dot at full radius
  const style: DotStyle = silhouette ? { ...p.style, sizeMin: p.style.sizeMax, sizeCurve: undefined, opacityMode: 'fromValue' } : p.style
  const dots = sampleCard(p, t, style, since)
  const pad = p.bleed ? 0 : PAD
  const card = new Raster(w + pad * 2, h + pad * 2, theme.bg)
  card.rect(0, 0, card.w, card.h, silhouette ? '#000000' : theme.surface, 14, '#26292d')
  const n = squircleExponent(p.style.cornerRoundness ?? 0)
  for (const d of dots) if (visible(d)) {
    const shape = d.shape === 'circle' ? 2 : d.shape === 'square' ? 40 : n
    card.dot(pad + d.x * k, pad + d.y * k, d.r * k, shape, silhouette ? '#ffffff' : d.color, silhouette ? 1 : d.opacity)
  }
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

export const median = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
export const quantile = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))] : NaN }
/** Median wall time of `runs` calls (after one warm-up call). */
export function timeMedian(fn: () => unknown, runs = 5): number {
  fn()
  const ms: number[] = []
  for (let i = 0; i < runs; i++) { const t0 = performance.now(); fn(); ms.push(performance.now() - t0) }
  return median(ms)
}
