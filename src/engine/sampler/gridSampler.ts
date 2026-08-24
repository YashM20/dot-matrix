import type { DotInstance, DotStyle, Field, GridConfig, ThemeTokens } from '../types'
import { applyJitter } from './jitter'
import { quantize } from './quantize'
/**
 * Canonical tone mapping — single source of truth for dot color by value.
 * Thresholds mirror DESIGN.md Dot Grey Scale and widgets/types toneByValue:
 *   value <= 0        → dotFaint (background / near-zero)
 *   0 < value ≤ 0.34  → dotFaint  (≈ bottom third)
 *   0.34 < value ≤ 0.67 → dotMid (≈ middle third)
 *   0.67 < value ≤ 1  → dotIdle   (≈ top third, brightest static)
 * dotActive is never returned here — widgets opt into it via paint/paintFor.
 * Keep thresholds stable; widgets must not invent ad-hoc bands.
 */
export function colorFor(value: number, theme: ThemeTokens): string {
  if (value <= 0.34) return theme.dotFaint ?? theme.dotIdle
  if (value <= 0.67) return theme.dotMid ?? theme.dotIdle
  return theme.dotIdle
}
/** Alias kept for widget parity — toneByValue(0.34,0.67) === colorFor */
export const toneByValue = colorFor
export type ColorFor = (value: number, theme: ThemeTokens) => string
export function sampleField(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens, colorForFn: ColorFor = colorFor): DotInstance[] {
  const pitch = grid.pitch ?? theme.gridPx; const dots: DotInstance[] = []
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    let value = Math.max(0, Math.min(1, field(grid.cols === 1 ? .5 : col / (grid.cols - 1), grid.rows === 1 ? .5 : row / (grid.rows - 1))))
    if (style.quantizeSteps) value = quantize(value, style.quantizeSteps)
    const eased = style.sizeCurve ? style.sizeCurve(value) : value
    const [x, y] = applyJitter([col * pitch + pitch / 2, row * pitch + pitch / 2], style.jitter ?? 0, row * grid.cols + col)
    dots.push({ x, y, r: style.sizeMin + (style.sizeMax - style.sizeMin) * eased, opacity: style.opacityMode === 'constant' ? 1 : value, color: colorForFn(value, theme), shape: style.shape, roundness: style.cornerRoundness })
  }
  return dots
}
