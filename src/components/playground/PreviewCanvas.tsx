import { useState } from 'react'
import { DotCanvas } from '../DotCanvas'
import { usePlayground } from './store'
import { getTheme, resolveCurrent } from './render'

export function PreviewCanvas() {
  const presetId = usePlayground(s => s.presetId)
  const pitch = usePlayground(s => s.pitch)
  const shape = usePlayground(s => s.shape)
  const sizeMin = usePlayground(s => s.sizeMin)
  const sizeMax = usePlayground(s => s.sizeMax)
  const cornerRoundness = usePlayground(s => s.cornerRoundness)
  const jitter = usePlayground(s => s.jitter)
  const quantizeSteps = usePlayground(s => s.quantizeSteps)
  const themeName = usePlayground(s => s.theme)
  const animated = usePlayground(s => s.animated)
  const photoField = usePlayground(s => s.photoField)
  const [showThemeBg, setShowThemeBg] = useState(true)
  const state = { presetId, pitch, shape, sizeMin, sizeMax, cornerRoundness, jitter, quantizeSteps, theme: themeName, animated, photoField } as Parameters<typeof resolveCurrent>[0]
  const widget = resolveCurrent(state)
  const theme = getTheme(state)
  const bg = showThemeBg ? theme.bg : '#000000'
  const dims = `${widget.grid.cols * pitch}×${widget.grid.rows * pitch}px   •   ${widget.grid.cols}×${widget.grid.rows} @ ${pitch}px`

  return (
    <section className="pg-panel pg-preview">
      <div className="pg-preview-head">
        <h2>PREVIEW — {widget.name.toUpperCase()}</h2>
        <div className="pg-preview-actions">
          <span className="pg-preview-badge">{animated ? 'CANVAS' : 'SVG'}</span>
          <button className="pg-bg-toggle" onClick={() => setShowThemeBg(v => !v)} title="Toggle preview background">
            {showThemeBg ? 'THEME BG' : 'BLACK BG'}
          </button>
        </div>
      </div>
      <div id="pg-svg-host" className="pg-stage" style={{ background: bg }}>
        <div className="pg-oled-frame">
          <DotCanvas field={widget.field()} grid={widget.grid} style={widget.style} theme={theme} paint={widget.paint} animated={animated} />
        </div>
      </div>
      <div className="pg-preview-meta">
        <span>{dims}</span>
        <span className="pg-preview-theme">{themeName.toUpperCase()}</span>
      </div>
    </section>
  )
}
