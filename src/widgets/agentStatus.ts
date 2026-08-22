import type { WidgetPreset } from './types'
import { baseStyle } from './types'

const pulse = (u: number, v: number): number => {
  const rows = [0.14, 0.42, 0.7]
  for (let i = 0; i < rows.length; i++) {
    const dotX = .08 + i * .02
    if (Math.hypot((u - dotX) / .05, (v - rows[i]) / .18) < 1) return i === 0 ? 1 : i === 1 ? .6 : .3
    if (Math.abs(v - rows[i]) < .09 && u > .2 && u < (.5 + i * .15)) return i === 0 ? .8 : .35
  }
  return 0
}

export const agentStatus: WidgetPreset = {
  id: 'agent-status', name: 'Agent Status', group: 'composite', live: true,
  grid: { cols: 32, rows: 16 }, style: baseStyle,
  field: () => pulse,
}
