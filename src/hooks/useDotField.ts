import { useEffect, useMemo, useState } from 'react'
import { sampleField, sampleLayers } from '../engine'
import type { DotInstance, DotStyle, Field, GridConfig, Layer, ThemeTokens } from '../engine'
import type { WidgetContext } from '../widgets/types'

export type DotSource = { field: Field } | { layers: (ctx: WidgetContext) => Layer[] }

/**
 * Sample a field or layer-set onto the grid, memoised on primitive style/grid values so a
 * widget only re-samples when something visible changed (or `t` advanced for animation).
 */
export function useDotField(source: DotSource, grid: GridConfig, style: DotStyle, theme: ThemeTokens, t = 0, data: Record<string, number> = {}): DotInstance[] {
  const { cols, rows, pitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps } = style
  const dataKey = JSON.stringify(data)
  const field = 'field' in source ? source.field : undefined
  const layers = 'layers' in source ? source.layers : undefined
  return useMemo(() => {
    const g = { cols, rows, pitch }, s = { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps }
    return layers ? sampleLayers(layers({ t, data: JSON.parse(dataKey) }), g, s, theme) : sampleField(field!, g, s, theme)
  }, [field, layers, cols, rows, pitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, theme, t, dataKey])
}

/** Seconds since mount, advanced at `fps` while `running`; stays 0 otherwise. */
export function useClock(running: boolean, fps = 12): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (!running) return
    const start = performance.now(); let frame = 0, last = 0
    const loop = (now: number) => { frame = requestAnimationFrame(loop); if (now - last < 1000 / fps) return; last = now; setT((now - start) / 1000) }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [running, fps])
  return running ? t : 0
}
