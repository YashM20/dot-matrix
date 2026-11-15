/**
 * The inspector's DESIGN tab: the document with nothing selected, a frame (its grid, dots, data, layers), a layer
 * (name, tone, blend, then the fields of its kind, in LayerFields.tsx), or many frames, layers or a group.
 */
import { useRef } from 'react'
import { squircleExponent } from '../../engine/renderer/shapePath'
import { SHARE_GRIDS } from '../../lib/share'
import { CARD, widgetById } from '../../widgets'
import type { WidgetPreset } from '../../widgets/types'
import { More } from '../More'
import { looksLikeSpec, presetAsSpecCard, specV1 } from '../studio/adapter'
import { BLENDS, cardFromJSON, LATTICES, TONES, type LayerTone, type StudioCard, type StudioLayer } from '../studio/doc'
import { arrangeSel, copyEverywhere, deleteSel, duplicateSel, groupSel, lockSel, paste, ungroupSel } from './actions'
import { attempt } from './attempt'
import { docFromJSON, duplicateFrame, duplicateLayer, editFrame, frameById, groupOf, moveLayer, newIRLayer, removeFrame, removeLayer, renameGroup, seedDoc, THEMES, topDown, type EditorFrame, type ThemeName } from './doc'
import { exporters } from './exporters'
import { PaintFields, SiteFields, SpecFields, TextFields } from './LayerFields'
import { compiledOf } from './render'
import { ALIGNS, selCount, selGroup, selIds, type Align } from './select'
import { getEditor, useEditor } from './store'
import { useTarget } from './target'
import { Num, Pick, Section, Seg, Slider, Text } from './ui'

const GRIDS = { 'tile 144×144': SHARE_GRIDS.square, 'wide 216×108': SHARE_GRIDS.wide, 'tall 108×162': SHARE_GRIDS.tall, 'card 80×74': { ...CARD, pitch: 4 } } as const
type GridName = keyof typeof GRIDS
const THEME_LABEL: Record<ThemeName, string> = { dot480: 'DOT/480', deerflowMosaic: 'MOSAIC' }

export function Design() {
  const { f, l, doc, sel } = useTarget()
  if (!f) return <DocPanel />
  if (selCount(sel) > 1 || selGroup(doc, sel)) return <ManyPanel f={f} />
  if (!l) return <FramePanel f={f} />
  return <LayerPanel f={f} l={l} />
}

const ALIGN_LABEL: Record<Align, string> = { left: 'LEFT', hcenter: 'CENTRE', right: 'RIGHT', top: 'TOP', vcenter: 'MIDDLE', bottom: 'BOTTOM' }
/** Many frames, many layers of a frame, or a group: align / distribute, group, and the edits of many. */
function ManyPanel({ f }: { f: EditorFrame }) {
  const { doc, sel } = useTarget(), { edit, select } = getEditor()
  const layers = !!sel.layer, ids = selIds(sel), g = selGroup(doc, sel), grouped = layers && ids.some(id => groupOf(f, id))
  const name = (id: string) => (layers ? f.card.layers.find(l => l.id === id)?.name : frameById(doc, id)?.card.name) ?? id
  const locked = layers ? ids.every(id => f.locks?.includes(id)) : ids.every(id => frameById(doc, id)?.locked)
  return <>
    <Section title={g ? 'GROUP' : 'SELECTION'} aside={layers ? `${ids.length} layers · ${f.card.name}` : `${ids.length} frames`}>
      {g && <div className="ed-grid2"><Text label="NAME" value={g.name} onChange={v => edit(d => renameGroup(d, f.id, g.id, v), `group:${g.id}`)} /></div>}
      <ul className="ed-mini-list">{ids.map(id => <li key={id}><button type="button" onClick={() => select(layers ? { frame: f.id, layer: id } : { frame: id })}>{name(id)}</button></li>)}</ul>
    </Section>
    <Section title="ALIGN" aside={layers ? (ids.length === 1 ? 'to the frame · text, sites, placed spec · whole cells' : 'text, sites, placed spec · whole cells') : 'Alt+A D W S H V'}>
      <div className="ed-row-btns ed-align">{ALIGNS.map(a => <button key={a} type="button" aria-label={`Align ${ALIGN_LABEL[a].toLowerCase()}`} onClick={() => arrangeSel(a)}>{ALIGN_LABEL[a]}</button>)}</div>
      <div className="ed-row-btns">
        <button type="button" disabled={ids.length < 3} onClick={() => arrangeSel('dist-x')}>DISTRIBUTE ↔</button>
        <button type="button" disabled={ids.length < 3} onClick={() => arrangeSel('dist-y')}>DISTRIBUTE ↕</button>
      </div>
    </Section>
    <Section title="ARRANGE">
      <div className="ed-row-btns">
        {layers && !g && <button type="button" onClick={groupSel}>GROUP</button>}
        {grouped && <button type="button" onClick={ungroupSel}>UNGROUP</button>}
        <button type="button" onClick={duplicateSel}>DUPLICATE</button>
        <button type="button" onClick={copyEverywhere}>COPY</button>
        <button type="button" onClick={() => paste()}>PASTE</button>
        <button type="button" onClick={lockSel}>{locked ? 'UNLOCK' : 'LOCK'}</button>
        <button type="button" className="ed-danger" onClick={deleteSel}>DELETE</button>
      </div>
      <p className="ed-hint">{layers ? 'Ctrl+G groups, Ctrl+⇧G ungroups. ' : ''}Ctrl+D duplicates, Alt-drag moves a copy, Ctrl+C / Ctrl+V copy and paste (also into another tab).</p>
    </Section>
  </>
}

