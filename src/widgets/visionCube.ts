import { cachedIconField } from '../engine/fields/iconSDF'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

export const visionCube: WidgetPreset = {
  id: 'vision-cube', name: 'Vision Cube', group: 'icon', live: true,
  grid: { cols: 22, rows: 22 }, style: baseStyle,
  field: () => cachedIconField('cube', 'M16 3 29 10v12L16 29 3 22V10ZM3 10l13 7 13-7M16 17v12', 48),
  paint: accentHigh(.85),
}
