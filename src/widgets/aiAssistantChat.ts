import { gridField } from '../engine/fields/heatmapField'
import type { WidgetPreset } from './types'
import { baseStyle, toneByValue } from './types'

const bubbles = [
  [0, 0, 0, .9, .9, .9, .9, .9, .9, 0, 0, 0],
  [0, 0, 0, .5, .5, .5, .9, .9, .5, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, .6, .6, .6, .6, 0, 0, 0, 0, 0, 0, 0],
  [.25, .25, .6, .25, .25, 0, 0, 0, 0, 0, 0, 0],
]

export const aiAssistantChat: WidgetPreset = {
  id: 'ai-assistant-chat', name: 'AI Assistant Chat', group: 'composite', live: true,
  grid: { cols: 36, rows: 20 }, style: { ...baseStyle, cornerRoundness: .55 },
  field: () => gridField(bubbles),
  paint: toneByValue(),
}
