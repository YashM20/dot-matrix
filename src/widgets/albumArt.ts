import type { Field } from '../engine/types'
import { spiralField } from '../engine/fields/warpedField'
import type { WidgetPreset } from './types'
import { baseStyle, combine } from './types'

const disc: Field = (u, v) => {
  const disc = Math.max(0, 1 - Math.hypot(u - .5, v - .5) * 2.1)
  const ring = Math.abs(Math.hypot(u - .5, v - .5) - .3) < .012 ? .9 : 0
  const hole = Math.hypot(u - .5, v - .5) < .04 ? .95 : 0
  return Math.min(1, Math.max(.06 + (1 - v) * .12, disc * .55, ring, hole))
}
const groove = spiralField(0.5, 0.5, 3.5, 22)

export const albumArt: WidgetPreset = {
  id: 'album-art', name: 'Album Art', group: 'photo',
  grid: { cols: 48, rows: 48 }, style: baseStyle,
  field: () => combine(disc, (u, v) => groove(u, v) * 0.32),
}
