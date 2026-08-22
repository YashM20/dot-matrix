import type { DotStyle, Field, GridConfig } from '../../engine'
import { dot480, presets } from '../../engine'
import { sampleField } from '../../engine/sampler/gridSampler'
import { renderSVG } from '../../engine/renderer/svgRenderer'
import { widgetById } from '../../widgets'
import type { PlaygroundState } from './store'

export interface ResolvedWidget {
  id: string
  name: string
  field: () => Field
  grid: GridConfig
  style: DotStyle
  paint?: (dots: ReturnType<typeof sampleField>, theme: typeof dot480) => void
}

export function resolveCurrent(state: PlaygroundState): ResolvedWidget {
  const preset = widgetById(state.presetId) ?? widgetById('clock')!
  const photo = state.photoField
  return {
    id: preset.id,
    name: photo ? 'PHOTO HALFTONE' : preset.name,
    field: photo ? () => photo : preset.field,
    grid: { ...preset.grid, pitch: state.pitch },
    style: {
      shape: state.shape,
      sizeMin: state.sizeMin,
      sizeMax: state.sizeMax,
      cornerRoundness: state.cornerRoundness,
      opacityMode: 'fromValue',
      jitter: state.jitter,
      quantizeSteps: state.quantizeSteps || undefined,
    },
    paint: photo ? undefined : preset.paint,
  }
}

export function getTheme(state: PlaygroundState) { return presets[state.theme] ?? dot480 }
export function renderCurrentSVG(state: PlaygroundState): string {
  const widget = resolveCurrent(state)
  const theme = getTheme(state)
  const dots = sampleField(widget.field(), widget.grid, widget.style, theme)
  if (widget.paint) widget.paint(dots, theme)
  return renderSVG(dots, widget.grid.cols * widget.grid.pitch!, widget.grid.rows * widget.grid.pitch!)
}

export function snippetFor(state: PlaygroundState): string {
  const widget = resolveCurrent(state)
  const themeStr = state.theme !== 'dot480' ? `\n  theme="${state.theme}"` : ''
  const animStr = state.animated ? `\n  animated` : ''
  return `<DotWidget\n  type="${widget.id}"\n  density={${state.pitch}}\n  dotShape="${state.shape}"\n  roundness={${state.cornerRoundness}}${themeStr}${animStr}\n  size={{ w: ${widget.grid.cols * state.pitch}, h: ${widget.grid.rows * state.pitch} }}\n/>`
}
