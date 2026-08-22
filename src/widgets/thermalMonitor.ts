import type { Field } from '../engine/types'
import { sinWarp } from '../engine/fields/warpedField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const baseThermal: Field = (u, v) => {
  const hot = Math.max(0, 1 - Math.hypot(u - .38, v - .55) * 2.6)
  const warm = Math.max(0, 1 - Math.hypot(u - .68, v - .3) * 3.4)
  const core = Math.min(1, .12 + hot * .95 + warm * .5 - Math.hypot(u - .5, v - .5) * .18)
  return core * (0.92 + 0.08 * Math.sin(u * 22) * Math.cos(v * 18))
}
const thermal: Field = sinWarp(baseThermal, 14, 0.04)

export const thermalMonitor: WidgetPreset = {
  id: 'thermal-monitor', name: 'Thermal Monitor', group: 'photo', live: true,
  grid: { cols: 48, rows: 48 }, style: { ...baseStyle, shape: 'squircle', cornerRoundness: .4 },
  field: () => thermal,
  paint: (dots, theme) => { for (const dot of dots) if (dot.opacity >= .85) dot.color = theme.dotActive; else if (dot.opacity > 0) dot.color = dot.opacity < .35 ? theme.dotFaint! : theme.dotMid! },
}
