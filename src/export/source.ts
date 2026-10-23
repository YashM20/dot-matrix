/** Clip sources: a widget preset (or any layer function) on its own grid and style → `ClipSource`. */
import type { DotStyle, GridConfig, Layer, ThemeTokens } from '../engine/types'
import { sampleLayers } from '../engine/sampler/gridSampler'
import { withChrome, type WidgetContext, type WidgetPreset } from '../widgets'
import type { ClipSource } from './record'

/** Every colour token a theme can put on a dot (the GIF palette's tones). */
export const themeTones = (t: ThemeTokens) => [t.dotIdle, t.dotMid, t.dotFaint, t.dotActive, t.dotActiveDim, t.value, t.accentAmber, t.hairline].filter((c): c is string => !!c)

/** Drive one data key linearly over the clip (static cards like `timer` animate their value). */
export interface Sweep { key: string; from: number; to: number; seconds: number }
const swept = (data: Record<string, number>, s: Sweep | undefined, t: number) =>
  s ? { ...data, [s.key]: s.from + (s.to - s.from) * Math.min(1, Math.max(0, t / s.seconds)) } : data

export function layerSource(layers: (ctx: WidgetContext) => Layer[], grid: GridConfig, style: DotStyle, theme: ThemeTokens, data: Record<string, number> = {}, sweep?: Sweep): ClipSource {
  const pitch = grid.pitch ?? theme.gridPx
  const g = { ...grid, pitch }
  return { width: grid.cols * pitch, height: grid.rows * pitch, background: theme.surface, tones: themeTones(theme), frame: t => sampleLayers(layers({ t, data: swept(data, sweep, t) }), g, style, theme) }
}
export const presetSource = (p: WidgetPreset, theme: ThemeTokens, data: Record<string, number> = {}, sweep?: Sweep) =>
  layerSource(withChrome(p), p.grid, p.style, theme, { ...p.defaults, ...data }, sweep)
