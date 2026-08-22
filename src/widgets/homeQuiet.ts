import type { WidgetPreset } from './types'
import { baseStyle, combine } from './types'

export const homeQuiet: WidgetPreset = {
  id: 'home-quiet', name: 'Home Quiet', group: 'chart',
  grid: { cols: 28, rows: 28 }, style: { ...baseStyle, shape: 'square', cornerRoundness: 0.15, sizeMin: 0.4, sizeMax: 1.5 },
  field: () => combine(
    (u, v) => (u > 0.08 && u < 0.46 && v > 0.28 && v < 0.78 && (u < 0.1 || u > 0.44 || v < 0.3 || v > 0.76) ? 0.75 : 0),
    (u, v) => (u > 0.56 && u < 0.94 && v > 0.28 && v < 0.78 && (u < 0.58 || u > 0.92 || v < 0.3 || v > 0.76) ? 0.35 : 0),
    (u, v) => Math.hypot(u - 0.78, v - 0.62) < 0.04 ? 1 : 0,
  ),
  paint: (dots, t) => { for (const d of dots) if (d.opacity >= 0.95) d.color = t.dotActive },
}
