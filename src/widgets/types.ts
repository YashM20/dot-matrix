import type { DotInstance, DotStyle, Field, GridConfig, ThemeTokens } from '../engine/types'

export interface WidgetPreset {
  id: string
  name: string
  group: 'text' | 'polar' | 'icon' | 'photo' | 'chart' | 'scatter' | 'composite'
  live?: boolean
  grid: GridConfig
  style: DotStyle
  field(): Field
  paint?(dots: DotInstance[], theme: ThemeTokens): void
}

export const baseStyle: DotStyle = { shape: 'squircle', sizeMin: .3, sizeMax: 1.6, cornerRoundness: .72, opacityMode: 'fromValue', quantizeSteps: 5 }

export const combine = (...fields: Field[]): Field => (u, v) => fields.reduce((max, f) => Math.max(max, f(u, v)), 0)

export const place = (field: Field, x: number, y: number, w: number, h: number): Field => (u, v) => (u < x || u > x + w || v < y || v > y + h) ? 0 : field((u - x) / w, (v - y) / h)

export const dim = (field: Field, factor: number): Field => (u, v) => field(u, v) * factor

export const accentHigh = (threshold = .8): NonNullable<WidgetPreset['paint']> => (dots, theme) => { for (const dot of dots) if (dot.opacity >= threshold) dot.color = theme.dotActive }

export const accentBand = (lo: number, hi: number): NonNullable<WidgetPreset['paint']> => (dots, theme) => { for (const dot of dots) if (dot.opacity > lo && dot.opacity <= hi) dot.color = theme.dotActive }

export const toneByValue = (faintAt = .34, midAt = .67): NonNullable<WidgetPreset['paint']> => (dots, theme) => { for (const dot of dots) if (dot.opacity > 0) dot.color = dot.opacity <= faintAt ? theme.dotFaint! : dot.opacity <= midAt ? theme.dotMid! : theme.dotIdle }
