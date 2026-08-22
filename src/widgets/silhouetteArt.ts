import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const silhouette: Field = (u, v) => {
  const glow = Math.max(.15, .55 - Math.abs(v - .38) * .7)
  const figure = Math.max(
    Math.max(0, 1 - Math.hypot((u - .5) * 1.4, v - .3) * 3.6),
    Math.max(0, 1 - Math.hypot((u - .5) * 2.1, (v - .78) * 1.25) * 2.4),
  )
  return Math.max(glow * .5, figure)
}

export const silhouetteArt: WidgetPreset = {
  id: 'silhouette-art', name: 'Silhouette Art', group: 'photo',
  grid: { cols: 46, rows: 52 }, style: baseStyle,
  field: () => silhouette,
}
