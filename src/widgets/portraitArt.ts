import { concentricWaveField, gradientField, sinWarp } from '../engine/fields/warpedField'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle, dim } from './types'

const headShoulders: Field = (u, v) => {
  const head = Math.max(0, 1 - Math.hypot(u - .5, v - .34) * 4.2)
  const shoulders = Math.max(0, 1 - Math.hypot(u - .5, (v - .92) * 1.7) * 2.6)
  return Math.min(1, Math.max(head * 1.05, shoulders * .9))
}
const backdrop: Field = gradientField(Math.PI * 0.35)
const halftone: Field = sinWarp(concentricWaveField(0.5, 0.34, 22), 8, 0.03)
const portrait: Field = (u, v) => {
  const base = Math.max(dim(backdrop, 0.32)(u, v), headShoulders(u, v))
  const ht = halftone(u, v) * 0.18 * Math.max(0, 1 - Math.hypot(u - .5, v - .34) * 1.6)
  return Math.min(1, base + ht)
}

export const portraitArt: WidgetPreset = {
  id: 'portrait-art', name: 'Portrait Art', group: 'photo',
  grid: { cols: 52, rows: 52 }, style: { ...baseStyle, cornerRoundness: .45 },
  field: () => portrait,
}
