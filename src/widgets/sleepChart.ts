import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

const stages = [
  [0, 0, 0, 0, 0, 0, .3, .6, .9, .9, .9, .6],
  [.6, .3, 0, 0, .3, .6, .9, .6, .3, 0, 0, 0],
  [0, 0, 0, .3, .6, .9, .6, .3, 0, 0, .3, .6],
]

export const sleepChart: WidgetPreset = {
  id: 'sleep-chart', name: 'Sleep Chart', group: 'chart',
  grid: { cols: 36, rows: 12 }, style: { ...baseStyle, shape: 'square', cornerRoundness: .2, sizeMin: .5, sizeMax: 1.7 },
  field: () => gridField(stages),
  paint: toneByValue(),
}
