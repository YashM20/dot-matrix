/** State machine view (states = named data presets, edges = mask / ease / ms; click to fire) and the binding panel. */
import { useState } from 'react'
import { ease, masks, type EaseName, type MaskName } from '../../engine/motion'
import type { Binding, MachineEdge, SourceId, StudioState } from './doc'
import { Num } from './Inspector'
import { compiledOf, useCard, useStudio } from './store'
import { SOURCES } from './timeline'

const MASKS = Object.keys(masks) as MaskName[], EASES = Object.keys(ease) as EaseName[]

function Graph({ states, edges, current, onFire }: { states: StudioState[]; edges: MachineEdge[]; current: string; onFire: (i: number) => void }) {
  const W = 300, H = 120, n = states.length
  const x = (name: string) => { const i = states.findIndex(s => s.name === name); return 30 + ((i < 0 ? 0 : i) + .5) * ((W - 60) / Math.max(1, n)) }
  return (
    <svg className="st-graph" viewBox={`0 0 ${W} ${H}`} role="group" aria-label="State machine diagram">
      {edges.map((e, i) => {
        const a = e.from === '*' ? x(current) : x(e.from), b = x(e.to), fwd = b >= a, y = H / 2, bend = fwd ? -34 : 34
        const mx = (a + b) / 2, d = a === b ? `M ${a - 8} ${y - 12} C ${a - 30} ${y - 54}, ${a + 30} ${y - 54}, ${a + 8} ${y - 12}` : `M ${a} ${y + (fwd ? -12 : 12)} Q ${mx} ${y + bend * 1.6} ${b} ${y + (fwd ? -12 : 12)}`
        return <g key={i} className="st-edge" onClick={() => onFire(i)}><path d={d} /><text x={mx} y={y + bend * (a === b ? 1.3 : 1.05)} textAnchor="middle">{e.on || `${e.mask}`}</text></g>
      })}
      {states.map(s => <g key={s.name} className={`st-node${s.name === current ? ' on' : ''}`}><circle cx={x(s.name)} cy={H / 2} r={11} /><text x={x(s.name)} y={H / 2 + 26} textAnchor="middle">{s.name.toUpperCase()}</text></g>)}
    </svg>
  )
}

export function MachinePanel() {
  const card = useCard(), { edit, fire, state, mode } = useStudio()
  const keys = compiledOf(card).keys
  const [sel, setSel] = useState(0)
  const s = card.states[Math.min(sel, card.states.length - 1)]
  const setState = (i: number, p: Partial<StudioState>, tag?: string) => edit(c => ({ ...c, states: c.states.map((x, j) => (j === i ? { ...x, ...p } : x)) }), tag)
  const setEdge = (i: number, p: Partial<MachineEdge>, tag?: string) => edit(c => ({ ...c, machine: c.machine.map((x, j) => (j === i ? { ...x, ...p } : x)) }), tag)
  const addState = () => { const name = `s${card.states.length}`; edit(c => ({ ...c, states: [...c.states, { name, data: { ...c.data } }] })); setSel(card.states.length) }
  const si = card.states.indexOf(s)
  const names = card.states.map(x => x.name)
  return (
    <section className="pg-panel st-panel" aria-label="State machine">
      <h2>STATES <small>{mode === 'live' ? `NOW ${state.toUpperCase()}` : 'CLICK AN EDGE TO FIRE'}</small></h2>
      <Graph states={card.states} edges={card.machine} current={state} onFire={fire} />
      <div className="st-chips" role="group" aria-label="States">
        {card.states.map((x, i) => <button key={x.name + i} type="button" className={i === si ? 'on' : ''} aria-pressed={i === si} onClick={() => setSel(i)}>{x.name.toUpperCase()}</button>)}
        <button type="button" onClick={addState}>+ STATE</button>
      </div>
      {s && (
        <div className="st-grid2">
          <label className="st-num"><span>NAME</span><input value={s.name} maxLength={32} onChange={e => {
            const name = e.target.value.replace(/[^\w-]/g, '').slice(0, 32) || s.name, old = s.name
            edit(c => ({ ...c, states: c.states.map((x, j) => (j === si ? { ...x, name } : x)), machine: c.machine.map(m => ({ ...m, from: m.from === old ? name : m.from, to: m.to === old ? name : m.to })) }), `sname:${si}`)
          }} /></label>
          <div className="st-row">
            <button type="button" onClick={() => setState(si, { data: { ...card.data } })} title="Copy the card's current data into this state">CAPTURE DATA</button>
            <button type="button" disabled={card.states.length < 2} onClick={() => { edit(c => ({ ...c, states: c.states.filter((_, j) => j !== si), machine: c.machine.filter(m => m.from !== s.name && m.to !== s.name) })); setSel(0) }}>REMOVE</button>
          </div>
          {keys.map(k => <Num key={k} label={`DATA.${k}`} value={s.data[k] ?? card.data[k] ?? 0} step={.01} onChange={v => setState(si, { data: { ...s.data, [k]: v } }, `sd:${si}:${k}`)} />)}
        </div>
      )}
      <h3 className="st-sub">EDGES</h3>
      {card.machine.map((e, i) => (
        <div key={i} className="st-edge-row" role="group" aria-label={`Edge ${e.from} to ${e.to}`}>
          <select aria-label="From state" value={e.from} onChange={x => setEdge(i, { from: x.target.value })}>{['*', ...names].map(n => <option key={n}>{n}</option>)}</select>
          <span aria-hidden="true">→</span>
          <select aria-label="To state" value={e.to} onChange={x => setEdge(i, { to: x.target.value })}>{names.map(n => <option key={n}>{n}</option>)}</select>
          <input aria-label="Event name" value={e.on} maxLength={24} placeholder="on" onChange={x => setEdge(i, { on: x.target.value }, `on:${i}`)} />
          <select aria-label="Mask" value={e.mask} onChange={x => setEdge(i, { mask: x.target.value as MaskName })}>{MASKS.map(m => <option key={m}>{m}</option>)}</select>
          <select aria-label="Ease" value={e.ease} onChange={x => setEdge(i, { ease: x.target.value as EaseName })}>{EASES.map(m => <option key={m}>{m}</option>)}</select>
          <input aria-label="Duration ms" type="number" min={0} max={5000} step={10} value={e.ms} onChange={x => setEdge(i, { ms: Math.max(0, Math.min(5000, Number(x.target.value) || 0)) }, `ms:${i}`)} />
          <button type="button" className="st-fire" onClick={() => fire(i)}>FIRE</button>
          <button type="button" aria-label="Remove edge" onClick={() => edit(c => ({ ...c, machine: c.machine.filter((_, j) => j !== i) }))}>×</button>
        </div>
      ))}
      <button type="button" disabled={!names.length} onClick={() => edit(c => ({ ...c, machine: [...c.machine, { from: names[0], to: names[names.length - 1], on: 'press', mask: 'bayer', ease: 'emphasized', ms: 400 }] }))}>+ EDGE</button>
    </section>
  )
}

