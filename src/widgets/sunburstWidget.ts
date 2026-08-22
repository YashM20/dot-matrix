import { sunburstField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const sunburstWidget: WidgetPreset = {
  id: 'sunburst', name: 'Sunburst Day', group: 'polar', live: true,
  grid: { cols: 26, rows: 26 }, style: baseStyle,
  field: () => sunburstField(.5, .5, 9, 0.11),
  paint: (dots, t) => { for (const d of dots) if (d.opacity > 0.6 && Math.hypot(d.x - 52, d.y - 52) < 18) d.color = t.dotActive },
}
