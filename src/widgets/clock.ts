import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const clock: WidgetPreset = {
  id: 'clock', name: 'Clock', group: 'text',
  grid: { cols: 34, rows: 9 }, style: baseStyle,
  field: () => {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return textField(time)
  },
}