/** Open a picked file: an editor document replaces the canvas, a card spec or card JSON becomes a frame. */
async function openFile(fl: File) {
  const { setNote, fit } = getEditor()
  const text = await fl.text(), x = JSON.parse(text) as { kind?: string }
  if (x.kind === 'dot480.editor') { getEditor().openDoc(docFromJSON(text)); setNote(`opened ${fl.name}`); requestAnimationFrame(() => fit()) } // held from the autosave until it draws
  else {
    const card = looksLikeSpec(x) ? specV1.fromSpec(x as never) : cardFromJSON(text)
    getEditor().insertCard(card, { source: 'file' }); setNote(`added ${fl.name} as a frame`)
  }
}

function DocPanel() {
  const doc = useEditor(s => s.h.present), { edit, setNote, fit, setShortcuts } = getEditor()
  const file = useRef<HTMLInputElement>(null)
  const open = (fl: File) => attempt(() => openFile(fl), e => setNote(`could not open ${fl.name}: ${e.message}`))
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
        <button type="button" onClick={() => { edit(() => seedDoc()); getEditor().select({}); requestAnimationFrame(() => fit()) }} title="Replace the canvas with the starter frames (undoable)">RESET CANVAS</button>
      </div>
      <input ref={file} type="file" accept=".json,application/json" hidden aria-label="Open an editor document, Studio card or card spec JSON" onChange={e => { const x = e.target.files?.[0]; if (x) void open(x); e.target.value = '' }} />
      <p className="ed-hint">Opens an editor document, or adds a Studio card / card spec v1 file as a frame. The canvas autosaves in this browser.</p>
    </Section>
  </>
}

/** FRAME: name, place and grid; a reference frame's grid is its preset's, and MAKE EDITABLE turns it into layers. */
function FrameSection({ f, refPreset }: { f: EditorFrame; refPreset?: WidgetPreset }) {
  const { card } = useTarget(), { edit, select } = getEditor()
  const c = f.card
  const gridName = (Object.keys(GRIDS) as GridName[]).find(k => GRIDS[k].cols === c.grid.cols && GRIDS[k].rows === c.grid.rows)
  return <Section title="FRAME" aside={c.reference ? `REF ${c.reference.toUpperCase()}` : undefined}>
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
    {refPreset && <div className="ed-row-btns"><button type="button" onClick={() => { try { card(() => ({ ...presetAsSpecCard(refPreset), name: c.name })); select({ frame: f.id }) } catch (e) { getEditor().setNote((e as Error).message) } }}>MAKE EDITABLE</button></div>}
  </Section>
}

