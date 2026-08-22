import { catmullRomField } from '../engine/fields/splineField'
import type { WidgetPreset } from './types'
import { baseStyle, combine } from './types'

const center: [number, number] = [0.5, 0.5]
const nodes: [number, number][] = [[0.18, 0.25], [0.5, 0.12], [0.82, 0.25], [0.82, 0.55], [0.62, 0.78], [0.34, 0.78]]
const spokes = nodes.map(n => catmullRomField([center, [(center[0] + n[0]) / 2, (center[1] + n[1]) / 2], n], 0.5))
const dots = (u: number, v: number) => { let b = Infinity; for (const n of [...nodes, center]) b = Math.min(b, Math.hypot(u - n[0], v - n[1])); return b < 0.055 ? 0.9 : 0 }
const oneRed = (u: number, v: number) => Math.hypot(u - 0.82, v - 0.25) < 0.055 ? 1 : 0

export const wikiGraph: WidgetPreset = {
  id: 'wiki-graph', name: "Henry's Wiki", group: 'chart', live: true,
  grid: { cols: 28, rows: 28 }, style: baseStyle,
  field: () => combine(...spokes, dots, oneRed),
  paint: (dotsArr, t) => { for (const d of dotsArr) if (d.opacity >= 0.95 && Math.hypot(d.x - 0.82 * 112, d.y - 0.25 * 112) < 10) d.color = t.dotActive },
}
