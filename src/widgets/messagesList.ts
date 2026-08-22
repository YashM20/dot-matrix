import type { WidgetPreset } from './types'
import { baseStyle, combine } from './types'

const avatar = (cx: number, cy: number) => (u: number, v: number) => { const dx = (u - cx) / 0.07, dy = (v - cy) / 0.13; const d = Math.hypot(dx, dy); return d < 0.85 ? 0.85 : d < 1 ? 0.35 : 0 }
const rowBg = (y: number, h: number) => (u: number, v: number) => v > y && v < y + h && u > 0.02 && u < 0.98 ? 0.18 : 0
const textLine = (x: number, y: number, w: number) => (u: number, v: number) => u > x && u < x + w && Math.abs(v - y) < 0.02 ? 0.9 : 0

export const messagesList: WidgetPreset = {
  id: 'messages-list', name: 'Messages List', group: 'composite',
  grid: { cols: 34, rows: 18 }, style: baseStyle,
  field: () => combine(
    rowBg(0.05, 0.38), rowBg(0.52, 0.38),
    avatar(0.1, 0.24), avatar(0.1, 0.71),
    textLine(0.22, 0.18, 0.42), textLine(0.22, 0.26, 0.5), textLine(0.68, 0.18, 0.14), textLine(0.68, 0.66, 0.14),
    textLine(0.22, 0.62, 0.38), textLine(0.22, 0.72, 0.48),
  ),
}
