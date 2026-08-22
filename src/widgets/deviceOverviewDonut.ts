import { ringField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim } from './types'

const segments = [.32, .22, .28, .18]
let start = 0
const arcs = segments.map(sweep => { const field = ringField(.5, .5, .34, .46, -Math.PI / 2 + (start + .015) * Math.PI * 2, (sweep - .03) * Math.PI * 2); start += sweep; return dim(field, .55) })

export const deviceOverviewDonut: WidgetPreset = {
  id: 'device-overview-donut', name: 'Device Overview Donut', group: 'polar',
  grid: { cols: 24, rows: 24 }, style: baseStyle,
  field: () => combine(...arcs),
  paint: (dots, theme) => { for (const dot of dots) if (dot.opacity > .4) dot.color = theme.dotIdle },
}
