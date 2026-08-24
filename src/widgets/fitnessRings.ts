import { ringField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim } from './types'

const ring = (rInner: number, rOuter: number, sweep: number) => ringField(.5, .5, rInner, rOuter, -Math.PI / 2, Math.PI * sweep)
const track = (rInner: number, rOuter: number) => dim(ring(rInner, rOuter, 2), .3)

export const fitnessRings: WidgetPreset = {
  id: 'fitness-rings', name: 'Fitness Rings', group: 'polar', live: true,
  grid: { cols: 36, rows: 36 }, style: { ...baseStyle, sizeMax: 2.2 },
  field: () => combine(track(.4, .48), dim(ring(.4, .48, 1.21), .58), track(.29, .37), dim(ring(.29, .37, 1.62), .78), track(.18, .26), ring(.18, .26, 2)),
  paint: (dots, theme) => { for (const dot of dots) if (dot.opacity > .6) dot.color = dot.opacity >= .95 ? theme.dotActive : theme.dotMid! },
}
