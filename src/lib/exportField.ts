import { sampleField } from '../engine/sampler/gridSampler'
import { renderSVG } from '../engine/renderer/svgRenderer'
import type { Field, GridConfig, DotStyle, ThemeTokens } from '../engine/types'
import { dot480 } from '../engine/theme/tokens'

export function fieldToSVG(field: Field, grid: GridConfig, style: DotStyle, theme: ThemeTokens = dot480): string {
  const dots = sampleField(field, grid, style, theme)
  const pitch = grid.pitch ?? theme.gridPx
  return renderSVG(dots, grid.cols * pitch, grid.rows * pitch)
}

export function fieldSnippet(fieldName: string, grid: GridConfig, style: DotStyle): string {
  return `<DotCanvas field={${fieldName}} grid={{cols:${grid.cols},rows:${grid.rows},pitch:${grid.pitch ?? 4}}} style={${JSON.stringify(style)}} />`
}
