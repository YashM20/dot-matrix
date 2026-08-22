import { corridorField } from '../engine/fields/projection3D'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

export const mazeGame: WidgetPreset = {
  id: 'maze-game', name: 'Maze Game', group: 'scatter', live: true,
  grid: { cols: 40, rows: 40 }, style: { ...baseStyle, shape: 'square', cornerRoundness: .2 },
  field: () => corridorField(7, 1.6),
  paint: toneByValue(),
}
