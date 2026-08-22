import { amplitudeField, sumOfSinesAmplitudes } from '../engine/fields/waveformField'
import type { WidgetPreset } from './types'
import { baseStyle } from './types'

export const audioRecorder: WidgetPreset = {
  id: 'audio-recorder', name: 'Audio Recorder', group: 'chart', live: true,
  grid: { cols: 48, rows: 16 }, style: baseStyle,
  field: () => amplitudeField(sumOfSinesAmplitudes(48, 2.4)),
}