/** DOTS: roundness, size and density, the advanced texture fold, theme and animation. */
function DotsSection({ f, refPreset }: { f: EditorFrame; refPreset?: WidgetPreset }) {
  const { card } = useTarget(), { edit } = getEditor()
  const c = f.card, st = c.style, pitch = c.grid.pitch ?? 4
  const setStyle = (p: Partial<typeof st>, tag: string) => card(x => ({ ...x, style: { ...x.style, ...p } }), tag)
  return <Section title="DOTS" aside={`pitch ${pitch}px`}>
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
    {refPreset && <div className="ed-row-btns"><button type="button" onClick={() => card(x => ({ ...x, grid: { ...x.grid, pitch: refPreset.grid.pitch ?? 4 }, style: { ...refPreset.style } }))}>RESET STYLE</button></div>}
  </Section>
}

/** DATA: a slider for every data key the card reads (its code layers included), not only the ones it has defaults for. */
function DataSection({ c }: { c: StudioCard }) {
  const { card } = useTarget()
  const keys = [...new Set([...c.bindings.map(b => b.key), ...Object.keys(c.data), ...compiledOf(c).keys])]
  if (!keys.length) return null
  return <Section title="DATA" aside="what the card shows">
    {keys.map(k => { const b = c.bindings.find(x => x.key === k), v = c.data[k] ?? 0, lo = b?.min ?? Math.min(0, v), hi = b?.max ?? Math.max(1, v)
      return <Slider key={k} label={k} value={v} min={lo} max={hi} step={b?.step ?? .01} onChange={x => card(y => ({ ...y, data: { ...y.data, [k]: x } }), `data:${k}`)} fmt={x => (Math.abs(x) >= 10 ? x.toFixed(0) : x.toFixed(2))} /> })}
  </Section>
}

function FramePanel({ f }: { f: EditorFrame }) {
  const { edit, select, fit, setRight } = getEditor()
  const c = f.card, refPreset = c.reference ? widgetById(c.reference) : undefined
  return <>
    <FrameSection f={f} refPreset={refPreset} />
    <DotsSection f={f} refPreset={refPreset} />
    <DataSection c={c} />
    <Section title="LAYERS" aside={`${c.layers.length}`}>
      <ul className="ed-mini-list">{topDown(c).map(x => <li key={x.id}><button type="button" onClick={() => select({ frame: f.id, layer: x.id })}>{x.name}</button></li>)}</ul>
      <div className="ed-row-btns">
        <button type="button" onClick={() => { getEditor().addLayerTo(f.id, newIRLayer(c.layers.length + 1)); setRight('code') }}>+ CODE LAYER</button>
        <button type="button" onClick={() => getEditor().setTool('text')}>+ TEXT (T)</button>
        <button type="button" onClick={() => getEditor().setTool('draw')}>+ PAINT (B)</button>
      </div>
    </Section>
    <Section title="ARRANGE">
      <div className="ed-row-btns">
        <button type="button" onClick={() => fit([f.id], 4)}>ZOOM TO</button>
        <button type="button" onClick={() => { const r = duplicateFrame(getEditor().h.present, f.id); edit(() => r.doc); if (r.id) select({ frame: r.id }) }}>DUPLICATE</button>
        <button type="button" onClick={copyEverywhere}>COPY</button>
        <button type="button" onClick={() => edit(d => editFrame(d, f.id, x => ({ ...x, hidden: !x.hidden })))}>{f.hidden ? 'SHOW' : 'HIDE'}</button>
        <button type="button" aria-pressed={!!f.locked} onClick={lockSel}>{f.locked ? 'UNLOCK' : 'LOCK'}</button>
        <button type="button" className="ed-danger" onClick={() => { edit(d => removeFrame(d, f.id)); select({}) }}>DELETE</button>
      </div>
    </Section>
  </>
}
/** Dot radii are in px: keep them proportional when the pitch changes. */
const rescale = (c: StudioCard, pitch: number) => { const k = pitch / (c.grid.pitch ?? 4); return { ...c.style, sizeMin: c.style.sizeMin * k, sizeMax: c.style.sizeMax * k } }

