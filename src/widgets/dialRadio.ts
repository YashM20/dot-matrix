import { dialField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

export const dialRadio: WidgetPreset = {
  id: 'dial-radio', name: 'Dial Radio', group: 'polar', live: true,
  grid: { cols: 28, rows: 28 }, style: baseStyle,
  field: () => dialField(.5, .5, .42, -Math.PI / 2 + Math.PI * 2 * .38),
  paint: accentHigh(.9),
}
