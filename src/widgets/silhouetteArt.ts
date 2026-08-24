import { concentricWaveField, gradientField, sinWarp } from '../engine/fields/warpedField'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle, dim } from './types'

const figure: Field = (u, v) => Math.max(
  Math.max(0, 1 - Math.hypot((u - .5) * 1.4, v - .3) * 3.6),
  Math.max(0, 1 - Math.hypot((u - .5) * 2.1, (v - .78) * 1.25) * 2.4),
)
const glow: Field = gradientField(-Math.PI * 0.2)
const halftone: Field = sinWarp(concentricWaveField(0.5, 0.42, 18), 6, 0.025)
const silhouette: Field = (u, v) => {
  const g = dim(glow, 0.55)(u, v) * Math.max(.3, 1 - Math.abs(v - .38) * .7)
  const f = figure(u, v)
  const ht = halftone(u, v) * 0.15 * f
  return Math.min(1, Math.max(g * .5, f + ht))
}

export const silhouetteArt: WidgetPreset = {
  id: 'silhouette-art', name: 'Silhouette Art', group: 'photo',
  grid: { cols: 46, rows: 52 }, style: baseStyle,
  field: () => silhouette,
}
