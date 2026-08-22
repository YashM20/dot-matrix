import { poissonDiscPoints, scatterField } from '../engine/fields/scatterField'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

export const starFieldWidget: WidgetPreset = {
  id: 'star-field', name: 'Star Field', group: 'scatter',
  grid: { cols: 44, rows: 44 }, style: baseStyle,
  field: () => scatterField(poissonDiscPoints(100, 100, 9, 7), 1.4, 100, 100),
  paint: toneByValue(.4, .75),
}
