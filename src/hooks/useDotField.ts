import { useMemo } from 'react'
import { sampleField, sampleLayers } from '../engine'
import type { DotInstance, DotStyle, Field, FrameContext, GridConfig, Layer, ThemeTokens } from '../engine'
import type { WidgetContext } from '../widgets/types'

export type DotSource = { field: Field } | { layers: (ctx: WidgetContext) => Layer[] }
/** Interaction fields of the frame context (P2), filled by the input layer in `DotCanvas`. */
export type InteractionContext = Pick<FrameContext, 'hover' | 'pressed' | 'focus' | 'pointers'>

/**
 * Sample a field or layer-set onto the grid, memoised on primitive style/grid values so a
 * widget only re-samples when something visible changed (or `t` advanced for animation).
 */
const NONE: DotInstance[] = []
/**
 * `enabled: false` skips sampling entirely (cards whose entrance has not started yet).
 * `ix` adds hover / pressed / focus / pointers to the layers' context (omitted at rest).
 */
export function useDotField(source: DotSource, grid: GridConfig, style: DotStyle, theme: ThemeTokens, t = 0, data: Record<string, number> = {}, enabled = true, ix?: InteractionContext): DotInstance[] {
  const { cols, rows, pitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps } = style
  const dataKey = JSON.stringify(data)
  const ixKey = ix ? JSON.stringify(ix) : ''
  const field = 'field' in source ? source.field : undefined
  const layers = 'layers' in source ? source.layers : undefined
  return useMemo(() => {
    if (!enabled) return NONE
    const g = { cols, rows, pitch }, s = { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps }
    const extra = ixKey ? JSON.parse(ixKey) as InteractionContext : undefined
    // a broken preset renders blank instead of taking the whole board down
    try { return layers ? sampleLayers(layers({ t, data: JSON.parse(dataKey), grid: g, ...extra }), g, s, theme) : sampleField(field!, g, s, theme) }
    catch (error) { console.error('useDotField: sampling failed', error); return [] }
  }, [field, layers, cols, rows, pitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, theme, t, dataKey, enabled, ixKey])
}
