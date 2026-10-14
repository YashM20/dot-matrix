import { useMemo } from 'react'
import { sampleField, sampleLayers } from '../engine'
import type { DotInstance, DotStyle, Field, GridConfig, Layer, ThemeTokens } from '../engine'
import type { WidgetContext } from '../widgets/types'

export type DotSource = { field: Field } | { layers: (ctx: WidgetContext) => Layer[] }

/**
 * Sample a field or layer-set onto the grid, memoised on primitive style/grid values so a
 * widget only re-samples when something visible changed (or `t` advanced for animation).
 */
const NONE: DotInstance[] = []
/** `enabled: false` skips sampling entirely (cards whose entrance has not started yet). */
export function useDotField(source: DotSource, grid: GridConfig, style: DotStyle, theme: ThemeTokens, t = 0, data: Record<string, number> = {}, enabled = true): DotInstance[] {
  const { cols, rows, pitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps } = style
  const dataKey = JSON.stringify(data)
  const field = 'field' in source ? source.field : undefined
  const layers = 'layers' in source ? source.layers : undefined
  return useMemo(() => {
    if (!enabled) return NONE
    const g = { cols, rows, pitch }, s = { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps }
    // a broken preset renders blank instead of taking the whole board down
    try { return layers ? sampleLayers(layers({ t, data: JSON.parse(dataKey), grid: g }), g, s, theme) : sampleField(field!, g, s, theme) }
    catch (error) { console.error('useDotField: sampling failed', error); return [] }
  }, [field, layers, cols, rows, pitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, theme, t, dataKey, enabled])
}
