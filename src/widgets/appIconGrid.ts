import { cachedIconField } from '../engine/fields/iconSDF'
import { spiralField, truchetField } from '../engine/fields/warpedField'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle, place, toneByValue } from './types'

const glyphs = ['□', '▂', '☼', '◯', '◐', '⬡', '▭', '▲', '≡']
const truchetOverlay = truchetField(4)
const spiralOverlay = spiralField(0.5, 0.5, 1.8, 14)
const cellField = (index: number): Field => {
  const col = index % 3, rowIdx = Math.floor(index / 3)
  const x = col * .34, y = rowIdx * .34, w = .26, h = .26
  if (index === 4) return place(truchetOverlay, x, y, w, h)
  if (index === 7) return place(spiralOverlay, x, y, w, h)
  const inner = cachedIconField(`appicon-${glyphs[index]}`, glyphs[index], 24)
  return (u, v) => (u < x || u > x + w || v < y || v > y + h) ? 0 : inner((u - x) / w, (v - y) / h)
}

export const appIconGrid: WidgetPreset = {
  id: 'app-icon-grid', name: 'App Icon Grid', group: 'icon',
  grid: { cols: 27, rows: 27 }, style: baseStyle,
  field: () => (u, v) => Math.max(...glyphs.map((_, i) => cellField(i)(u, v))),
  paint: toneByValue(),
}
