import { ringField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim } from './types'

const track = ringField(.5, .5, .36, .46, -Math.PI / 2, Math.PI * 2)

export const gaugeBattery: WidgetPreset = {
  id: 'gauge-battery', name: 'Gauge Battery', group: 'polar',
  grid: { cols: 24, rows: 24 }, style: baseStyle,
  field: () => combine(dim(track, .35), ringField(.5, .5, .36, .46, -Math.PI / 2, Math.PI * 1.55)),
  paint: (dots, theme) => { for (const dot of dots) if (dot.opacity > .6) dot.color = dot.opacity >= .85 ? theme.dotIdle : theme.dotFaint! },
}
