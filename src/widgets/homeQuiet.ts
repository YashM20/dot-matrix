import { checkerField, sinWarp } from '../engine/fields/warpedField'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim, place } from './types'

export const homeQuiet: WidgetPreset = {
  id: 'home-quiet', name: 'Home Quiet', group: 'chart',
  grid: { cols: 28, rows: 28 }, style: { ...baseStyle, shape: 'square', cornerRoundness: 0.15, sizeMin: 0.4, sizeMax: 1.5 },
  field: () => combine(
    sinWarp(dim(place(checkerField(8, 8), 0.08, 0.28, 0.38, 0.5), 0.75), 8, 0.02),
    sinWarp(dim(place(checkerField(8, 8), 0.56, 0.28, 0.38, 0.5), 0.35), 8, 0.02),
    (u, v) => Math.hypot(u - 0.78, v - 0.62) < 0.04 ? 1 : 0,
  ),
  paint: (dots, t) => { for (const d of dots) if (d.opacity >= 0.95) d.color = t.dotActive },
}
