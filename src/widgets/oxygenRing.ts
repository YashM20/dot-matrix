import { ringField } from '../engine/fields/polarField'
import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle, combine, dim, place } from './types'

export const oxygenRing: WidgetPreset = {
  id: 'oxygen-ring', name: 'Oxygen Ring', group: 'polar', live: true,
  grid: { cols: 26, rows: 20 }, style: baseStyle,
  field: () => combine(
    place(combine(dim(ringField(.5, .5, .3, .42, -Math.PI / 2, Math.PI * 2), .3), ringField(.5, .5, .3, .42, -Math.PI / 2, Math.PI * 1.94)), 0, .05, .62, .9),
    place(dim(textField('97'), .8), .68, .28, .3, .44),
  ),
  paint: accentHigh(.95),
}
