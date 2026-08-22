import { cachedIconField, iconPaths } from '../engine/fields/iconSDF'
import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle, combine, dim, place } from './types'

export const evCharge: WidgetPreset = {
  id: 'ev-charge', name: 'EV Charge', group: 'icon', live: true,
  grid: { cols: 28, rows: 20 }, style: baseStyle,
  field: () => combine(
    place(cachedIconField('car', iconPaths.car, 48), .06, .1, .44, .44),
    place(dim((u) => u < .62 ? 1 : 0, .8), .58, .34, .34, .14),
    place(textField('68%'), .58, .1, .36, .3),
  ),
  paint: accentHigh(.9),
}
