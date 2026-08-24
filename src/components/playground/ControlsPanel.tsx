import { useCallback, useState } from 'react'
import type { DotStyle } from '../../engine'
import { widgetPresets } from '../../widgets'
import { usePlayground } from './store'

const shapes: DotStyle['shape'][] = ['circle', 'square', 'squircle']

const defaults = {
  pitch: 4,
  shape: 'squircle' as const,
  sizeMin: 0.3,
  sizeMax: 1.6,
  cornerRoundness: 0.72,
  jitter: 0,
  quantizeSteps: 5,
  theme: 'dot480' as const,
  animated: false,
}

export function ControlsPanel() {
  const s = usePlayground()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ advanced: true, appearance: true })
  const toggle = (g: string) => setCollapsed(c => ({ ...c, [g]: !c[g] }))

  const handleReset = useCallback(() => {
    s.setPitch(defaults.pitch)
    s.setShape(defaults.shape)
    s.setSizeMin(defaults.sizeMin)
    s.setSizeMax(defaults.sizeMax)
    s.setCornerRoundness(defaults.cornerRoundness)
    s.setJitter(defaults.jitter)
    s.setQuantizeSteps(defaults.quantizeSteps)
    s.setTheme(defaults.theme)
    s.setAnimated(defaults.animated)
  }, [s])

  const handleRandomize = useCallback(() => {
    const preset = widgetPresets[Math.floor(Math.random() * widgetPresets.length)]
    s.setPreset(preset.id)
    s.setPitch(2 + Math.floor(Math.random() * 7))
    s.setShape(shapes[Math.floor(Math.random() * shapes.length)])
    const min = Math.round(Math.random() * 60) / 100
    const max = Math.round((0.8 + Math.random() * 1.2) * 100) / 100
    s.setSizeMin(Math.min(min, max - 0.4))
    s.setSizeMax(Math.max(max, min + 0.4))
    s.setCornerRoundness(Math.round(Math.random() * 100) / 100)
    s.setJitter(Math.round(Math.random() * 20) / 20)
    s.setQuantizeSteps(Math.floor(Math.random() * 11))
    s.setTheme(Math.random() > 0.5 ? 'deerflowMosaic' : 'dot480')
    s.setAnimated(Math.random() > 0.5)
  }, [s])

  return (
    <section className="pg-panel pg-controls">
      <div className="pg-controls-head">
        <h2>CONTROLS</h2>
        <div className="pg-controls-actions">
          <button onClick={handleReset} title="Reset to defaults">RESET</button>
          <button onClick={handleRandomize} title="Pick random preset + params">RANDOMIZE</button>
        </div>
      </div>

      <div className="pg-control-group">
        <h3>FORM</h3>

        <label>
          <span>DENSITY <small className="pg-hint">pitch</small></span>
          <input type="range" min={2} max={8} step={1} value={s.pitch} onChange={e => s.setPitch(+e.target.value)} />
          <b>{s.pitch}PX</b>
        </label>

        <label>
          <span>SHAPE</span>
          <select value={s.shape} onChange={e => s.setShape(e.target.value as DotStyle['shape'])}>{shapes.map(x => <option key={x}>{x}</option>)}</select>
          <b style={{ fontSize: 9 }}>{s.shape.toUpperCase()}</b>
        </label>

        <label>
          <span>ROUNDNESS <small className="pg-hint">squircle</small></span>
          <input type="range" min={0} max={1} step={0.02} value={s.cornerRoundness} onChange={e => s.setCornerRoundness(+e.target.value)} />
          <b>{s.cornerRoundness.toFixed(2)}</b>
        </label>
        <p className="pg-hint">0 = circle · 1 = square-ish</p>
      </div>

      <div className="pg-control-group">
        <button className="pg-group-toggle" onClick={() => toggle('advanced')}>
          <h3>ADVANCED</h3>
          <span className={`pg-group-arrow ${collapsed.advanced ? '' : 'open'}`} />
        </button>
        {!collapsed.advanced && <>
          <label>
            <span>SIZE MIN</span>
            <input type="range" min={0} max={1.6} step={0.05} value={s.sizeMin} onChange={e => s.setSizeMin(+e.target.value)} />
            <b>{s.sizeMin.toFixed(2)}</b>
          </label>

          <label>
            <span>SIZE MAX</span>
            <input type="range" min={0.4} max={2} step={0.05} value={s.sizeMax} onChange={e => s.setSizeMax(+e.target.value)} />
            <b>{s.sizeMax.toFixed(2)}</b>
          </label>
          <p className="pg-hint">Max dot radius in grid units</p>

          <label>
            <span>JITTER</span>
            <input type="range" min={0} max={1} step={0.05} value={s.jitter} onChange={e => s.setJitter(+e.target.value)} />
            <b>{s.jitter.toFixed(2)}</b>
          </label>
          <p className="pg-hint">0 = gridded · 1 = organic offset</p>

          <label>
            <span>QUANTIZE</span>
            <input type="range" min={0} max={10} step={1} value={s.quantizeSteps} onChange={e => s.setQuantizeSteps(+e.target.value)} />
            <b>{s.quantizeSteps || 'OFF'}</b>
          </label>
          <p className="pg-hint">Posterize dot sizes into N steps</p>
        </>}
      </div>

      <div className="pg-control-group">
        <button className="pg-group-toggle" onClick={() => toggle('appearance')}>
          <h3>APPEARANCE</h3>
          <span className={`pg-group-arrow ${collapsed.appearance ? '' : 'open'}`} />
        </button>
        {!collapsed.appearance && <>
          <label>
            <span>THEME</span>
            <select value={s.theme} onChange={e => s.setTheme(e.target.value as 'dot480' | 'deerflowMosaic')}><option value="dot480">DOT480</option><option value="deerflowMosaic">MOSAIC</option></select>
            <b style={{ fontSize: 9 }}>{s.theme === 'dot480' ? '480' : 'MOSAIC'}</b>
          </label>
          <label>
            <span>ANIMATED</span>
            <input type="checkbox" checked={s.animated} onChange={e => s.setAnimated(e.target.checked)} />
            <b>{s.animated ? 'ON' : 'OFF'}</b>
          </label>
          <p className="pg-hint">SVG under 2000 dots, Canvas above or when animated</p>
        </>}
      </div>
    </section>
  )
}
