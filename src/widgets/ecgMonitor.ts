import { amplitudeField, ecgAmplitudes, sumOfSinesAmplitudes, traceField } from '../engine/fields/waveformField'
import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle, combine, dim, place } from './types'

export const musicPlayer: WidgetPreset = {
  id: 'music-player', name: 'Music Player', group: 'chart', live: true,
  grid: { cols: 52, rows: 16 }, style: baseStyle,
  field: () => combine(
    amplitudeField(sumOfSinesAmplitudes(52, 3.3)),
    (u) => Math.abs(u - .38) < .014 ? 1 : 0,
  ),
  paint: (dots, theme) => { const maxX = Math.max(...dots.map(d => d.x), 1); for (const dot of dots) if (Math.abs(dot.x / maxX - .38) < .018 && dot.opacity > .2) dot.color = theme.dotActive },
}

export const ecgMonitor: WidgetPreset = {
  id: 'ecg-monitor', name: 'ECG Monitor', group: 'chart', live: true,
  grid: { cols: 56, rows: 18 }, style: baseStyle,
  field: () => {
    const trace = traceField(ecgAmplitudes(56, 0), 0.038)
    return combine(
      place(trace, 0, .12, 1, .62),
      place(dim(textField('72'), .75), .04, .02, .22, .5),
    )
  },
  paint: accentHigh(.9),
}
