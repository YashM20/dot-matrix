import { useState } from 'react'
/** Inspector for the selected layer (IR editor with line:col errors, lattice / size / tone pickers) and the card settings. */
import { IR_LIMITS } from '../../engine/ir'
import { SHARE_GRIDS } from '../../lib/share'
import { CARD } from '../../widgets'
import { CodeEditor } from '../dwitter/CodeEditor'
import { BLENDS, LATTICES, newId, normalizeZ, SITE_SIZES, stackOrder, TONES, type Blend, type IRLayer, type LayerTone, type SitesLayer, type SpecLayer, type StudioLayer, type TextLayer } from './doc'
import { compiledOf, useCard, useStudio } from './store'

export function Num({ label, value, onChange, min, max, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; disabled?: boolean }) {
  return <label className="st-num"><span>{label}</span><input type="number" value={Number.isFinite(value) ? +value.toFixed(3) : 0} min={min} max={max} step={step} disabled={disabled}
    onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(min !== undefined || max !== undefined ? Math.min(max ?? v, Math.max(min ?? v, v)) : v) }} /></label>
}
const Pick = <T extends string | number>({ label, value, options, onChange, fmt = String }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; fmt?: (v: T) => string }) =>
  <label className="st-num"><span>{label}</span><select value={String(value)} onChange={e => onChange(options.find(o => String(o) === e.target.value) as T)}>{options.map(o => <option key={String(o)} value={String(o)}>{fmt(o)}</option>)}</select></label>

function IRFields({ l }: { l: IRLayer | SitesLayer }) {
  const card = useCard(), editLayer = useStudio(s => s.editLayer)
  const err = compiledOf(card).errors.get(l.id)
  return (
    <>
      <CodeEditor value={l.src} onChange={src => editLayer(l.id, x => ({ ...x, src }), `src:${l.id}`)} error={err} maxLength={IR_LIMITS.source} />
      <div className="dw-status" id="dw-status" aria-live="polite">{err ? <span className="dw-bad">ERROR {err.line}:{err.col} · LAST GOOD PROGRAM SHOWN</span> : <span>{l.src.length}/{IR_LIMITS.source} CHARS · OK</span>}</div>
    </>
  )
}

function TextFields({ l }: { l: TextLayer }) {
  const editLayer = useStudio(s => s.editLayer)
  const set = (p: Partial<TextLayer['params']>, tag = `text:${l.id}`) => editLayer(l.id, x => ({ ...x, params: { ...(x as TextLayer).params, ...p } }) as StudioLayer, tag)
  return (
    <div className="st-grid2">
      <label className="st-num st-wide"><span>TEXT</span><input value={l.params.text} maxLength={64} onChange={e => set({ text: e.target.value.toUpperCase() })} /></label>
      <Num label="COL" value={l.params.col} onChange={col => set({ col }, `col:${l.id}`)} />
      <Num label="ROW" value={l.params.row} onChange={row => set({ row }, `row:${l.id}`)} />
      <Pick label="ALIGN" value={l.params.align} options={['left', 'center', 'right'] as const} onChange={align => set({ align })} />
      <Pick label="SCALE" value={l.params.scale} options={[1, 2, 3, 4]} onChange={scale => set({ scale })} fmt={s => `${s}×`} />
      <label className="st-check"><input type="checkbox" checked={l.params.smooth} onChange={e => set({ smooth: e.target.checked })} /> SMOOTH (DISPLAY WEIGHT)</label>
    </div>
  )
}

