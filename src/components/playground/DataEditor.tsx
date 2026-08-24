import { usePlayground } from './store'

/**
 * Per-widget data editors placeholder.
 * Wires at least fitnessRings (MOVE/EXERCISE/STAND sweep) — other presets fall through to "No editor".
 * Mutates store.widgetData[presetId][key] which PreviewCanvas/render.ts applies via data-driven field override.
 * Extend by adding a branch for your preset and a matching override in render.ts resolveCurrent.
 */
export function DataEditor() {
  const presetId = usePlayground(s => s.presetId)
  const widgetData = usePlayground(s => s.widgetData)
  const setWidgetData = usePlayground(s => s.setWidgetData)

  if (presetId === 'fitness-rings') {
    const d = widgetData['fitness-rings'] ?? { move: 1.21, exercise: 1.62, stand: 2 }
    return (
      <section className="pg-panel">
        <h2>DATA — FITNESS RINGS</h2>
        <p className="pg-note">MOVE / EXERCISE / STAND sweep (0–2 = 0–360°). Live field rebuild.</p>
        <label>MOVE <input type="range" min={0} max={2} step={0.02} value={d.move} onChange={e => setWidgetData('fitness-rings', 'move', +e.target.value)} /><b>{Math.round(d.move * 50)}%</b></label>
        <label>EXERCISE <input type="range" min={0} max={2} step={0.02} value={d.exercise} onChange={e => setWidgetData('fitness-rings', 'exercise', +e.target.value)} /><b>{Math.round(d.exercise * 50)}%</b></label>
        <label>STAND <input type="range" min={0} max={2} step={0.02} value={d.stand} onChange={e => setWidgetData('fitness-rings', 'stand', +e.target.value)} /><b>{Math.round(d.stand * 50)}%</b></label>
      </section>
    )
  }

  if (presetId === 'retail-analytics') {
    const d = widgetData['retail-analytics'] ?? { sales: 0.58 }
    return (
      <section className="pg-panel">
        <h2>DATA — RETAIL ANALYTICS</h2>
        <label>SALES TREND <input type="range" min={0} max={1} step={0.02} value={d.sales} onChange={e => setWidgetData('retail-analytics', 'sales', +e.target.value)} /><b>{d.sales.toFixed(2)}</b></label>
      </section>
    )
  }

  return (
    <section className="pg-panel">
      <h2>DATA</h2>
      <p className="pg-note">No per-widget editor for “{presetId}”. Add a branch in DataEditor.tsx and an override in render.ts.</p>
    </section>
  )
}
