/** Layer list: top of the list = top of the stack. Drag (or Alt+↑/↓) to reorder; visibility, tone and blend inline. */
import { useState, type DragEvent, type KeyboardEvent } from 'react'
import { BLENDS, irLayer, normalizeZ, sitesLayer, stackOrder, textLayer, TONES, type Blend, type LayerTone, type StudioLayer } from './doc'
import { compiledOf, useCard, useStudio } from './store'

const KIND: Record<StudioLayer['kind'], string> = { ir: 'IR', text: 'TXT', sites: 'SIT', 'preset-layer': 'REF', spec: 'SPC' }

export function LayerList() {
  const card = useCard(), { selected, select, edit, editLayer } = useStudio()
  const errors = compiledOf(card).errors
  const [drag, setDrag] = useState<string | null>(null)
  const top = [...stackOrder(card.layers)].reverse()
  /** Move layer `id` to list position `to` (0 = top). */
  const move = (id: string, to: number) => edit(c => {
    const list = [...stackOrder(c.layers)].reverse(), from = list.findIndex(l => l.id === id)
    if (from < 0 || to < 0 || to >= list.length || from === to) return c
    const [l] = list.splice(from, 1); list.splice(to, 0, l)
    return { ...c, layers: normalizeZ(list.reverse()) }
  })
  const add = (l: StudioLayer) => { edit(c => ({ ...c, layers: normalizeZ([...stackOrder(c.layers), l]) })); select(l.id) }
  const remove = (id: string) => { edit(c => ({ ...c, layers: normalizeZ(stackOrder(c.layers).filter(l => l.id !== id)) })); if (selected === id) select(undefined) }
  const onKey = (e: KeyboardEvent, id: string, i: number) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(id, i + (e.key === 'ArrowUp' ? -1 : 1)) }
    else if (e.key === 'Delete') { e.preventDefault(); remove(id) }
  }
  const onDrop = (e: DragEvent, i: number) => { e.preventDefault(); if (drag) move(drag, i); setDrag(null) }
  return (
    <section className="pg-panel st-panel st-layers" aria-label="Layers">
      <h2>LAYERS <small>{card.layers.length}</small></h2>
      <div className="st-add" role="group" aria-label="Add layer">
        <button type="button" onClick={() => add(irLayer('// field\n.5 + .5 * sin(u * 12 + t)', { name: `field ${card.layers.length + 1}`, lattice: 2 }))}>+ IR</button>
        <button type="button" onClick={() => add(textLayer('TEXT', { name: `text ${card.layers.length + 1}` }))}>+ TEXT</button>
        <button type="button" onClick={() => add(sitesLayer({ name: `sites ${card.layers.length + 1}` }))}>+ SITES</button>
      </div>
      <ol className="st-layer-list">
        {top.map((l, i) => (
          <li key={l.id} className={`st-layer${l.id === selected ? ' on' : ''}${drag === l.id ? ' drag' : ''}${l.visible ? '' : ' off'}`}
            draggable onDragStart={e => { setDrag(l.id); e.dataTransfer.effectAllowed = 'move' }} onDragOver={e => e.preventDefault()} onDrop={e => onDrop(e, i)} onDragEnd={() => setDrag(null)}>
            <button type="button" className="st-eye" aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`} aria-pressed={l.visible} onClick={() => editLayer(l.id, x => ({ ...x, visible: !x.visible }), 'vis')}>{l.visible ? '●' : '○'}</button>
            <button type="button" className="st-layer-name" aria-pressed={l.id === selected} onClick={() => select(l.id)} onKeyDown={e => onKey(e, l.id, i)}
              title="Select · Alt+↑/↓ reorder · Delete removes">
              <b>{KIND[l.kind]}</b> {l.name}{errors.has(l.id) && <i className="st-err" title={errors.get(l.id)!.message}> ERR</i>}
            </button>
            <select aria-label={`Tone of ${l.name}`} value={l.tone} onChange={e => editLayer(l.id, x => ({ ...x, tone: e.target.value as LayerTone }))}>
              {(l.kind === 'preset-layer' ? ['preset', ...TONES] : TONES).map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select aria-label={`Blend of ${l.name}`} value={l.blend} onChange={e => editLayer(l.id, x => ({ ...x, blend: e.target.value as Blend }))}>
              {BLENDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <span className="st-layer-move">
              <button type="button" aria-label={`Move ${l.name} up`} disabled={i === 0} onClick={() => move(l.id, i - 1)}>↑</button>
              <button type="button" aria-label={`Move ${l.name} down`} disabled={i === top.length - 1} onClick={() => move(l.id, i + 1)}>↓</button>
            </span>
          </li>
        ))}
      </ol>
      {!card.layers.length && <p className="st-hint">Empty card. Add a layer, or import a preset or a DOTS program.</p>}
    </section>
  )
}
