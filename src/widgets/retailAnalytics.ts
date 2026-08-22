import { catmullRomField } from '../engine/fields/splineField'
import { textField } from '../engine/fields/bitmapFont'
import type { WidgetPreset } from './types'
import { accentHigh, baseStyle, combine, place } from './types'

export const retailAnalytics: WidgetPreset = {
  id: 'retail-analytics', name: 'Retail Analytics', group: 'chart',
  grid: { cols: 46, rows: 20 }, style: baseStyle,
  field: () => combine(
    place(catmullRomField([[0, .75], [.22, .4], [.45, .58], [.68, .22], [1, .34]], .5), 0, .25, 1, .7),
    place(textField('+23%'), .6, .02, .38, .24),
  ),
  paint: accentHigh(.9),
}