function SiteFields({ l }: { l: SitesLayer }) {
  const editLayer = useStudio(s => s.editLayer)
  const set = (p: Partial<SitesLayer['params']>, k: string) => editLayer(l.id, x => ({ ...x, params: { ...(x as SitesLayer).params, ...p } }) as StudioLayer, `${k}:${l.id}`)
  const p = l.params
  return (
    <div className="st-grid2">
      <Pick label="SHAPE" value={p.shape} options={['ring', 'line', 'disc'] as const} onChange={shape => set({ shape }, 'shape')} />
      <Pick label="SIZE" value={l.size} options={SITE_SIZES} onChange={size => editLayer(l.id, x => ({ ...x, size }) as StudioLayer)} fmt={s => `${s}×`} />
      <Num label={p.shape === 'line' ? 'X0' : 'CX'} value={p.cx} onChange={cx => set({ cx }, 'cx')} />
      <Num label={p.shape === 'line' ? 'Y0' : 'CY'} value={p.cy} onChange={cy => set({ cy }, 'cy')} />
      {p.shape === 'line' ? <><Num label="X1" value={p.x1} onChange={x1 => set({ x1 }, 'x1')} /><Num label="Y1" value={p.y1} onChange={y1 => set({ y1 }, 'y1')} /></>
        : <Num label="RADIUS" value={p.r} min={1} max={512} onChange={r => set({ r }, 'r')} />}
      <Num label="SPACING" value={p.spacing} min={1} max={64} step={.5} onChange={spacing => set({ spacing }, 'sp')} />
      {p.shape === 'ring' && <><Num label="START°" value={(p.start * 180) / Math.PI} step={5} onChange={d => set({ start: (d * Math.PI) / 180 }, 'st')} /><Num label="SWEEP°" value={(p.sweep * 180) / Math.PI} min={0} max={360} step={5} onChange={d => set({ sweep: (d * Math.PI) / 180 }, 'sw')} /></>}
    </div>
  )
}

function SpecFields({ l }: { l: SpecLayer }) {
  const editLayer = useStudio(s => s.editLayer)
  const [text, setText] = useState(() => JSON.stringify(l.spec, null, 1))
  const [err, setErr] = useState('')
  const big = text.length > 20000
  const apply = (v: string) => {
    setText(v)
    try { const spec = JSON.parse(v); if (!spec || typeof spec.kind !== 'string') throw new Error('needs a "kind"'); editLayer(l.id, x => ({ ...x, spec }) as StudioLayer, `spec:${l.id}`); setErr('') }
    catch (e) { setErr((e as Error).message) }
  }
  return (
    <>
      <p className="st-hint">Card spec v1 <b>{l.spec.kind}</b> layer, built by <code>src/spec</code>. Edit its JSON{big ? ' (large: a baked raster)' : ''}:</p>
      <textarea className="st-json" aria-label="Spec layer JSON" spellCheck={false} value={big ? text.slice(0, 20000) : text} readOnly={big} onChange={e => apply(e.target.value)} rows={8} />
      {err && <p className="dw-bad" role="alert">JSON: {err}</p>}
    </>
  )
}

