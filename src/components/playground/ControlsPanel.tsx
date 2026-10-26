import type { DotStyle } from '../../engine'
import { squircleExponent } from '../../engine'
import { widgetPresets } from '../../widgets'
import { More } from '../More'
import { usePlayground, type ThemeName } from './store'

const shapes: DotStyle['shape'][] = ['circle', 'square', 'squircle']

export function ControlsPanel() {
  const s = usePlayground()

  const handleRandomize = () => {
    const preset = widgetPresets[Math.floor(Math.random() * widgetPresets.length)]
    s.setPreset(preset.id)
    s.setShape(shapes[Math.floor(Math.random() * shapes.length)])
    s.setCornerRoundness(Math.round(Math.random() * 100) / 100)
    s.setTheme(Math.random() > 0.5 ? 'deerflowMosaic' : 'dot480')
  }

  return (
    <section className="pg-panel pg-controls">
      <div className="pg-controls-head">
        <h2>CONTROLS</h2>
        <div className="pg-controls-actions">
          <button onClick={s.resetStyle} title="Back to the preset's own style">RESET</button>
          <button onClick={handleRandomize} title="Pick a random preset + shape">RANDOMIZE</button>
        </div>
      </div>

      <div className="pg-control-group">
        <h3>FORM</h3>
        <label>
          <span>DENSITY <small className="pg-hint">pitch</small></span>
          <input type="range" min={1.5} max={8} step={0.25} value={s.pitch} onChange={e => s.setPitch(+e.target.value)} />
          <b>{s.pitch}PX</b>
        </label>
        <label>
          <span>SHAPE</span>
          <select value={s.shape} onChange={e => s.setShape(e.target.value as DotStyle['shape'])}>{shapes.map(x => <option key={x}>{x}</option>)}</select>
          <b style={{ fontSize: 9 }}>{s.shape.toUpperCase()}</b>
        </label>
        <label>
          <span>ROUNDNESS <small className="pg-hint">n={squircleExponent(s.cornerRoundness).toFixed(1)}</small></span>
          <input type="range" min={0} max={1} step={0.02} value={s.cornerRoundness} onChange={e => s.setCornerRoundness(+e.target.value)} />
          <b>{s.cornerRoundness.toFixed(2)}</b>
        </label>
        <p className="pg-hint">0 = circle (n=2) · 0.26 = squircle (n=4) · 1 = square</p>
      </div>

      <More id="tune-advanced" label="Dot size & texture" tech="advanced" className="pg-control-group">
        <label>
          <span>SIZE MIN</span>
          <input type="range" min={0} max={2} step={0.05} value={s.sizeMin} onChange={e => s.setSizeMin(+e.target.value)} />
          <b>{s.sizeMin.toFixed(2)}</b>
        </label>
        <label>
          <span>SIZE MAX</span>
          <input type="range" min={0.2} max={4} step={0.05} value={s.sizeMax} onChange={e => s.setSizeMax(+e.target.value)} />
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
      </More>

      <More id="tune-appearance" label="Theme & motion" tech="appearance" className="pg-control-group">
        <label>
          <span>THEME</span>
          <select value={s.theme} onChange={e => s.setTheme(e.target.value as ThemeName)}><option value="dot480">DOT480</option><option value="deerflowMosaic">MOSAIC</option></select>
          <b style={{ fontSize: 9 }}>{s.theme === 'dot480' ? '480' : 'MOSAIC'}</b>
        </label>
        <label>
          <span>ANIMATED</span>
          <input type="checkbox" checked={s.animated} onChange={e => s.setAnimated(e.target.checked)} />
          <b>{s.animated ? 'ON' : 'OFF'}</b>
        </label>
        <p className="pg-hint">Runs the preset clock at 12 fps on Canvas; static presets just re-sample</p>
      </More>
    </section>
  )
}
