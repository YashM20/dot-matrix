import { cachedIconField } from '../engine/fields/iconSDF'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

const glyphs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
const cellField = (index: number): Field => {
  const col = index % 3, rowIdx = Math.floor(index / 3)
  const inner = cachedIconField(`appicon-${glyphs[index]}`, glyphs[index], 24)
  return (u, v) => (u < col * .34 || u > col * .34 + .26 || v < rowIdx * .34 || v > rowIdx * .34 + .26) ? 0 : inner((u - col * .34) / .26, (v - rowIdx * .34) / .26)
}

export const appIconGrid: WidgetPreset = {
  id: 'app-icon-grid', name: 'App Icon Grid', group: 'icon',
  grid: { cols: 27, rows: 27 }, style: baseStyle,
  field: () => (u, v) => Math.max(...glyphs.map((_, i) => cellField(i)(u, v))),
  paint: toneByValue(),
}
