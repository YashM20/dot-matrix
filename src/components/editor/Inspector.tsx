/**
 * Right panel, contextual to the selection: DESIGN (document / frame style + data — what TUNE did — or
 * the selected layer's properties), ANIMATE (timeline tracks, states — COMPOSE's timeline), CODE (the
 * Field IR editor with its share link — what CODE did) and EXPORT (every TUNE / COMPOSE export).
 */
import { useEffect, useRef, useState } from 'react'
import { IR_LIMITS } from '../../engine/ir'
import { ease, masks, type EaseName, type MaskName } from '../../engine/motion'
import { squircleExponent } from '../../engine/renderer/shapePath'
import { dotifyUpload } from '../../lib/photoDotify'
import { encodeShare, programHash, shareUrl, SHARE_GRIDS } from '../../lib/share'
import type { ClipFormat } from '../../export'
import { CARD, widgetById } from '../../widgets'
import { More } from '../More'
import { CodeEditor } from '../dwitter/CodeEditor'
import { EXAMPLES } from '../dwitter/examples'
import { presetAsSpecCard, specV1 } from '../studio/adapter'
import { BLENDS, LATTICES, paintCells, SITE_SIZES, TONES, type LayerTone, type PaintLayer, type SitesLayer, type StudioCard, type StudioLayer, type TextLayer, type IRLayer, type Motion } from '../studio/doc'
import { trackSpans, type Track } from '../studio/playback'
import { cellsFromMatrix, duplicateFrame, duplicateLayer, editCard, editFrame, editLayer, encodeCells, frameById, layerOf, moveLayer, newIRLayer, removeFrame, removeLayer, seedDoc, shareable, THEMES, topDown, type EditorFrame, type Sel, type ThemeName } from './doc'
import { exporters, recordFrame } from './exporters'
import { compiledOf } from './render'
import { useEditor, type RightTab } from './store'
import { MiniDots, Num, Pick, Section, Seg, Slider, Text, useCurve, useMask } from './ui'

const TABS: { id: RightTab; label: string }[] = [{ id: 'design', label: 'DESIGN' }, { id: 'animate', label: 'ANIMATE' }, { id: 'code', label: 'CODE' }, { id: 'export', label: 'EXPORT' }]
const GRIDS = { 'tile 144×144': SHARE_GRIDS.square, 'wide 216×108': SHARE_GRIDS.wide, 'tall 108×162': SHARE_GRIDS.tall, 'card 80×74': { ...CARD, pitch: 4 } } as const
type GridName = keyof typeof GRIDS
const THEME_LABEL: Record<ThemeName, string> = { dot480: 'DOT/480', deerflowMosaic: 'MOSAIC' }

/** The selection's frame, layer and edit helpers. */
function useTarget() {
  const doc = useEditor(s => s.h.present), sel = useEditor(s => s.sel)
  const f = frameById(doc, sel.frame), l = layerOf(doc, sel)
  const { edit } = useEditor.getState()
  const card = (fn: (c: StudioCard) => StudioCard, tag?: string) => f && edit(d => editCard(d, f.id, fn), tag)
  const layer = (fn: (l: StudioLayer) => StudioLayer, tag?: string) => f && l && edit(d => editLayer(d, { frame: f.id, layer: l.id }, fn), tag ?? `layer:${l.id}`)
  return { doc, sel, f, l, card, layer }
}

export function InspectorTabs({ className = '' }: { className?: string }) {
  const right = useEditor(s => s.right), setRight = useEditor(s => s.setRight)
  return <div className={`ed-tabs ${className}`} role="tablist" aria-label="Inspector">{TABS.map(t => <button key={t.id} type="button" role="tab" id={`ed-tab-${t.id}`} aria-selected={right === t.id} aria-controls="ed-insp" onClick={() => setRight(t.id)}>{t.label}</button>)}</div>
}
export function InspectorBody() {
  const right = useEditor(s => s.right)
  return <div className="ed-insp" id="ed-insp" role="tabpanel" aria-labelledby={`ed-tab-${right}`}>
    {right === 'design' ? <Design /> : right === 'animate' ? <Animate /> : right === 'code' ? <Code /> : <Export />}
  </div>
}

// ── DESIGN ─────────────────────────────────────────────────────────────────
function Design() {
  const { f, l } = useTarget()
  if (!f) return <DocPanel />
  if (!l) return <FramePanel f={f} />
  return <LayerPanel f={f} l={l} />
}

