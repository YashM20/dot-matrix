import { dialField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

export const gaugeSpeed: WidgetPreset = {
  id: 'gauge-speed', name: 'Gauge Speed', group: 'polar',
  grid: { cols: 26, rows: 26 }, style: baseStyle,
  field: () => dialField(.5, .5, .42, -Math.PI / 2 + .62 * Math.PI * 2 * .72),
  paint: toneByValue(),
}
