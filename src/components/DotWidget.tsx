import type { DotStyle } from '../engine'
import { dot480 } from '../engine'
import type { WidgetPreset } from '../widgets'
import { widgetById } from '../widgets'
import { DotCanvas } from './DotCanvas'

export interface DotWidgetProps {
  type: string
  density?: number
  dotShape?: DotStyle['shape']
  roundness?: number
  size?: { w: number; h: number }
  theme?: typeof dot480
  data?: Record<string, unknown>
  preset?: WidgetPreset
}

export function DotWidget({ type, density = 4, dotShape, roundness, size, theme = dot480, preset: presetProp }: DotWidgetProps) {
  const resolved = presetProp ?? widgetById(type)
  const pitch = density ?? dot480.gridPx
  const style = resolved ? {
    ...resolved.style,
    shape: dotShape ?? resolved.style.shape,
    cornerRoundness: roundness ?? resolved.style.cornerRoundness,
  } : null
  let grid = resolved ? { ...resolved.grid, pitch } : null
  if (size && grid) {
    const cols = Math.max(4, Math.round(size.w / pitch))
    const rows = Math.max(4, Math.round(size.h / pitch))
    grid = { ...grid, cols, rows }
  }
  if (!resolved || !style || !grid) return null
  return (
    <article className="dot-card">
      <header className="dot-card-head">
        <span className="dot-card-label">{resolved.name.toUpperCase()}</span>
        {resolved.live && <i className="status-dot" aria-label="live" />}
      </header>
      <div className="dot-card-body">
        <DotCanvas field={resolved.field()} grid={grid} style={style} theme={theme} paint={resolved.paint} />
      </div>
    </article>
  )
}
