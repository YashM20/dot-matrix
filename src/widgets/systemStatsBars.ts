import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

const usage = [
  [.9, .9, .8, .8, .7, .7, .6, .6, .5],
  [.5, .5, .4, .4, .3, .3, .3, .2, .2],
  [.3, .35, .35, .4, .45, .5, .55, .6, .65],
]

export const systemStatsBars: WidgetPreset = {
  id: 'system-stats-bars', name: 'System Stats Bars', group: 'chart',
  grid: { cols: 36, rows: 15 }, style: { ...baseStyle, shape: 'square', cornerRoundness: .2, sizeMin: .5, sizeMax: 1.7 },
  field: () => gridField(usage),
  paint: toneByValue(),
}
