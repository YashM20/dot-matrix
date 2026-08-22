import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle, combine } from './types'

export const boardingPass: WidgetPreset = {
  id: 'boarding-pass', name: 'Boarding Pass', group: 'text',
  grid: { cols: 36, rows: 12 }, style: baseStyle,
  field: () => combine(textField('14A'), (u) => u > .82 && Math.abs(u % .06 - .03) < .012 ? .5 : 0),
  paint: accentHigh(.9),
}
