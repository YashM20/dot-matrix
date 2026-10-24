import type { DotStyle, GridConfig, Layer } from '../../engine'
import { dot480, presets } from '../../engine'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { renderSVG } from '../../engine/renderer/svgRenderer'
import { widgetById, widgetPresets, withChrome, type WidgetContext } from '../../widgets'
import type { PlaygroundState } from './store'

export interface ResolvedWidget {
  id: string
  name: string
  layers: (ctx: WidgetContext) => Layer[]
  data: Record<string, number>
  defaults: Record<string, number>
  grid: GridConfig
  style: DotStyle
  animated: boolean
  /** The preset's `springKeys` (data glides instead of dissolving); none for photos. */
  springKeys?: string[]
}

export function resolveCurrent(state: PlaygroundState): ResolvedWidget {
  const preset = widgetById(state.presetId) ?? widgetPresets[0]
  const photo = state.photoField
  const defaults = preset.defaults ?? {}
  return {
    id: preset.id,
    name: photo ? 'PHOTO HALFTONE' : preset.name,
    layers: photo ? () => [{ field: photo, tone: 'auto' }] : withChrome(preset),
    data: { ...defaults, ...(state.widgetData[preset.id] ?? {}) },
    defaults,
    grid: { ...(photo ? state.photoGrid ?? preset.grid : preset.grid), pitch: state.pitch },
    style: {
      shape: state.shape,
      sizeMin: state.sizeMin,
      sizeMax: state.sizeMax,
      cornerRoundness: state.cornerRoundness,
      opacityMode: 'fromValue',
      jitter: state.jitter,
      // Photos keep continuous radii; UI widgets stay quantized (DESIGN.md › Do's and Don'ts).
      quantizeSteps: photo ? undefined : state.quantizeSteps || undefined,
    },
    animated: !photo && state.animated,
    springKeys: photo ? undefined : preset.springKeys,
  }
}

export function getTheme(state: PlaygroundState) { return presets[state.theme] ?? dot480 }
export function renderCurrentSVG(state: PlaygroundState): string {
  const widget = resolveCurrent(state)
  const dots = sampleLayers(widget.layers({ t: 0, data: widget.data }), widget.grid, widget.style, getTheme(state))
  return renderSVG(dots, widget.grid.cols * widget.grid.pitch!, widget.grid.rows * widget.grid.pitch!)
}

/** A copy-pasteable `<DotWidget>` that reproduces the preview. */
export function snippetFor(state: PlaygroundState): string {
  const widget = resolveCurrent(state)
  const props = [`type="${widget.id}"`, `density={${state.pitch}}`, `dotShape="${state.shape}"`, `roundness={${state.cornerRoundness}}`]
  if (state.theme !== 'dot480') props.push(`theme={${state.theme}}`)
  if (widget.animated) props.push('animated')
  const changed = Object.entries(widget.data).filter(([k, v]) => widget.defaults[k] !== v)
  if (changed.length) props.push(`data={{ ${changed.map(([k, v]) => `${k}: ${v}`).join(', ')} }}`)
  const imports = [`import { DotWidget } from './components/DotWidget'`, ...(state.theme !== 'dot480' ? [`import { ${state.theme} } from './engine'`] : [])]
  return `${imports.join('\n')}\n\n<DotWidget\n  ${props.join('\n  ')}\n/>`
}
