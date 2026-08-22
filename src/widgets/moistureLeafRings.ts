import { ringField } from '../engine/fields/polarField'
import { cachedIconField } from '../engine/fields/iconSDF'
import { iconPaths } from '../engine/fields/iconSDF'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim, place } from './types'

export const moistureLeafRings: WidgetPreset = {
  id: 'moisture-leaf-rings', name: 'Moisture Leaf Rings', group: 'polar',
  grid: { cols: 24, rows: 24 }, style: baseStyle,
  field: () => combine(
    combine(dim(ringField(.5, .5, .34, .44, -Math.PI / 2, Math.PI * 2), .3), dim(ringField(.5, .5, .34, .44, -Math.PI / 2, Math.PI * 1.32), .7)),
    place(cachedIconField('leaf', iconPaths.leaf, 48), .3, .3, .4, .4),
  ),
  paint: (dots, theme) => { for (const dot of dots) if (dot.opacity > .55) dot.color = dot.opacity >= .85 ? theme.dotIdle : theme.dotFaint! },
}
