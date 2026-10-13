import type { DotStyle, ThemeTokens } from '../engine'
import { dot480 } from '../engine'
import { useMemo } from 'react'
import type { WidgetPreset } from '../widgets'
import { widgetById, withChrome } from '../widgets'
import { DotCanvas } from './DotCanvas'

export interface DotWidgetProps {
  /** Preset id from `widgetPresets` (ignored when `preset` is given). */
  type: string
  /** Dot pitch in px — the one responsive lever (DESIGN.md › Density Scaling). */
  density?: number
  dotShape?: DotStyle['shape']
  roundness?: number
  /** Override the preset's own grid, in px; cols/rows are derived from density. */
  size?: { w: number; h: number }
  theme?: ThemeTokens
  /** Run the preset's clock. Defaults to the preset's `animated` flag. */
  animated?: boolean
  data?: Record<string, number>
  tick?: number
  preset?: WidgetPreset
}

export function DotWidget({ type, density, dotShape, roundness, size, theme = dot480, animated, data, tick, preset: presetProp }: DotWidgetProps) {
  const preset = presetProp ?? widgetById(type)
  const layers = useMemo(() => preset && withChrome(preset), [preset])
  if (!preset || !layers) return null
  const native = preset.grid.pitch ?? theme.gridPx, pitch = density ?? native, k = pitch / native
  // radii are px tuned for the preset's own pitch — scale them with density so dots keep their proportion
  const style: DotStyle = { ...preset.style, sizeMin: preset.style.sizeMin * k, sizeMax: preset.style.sizeMax * k, shape: dotShape ?? preset.style.shape, cornerRoundness: roundness ?? preset.style.cornerRoundness }
  const grid = size ? { pitch, cols: Math.max(4, Math.round(size.w / pitch)), rows: Math.max(4, Math.round(size.h / pitch)) } : { ...preset.grid, pitch }
  return (
    // role="img": the card is one dot-matrix picture; its children (label text, canvas) are presentational
    <article className={`dot-card${preset.bleed ? ' dot-card--bleed' : ''}`} role="img" aria-label={preset.live ? `${preset.name} (live)` : preset.name}>
      {preset.chrome !== 'dots' && <header className="dot-card-head" aria-hidden="true">
        <span className="dot-card-label">{preset.name.toUpperCase()}</span>
        {preset.live && <i className="status-dot" />}
      </header>}
      <div className="dot-card-body">
        <DotCanvas layers={layers} data={{ ...preset.defaults, ...data }} grid={grid} style={style} theme={theme} animated={animated ?? preset.animated} tick={tick} />
      </div>
    </article>
  )
}
