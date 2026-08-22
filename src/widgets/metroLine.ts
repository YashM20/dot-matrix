import { catmullRomField } from '../engine/fields/splineField'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

const stations: [number, number][] = [[.08, .62], [.28, .38], [.5, .52], [.72, .28], [.92, .42]]
const stationDot: Field = (u, v) => {
  let best = Infinity
  for (const [sx, sy] of stations) best = Math.min(best, Math.hypot(u - sx, v - sy))
  return best < .045 ? .95 : 0
}

export const metroLine: WidgetPreset = {
  id: 'metro-line', name: 'Metro Line', group: 'chart',
  grid: { cols: 44, rows: 16 }, style: baseStyle,
  field: () => (u, v) => Math.max(catmullRomField(stations)(u, v) * .8, stationDot(u, v)),
  paint: accentHigh(.85),
}
