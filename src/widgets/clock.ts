import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const clockFieldFor = (now: Date = new Date()) => {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return textField(time)
}

export const clock: WidgetPreset = {
  id: 'clock', name: 'Clock', group: 'text', live: true,
  grid: { cols: 60, rows: 18 }, style: baseStyle,
  field: () => clockFieldFor(),
}
