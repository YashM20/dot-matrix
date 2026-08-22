import { concentricRingsField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

export const breathingCircles: WidgetPreset = {
  id: 'breathing-circles', name: 'Breathing Circles', group: 'polar', live: true,
  grid: { cols: 26, rows: 26 }, style: baseStyle,
  field: () => concentricRingsField(.5, .5, 14, 0),
  paint: accentHigh(.9),
}
