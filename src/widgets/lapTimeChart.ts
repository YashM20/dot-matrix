import { catmullRomField } from '../engine/fields/splineField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const lapTimeChart: WidgetPreset = {
  id: 'lap-time-chart', name: 'Lap Time Chart', group: 'chart',
  grid: { cols: 44, rows: 16 }, style: baseStyle,
  field: () => catmullRomField([[0, .8], [.18, .35], [.36, .55], [.54, .2], [.74, .45], [1, .28]], .5),
}
