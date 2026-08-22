import { amplitudeField, sumOfSinesAmplitudes } from '../engine/fields/waveformField'
import { cjkTextField } from '../engine/fields/cjkFallback'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim, place } from './types'

export const interpreterDual: WidgetPreset = {
  id: 'interpreter-dual', name: 'Interpreter Dual', group: 'chart', live: true,
  grid: { cols: 48, rows: 26 }, style: baseStyle,
  field: () => combine(
    place(amplitudeField(sumOfSinesAmplitudes(48, 1.7)), 0, 0.18, 1, .32),
    place(dim(amplitudeField(sumOfSinesAmplitudes(48, 4.2)), .6), 0, 0.54, 1, .32),
    place(cjkTextField('开始吧', 'Noto Sans SC'), 0.22, 0.88, 0.56, 0.12),
  ),
}
