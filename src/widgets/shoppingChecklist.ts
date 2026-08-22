import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

const checklist: Field = (u, v) => {
  const rowCount = 4
  const rowIdx = Math.floor(v * rowCount)
  if (rowIdx < 0 || rowIdx >= rowCount) return 0
  const ly = ((v * rowCount) % 1 - .5)
  const box = u > .06 && u < .16 && Math.abs(ly) < .07
  const line = u > .24 && u < .92 && Math.abs(ly) < .03 && rowIdx !== 1 ? .55 : 0
  const checked = rowIdx < 2
  return Math.max(box ? (checked ? .95 : .3) : 0, checked ? line * .4 : line)
}

export const shoppingChecklist: WidgetPreset = {
  id: 'shopping-checklist', name: 'Shopping Checklist', group: 'composite',
  grid: { cols: 34, rows: 20 }, style: baseStyle,
  field: () => checklist,
  paint: accentHigh(.85),
}