/** The fields of the layer's kind: TEXT, SITES, PAINT, a code peek (IR and sites), SPEC, or the read-only reference note. */
function KindFields({ f, l }: { f: EditorFrame; l: StudioLayer }) {
  const { setRight } = getEditor()
  return <>
    {l.kind === 'text' && <TextFields l={l} />}
    {l.kind === 'sites' && <SiteFields l={l} />}
    {l.kind === 'paint' && <PaintFields f={f} l={l} />}
    {(l.kind === 'ir' || l.kind === 'sites') && <Section title="FIELD"><pre className="ed-code-peek">{l.src.split('\n').slice(0, 4).join('\n')}</pre><div className="ed-row-btns"><button type="button" onClick={() => setRight('code')}>EDIT CODE</button></div></Section>}
    {l.kind === 'spec' && <SpecFields key={l.id} f={f} l={l} />}
    {l.kind === 'preset-layer' && <p className="ed-hint">Layer <b>#{l.params.index}</b> of preset <b>{l.params.preset}</b>, live and read-only. Select its frame and press MAKE EDITABLE to change its field or text.</p>}
  </>
}

/** ARRANGE for one layer: order, duplicate, group, copy, lock, delete. */
function LayerArrange({ f, l }: { f: EditorFrame; l: StudioLayer }) {
  const { edit, select } = getEditor()
  const sel = { frame: f.id, layer: l.id }, idx = topDown(f.card).findIndex(x => x.id === l.id), locked = !!f.locks?.includes(l.id)
  return <Section title="ARRANGE">
    <div className="ed-row-btns">
      <button type="button" disabled={idx <= 0} onClick={() => edit(d => moveLayer(d, sel, idx - 1))} aria-label="Bring forward">FORWARD ↑</button>
      <button type="button" disabled={idx >= f.card.layers.length - 1} onClick={() => edit(d => moveLayer(d, sel, idx + 1))} aria-label="Send backward">BACK ↓</button>
      <button type="button" onClick={() => { const r = duplicateLayer(getEditor().h.present, sel); edit(() => r.doc); if (r.id) select({ frame: f.id, layer: r.id }) }}>DUPLICATE</button>
      {groupOf(f, l.id) ? <button type="button" onClick={ungroupSel}>UNGROUP</button> : <button type="button" onClick={groupSel}>GROUP</button>}
      <button type="button" onClick={copyEverywhere}>COPY</button>
      <button type="button" aria-pressed={locked} onClick={lockSel}>{locked ? 'UNLOCK' : 'LOCK'}</button>
      <button type="button" className="ed-danger" onClick={() => { edit(d => removeLayer(d, sel)); select({ frame: f.id }) }}>DELETE</button>
    </div>
  </Section>
}

const KIND_NAME: Record<StudioLayer['kind'], string> = { ir: 'CODE', text: 'TEXT', sites: 'SITES', 'preset-layer': 'REFERENCE', spec: 'SPEC', paint: 'PAINT' }
function LayerPanel({ f, l }: { f: EditorFrame; l: StudioLayer }) {
  const { layer } = useTarget(), { select } = getEditor()
  const presetTone = l.kind === 'preset-layer' || l.kind === 'spec'
  const err = compiledOf(f.card).errors.get(l.id)
  return <>
    <Section title={KIND_NAME[l.kind]} aside={<button type="button" className="ed-link" onClick={() => select({ frame: f.id })}>IN {f.card.name.toUpperCase()} ↑</button>}>
      <div className="ed-grid2">
        <Text label="NAME" value={l.name} onChange={name => layer(x => ({ ...x, name }), `name:${l.id}`)} />
        <Pick label="TONE" value={l.tone} options={(presetTone ? ['preset', ...TONES] : TONES) as LayerTone[]} onChange={tone => layer(x => ({ ...x, tone }))} />
        <Pick label="BLEND" value={l.blend} options={BLENDS} onChange={blend => layer(x => ({ ...x, blend }))} />
        {(l.kind === 'ir' || l.kind === 'text' || l.kind === 'paint') && <Pick label="LATTICE" value={l.lattice} options={LATTICES} disabled={l.kind === 'paint'} onChange={lattice => layer(x => ({ ...x, lattice }) as StudioLayer)} fmt={k => `${k}× · ${Math.floor(f.card.grid.cols / k)}×${Math.floor(f.card.grid.rows / k)}`} />}
        <label className="ed-check"><input type="checkbox" checked={l.visible} onChange={e => layer(x => ({ ...x, visible: e.target.checked }))} /> VISIBLE</label>
      </div>
      {err && <p className="ed-bad" role="alert">{err.message}</p>}
    </Section>
    <KindFields f={f} l={l} />
    <LayerArrange f={f} l={l} />
  </>
}
