import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const portrait: Field = (u, v) => {
  const head = Math.max(0, 1 - Math.hypot(u - .5, v - .34) * 4.2)
  const shoulders = Math.max(0, 1 - Math.hypot(u - .5, (v - .92) * 1.7) * 2.6)
  const backdrop = Math.max(.08, .32 - Math.abs(u - .5) * .3 + v * .12)
  return Math.min(1, Math.max(backdrop, head * 1.05, shoulders * .9))
}

export const portraitArt: WidgetPreset = {
  id: 'portrait-art', name: 'Portrait Art', group: 'photo',
  grid: { cols: 52, rows: 52 }, style: { ...baseStyle, cornerRoundness: .45 },
  field: () => portrait,
}
