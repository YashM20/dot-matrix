import { ringField } from '../engine/fields/polarField'
import { modulatedRingField } from '../engine/fields/warpedField'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim } from './types'

export const rideDual: WidgetPreset = {
  id: 'ride-dual', name: 'Ride Dual', group: 'polar', live: true,
  grid: { cols: 28, rows: 28 }, style: baseStyle,
  field: () => combine(
    dim(modulatedRingField(0.5, 0.5, 0.32, 0.46, -Math.PI / 2, Math.PI * 2, 8, 0.12), 0.32),
    modulatedRingField(0.5, 0.5, 0.32, 0.46, -Math.PI / 2 - 0.35, 0.42, 6, 0.18),
    dim(ringField(0.5, 0.5, 0.18, 0.26, 0, Math.PI * 2), 0.3),
  ),
  paint: (dots, t) => { for (const d of dots) if (d.opacity > 0.7) d.color = d.opacity >= 0.9 ? t.dotIdle : t.dotFaint! },
}
