import { cachedIconField } from '../engine/fields/iconSDF'
import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim, place, toneByValue } from './types'

export const weatherCard: WidgetPreset = {
  id: 'weather-card', name: 'Weather Card', group: 'icon',
  grid: { cols: 44, rows: 26 }, style: baseStyle,
  field: () => combine(
    place(cachedIconField('cloud', 'M6 14h14a5.5 5.5 0 0 0 0-11 7 7 0 0 0-13 2', 40), .05, .12, .38, .38),
    place(cachedIconField('sun', 'M16 4v3M16 25v3M4 16h3M25 16h3M8 8l2 2M22 22l2 2M24 8l-2 2M10 22l-2 2M21 16a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z', 40), .55, .08, .34, .34),
    place(dim(textField('24°'), .75), .18, .62, .64, .32),
  ),
  paint: toneByValue(),
}
