/**
 * DESIGN's fields for one layer kind: TEXT, SITES, PAINT (the brush and tracing a picture) and SPEC (its place and
 * its JSON). LayerPanel shows the one that matches the selected layer.
 */
import { useRef, useState } from 'react'
import { foldText, undrawnNote } from '../../data/text'
import { dotifyUpload } from '../../lib/photoDotify'
import { paintCells, SITE_SIZES, type PaintLayer, type SitesLayer, type StudioLayer, type TextLayer } from '../studio/doc'
import { attempt } from './attempt'
import { specBounds, typedText } from './direct'
import { cellsFromMatrix, encodeCells, movable, type EditorFrame } from './doc'
import { getEditor, useEditor } from './store'
import { useTarget } from './target'
import { Num, Pick, Section, Slider } from './ui'

export function TextFields({ l }: { l: TextLayer }) {
  const { layer } = useTarget()
  const set = (p: Partial<TextLayer['params']>, tag?: string) => layer(x => ({ ...x, params: { ...(x as TextLayer).params, ...p } }) as StudioLayer, tag ?? `text:${l.id}`)
  // what the last keystroke into this layer dropped (the 5×7 font lacks it), named under the field
  const [gone, setGone] = useState({ id: l.id, note: '' })
  const type = (v: string) => { set({ text: typedText(v) }); setGone({ id: l.id, note: undrawnNote(foldText(v).dropped) }) }
  const note = gone.id === l.id ? gone.note : ''
  return <Section title="TEXT" aside="drag it · double-click (tap when selected) to type on the canvas">
    <div className="ed-grid2">
      <label className="ed-field ed-wide"><span>TEXT</span><input data-focus="text" value={l.params.text} maxLength={64} autoCapitalize="characters" spellCheck={false} aria-describedby={note ? `undrawn-${l.id}` : undefined} onChange={e => type(e.target.value)} /></label>
      <Num label="COL" value={l.params.col} onChange={col => set({ col }, `col:${l.id}`)} />
      <Num label="ROW" value={l.params.row} onChange={row => set({ row }, `row:${l.id}`)} />
      <Pick label="ALIGN" value={l.params.align} options={['left', 'center', 'right'] as const} onChange={align => set({ align })} />
      <Pick label="SCALE" value={l.params.scale} options={[1, 2, 3, 4]} onChange={scale => set({ scale })} fmt={s => `${s}×`} />
      <label className="ed-check"><input type="checkbox" checked={l.params.smooth} onChange={e => set({ smooth: e.target.checked })} /> SMOOTH (HERO WEIGHT)</label>
    </div>
    <p className="ed-hint" id={`undrawn-${l.id}`} role="status">{note}</p>
  </Section>
}
export function SiteFields({ l }: { l: SitesLayer }) {
  const { layer } = useTarget(), p = l.params
  const set = (q: Partial<SitesLayer['params']>, k: string) => layer(x => ({ ...x, params: { ...(x as SitesLayer).params, ...q } }) as StudioLayer, `${k}:${l.id}`)
  const deg = (r: number) => Math.round((r * 180) / Math.PI), rad = (d: number) => (d * Math.PI) / 180
  return <Section title="SITES" aside="drag it, or its handles on the canvas">
    <div className="ed-grid2">
      <Pick label="SHAPE" value={p.shape} options={['ring', 'line', 'disc'] as const} onChange={shape => set({ shape }, 'shape')} />
      <Pick label="SIZE" value={l.size} options={SITE_SIZES} onChange={size => layer(x => ({ ...x, size }) as StudioLayer)} fmt={s => `${s}×`} />
      <Num label={p.shape === 'line' ? 'X0' : 'CX'} value={p.cx} onChange={cx => set({ cx }, 'cx')} />
      <Num label={p.shape === 'line' ? 'Y0' : 'CY'} value={p.cy} onChange={cy => set({ cy }, 'cy')} />
      {p.shape === 'line' ? <><Num label="X1" value={p.x1} onChange={x1 => set({ x1 }, 'x1')} /><Num label="Y1" value={p.y1} onChange={y1 => set({ y1 }, 'y1')} /></> : <Num label="RADIUS" value={p.r} min={1} max={512} onChange={r => set({ r }, 'r')} />}
      <Num label="SPACING" value={p.spacing} min={1} max={64} step={.5} onChange={spacing => set({ spacing }, 'sp')} />
      {p.shape === 'ring' && <><Num label="START °" value={deg(p.start)} min={-360} max={360} step={5} onChange={d => set({ start: rad(d) }, 'start')} /><Num label="SWEEP °" value={deg(p.sweep)} min={1} max={360} step={5} onChange={d => set({ sweep: rad(d) }, 'sweep')} /></>}
    </div>
  </Section>
}
export function PaintFields({ f, l }: { f: EditorFrame; l: PaintLayer }) {
  const { layer } = useTarget(), brush = useEditor(s => s.brush), picking = useEditor(s => s.picking), { setBrush, setTool, setNote, setPicking } = getEditor(), tool = useEditor(s => s.tool)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const lit = paintCells(l).reduce((n, v) => n + (v > 0 ? 1 : 0), 0)
  const map = (fn: (v: number) => number) => layer(x => { const a = paintCells(x as PaintLayer).map(fn); return { ...x, cells: encodeCells(a) } as StudioLayer })
  const trace = async (fl?: File) => {
    if (!fl || !fl.type.startsWith('image/')) return
    setBusy(true)
    await attempt(async () => {
      const field = await dotifyUpload(fl, { cols: l.cols, rows: l.rows }, 'bayer')
      const m = Array.from({ length: l.rows }, (_, r) => Array.from({ length: l.cols }, (_, c) => field(l.cols === 1 ? .5 : c / (l.cols - 1), l.rows === 1 ? .5 : r / (l.rows - 1))))
      layer(x => ({ ...x, cells: cellsFromMatrix(x as PaintLayer, m) }) as StudioLayer)
      setNote(`traced ${fl.name} into ${l.name}`)
    }, e => setNote(`trace failed: ${e.message}`), () => setBusy(false))
  }
  return <Section title="BRUSH" aside={`${l.cols}×${l.rows} · ${lit} lit`}>
    <div className="ed-row-btns">
      <button type="button" aria-pressed={tool === 'draw' && !brush.erase && !picking} onClick={() => { setTool('draw'); setBrush({ erase: false }) }}>PAINT (B)</button>
      <button type="button" aria-pressed={tool === 'draw' && brush.erase && !picking} onClick={() => { setTool('draw'); setBrush({ erase: true }) }}>ERASE (E)</button>
      <button type="button" aria-pressed={picking} onClick={() => { setPicking(!picking); if (!picking) setNote('PICK: tap a painted dot to take its ink') }} title="Eyedropper: the ink of a painted dot (I, or Alt-click while drawing)">PICK INK (I)</button>
    </div>
    <Slider label="SIZE" hint="[ ]" value={brush.size} min={1} max={8} step={1} onChange={size => setBrush({ size })} fmt={v => String(v)} />
    <Slider label="INK" hint="dot value" value={brush.value} min={.2} max={1} step={.2} onChange={value => setBrush({ value })} />
    <div className="ed-row-btns">
      <button type="button" onClick={() => map(v => 255 - v)}>INVERT</button>
      <button type="button" onClick={() => map(() => 0)}>CLEAR</button>
      <button type="button" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'TRACING…' : 'TRACE A PICTURE'}</button>
    </div>
    <input ref={file} type="file" accept="image/*" hidden aria-label="Picture to trace into this paint layer" onChange={e => { void trace(e.target.files?.[0]); e.target.value = '' }} />
    <p className="ed-hint">Paints whole cells of the {l.lattice}× lattice in {f.card.name}. Right-drag erases; PICK INK (or Alt-click) takes the ink of a painted dot. Two fingers pan and zoom.</p>
  </Section>
}
/** The SPEC JSON box's text as a spec; throws with the reason it isn't one. */
function parseSpec(text: string) {
  const spec = JSON.parse(text)
  if (!spec?.kind) throw new Error('needs a "kind"')
  return spec
}

