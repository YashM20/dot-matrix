import { useState } from 'react'
import { DotCanvas, type RenderMode } from '../DotCanvas'
import { usePlayground } from './store'
import { getTheme, resolveCurrent } from './render'

export function PreviewCanvas() {
  const state = usePlayground()
  const [showThemeBg, setShowThemeBg] = useState(true)
  const [mode, setMode] = useState<RenderMode>('svg')
  const widget = resolveCurrent(state)
  const theme = getTheme(state)
  const bg = showThemeBg ? theme.bg : '#000000'
  const { pitch } = state
  const dims = `${widget.grid.cols * pitch}×${widget.grid.rows * pitch}px   •   ${widget.grid.cols}×${widget.grid.rows} @ ${pitch}px`

  return (
    <section className="pg-panel pg-preview">
      <div className="pg-preview-head">
        <h2>PREVIEW — {widget.name.toUpperCase()}</h2>
        <div className="pg-preview-actions">
          <span className="pg-preview-badge">{mode.toUpperCase()}</span>
          <button className="pg-bg-toggle" onClick={() => setShowThemeBg(v => !v)} title="Toggle preview background">
            {showThemeBg ? 'THEME BG' : 'BLACK BG'}
          </button>
        </div>
      </div>
      <div id="pg-svg-host" className="pg-stage" style={{ background: bg }}>
        <div className="pg-oled-frame">
          <DotCanvas layers={widget.layers} data={widget.data} grid={widget.grid} style={widget.style} theme={theme} animated={widget.animated} springKeys={widget.springKeys} onMode={setMode} />
        </div>
      </div>
      <div className="pg-preview-meta">
        <span>{dims}</span>
        <span className="pg-preview-theme">{state.theme.toUpperCase()}</span>
      </div>
    </section>
  )
}
