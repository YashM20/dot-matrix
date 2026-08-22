import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const steps = [[0.95, 0.25, 0.25, 0.25]]

export const pharmaTrack: WidgetPreset = {
  id: 'pharma-track', name: 'Pharma Track', group: 'composite',
  grid: { cols: 32, rows: 14 }, style: { ...baseStyle, shape: 'square', cornerRoundness: 0.2 },
  field: () => gridField(steps),
  paint: (dots, t) => { for (const d of dots) if (d.opacity > 0.6) d.color = d.opacity >= 0.9 ? t.dotActive : t.dotFaint! },
}