export function Inspector() {
  const card = useCard(), { selected, editLayer, edit, select } = useStudio()
  const l = card.layers.find(x => x.id === selected)
  if (!l) return <section className="pg-panel st-panel" aria-label="Inspector"><h2>INSPECTOR</h2><p className="st-hint">Select a layer.</p></section>
  const ro = l.kind === 'preset-layer'
  const duplicate = () => { const c = { ...structuredClone(l), id: newId(), name: `${l.name} copy` }; edit(x => ({ ...x, layers: normalizeZ([...stackOrder(x.layers), c]) })); select(c.id) }
  const remove = () => { edit(x => ({ ...x, layers: normalizeZ(stackOrder(x.layers).filter(y => y.id !== l.id)) })); select(undefined) }
  return (
    <section className="pg-panel st-panel" aria-label="Inspector">
      <h2>INSPECTOR <small>{l.kind.toUpperCase()} · Z {l.z}</small></h2>
      <div className="st-grid2">
        <label className="st-num st-wide"><span>NAME</span><input value={l.name} maxLength={64} onChange={e => editLayer(l.id, x => ({ ...x, name: e.target.value }), `name:${l.id}`)} /></label>
        <Pick label="TONE" value={l.tone} options={(ro ? ['preset', ...TONES] : TONES) as LayerTone[]} onChange={tone => editLayer(l.id, x => ({ ...x, tone }))} />
        <Pick label="BLEND" value={l.blend} options={BLENDS} onChange={(blend: Blend) => editLayer(l.id, x => ({ ...x, blend }))} />
        {(l.kind === 'ir' || l.kind === 'text') && <Pick label="LATTICE" value={l.lattice} options={LATTICES} onChange={lattice => editLayer(l.id, x => ({ ...x, lattice }) as StudioLayer)} fmt={k => `${k}× · ${Math.floor(card.grid.cols / k)}×${Math.floor(card.grid.rows / k)}`} />}
      </div>
      {l.kind === 'ir' && <IRFields l={l} />}
      {l.kind === 'sites' && <><SiteFields l={l} /><p className="st-hint">Field at each site (u, v, t, data.*):</p><IRFields l={l} /></>}
      {l.kind === 'text' && <TextFields l={l} />}
      {l.kind === 'spec' && <SpecFields key={l.id} l={l} />}
      {ro && <p className="st-hint">Reference layer <b>#{l.params.index}</b> of preset <b>{l.params.preset}</b> (read-only: its field, lattice and sites come from the preset's <code>layers(ctx)</code>; tone, blend, order and visibility are yours).</p>}
      <div className="st-row">
        <button type="button" onClick={duplicate}>DUPLICATE</button>
        <button type="button" onClick={remove}>REMOVE</button>
      </div>
    </section>
  )
}

const GRIDS = { 'tile 144×144': SHARE_GRIDS.square, 'wide 216×108': SHARE_GRIDS.wide, 'tall 108×162': SHARE_GRIDS.tall, 'card 80×74': { ...CARD, pitch: 4 } } as const
export function CardPanel() {
  const card = useCard(), edit = useStudio(s => s.edit)
  const gridName = (Object.keys(GRIDS) as (keyof typeof GRIDS)[]).find(k => GRIDS[k].cols === card.grid.cols && GRIDS[k].rows === card.grid.rows)
  const st = card.style
  const setStyle = (p: Partial<typeof st>, tag: string) => edit(c => ({ ...c, style: { ...c.style, ...p } }), tag)
  return (
    <section className="pg-panel st-panel" aria-label="Card">
      <h2>CARD {card.reference && <small>REF {card.reference.toUpperCase()}</small>}</h2>
      <div className="st-grid2">
        <label className="st-num st-wide"><span>NAME</span><input value={card.name} maxLength={64} onChange={e => edit(c => ({ ...c, name: e.target.value }), 'card:name')} /></label>
        <label className="st-num"><span>GRID</span><select value={gridName ?? ''} onChange={e => { const g = GRIDS[e.target.value as keyof typeof GRIDS]; if (g) edit(c => ({ ...c, grid: { ...g } })) }}>
          {!gridName && <option value="">{card.grid.cols}×{card.grid.rows}</option>}{Object.keys(GRIDS).map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <Num label="PITCH PX" value={card.grid.pitch ?? 4} min={1} max={8} step={.25} onChange={pitch => edit(c => ({ ...c, grid: { ...c.grid, pitch }, style: { ...c.style, sizeMin: c.style.sizeMin * pitch / (c.grid.pitch ?? 4), sizeMax: c.style.sizeMax * pitch / (c.grid.pitch ?? 4) } }), 'card:pitch')} />
        <Num label="DOT MAX" value={st.sizeMax} min={.1} max={8} step={.05} onChange={sizeMax => setStyle({ sizeMax }, 'card:max')} />
        <Num label="DOT MIN" value={st.sizeMin} min={0} max={8} step={.05} onChange={sizeMin => setStyle({ sizeMin }, 'card:min')} />
        <Num label="ROUNDNESS" value={st.cornerRoundness ?? 0} min={0} max={1} step={.05} onChange={cornerRoundness => setStyle({ cornerRoundness }, 'card:round')} />
        <Num label="QUANTIZE" value={st.quantizeSteps ?? 0} min={2} max={12} onChange={quantizeSteps => setStyle({ quantizeSteps }, 'card:q')} />
        <label className="st-check"><input type="checkbox" checked={card.animated} onChange={e => edit(c => ({ ...c, animated: e.target.checked }))} /> ANIMATED</label>
      </div>
    </section>
  )
}
