import { cachedIconField, iconPaths } from '../engine/fields/iconSDF'
import type { Field } from '../engine/types'
import type { WidgetPreset } from './types'
import { baseStyle, place } from './types'

const row = (v: number): Field => (u, y) => Math.abs(y - v) < .05 && u > .16 && u < .95 ? .6 : 0

export const settingsList: WidgetPreset = {
  id: 'settings-list', name: 'Settings List', group: 'icon',
  grid: { cols: 30, rows: 24 }, style: baseStyle,
  field: () => {
    const rows = [row(.17), row(.39), row(.61), row(.83)]
    const icons = [place(cachedIconField('cloud', iconPaths.cloud, 32), .03, .08, .11, .18), place(cachedIconField('car', iconPaths.car, 32), .03, .3, .11, .18), place(cachedIconField('leaf', iconPaths.leaf, 32), .03, .52, .11, .18)]
    return (u, v) => Math.max(...rows.map(f => f(u, v)), ...icons.map(f => f(u, v)))
  },
}
