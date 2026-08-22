import { useMemo } from 'react'
import { sampleField } from '../engine'
import type { DotInstance, DotStyle, Field, GridConfig, ThemeTokens } from '../engine'

export function useDotField(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] {
  const { cols, rows, pitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps } = style
  return useMemo(
    () => sampleField(field, grid, style, theme),
    [field, cols, rows, pitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, theme],
  )
}
