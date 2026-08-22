import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const headlineText: WidgetPreset = {
  id: 'headline-text', name: 'Headline Text', group: 'text',
  grid: { cols: 40, rows: 16 }, style: baseStyle,
  field: () => (u, v) => Math.max(v < .5 ? textField('SHIP THE')(u * 2, v * 2) : 0, v >= .5 ? textField('IDEA')(u * 2, (v - .5) * 2) : 0),
}