function DocPanel() {
  const doc = useEditor(s => s.h.present), { edit, setNote, fit, setShortcuts } = useEditor.getState()
  const file = useRef<HTMLInputElement>(null)
  const open = async (fl: File) => {
    try {
      const text = await fl.text(), x = JSON.parse(text) as { kind?: string }
      const { docFromJSON } = await import('./doc')
      if (x.kind === 'dot480.editor') { const d = docFromJSON(text); edit(() => d); setNote(`opened ${fl.name}`); requestAnimationFrame(() => fit()) }
      else {
        const { looksLikeSpec } = await import('../studio/adapter'), { cardFromJSON } = await import('../studio/doc')
        const card = looksLikeSpec(x) ? specV1.fromSpec(x as never) : cardFromJSON(text)
        useEditor.getState().insertCard(card, { source: 'file' }); setNote(`added ${fl.name} as a frame`)
      }
    } catch (e) { setNote(`could not open ${fl.name}: ${(e as Error).message}`) }
  }
  return <>
    <Section title="DOCUMENT" aside={`${doc.frames.length} frames`}>
      <div className="ed-grid2"><Text label="NAME" value={doc.name} onChange={name => edit(d => ({ ...d, name }), 'doc:name')} /></div>
      <p className="ed-hint">Select a frame or a layer to edit it. Insert cards from ASSETS, or use a tool: <b>F</b> frame, <b>B</b> draw, <b>T</b> text, <b>C</b> code.</p>
      <div className="ed-row-btns">
        <button type="button" onClick={() => fit()}>ZOOM TO FIT</button>
        <button type="button" onClick={() => setShortcuts(true)}>SHORTCUTS</button>
      </div>
    </Section>
    <Section title="FILE">
      <div className="ed-row-btns">
        <button type="button" onClick={() => exporters.doc(doc)}>DOWNLOAD JSON</button>
        <button type="button" onClick={() => file.current?.click()}>OPEN FILE</button>
        <button type="button" onClick={() => { edit(() => seedDoc()); useEditor.getState().select({}); requestAnimationFrame(() => fit()) }} title="Replace the canvas with the starter frames (undoable)">RESET CANVAS</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Open an editor document, Studio card or card spec JSON" onChange={e => { const x = e.target.files?.[0]; if (x) void open(x); e.target.value = '' }} />
      <p className="ed-hint">Opens an editor document, or adds a Studio card / card spec v1 file as a frame. The canvas autosaves in this browser.</p>
    </Section>
  </>
}

