import type { DotStyle } from '../../engine'
import { usePlayground } from './store'

const shapes: DotStyle['shape'][] = ['circle', 'square', 'squircle']

export function ControlsPanel() {
  const s = usePlayground()
  return (
    <section className="pg-panel pg-controls">
      <h2>CONTROLS</h2>
      <label>DENSITY <input type="range" min={2} max={8} step={1} value={s.pitch} onChange={e => s.setPitch(+e.target.value)} /><b>{s.pitch}PX</b></label>
      <label>SHAPE <select value={s.shape} onChange={e => s.setShape(e.target.value as DotStyle['shape'])}>{shapes.map(x => <option key={x}>{x}</option>)}</select></label>
      <label>SIZE MIN <input type="range" min={0} max={1.6} step={0.05} value={s.sizeMin} onChange={e => s.setSizeMin(+e.target.value)} /><b>{s.sizeMin.toFixed(2)}</b></label>
      <label>SIZE MAX <input type="range" min={0.4} max={2} step={0.05} value={s.sizeMax} onChange={e => s.setSizeMax(+e.target.value)} /><b>{s.sizeMax.toFixed(2)}</b></label>
      <label>ROUNDNESS <input type="range" min={0} max={1} step={0.02} value={s.cornerRoundness} onChange={e => s.setCornerRoundness(+e.target.value)} /><b>{s.cornerRoundness.toFixed(2)}</b></label>
      <label>JITTER <input type="range" min={0} max={1} step={0.05} value={s.jitter} onChange={e => s.setJitter(+e.target.value)} /><b>{s.jitter.toFixed(2)}</b></label>
      <label>QUANTIZE STEPS <input type="range" min={0} max={10} step={1} value={s.quantizeSteps} onChange={e => s.setQuantizeSteps(+e.target.value)} /><b>{s.quantizeSteps || 'OFF'}</b></label>
      <label>THEME <select value={s.theme} onChange={e => s.setTheme(e.target.value as 'dot480' | 'deerflowMosaic')}><option value="dot480">DOT480</option><option value="deerflowMosaic">DEERFLOW MOSAIC</option></select></label>
      <label>ANIMATED <input type="checkbox" checked={s.animated} onChange={e => s.setAnimated(e.target.checked)} /><b>{s.animated ? 'CANVAS' : 'SVG'}</b></label>
    </section>
  )
}
