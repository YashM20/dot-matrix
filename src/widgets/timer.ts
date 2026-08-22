import { ringField } from '../engine/fields/polarField'
import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle, combine, place } from './types'

export const timer: WidgetPreset = {
  id: 'timer', name: 'Timer', group: 'text', live: true,
  grid: { cols: 30, rows: 14 }, style: baseStyle,
  field: () => combine(place(ringField(.5, .5, .3, .44, -Math.PI / 2, Math.PI * 1.7), 0, 0, .42, 1), place(textField('00:47'), .48, .25, .5, .55)),
  paint: accentHigh(.8),
}
