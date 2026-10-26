import { widgetById } from '../../widgets'
import { More } from '../More'
import { usePlayground } from './store'

/** One slider per key in the selected preset's `defaults` — widgets opt in by declaring defaults. */
export function DataEditor() {
  return <More id="tune-data" label="Live data" tech="data" className="more--panel"><DataSliders /></More>
}

function DataSliders() {
  const presetId = usePlayground(s => s.presetId)
  const widgetData = usePlayground(s => s.widgetData)
  const setWidgetData = usePlayground(s => s.setWidgetData)
  const defaults = widgetById(presetId)?.defaults
  if (!defaults || Object.keys(defaults).length === 0) {
    return (
      <section className="pg-panel">
        <h2>DATA</h2>
        <p className="pg-note">“{presetId}” has no editable data. Add a `defaults` map to its preset to get sliders here.</p>
      </section>
    )
  }
  const current = { ...defaults, ...(widgetData[presetId] ?? {}) }
  return (
    <section className="pg-panel">
      <h2>DATA — {presetId.toUpperCase()}</h2>
      {Object.entries(defaults).map(([key, def]) => {
        const max = def > 1 ? Math.ceil(def * 2) : 1
        return (
          <label key={key}>
            {key.toUpperCase()}
            <input type="range" min={0} max={max} step={max > 1 ? 1 : 0.01} value={current[key]} onChange={e => setWidgetData(presetId, key, +e.target.value)} />
            <b>{max > 1 ? current[key] : `${Math.round(current[key] * 100)}%`}</b>
          </label>
        )
      })}
    </section>
  )
}
