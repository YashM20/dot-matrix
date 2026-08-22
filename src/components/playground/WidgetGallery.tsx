import { memo } from 'react'
import { DotCanvas } from '../DotCanvas'
import { widgetPresets } from '../../widgets'
import type { WidgetPreset } from '../../widgets/types'
import { usePlayground } from './store'

const groups = ['text', 'polar', 'icon', 'photo', 'chart', 'scatter', 'composite'] as const

const MiniThumb = memo(function MiniThumb({ preset }: { preset: WidgetPreset }) {
  return <DotCanvas field={preset.field()} grid={{ ...preset.grid, pitch: 2 }} style={{ ...preset.style, sizeMin: 0.5, sizeMax: 1.1 }} paint={preset.paint} />
})

export function WidgetGallery() {
  const presetId = usePlayground(s => s.presetId)
  const setPreset = usePlayground(s => s.setPreset)
  return (
    <section className="pg-panel pg-gallery">
      <h2>WIDGETS — {widgetPresets.length} PRESETS</h2>
      {groups.map(group => (
        <div key={group} className="pg-group">
          <h3>{group.toUpperCase()}</h3>
          <div className="pg-thumbs">
            {widgetPresets.filter(p => p.group === group).map(p => (
              <button key={p.id} className={`pg-thumb ${presetId === p.id ? 'selected' : ''}`} onClick={() => setPreset(p.id)} title={p.id}>
                <span className="pg-thumb-mini"><MiniThumb preset={p} /></span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
