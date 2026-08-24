import { memo, useMemo, useState } from 'react'
import { DotCanvas } from '../DotCanvas'
import { widgetPresets } from '../../widgets'
import type { WidgetPreset } from '../../widgets/types'
import { usePlayground } from './store'

const groups = ['text', 'polar', 'icon', 'photo', 'chart', 'scatter', 'composite'] as const
const QUICK_IDS = ['clock', 'timer', 'weather-card'] as const

const MiniThumb = memo(function MiniThumb({ preset }: { preset: WidgetPreset }) {
  return <DotCanvas field={preset.field()} grid={{ ...preset.grid, pitch: 2 }} style={{ ...preset.style, sizeMin: 0.5, sizeMax: 1.1 }} paint={preset.paint} />
})

export function WidgetGallery() {
  const presetId = usePlayground(s => s.presetId)
  const setPreset = usePlayground(s => s.setPreset)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const needle = q.trim().toLowerCase()
  const filterFn = (p: WidgetPreset) =>
    !needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle) || p.group.toLowerCase().includes(needle)

  const quick = useMemo(() => widgetPresets.filter(p => (QUICK_IDS as readonly string[]).includes(p.id)), [])
  const toggle = (g: string) => setCollapsed(c => ({ ...c, [g]: !c[g] }))

  return (
    <section className="pg-panel pg-gallery">
      <h2>WIDGETS <span className="pg-gallery-count">{widgetPresets.length}</span></h2>
      <input
        className="pg-search"
        placeholder="Search presets…"
        value={q}
        onChange={e => setQ(e.target.value)}
        aria-label="Search widgets"
      />

      {!needle && (
        <div className="pg-recommended">
          <h3>QUICK START</h3>
          <div className="pg-thumbs">
            {quick.map(p => (
              <button
                key={p.id}
                className={`pg-thumb pg-thumb--quick ${presetId === p.id ? 'selected' : ''}`}
                onClick={() => setPreset(p.id)}
                title={p.name}
              >
                <span className="pg-thumb-mini"><MiniThumb preset={p} /></span>
                {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.map(group => {
        const items = widgetPresets.filter(p => p.group === group).filter(filterFn)
        if (items.length === 0) return null
        const isCollapsed = collapsed[group] && !needle
        return (
          <div key={group} className="pg-group">
            <button className="pg-group-header" onClick={() => toggle(group)}>
              <span>{group.toUpperCase()}</span>
              <span className="pg-group-meta">{items.length} <span className={`pg-group-arrow ${isCollapsed ? '' : 'open'}`} /></span>
            </button>
            {!isCollapsed && (
              <div className="pg-thumbs">
                {items.map(p => (
                  <button key={p.id} className={`pg-thumb ${presetId === p.id ? 'selected' : ''}`} onClick={() => setPreset(p.id)} title={p.id}>
                    <span className="pg-thumb-mini"><MiniThumb preset={p} /></span>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      {needle && widgetPresets.filter(filterFn).length === 0 && (
        <p className="pg-note">No presets match "{q}".</p>
      )}
    </section>
  )
}
