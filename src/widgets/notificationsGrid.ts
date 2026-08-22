import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const dots = [
  [1, 0.25, 0.25, 0.25, 0.25],
  [0.25, 0.25, 0.25, 0.25, 0.25],
  [0.25, 0.25, 0.25, 0.25, 0.25],
]

export const notificationsGrid: WidgetPreset = {
  id: 'notifications-grid', name: 'Notifications', group: 'chart',
  grid: { cols: 22, rows: 14 }, style: { ...baseStyle, shape: 'circle', cornerRoundness: 1 },
  field: () => gridField(dots),
  paint: (d, t) => { let first = true; for (const dot of d) if (dot.opacity > 0.6) { dot.color = first ? t.dotActive : t.dotFaint!; first = false } },
}
