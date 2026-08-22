import { ringField } from '../engine/fields/polarField'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle, combine, dim } from './types'

const avatar: Field = (u, v) => Math.max(0, 1 - Math.hypot(u - .5, v - .5) * 3.4)

export const agentAvatarRing: WidgetPreset = {
  id: 'agent-avatar-ring', name: 'Agent Avatar Ring', group: 'polar', live: true,
  grid: { cols: 22, rows: 22 }, style: baseStyle,
  field: () => combine(dim(ringField(.5, .5, .4, .48, -Math.PI / 2, Math.PI * 2), .45), avatar),
  paint: (dots, theme) => { for (const dot of dots) if (dot.opacity > .6) dot.color = dot.opacity >= .95 ? theme.dotIdle : theme.dotFaint! },
}
