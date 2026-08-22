import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

const slots = [0, 1, 2, 3, 4, 5]
const pinField = (u: number, v: number): number => {
  const i = Math.floor(u * 6)
  if (!slots.includes(i) || Math.abs(v - .5) > .24) return 0
  const d = Math.hypot(((u * 6) % 1 - .5) / .24, (v - .5) / .24)
  const filled = i < 4
  if (filled) return d <= 1 ? .95 : 0
  return Math.abs(d - .8) < .2 ? .25 : 0
}

export const passwordDotsRing: WidgetPreset = {
  id: 'password-dots-ring', name: 'Password Dots', group: 'scatter',
  grid: { cols: 30, rows: 10 }, style: baseStyle,
  field: () => pinField,
  paint: accentHigh(.85),
}
