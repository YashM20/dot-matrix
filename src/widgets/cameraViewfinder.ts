import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

const brackets = [
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [0, 0, 0, .3, .3, .3, .3, .3, .3, .3, 0, 0, 0],
  [0, 0, 0, .3, .45, .45, .3, .45, .45, .3, 0, 0, 0],
  [0, 0, 0, .3, .3, .3, .3, .3, .3, .3, 0, 0, 0],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
]

export const cameraViewfinder: WidgetPreset = {
  id: 'camera-viewfinder', name: 'Camera Viewfinder', group: 'composite', live: true,
  grid: { cols: 39, rows: 21 }, style: { ...baseStyle, shape: 'square', cornerRoundness: .2 },
  field: () => gridField(brackets),
  paint: accentHigh(.85),
}