type SpecLayer = Extract<StudioLayer, { kind: 'spec' }>
/** PLACE: an IR spec's bounds (in layer cells), and the origin of any spec that has one or can take one. */
function SpecPlace({ f, l }: { f: EditorFrame; l: SpecLayer }) {
  const { layer } = useTarget(), s = l.spec
  const setSpec = (spec: typeof s, tag: string) => layer(x => ({ ...x, spec }) as StudioLayer, `${tag}:${l.id}`)
  const ir = s.kind === 'ir' ? s : undefined, b = ir ? specBounds(f, ir) : undefined
  const o = (s as { origin?: [number, number] }).origin, ox = o?.[0] ?? 0, oy = o?.[1] ?? 0
  if (!ir && !(movable(l) && s.kind !== 'sites')) return null
  return <Section title="PLACE" aside={ir ? 'bounds in layer cells · drag the corners on the canvas' : 'drag it on the canvas · whole cells'}>
    <div className="ed-grid2">
      {ir && b && (['COL', 'ROW', 'W', 'H'] as const).map((k, i) => <Num key={k} label={k} value={b[i]} min={i > 1 ? 1 : -512} max={512} onChange={v => { const nb = [...b] as [number, number, number, number]; nb[i] = Math.round(v); setSpec({ ...ir, bounds: nb }, 'bounds') }} />)}
      {'origin' in s || s.kind !== 'sites' ? <>
        <Num label="ORIGIN X" value={ox} onChange={x => setSpec({ ...s, origin: [Math.round(x), oy] } as typeof s, 'origin')} />
        <Num label="ORIGIN Y" value={oy} onChange={y => setSpec({ ...s, origin: [ox, Math.round(y)] } as typeof s, 'origin')} />
      </> : null}
    </div>
    {ir?.bounds && <div className="ed-row-btns"><button type="button" onClick={() => { const { bounds: _, ...rest } = ir; setSpec(rest, 'bounds') }}>WHOLE CARD</button></div>}
  </Section>
}

