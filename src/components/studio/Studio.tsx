/**
 * STUDIO tab — Dot Studio (P6-D): a layer editor for dot cards. Layers (z / blend / tone), inspector,
 * timeline (enter / change / exit with the engine masks and eases), a state machine you can fire,
 * data bindings, a live bar sheet + scorecard, and every export / device target. Documents save to
 * localStorage and JSON files, and import presets (as reference stacks or spec v1), DOTS programs and
 * card spec v1 JSON.
 */
import { useEffect, useRef, useState } from 'react'
import { decodeShare } from '../../lib/share'
import { widgetById, widgetPresets } from '../../widgets'
import { EXAMPLES } from '../dwitter/examples'
import { More } from '../More'
import { looksLikeSpec, presetAsSpecCard, specV1 } from './adapter'
import { cardFromJSON, importDots, importPreset, librarySave, libraryList, newCard, type StudioCard } from './doc'
import { CardPanel, Inspector } from './Inspector'
import { LayerList } from './LayerList'
import { BindingPanel, MachinePanel } from './Machine'
import { SidePanel } from './SidePanel'
import { starterCard, useCard, useStudio } from './store'
import { StudioCanvas } from './StudioCanvas'
import { Timeline } from './Timeline'


function Toolbar() {
  const card = useCard(), { h, undo, redo, replace, note, setNote } = useStudio()
  const [lib, setLib] = useState<StudioCard[]>(() => libraryList())
  const [preset, setPreset] = useState('level-03')
  const [dots, setDots] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const open = async (f: File) => {
    try {
      const text = await f.text(), json = JSON.parse(text)
      if (looksLikeSpec(json)) replace(specV1.fromSpec(json), `opened card spec ${f.name}`)
      else replace(cardFromJSON(text), `opened ${f.name}`)
    } catch (e) { setNote(`could not open ${f.name}: ${(e as Error).message}`) }
  }
  const openDots = async () => {
    const s = dots.trim(), ex = EXAMPLES.find(x => x.name === s)
    try {
      if (ex) { replace(importDots(ex), `imported DOTS example ${ex.name}`); return }
      const p = new URL(s, location.href).searchParams.get('p') ?? s
      replace(importDots(await decodeShare(p)), 'imported DOTS program')
    } catch (e) { setNote(`DOTS import failed: ${(e as Error).message}`) }
  }
  const save = () => { try { setLib(librarySave(card)); setNote(`saved "${card.name}" to this browser`) } catch (e) { setNote((e as Error).message) } }
  return (
    <div className="pg-panel st-toolbar" role="toolbar" aria-label="Document">
      <div className="st-row st-wrap">
        <button type="button" onClick={() => replace(newCard(), 'new empty card')}>NEW</button>
        <button type="button" onClick={() => replace(starterCard(), 'starter card')}>STARTER</button>
        <button type="button" onClick={undo} disabled={!h.past.length} title="Ctrl+Z">UNDO</button>
        <button type="button" onClick={redo} disabled={!h.future.length} title="Ctrl+Shift+Z / Ctrl+Y">REDO</button>
        <button type="button" onClick={save} title="Ctrl+S">SAVE</button>
        <select aria-label="Saved cards" value="" onChange={e => { const c = lib.find(x => x.id === e.target.value); if (c) replace(structuredClone(c), `loaded "${c.name}"`) }}>
          <option value="">{lib.length ? `SAVED (${lib.length})` : 'NO SAVES'}</option>{lib.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="button" onClick={() => file.current?.click()}>OPEN JSON</button>
        <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Open a Studio or card spec JSON file" onChange={e => { const f = e.target.files?.[0]; if (f) open(f); e.target.value = '' }} />
      </div>
      <div className="st-row st-wrap">
        <select aria-label="Preset to import" value={preset} onChange={e => setPreset(e.target.value)}>{widgetPresets.map((p, i) => <option key={p.id + i} value={p.id}>{p.id}</option>)}</select>
        <button type="button" onClick={() => { try { replace(importPreset(preset), `${preset}: read-only reference stack`) } catch (e) { setNote((e as Error).message) } }} title="Each layer of the preset, live and read-only">IMPORT REF</button>
        <button type="button" onClick={() => { const p = widgetById(preset); if (p) try { replace(presetAsSpecCard(p), `${preset}: editable spec v1 stack`) } catch (e) { setNote((e as Error).message) } }} title="Through card spec v1: IR and text layers become editable">AS SPEC</button>
        <input className="st-dots-in" list="st-dots-examples" aria-label="DOTS link, code or example name" placeholder="DOTS link / code / example" value={dots} onChange={e => setDots(e.target.value)} />
        <datalist id="st-dots-examples">{EXAMPLES.map(x => <option key={x.name} value={x.name} />)}</datalist>
        <button type="button" onClick={openDots} disabled={!dots.trim()}>IMPORT DOTS</button>
      </div>
      <p className="st-note" role="status" aria-live="polite">{note || `${card.name} · ${card.layers.length} layers · ${h.past.length} undo`}</p>
    </div>
  )
}

export function Studio() {
  const { undo, redo } = useStudio()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); try { librarySave(useStudio.getState().h.present); useStudio.getState().setNote('saved to this browser') } catch (err) { useStudio.getState().setNote((err as Error).message) } }
      else if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])
  return (
    <section className="st-layout" aria-label="Dot Studio">
      {/* UX U4: canvas, layers, inspector and export stay open; the rest folds under named "More" sections */}
      <div className="st-col st-left">
        <LayerList />
        <More id="compose-states" label="States & edges" tech="state machine" className="more--panel"><MachinePanel /></More>
      </div>
      <div className="st-col st-center">
        <Toolbar />
        <StudioCanvas />
        <More id="compose-timeline" label="Animation" tech="timeline" className="more--panel"><Timeline /></More>
      </div>
      <div className="st-col st-right">
        <Inspector />
        <More id="compose-bindings" label="Live data" tech="bindings" className="more--panel"><BindingPanel /></More>
        <More id="compose-card" label="Card size & dot style" tech="card" className="more--panel"><CardPanel /></More>
      </div>
      <SidePanel />
    </section>
  )
}
