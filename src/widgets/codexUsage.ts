import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const bars = [[0.2, 0.35, 0.6, 0.9, 0.7, 0.55, 0.4, 0.85, 0.6, 0.3]]

export const codexUsage: WidgetPreset = {
  id: 'codex-usage', name: 'Codex Usage', group: 'chart',
  grid: { cols: 36, rows: 12 }, style: { ...baseStyle, shape: 'square', cornerRoundness: 0.2 },
  field: () => gridField(bars),
  paint: (dots, t) => { for (const d of dots) if (d.opacity > 0.5) d.color = d.opacity > 0.7 ? t.dotActive : t.dotMid! },
}
