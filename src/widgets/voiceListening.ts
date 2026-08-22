import { amplitudeField, sumOfSinesAmplitudes } from '../engine/fields/waveformField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const voiceListening: WidgetPreset = {
  id: 'voice-listening', name: 'Voice Listening', group: 'chart', live: true,
  grid: { cols: 40, rows: 14 }, style: baseStyle,
  field: () => amplitudeField(sumOfSinesAmplitudes(40, 5.1)),
}