function FramePanel({ f }: { f: EditorFrame }) {
  const { card } = useTarget(), { edit, select, fit, setRight } = useEditor.getState()
  const c = f.card, st = c.style, pitch = c.grid.pitch ?? 4
  const gridName = (Object.keys(GRIDS) as GridName[]).find(k => GRIDS[k].cols === c.grid.cols && GRIDS[k].rows === c.grid.rows)
  const setStyle = (p: Partial<typeof st>, tag: string) => card(x => ({ ...x, style: { ...x.style, ...p } }), tag)
  const ref = c.reference ? widgetById(c.reference) : undefined
  // every data key the card reads (its code layers included), not only the ones it has defaults for
  const keys = [...new Set([...c.bindings.map(b => b.key), ...Object.keys(c.data), ...compiledOf(c).keys])]
  return <>
    <Section title="FRAME" aside={c.reference ? `REF ${c.reference.toUpperCase()}` : undefined}>
      <div className="ed-grid2">
        <Text label="NAME" value={c.name} onChange={name => card(x => ({ ...x, name }), 'frame:name')} />
        <Num label="X" value={f.x} step={4} onChange={x => edit(d => editFrame(d, f.id, y => ({ ...y, x })), 'frame:x')} />
        <Num label="Y" value={f.y} step={4} onChange={y => edit(d => editFrame(d, f.id, z => ({ ...z, y })), 'frame:y')} />
        <label className="ed-field ed-wide"><span>SIZE</span><select value={gridName ?? ''} disabled={!!c.reference} onChange={e => { const g = GRIDS[e.target.value as GridName]; if (g) card(x => ({ ...x, grid: { ...g }, style: rescale(x, g.pitch ?? 4) })) }}>
          {!gridName && <option value="">{c.grid.cols}×{c.grid.rows}</option>}{(Object.keys(GRIDS) as GridName[]).map(k => <option key={k} value={k}>{k}</option>)}</select></label>
        <Num label="COLS" value={c.grid.cols} min={8} max={512} disabled={!!c.reference} onChange={cols => card(x => ({ ...x, grid: { ...x.grid, cols } }), 'frame:cols')} />
        <Num label="ROWS" value={c.grid.rows} min={8} max={512} disabled={!!c.reference} onChange={rows => card(x => ({ ...x, grid: { ...x.grid, rows } }), 'frame:rows')} />
      </div>
      {c.reference && <p className="ed-hint">A reference frame draws its preset live, layer by layer. Tone, blend, order and visibility are yours; to edit its fields and text, make it editable.</p>}
      {ref && <div className="ed-row-btns"><button type="button" onClick={() => { try { card(() => ({ ...presetAsSpecCard(ref), name: c.name })); select({ frame: f.id }) } catch (e) { useEditor.getState().setNote((e as Error).message) } }}>MAKE EDITABLE</button></div>}
    </Section>
    <Section title="DOTS" aside={`pitch ${pitch}px`}>
      <Slider label="ROUNDNESS" hint={`n = ${squircleExponent(st.cornerRoundness ?? 0).toFixed(1)}`} value={st.cornerRoundness ?? 0} min={0} max={1} step={.02} onChange={cornerRoundness => setStyle({ cornerRoundness }, 'st:round')} />
      <Slider label="DOT SIZE" hint="max radius px" value={st.sizeMax} min={.1} max={Math.max(2, pitch * .8)} step={.05} onChange={sizeMax => setStyle({ sizeMax }, 'st:max')} />
      <Slider label="DENSITY" hint="pitch px" value={pitch} min={1.5} max={8} step={.25} onChange={p => card(x => ({ ...x, grid: { ...x.grid, pitch: p }, style: rescale(x, p) }), 'st:pitch')} fmt={v => `${v}`} />
      <More id="editor-dots" label="Dot size & texture" tech="advanced">
        <Slider label="DOT MIN" value={st.sizeMin} min={0} max={Math.max(1, st.sizeMax)} step={.05} onChange={sizeMin => setStyle({ sizeMin }, 'st:min')} />
        <Slider label="JITTER" hint="0 gridded · 1 organic" value={st.jitter ?? 0} min={0} max={1} step={.05} onChange={jitter => setStyle({ jitter }, 'st:jit')} />
        <Slider label="QUANTIZE" hint="size steps" value={st.quantizeSteps ?? 0} min={0} max={10} step={1} onChange={q => setStyle({ quantizeSteps: q || undefined }, 'st:q')} fmt={v => (v ? String(v) : 'OFF')} />
      </More>
      <div className="ed-grid2">
        <div className="ed-field ed-wide"><span>THEME</span><Seg label="Theme" value={f.theme} options={THEMES} fmt={t => THEME_LABEL[t]} onChange={theme => edit(d => editFrame(d, f.id, x => ({ ...x, theme })))} /></div>
        <label className="ed-check"><input type="checkbox" checked={c.animated} onChange={e => card(x => ({ ...x, animated: e.target.checked }))} /> ANIMATED</label>
      </div>
      {ref && <div className="ed-row-btns"><button type="button" onClick={() => card(x => ({ ...x, grid: { ...x.grid, pitch: ref.grid.pitch ?? 4 }, style: { ...ref.style } }))}>RESET STYLE</button></div>}
    </Section>
    {keys.length > 0 && <Section title="DATA" aside="what the card shows">
      {keys.map(k => { const b = c.bindings.find(x => x.key === k), v = c.data[k] ?? 0, lo = b?.min ?? Math.min(0, v), hi = b?.max ?? Math.max(1, v)
        return <Slider key={k} label={k} value={v} min={lo} max={hi} step={b?.step ?? .01} onChange={x => card(y => ({ ...y, data: { ...y.data, [k]: x } }), `data:${k}`)} fmt={x => (Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2))} /> })}
    </Section>}
    <Section title="LAYERS" aside={`${c.layers.length}`}>
      <ul className="ed-mini-list">{topDown(c).map(x => <li key={x.id}><button type="button" onClick={() => select({ frame: f.id, layer: x.id })}>{x.name}</button></li>)}</ul>
      <div className="ed-row-btns">
        <button type="button" onClick={() => { useEditor.getState().addLayerTo(f.id, newIRLayer(c.layers.length + 1)); setRight('code') }}>+ CODE LAYER</button>
        <button type="button" onClick={() => useEditor.getState().setTool('text')}>+ TEXT (T)</button>
        <button type="button" onClick={() => useEditor.getState().setTool('draw')}>+ PAINT (B)</button>
      </div>
    </Section>
    <Section title="ARRANGE">
      <div className="ed-row-btns">
        <button type="button" onClick={() => fit([f.id], 4)}>ZOOM TO</button>
        <button type="button" onClick={() => { const r = duplicateFrame(useEditor.getState().h.present, f.id); edit(() => r.doc); if (r.id) select({ frame: r.id }) }}>DUPLICATE</button>
        <button type="button" onClick={() => edit(d => editFrame(d, f.id, x => ({ ...x, hidden: !x.hidden })))}>{f.hidden ? 'SHOW' : 'HIDE'}</button>
        <button type="button" className="ed-danger" onClick={() => { edit(d => removeFrame(d, f.id)); select({}) }}>DELETE</button>
      </div>
    </Section>
  </>
}
/** Dot radii are in px: keep them proportional when the pitch changes. */
const rescale = (c: StudioCard, pitch: number) => { const k = pitch / (c.grid.pitch ?? 4); return { ...c.style, sizeMin: c.style.sizeMin * k, sizeMax: c.style.sizeMax * k } }

