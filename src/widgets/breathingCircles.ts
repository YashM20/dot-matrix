import { breathingField } from '../engine/fields/polarField'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle } from './types'

/** Live phase factory — call per frame with t (seconds or rAF phase) to animate. */
export const breathingCirclesField = (phase = 0) => breathingField(phase)
export const breathingCircles: WidgetPreset = {
  id: 'breathing-circles', name: 'Breathing Circles', group: 'polar', live: true,
  grid: { cols: 26, rows: 26 }, style: baseStyle,
  field: () => breathingField(0),
  // Animate in Board/playground via: DotCanvas field={breathingCirclesField(phase)} with phase driven by requestAnimationFrame.
  paint: accentHigh(.9),
}
