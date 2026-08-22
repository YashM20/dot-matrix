import type { DotInstance, DotStyle, Field, GridConfig, ThemeTokens } from '../types'
import { applyJitter } from './jitter'
import { quantize } from './quantize'
export function sampleField(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens): DotInstance[] {
  const pitch = grid.pitch ?? theme.gridPx; const dots: DotInstance[] = []
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    let value = Math.max(0, Math.min(1, field(grid.cols === 1 ? .5 : col / (grid.cols - 1), grid.rows === 1 ? .5 : row / (grid.rows - 1))))
    if (style.quantizeSteps) value = quantize(value, style.quantizeSteps)
    const eased = style.sizeCurve ? style.sizeCurve(value) : value
    const [x, y] = applyJitter([col * pitch + pitch / 2, row * pitch + pitch / 2], style.jitter ?? 0, row * grid.cols + col)
    dots.push({ x, y, r: style.sizeMin + (style.sizeMax - style.sizeMin) * eased, opacity: style.opacityMode === 'constant' ? 1 : value, color: theme.dotIdle, shape: style.shape, roundness: style.cornerRoundness })
  }
  return dots
}