export function BindingPanel() {
  const card = useCard(), edit = useStudio(s => s.edit)
  const keys = compiledOf(card).keys
  const setB = (i: number, p: Partial<Binding>, tag?: string) => edit(c => ({ ...c, bindings: c.bindings.map((x, j) => (j === i ? { ...x, ...p } : x)) }), tag)
  const free = keys.filter(k => !card.bindings.some(b => b.key === k))
  return (
    <section className="pg-panel st-panel" aria-label="Bindings">
      <h2>BINDINGS <small>{keys.length} DATA KEYS</small></h2>
      {card.bindings.map((b, i) => (
        <div key={b.key + i} className="st-binding">
          <div className="st-row">
            <select aria-label="Data key" value={b.key} onChange={e => setB(i, { key: e.target.value })}>{[...new Set([b.key, ...keys])].map(k => <option key={k} value={k}>data.{k}</option>)}</select>
            <select aria-label={`Binding kind for ${b.key}`} value={b.kind === 'source' ? b.source : 'slider'} onChange={e => setB(i, e.target.value === 'slider' ? { kind: 'slider', source: undefined } : { kind: 'source', source: e.target.value as SourceId })}>
              <option value="slider">SLIDER</option>{SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <button type="button" aria-label={`Remove binding ${b.key}`} onClick={() => edit(c => ({ ...c, bindings: c.bindings.filter((_, j) => j !== i) }))}>×</button>
          </div>
          {b.kind === 'slider' ? (
            <label className="dw-slider"><span>data.{b.key}</span>
              <input type="range" min={b.min} max={b.max} step={b.step} value={card.data[b.key] ?? b.min} aria-label={`data.${b.key}`} onChange={e => edit(c => ({ ...c, data: { ...c.data, [b.key]: Number(e.target.value) } }), `bind:${b.key}`)} />
              <output>{(card.data[b.key] ?? b.min).toFixed(2)}</output></label>
          ) : <p className="st-hint">data.{b.key} follows {SOURCES.find(s => s.id === b.source)?.label} on {b.min}..{b.max} (live preview + exports at t).</p>}
          <div className="st-grid3">
            <Num label="MIN" value={b.min} step={.1} onChange={min => setB(i, { min }, `bmin:${i}`)} />
            <Num label="MAX" value={b.max} step={.1} onChange={max => setB(i, { max }, `bmax:${i}`)} />
            <Num label="STEP" value={b.step} min={.001} step={.01} onChange={step => setB(i, { step }, `bstep:${i}`)} />
          </div>
        </div>
      ))}
      <div className="st-row">
        <select aria-label="Key to bind" id="st-bind-key" defaultValue="">{<option value="" disabled>{free.length ? 'choose data key' : 'no unbound keys'}</option>}{free.map(k => <option key={k} value={k}>data.{k}</option>)}</select>
        <button type="button" disabled={!free.length} onClick={() => {
          const el = document.getElementById('st-bind-key') as HTMLSelectElement | null, key = el?.value || free[0]
          edit(c => ({ ...c, bindings: [...c.bindings, { key, kind: 'slider', min: 0, max: 1, step: .01 }], data: { ...c.data, [key]: c.data[key] ?? .5 } }))
        }}>+ BIND</button>
      </div>
    </section>
  )
}
