import { memo, useState } from 'react'
import { DotCanvas } from '../DotCanvas'
import { boards, widgetPresets } from '../../widgets'
import type { WidgetPreset } from '../../widgets/types'
import { usePlayground } from './store'

const MiniThumb = memo(function MiniThumb({ preset }: { preset: WidgetPreset }) {
  return <DotCanvas layers={preset.layers} data={preset.defaults} grid={{ ...preset.grid, pitch: 2 }} style={{ ...preset.style, sizeMin: 0.4, sizeMax: 0.9 }} />
})

export function WidgetGallery() {
  const presetId = usePlayground(s => s.presetId)
  const setPreset = usePlayground(s => s.setPreset)
  const [q, setQ] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const needle = q.trim().toLowerCase()
  const matches = (p: WidgetPreset) => !needle || p.name.toLowerCase().includes(needle) || p.id.toLowerCase().includes(needle) || p.group.toLowerCase().includes(needle)
  const toggle = (g: string) => setCollapsed(c => ({ ...c, [g]: !c[g] }))

  return (
    <section className="pg-panel pg-gallery">
      <h2>WIDGETS <span className="pg-gallery-count">{widgetPresets.length}</span></h2>
      <input className="pg-search" placeholder="Search presets…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search widgets" />

      {boards.map(board => {
        const items = board.items.filter(matches)
        if (items.length === 0) return null
        const isCollapsed = collapsed[board.id] && !needle
        return (
          <div key={board.id} className="pg-group">
            <button className="pg-group-header" onClick={() => toggle(board.id)}>
              <span>{board.id.toUpperCase()}</span>
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
      {needle && widgetPresets.filter(matches).length === 0 && <p className="pg-note">No presets match "{q}".</p>}
    </section>
  )
}