/** SPEC JSON: the spec as text, edited in place; a change made elsewhere rewrites it, typing here does not. */
function SpecJson({ l }: { l: SpecLayer }) {
  const { layer } = useTarget()
  const [text, setText] = useState(() => JSON.stringify(l.spec, null, 1)), [err, setErr] = useState('')
  // a change made elsewhere (a drag, the bounds handles, the quick bar, undo) rewrites the JSON; typing here does not.
  // `mine` is the spec the box last showed or wrote; a different one is adopted during render, before it paints
  const [mine, setMine] = useState(l.spec)
  if (l.spec !== mine) { setMine(l.spec); setText(JSON.stringify(l.spec, null, 1)); setErr('') }
  const big = text.length > 20000
  return <Section title="SPEC JSON" aside={l.spec.kind}>
    <textarea className="ed-json" aria-label="Spec layer JSON" spellCheck={false} rows={8} readOnly={big} value={big ? text.slice(0, 20000) : text}
      onChange={e => { const v = e.target.value; setText(v); try { const spec = parseSpec(v); setMine(spec); layer(x => ({ ...x, spec }) as StudioLayer, `spec:${l.id}`); setErr('') } catch (er) { setErr((er as Error).message) } }} />
    {err && <p className="ed-bad" role="alert">JSON: {err}</p>}
  </Section>
}

export const SpecFields = ({ f, l }: { f: EditorFrame; l: SpecLayer }) => <><SpecPlace f={f} l={l} /><SpecJson l={l} /></>