const KIND_NAME: Record<StudioLayer['kind'], string> = { ir: 'CODE', text: 'TEXT', sites: 'SITES', 'preset-layer': 'REFERENCE', spec: 'SPEC', paint: 'PAINT' }
function LayerPanel({ f, l }: { f: EditorFrame; l: StudioLayer }) {
  const { layer } = useTarget(), { edit, select, setRight } = useEditor.getState()
  const sel = { frame: f.id, layer: l.id }, ro = l.kind === 'preset-layer', idx = topDown(f.card).findIndex(x => x.id === l.id)
  const err = compiledOf(f.card).errors.get(l.id)
  return <>
    <Section title={KIND_NAME[l.kind]} aside={<button type="button" className="ed-link" onClick={() => select({ frame: f.id })}>IN {f.card.name.toUpperCase()} ↑</button>}>
      <div className="ed-grid2">
        <Text label="NAME" value={l.name} onChange={name => layer(x => ({ ...x, name }), `name:${l.id}`)} />
        <Pick label="TONE" value={l.tone} options={(ro || l.kind === 'spec' ? ['preset', ...TONES] : TONES) as LayerTone[]} onChange={tone => layer(x => ({ ...x, tone }))} />
        <Pick label="BLEND" value={l.blend} options={BLENDS} onChange={blend => layer(x => ({ ...x, blend }))} />
        {(l.kind === 'ir' || l.kind === 'text' || l.kind === 'paint') && <Pick label="LATTICE" value={l.lattice} options={LATTICES} disabled={l.kind === 'paint'} onChange={lattice => layer(x => ({ ...x, lattice }) as StudioLayer)} fmt={k => `${k}× · ${Math.floor(f.card.grid.cols / k)}×${Math.floor(f.card.grid.rows / k)}`} />}
        <label className="ed-check"><input type="checkbox" checked={l.visible} onChange={e => layer(x => ({ ...x, visible: e.target.checked }))} /> VISIBLE</label>
      </div>
      {err && <p className="ed-bad" role="alert">{err.message}</p>}
    </Section>
    {l.kind === 'text' && <TextFields l={l} />}
    {l.kind === 'sites' && <SiteFields l={l} />}
    {l.kind === 'paint' && <PaintFields f={f} l={l} />}
    {(l.kind === 'ir' || l.kind === 'sites') && <Section title="FIELD"><pre className="ed-code-peek">{l.src.split('\n').slice(0, 4).join('\n')}</pre><div className="ed-row-btns"><button type="button" onClick={() => setRight('code')}>EDIT CODE</button></div></Section>}
    {l.kind === 'spec' && <SpecFields key={l.id} l={l} />}
    {ro && <p className="ed-hint">Layer <b>#{l.params.index}</b> of preset <b>{l.params.preset}</b>, live and read-only. Select its frame and press MAKE EDITABLE to change its field or text.</p>}
    <Section title="ARRANGE">
      <div className="ed-row-btns">
        <button type="button" disabled={idx <= 0} onClick={() => edit(d => moveLayer(d, sel, idx - 1))} aria-label="Bring forward">FORWARD ↑</button>
        <button type="button" disabled={idx >= f.card.layers.length - 1} onClick={() => edit(d => moveLayer(d, sel, idx + 1))} aria-label="Send backward">BACK ↓</button>
        <button type="button" onClick={() => { const r = duplicateLayer(useEditor.getState().h.present, sel); edit(() => r.doc); if (r.id) select({ frame: f.id, layer: r.id }) }}>DUPLICATE</button>
        <button type="button" className="ed-danger" onClick={() => { edit(d => removeLayer(d, sel)); select({ frame: f.id }) }}>DELETE</button>
      </div>
    </Section>
  </>
}

function TextFields({ l }: { l: TextLayer }) {
  const { layer } = useTarget()
  const set = (p: Partial<TextLayer['params']>, tag = `text:${l.id}`) => layer(x => ({ ...x, params: { ...(x as TextLayer).params, ...p } }) as StudioLayer, tag)
  return <Section title="TEXT" aside="drag it on the canvas">
    <div className="ed-grid2">
      <label className="ed-field ed-wide"><span>TEXT</span><input data-focus="text" value={l.params.text} maxLength={64} autoCapitalize="characters" spellCheck={false} onChange={e => set({ text: e.target.value.toUpperCase() })} /></label>
      <Num label="COL" value={l.params.col} onChange={col => set({ col }, `col:${l.id}`)} />
      <Num label="ROW" value={l.params.row} onChange={row => set({ row }, `row:${l.id}`)} />
      <Pick label="ALIGN" value={l.params.align} options={['left', 'center', 'right'] as const} onChange={align => set({ align })} />
      <Pick label="SCALE" value={l.params.scale} options={[1, 2, 3, 4]} onChange={scale => set({ scale })} fmt={s => `${s}×`} />
      <label className="ed-check"><input type="checkbox" checked={l.params.smooth} onChange={e => set({ smooth: e.target.checked })} /> SMOOTH (HERO WEIGHT)</label>
    </div>
  </Section>
}
function SiteFields({ l }: { l: SitesLayer }) {
  const { layer } = useTarget(), p = l.params
  const set = (q: Partial<SitesLayer['params']>, k: string) => layer(x => ({ ...x, params: { ...(x as SitesLayer).params, ...q } }) as StudioLayer, `${k}:${l.id}`)
  return <Section title="SITES" aside="drag it on the canvas">
    <div className="ed-grid2">
      <Pick label="SHAPE" value={p.shape} options={['ring', 'line', 'disc'] as const} onChange={shape => set({ shape }, 'shape')} />
      <Pick label="SIZE" value={l.size} options={SITE_SIZES} onChange={size => layer(x => ({ ...x, size }) as StudioLayer)} fmt={s => `${s}×`} />
      <Num label={p.shape === 'line' ? 'X0' : 'CX'} value={p.cx} onChange={cx => set({ cx }, 'cx')} />
      <Num label={p.shape === 'line' ? 'Y0' : 'CY'} value={p.cy} onChange={cy => set({ cy }, 'cy')} />
      {p.shape === 'line' ? <><Num label="X1" value={p.x1} onChange={x1 => set({ x1 }, 'x1')} /><Num label="Y1" value={p.y1} onChange={y1 => set({ y1 }, 'y1')} /></> : <Num label="RADIUS" value={p.r} min={1} max={512} onChange={r => set({ r }, 'r')} />}
      <Num label="SPACING" value={p.spacing} min={1} max={64} step={.5} onChange={spacing => set({ spacing }, 'sp')} />
    </div>
  </Section>
}
function PaintFields({ f, l }: { f: EditorFrame; l: PaintLayer }) {
  const { layer } = useTarget(), brush = useEditor(s => s.brush), { setBrush, setTool, setNote } = useEditor.getState(), tool = useEditor(s => s.tool)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const lit = paintCells(l).reduce((n, v) => n + (v > 0 ? 1 : 0), 0)
  const map = (fn: (v: number) => number) => layer(x => { const a = paintCells(x as PaintLayer).map(fn); return { ...x, cells: encodeCells(a) } as StudioLayer })
  const trace = async (fl?: File) => {
    if (!fl || !fl.type.startsWith('image/')) return
    setBusy(true)
    try {
      const field = await dotifyUpload(fl, { cols: l.cols, rows: l.rows }, 'bayer')
      const m = Array.from({ length: l.rows }, (_, r) => Array.from({ length: l.cols }, (_, c) => field(l.cols === 1 ? .5 : c / (l.cols - 1), l.rows === 1 ? .5 : r / (l.rows - 1))))
      layer(x => ({ ...x, cells: cellsFromMatrix(x as PaintLayer, m) }) as StudioLayer)
      setNote(`traced ${fl.name} into ${l.name}`)
    } catch (e) { setNote(`trace failed: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return <Section title="BRUSH" aside={`${l.cols}×${l.rows} · ${lit} lit`}>
    <div className="ed-row-btns">
      <button type="button" aria-pressed={tool === 'draw' && !brush.erase} onClick={() => { setTool('draw'); setBrush({ erase: false }) }}>PAINT (B)</button>
      <button type="button" aria-pressed={tool === 'draw' && brush.erase} onClick={() => { setTool('draw'); setBrush({ erase: true }) }}>ERASE (E)</button>
    </div>
    <Slider label="SIZE" hint="[ ]" value={brush.size} min={1} max={8} step={1} onChange={size => setBrush({ size })} fmt={v => String(v)} />
    <Slider label="INK" hint="dot value" value={brush.value} min={.2} max={1} step={.2} onChange={value => setBrush({ value })} />
    <div className="ed-row-btns">
      <button type="button" onClick={() => map(v => 255 - v)}>INVERT</button>
      <button type="button" onClick={() => map(() => 0)}>CLEAR</button>
      <button type="button" disabled={busy} onClick={() => file.current?.click()}>{busy ? 'TRACING…' : 'TRACE A PICTURE'}</button>
    </div>
    <input ref={file} type="file" accept="image/*" hidden aria-label="Picture to trace into this paint layer" onChange={e => { void trace(e.target.files?.[0]); e.target.value = '' }} />
    <p className="ed-hint">Paints whole cells of the {l.lattice}× lattice in {f.card.name}. Right-drag erases. Two fingers pan and zoom.</p>
  </Section>
}
function SpecFields({ l }: { l: Extract<StudioLayer, { kind: 'spec' }> }) {
  const { layer } = useTarget()
  const [text, setText] = useState(() => JSON.stringify(l.spec, null, 1)), [err, setErr] = useState('')
  const big = text.length > 20000
  return <Section title="SPEC JSON" aside={l.spec.kind}>
    <textarea className="ed-json" aria-label="Spec layer JSON" spellCheck={false} rows={8} readOnly={big} value={big ? text.slice(0, 20000) : text}
      onChange={e => { const v = e.target.value; setText(v); try { const spec = JSON.parse(v); if (!spec?.kind) throw new Error('needs a "kind"'); layer(x => ({ ...x, spec }) as StudioLayer, `spec:${l.id}`); setErr('') } catch (er) { setErr((er as Error).message) } }} />
    {err && <p className="ed-bad" role="alert">JSON: {err}</p>}
  </Section>
}

// ── ANIMATE ────────────────────────────────────────────────────────────────
const MASKS = Object.keys(masks) as MaskName[], EASES = Object.keys(ease) as EaseName[], LENGTHS = [1.5, 2, 3, 4, 6, 8, 12]
function Track({ f, track, motion, t0, t1 }: { f: EditorFrame; track: Track; motion: Motion; t0: number; t1: number }) {
  const { card } = useTarget(), L = f.card.timeline.length
  const set = (p: Partial<Motion>, tag?: string) => card(c => ({ ...c, transitions: { ...c.transitions, [track]: { ...c.transitions[track], ...p } } }), tag)
  const curve = useCurve(motion.ease), mask = useMask(motion.mask)
  return <div className="ed-track" role="group" aria-label={`${track} track`}>
    <div className="ed-track-head"><b>{track.toUpperCase()}</b><div className="ed-lane" aria-hidden="true"><i style={{ left: `${(t0 / L) * 100}%`, width: `${Math.max(1, ((t1 - t0) / L) * 100)}%` }} /></div></div>
    <div className="ed-grid2">
      <Pick label="MASK" value={motion.mask} options={MASKS} onChange={m => set({ mask: m })} />
      <Pick label="EASE" value={motion.ease} options={EASES} onChange={e => set({ ease: e })} />
      <Num label="MS" value={motion.ms} min={0} max={5000} step={10} onChange={ms => set({ ms }, `ms:${track}`)} />
      {track === 'change' ? <Num label="AT S" value={f.card.timeline.changeAt} min={0} max={L} step={.05} onChange={changeAt => card(c => ({ ...c, timeline: { ...c.timeline, changeAt } }), 'changeAt')} /> : <span />}
    </div>
    <div className="ed-track-viz"><MiniDots layers={mask} label={`${motion.mask} mask order`} /><MiniDots layers={curve} label={`${motion.ease} ease curve`} /></div>
  </div>
}
function Animate() {
  const { f, card } = useTarget(), play = useEditor(s => s.play), preview = useEditor(s => s.preview), { setPlay, setPreview } = useEditor.getState()
  if (!f) return <p className="ed-hint">Select a frame to animate it: enter, change and exit tracks with the engine's masks and eases, and the states it moves between.</p>
  const c = f.card, L = c.timeline.length, cur = preview[f.id] ?? c.states[0]?.name
  const state = c.states.find(s => s.name === cur) ?? c.states[0]
  const keys = [...new Set([...Object.keys(c.data), ...c.bindings.map(b => b.key), ...compiledOf(c).keys])]
  return <>
    <Section title="TIMELINE" aside={`${f.card.name}`}>
      <div className="ed-transport">
        <button type="button" className="ed-play" aria-label={play.playing ? 'Pause timeline' : 'Play timeline'} onClick={() => setPlay({ playing: !play.playing })}>{play.playing ? 'PAUSE' : 'PLAY'}</button>
        <input type="range" min={0} max={L} step={.01} value={Math.min(play.t, L)} aria-label="Timeline time t (seconds)" onChange={e => setPlay({ playing: false, t: Number(e.target.value) })} />
        <output className="ed-t">t {Math.min(play.t, L).toFixed(2)} s</output>
      </div>
      <div className="ed-grid2">
        <Pick label="LENGTH" value={L} options={LENGTHS} fmt={x => `${x} s`} onChange={length => card(x => ({ ...x, timeline: { ...x.timeline, length, changeAt: Math.min(x.timeline.changeAt, length) } }))} />
        <label className="ed-check"><input type="checkbox" checked={c.animated} onChange={e => card(x => ({ ...x, animated: e.target.checked }))} /> ANIMATED</label>
      </div>
      <p className="ed-hint">While this tab is open the frame previews the timeline at t; elsewhere it runs live.</p>
    </Section>
    <Section title="TRACKS">{trackSpans(c).map(s => <Track key={s.track} f={f} track={s.track} motion={s.motion} t0={s.t0} t1={s.t1} />)}</Section>
    <Section title="STATES" aside={`${c.states.length}`}>
      <div className="ed-chips" role="radiogroup" aria-label="Preview state">{c.states.map(s => <button key={s.name} type="button" role="radio" aria-checked={s.name === state?.name} onClick={() => setPreview(f.id, s.name)}>{s.name}</button>)}
        <button type="button" onClick={() => { const name = `s${c.states.length}`; card(x => ({ ...x, states: [...x.states, { name, data: { ...(state?.data ?? x.data) } }] })); setPreview(f.id, name) }}>+ STATE</button></div>
      {state && keys.map(k => <Num key={k} label={`DATA.${k}`} value={state.data[k] ?? c.data[k] ?? 0} step={.05} onChange={v => card(x => ({ ...x, states: x.states.map(s => (s.name === state.name ? { ...s, data: { ...s.data, [k]: v } } : s)) }), `state:${state.name}:${k}`)} />)}
      {state && c.states.length > 1 && <div className="ed-row-btns"><button type="button" className="ed-danger" onClick={() => { card(x => ({ ...x, states: x.states.filter(s => s.name !== state.name), machine: x.machine.filter(m => m.from !== state.name && m.to !== state.name) })); setPreview(f.id, c.states[0].name) }}>REMOVE {state.name.toUpperCase()}</button></div>}
      <p className="ed-hint">The change track goes from the first state to the second{c.machine.length ? ' (the first machine edge)' : ''}.</p>
    </Section>
  </>
}

// ── CODE ───────────────────────────────────────────────────────────────────
function Code() {
  const { f, l } = useTarget(), { setRight, select } = useEditor.getState()
  if (f && l && (l.kind === 'ir' || l.kind === 'sites')) return <CodeLayer key={l.id} f={f} l={l} />
  if (!f) return <><p className="ed-hint">Select a code layer, or tap a frame with the code tool (<b>C</b>) to add one. A new code frame starts from an example.</p>
    <div className="ed-row-btns"><button type="button" onClick={() => { useEditor.getState().insertProgram(EXAMPLES[0]) }}>NEW CODE FRAME</button></div></>
  const code = topDown(f.card).filter(x => x.kind === 'ir' || x.kind === 'sites')
  return <>
    <Section title="CODE LAYERS" aside={f.card.name}>
      {code.length ? <ul className="ed-mini-list">{code.map(x => <li key={x.id}><button type="button" onClick={() => select({ frame: f.id, layer: x.id })}>{x.name}</button></li>)}</ul> : <p className="ed-hint">This frame has no code layer.</p>}
      <div className="ed-row-btns"><button type="button" onClick={() => { useEditor.getState().addLayerTo(f.id, newIRLayer(f.card.layers.length + 1)); setRight('code') }}>+ CODE LAYER</button></div>
    </Section>
    <SpecPeek f={f} />
  </>
}
function SpecPeek({ f }: { f: EditorFrame }) {
  const [json, setJson] = useState('')
  useEffect(() => { const h = setTimeout(() => { try { setJson(JSON.stringify(specV1.toSpec(f.card).spec, (_, v) => (typeof v === 'string' && v.length > 240 ? `${v.slice(0, 60)}… (${v.length} chars)` : v), 1)) } catch (e) { setJson(`// ${(e as Error).message}`) } }, 200); return () => clearTimeout(h) }, [f.card])
  return <More id="editor-spec" label="This frame as card spec v1" tech="read-only JSON"><pre className="ed-json ed-json--ro" tabIndex={0} aria-label="Card spec v1 JSON">{json}</pre></More>
}
function CodeLayer({ f, l }: { f: EditorFrame; l: IRLayer | SitesLayer }) {
  const { layer, card } = useTarget()
  const compiled = compiledOf(f.card), err = compiled.errors.get(l.id)
  const [link, setLink] = useState(''), [copied, setCopied] = useState(false)
  const share = shareable(f, l)
  useEffect(() => {
    if (typeof share === 'string' || err) { setLink(''); return }
    let gone = false
    const h = setTimeout(() => { encodeShare(share).then(enc => { if (!gone) setLink(enc) }, () => { if (!gone) setLink('') }) }, 250)
    return () => { gone = true; clearTimeout(h) }
  }, [typeof share === 'string' ? share : `${share.src}|${share.grid}|${share.lattice}|${share.tone}`, !!err]) // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async () => {
    if (!link) return
    const url = shareUrl(link)
    try { await navigator.clipboard.writeText(url) } catch { /* clipboard blocked: the link is shown below */ }
    ;(window as { __editorLink?: string }).__editorLink = url
    setCopied(true); setTimeout(() => setCopied(false), 1400)
  }
  const keys = [...new Set(compiled.keys)].filter(k => l.src.includes(`data.${k}`))
  const near = l.src.length > IR_LIMITS.source * .9
  return <>
    <Section title="PROGRAM" aside={typeof share === 'string' ? l.name : `#${programHash(share)}`}>
      <CodeEditor value={l.src} onChange={src => layer(x => ({ ...x, src }) as StudioLayer, `src:${l.id}`)} error={err} maxLength={IR_LIMITS.source} />
      <div className="dw-status" id="dw-status" aria-live="polite">{err ? <span className="dw-bad">ERROR {err.line}:{err.col} · LAST GOOD PROGRAM SHOWN</span> : <span className={near ? 'dw-warn' : ''}><b>{l.src.length}</b>/{IR_LIMITS.source} CHARS · OK</span>}</div>
      <label className="ed-field ed-wide"><span>START FROM AN EXAMPLE</span><select value="" onChange={e => { const x = EXAMPLES.find(y => y.name === e.target.value); if (x) layer(y => ({ ...y, src: x.src, ...(y.kind === 'ir' && { lattice: x.lattice, tone: x.tone }) }) as StudioLayer) }}>
        <option value="">…</option>{EXAMPLES.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
    </Section>
    <Section title="SHARE" aside="?make=code&p=…">
      {typeof share === 'string' ? <p className="ed-hint">{share}.</p> : <>
        <div className="ed-row-btns ed-share">
          <button type="button" className="ed-primary" onClick={copy} disabled={!link}>{copied ? 'COPIED' : 'COPY LINK'}</button>
          <output className="ed-url" title={link ? shareUrl(link) : ''}>{link ? <>LINK <b>{shareUrl(link).length}</b> CHARS · {link[0] === 'z' ? 'DEFLATE' : 'PLAIN'}</> : '—'}</output>
        </div>
        <p className="ed-hint">The link opens this program in the editor on any device; nothing is uploaded.</p></>}
    </Section>
    {keys.length > 0 && <Section title="DATA" aside="data.* sliders">
      {keys.map(k => <Slider key={k} label={`data.${k}`} value={f.card.data[k] ?? 0} min={0} max={1} step={.01} onChange={v => card(c => ({ ...c, data: { ...c.data, [k]: v } }), `data:${k}`)} />)}
    </Section>}
  </>
}

// ── EXPORT ─────────────────────────────────────────────────────────────────
const FORMATS: ClipFormat[] = ['apng', 'gif', 'webm', 'mp4']
function Export() {
  const { f } = useTarget(), t = useEditor(s => s.play.t)
  const [format, setFormat] = useState<ClipFormat>('apng'), [fps, setFps] = useState(24), [scale, setScale] = useState(1)
  const [progress, setProgress] = useState<number | null>(null), [status, setStatus] = useState('')
  const abort = useRef<AbortController | null>(null)
  if (!f) return <p className="ed-hint">Select a frame (or a layer in it) to export it as PNG, SVG, HTML, a clip of its timeline, a plotter SVG or a card spec.</p>
  const T = Math.min(t, f.card.timeline.length)
  const run = async (fn: () => unknown) => { try { const r = await fn(); setStatus(typeof r === 'string' ? r : 'saved') } catch (e) { setStatus(`failed: ${(e as Error).message}`) } }
  const record = async () => {
    abort.current = new AbortController(); setProgress(0); setStatus('')
    try { setStatus(await recordFrame(f, { format, fps, scale, signal: abort.current.signal, onProgress: setProgress })) }
    catch (e) { setStatus(e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : `failed: ${(e as Error).message}`) }
    finally { setProgress(null); abort.current = null }
  }
  return <>
    <Section title="IMAGE" aside={`${f.card.name} · t ${T.toFixed(2)}`}>
      <div className="ed-row-btns">
        <button type="button" className="ed-primary" onClick={() => run(() => exporters.png(f, T))}>PNG</button>
        <button type="button" onClick={() => run(() => exporters.svg(f, T))}>SVG</button>
        <button type="button" onClick={() => run(() => exporters.html(f, T))}>HTML</button>
      </div>
    </Section>
    <Section title="CLIP" aside={`timeline ${f.card.timeline.length} s`}>
      <div className="ed-grid2">
        <Pick label="FORMAT" value={format} options={FORMATS} fmt={x => x.toUpperCase()} onChange={setFormat} />
        <Pick label="FPS" value={fps} options={[12, 15, 24, 30, 60]} onChange={setFps} />
        <Pick label="SCALE" value={scale} options={[1, 2, 3]} fmt={x => `${x}×`} onChange={setScale} />
        {progress === null ? <button type="button" className="ed-record" onClick={record}>RECORD</button> : <button type="button" onClick={() => abort.current?.abort()}>CANCEL</button>}
      </div>
      {progress !== null && <progress value={progress} max={1} aria-label="Export progress" />}
    </Section>
    <More id="editor-export-more" label="Plotter, JSON & spec" tech="plotter SVG, Studio JSON, card spec v1 / v0">
      <div className="ed-row-btns">
        <button type="button" onClick={() => run(() => exporters.plotter(f, T))}>PLOTTER SVG</button>
        <button type="button" onClick={() => run(() => exporters.studio(f))}>STUDIO JSON</button>
        <button type="button" onClick={() => run(() => exporters.specV1(f))}>CARD SPEC v1</button>
        <button type="button" onClick={() => run(() => exporters.specV0(f))}>SPEC v0</button>
      </div>
    </More>
    {status && <p className="ed-hint ed-status" role="status">{status}</p>}
  </>
}
export type { Sel }
