/**
 * Left panel: LAYERS (frames → their layers, top of the stack first) and ASSETS (presets from every
 * board, the CODE examples, saved Studio cards, blank / drawing / photo frames).
 * Reorder by dragging a row's grip (mouse or finger: pointer events, not HTML5 drag) or Alt+↑/↓.
 */
import { memo, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { dot480 } from '../../engine/theme/tokens'
import { dotifyUpload } from '../../lib/photoDotify'
import { SHARE_GRIDS } from '../../lib/share'
import { boards, CARD, TILE, withChrome, type WidgetPreset } from '../../widgets'
import { EXAMPLES, type Example } from '../dwitter/examples'
import { compiledOf } from './render'
import { libraryList, paintLayer, type StudioCard, type StudioLayer } from '../studio/doc'
import { blankCard, drawingCard, editFrame, editLayer, frameById, moveLayer, programCard, topDown, type EditorFrame } from './doc'
import { useEditor } from './store'

const KIND: Record<StudioLayer['kind'], string> = { ir: 'CODE', text: 'TEXT', sites: 'SITES', 'preset-layer': 'REF', spec: 'SPEC', paint: 'PAINT' }

function Rename({ value, onDone }: { value: string; onDone: (v?: string) => void }) {
  const [v, setV] = useState(value)
  return <input className="ed-rename" autoFocus value={v} maxLength={64} aria-label="Rename" onChange={e => setV(e.target.value)} onFocus={e => e.currentTarget.select()}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') onDone(v.trim() || value); else if (e.key === 'Escape') onDone() }} onBlur={() => onDone(v.trim() || value)} />
}

function FrameRows({ f }: { f: EditorFrame }) {
  const sel = useEditor(s => s.sel), { select, edit } = useEditor.getState()
  const [open, setOpen] = useState(true)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ id: string; to: number } | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const layers = topDown(f.card), errors = compiledOf(f.card).errors
  const isOpen = open || sel.frame === f.id && !!sel.layer
  const pick = (layer?: string) => select(layer ? { frame: f.id, layer } : { frame: f.id })
  const indexAt = (y: number) => {
    const rows = [...(list.current?.children ?? [])] as HTMLElement[]
    const i = rows.findIndex(r => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2 })
    return i < 0 ? rows.length - 1 : i
  }
  const onGrip = (e: PointerEvent<HTMLElement>, id: string, i: number) => {
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id, to: i }); pick(id)
  }
  const onGripMove = (e: PointerEvent<HTMLElement>) => { if (drag) setDrag({ ...drag, to: indexAt(e.clientY) }) }
  const onGripUp = () => { if (drag) { const from = layers.findIndex(l => l.id === drag.id); if (from !== drag.to) edit(d => moveLayer(d, { frame: f.id, layer: drag.id }, drag.to)) } setDrag(null) }
  const onKey = (e: KeyboardEvent, id: string, i: number) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); e.stopPropagation(); edit(d => moveLayer(d, { frame: f.id, layer: id }, i + (e.key === 'ArrowUp' ? -1 : 1))) }
    else if (e.key === 'F2') { e.preventDefault(); setRenaming(id) }
  }
  const frameOn = sel.frame === f.id && !sel.layer
  return (
    <li className={`ed-tree-frame${frameOn ? ' on' : ''}${sel.frame === f.id ? ' within' : ''}${f.hidden ? ' off' : ''}`}>
      <div className="ed-row ed-row--frame">
        <button type="button" className="ed-twist" aria-expanded={isOpen} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${f.card.name}`} onClick={() => setOpen(!isOpen)}>{isOpen ? '▾' : '▸'}</button>
        {renaming === f.id ? <Rename value={f.card.name} onDone={v => { setRenaming(null); if (v) edit(d => editFrame(d, f.id, x => ({ ...x, card: { ...x.card, name: v } }))) }} />
          : <button type="button" className="ed-row-name" aria-pressed={frameOn} onClick={() => pick()} onDoubleClick={() => setRenaming(f.id)} onKeyDown={e => { if (e.key === 'F2') setRenaming(f.id) }}>
            <b>#</b>{f.card.name}<small>{f.card.grid.cols}×{f.card.grid.rows}</small></button>}
        <button type="button" className="ed-eye" aria-pressed={!f.hidden} aria-label={`${f.hidden ? 'Show' : 'Hide'} frame ${f.card.name}`} onClick={() => edit(d => editFrame(d, f.id, x => ({ ...x, hidden: !x.hidden })))}>{f.hidden ? '○' : '●'}</button>
      </div>
      {isOpen && <ol ref={list} className="ed-tree-layers" aria-label={`Layers of ${f.card.name}`}>
        {layers.map((l, i) => {
          const on = sel.frame === f.id && sel.layer === l.id, dragging = drag?.id === l.id
          return (
            <li key={l.id} className={`ed-row ed-row--layer${on ? ' on' : ''}${l.visible ? '' : ' off'}${dragging ? ' drag' : ''}${drag && drag.to === i && !dragging ? ' drop' : ''}`}>
              <span className="ed-grip" role="button" tabIndex={-1} aria-label={`Drag to reorder ${l.name}`} onPointerDown={e => onGrip(e, l.id, i)} onPointerMove={onGripMove} onPointerUp={onGripUp} onPointerCancel={() => setDrag(null)}>⋮⋮</span>
              {renaming === l.id ? <Rename value={l.name} onDone={v => { setRenaming(null); if (v) edit(d => editLayer(d, { frame: f.id, layer: l.id }, x => ({ ...x, name: v }))) }} />
                : <button type="button" className="ed-row-name" aria-pressed={on} title="Select · double-click or F2 renames · Alt+↑/↓ reorders" onClick={() => pick(l.id)} onDoubleClick={() => setRenaming(l.id)} onKeyDown={e => onKey(e, l.id, i)}>
                  <b>{KIND[l.kind]}</b>{l.name}{errors.has(l.id) && <i className="ed-err" title={errors.get(l.id)!.message}>ERR</i>}{l.blend !== 'normal' && <small>{l.blend}</small>}</button>}
              <button type="button" className="ed-eye" aria-pressed={l.visible} aria-label={`${l.visible ? 'Hide' : 'Show'} ${l.name}`} onClick={() => edit(d => editLayer(d, { frame: f.id, layer: l.id }, x => ({ ...x, visible: !x.visible })))}>{l.visible ? '●' : '○'}</button>
            </li>
          )
        })}
        {!layers.length && <li className="ed-empty">Empty frame. Use the draw, text or code tool on it.</li>}
      </ol>}
    </li>
  )
}

export function LayersPanel() {
  const frames = useEditor(s => s.h.present.frames)
  const top = [...frames].reverse()
  return (
    <div className="ed-pane" aria-label="Layers">
      <ol className="ed-tree">{top.map(f => <FrameRows key={f.id} f={f} />)}</ol>
      {!frames.length && <p className="ed-empty">Nothing on the canvas. Insert a card from ASSETS, or draw a frame with the frame tool (F).</p>}
    </div>
  )
}

// ── assets ─────────────────────────────────────────────────────────────────
/**
 * Thumbnails draw one at a time from a queue, a few per frame within ~6 ms, so opening ASSETS (173 presets)
 * never blocks: names show at once, the dots fill in behind them (phones first saw a blank screen).
 */
const thumbQueue: (() => void)[] = []
let thumbTick = 0
function queueThumb(fn: () => void): () => void {
  thumbQueue.push(fn)
  const run = () => {
    const t0 = performance.now()
    while (thumbQueue.length && performance.now() - t0 < 6) thumbQueue.shift()!()
    thumbTick = thumbQueue.length ? requestAnimationFrame(run) : 0
  }
  if (!thumbTick) thumbTick = requestAnimationFrame(run)
  return () => { const i = thumbQueue.indexOf(fn); if (i >= 0) thumbQueue.splice(i, 1) }
}
/** A preset / program / card thumbnail: sampled once on a coarse pitch, when it scrolls into view. */
const Thumb = memo(function Thumb({ make, label }: { make: () => { layers: ReturnType<WidgetPreset['layers']>; grid: WidgetPreset['grid']; style: WidgetPreset['style'] }; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const draw = () => {
      const ctx = c.getContext('2d')
      if (!ctx) return
      try {
        const { layers, grid, style } = make(), W = 112, pitch = W / Math.max(grid.cols, grid.rows), k = Math.min(2, window.devicePixelRatio || 1), p0 = grid.pitch ?? 4
        c.width = Math.round(grid.cols * pitch * k); c.height = Math.round(grid.rows * pitch * k)
        ctx.fillStyle = dot480.surface; ctx.fillRect(0, 0, c.width, c.height)
        ctx.setTransform(k, 0, 0, k, 0, 0)
        renderCanvas(ctx, sampleLayers(layers, { ...grid, pitch }, { ...style, sizeMin: style.sizeMin * pitch / p0, sizeMax: style.sizeMax * pitch / p0 }, dot480))
      } catch { /* a thumbnail never breaks the panel */ }
    }
    let cancel: (() => void) | undefined
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); cancel = queueThumb(draw) } }, { rootMargin: '120px' })
    io.observe(c)
    return () => { io.disconnect(); cancel?.() }
  }, [make])
  return <canvas ref={ref} className="ed-thumb" role="img" aria-label={label} />
})
type ThumbMake = Parameters<typeof Thumb>[0]['make']
const thumbs = new Map<string, ThumbMake>()
const cached = (key: string, make: ThumbMake) => { let m = thumbs.get(key); if (!m) thumbs.set(key, (m = make)); return m }
const presetThumb = (p: WidgetPreset) => cached(`p:${p.id}`, () => ({ layers: withChrome(p)({ t: 1, data: { ...p.defaults } }), grid: p.grid, style: p.style }))
const cardThumb = (c: StudioCard, key = `c:${c.id}`) => cached(key, () => ({ layers: compiledOf(c).layers({ t: 1, data: { ...c.data } }), grid: c.grid, style: c.style }))
const exampleCards = new Map<string, StudioCard>()
const exampleCard = (x: Example) => { let c = exampleCards.get(x.name); if (!c) exampleCards.set(x.name, (c = programCard(x))); return c }

function Asset({ name, sub, thumb, onPick }: { name: string; sub?: string; thumb: ThumbMake; onPick: () => void }) {
  return <li><button type="button" className="ed-asset" onClick={onPick} title={`Insert ${name} as a new frame`}><Thumb make={thumb} label="" /><span>{name}</span>{sub && <small>{sub}</small>}</button></li>
}

export function AssetsPanel({ onInserted }: { onInserted?: () => void }) {
  const [q, setQ] = useState('')
  const [shut, setShut] = useState<Record<string, boolean>>(() => Object.fromEntries(boards.slice(1).map(b => [b.id, true])))
  const [busy, setBusy] = useState(false)
  const photo = useRef<HTMLInputElement>(null)
  const saved = useMemo(() => libraryList(), [])
  const s = useEditor.getState()
  const done = () => onInserted?.()
  const needle = q.trim().toLowerCase()
  const hit = (...xs: string[]) => !needle || xs.some(x => x.toLowerCase().includes(needle))
  const startThumbs = useMemo(() => ({
    tile: cached('s:tile', () => ({ layers: [{ field: () => 1, tone: 'faint' as const }], grid: { cols: 36, rows: 36, pitch: 4 }, style: blankCard().style })),
    wide: cached('s:wide', () => ({ layers: [{ field: () => 1, tone: 'faint' as const }], grid: { cols: 36, rows: 18, pitch: 4 }, style: blankCard().style })),
    card: cached('s:card', () => ({ layers: [{ field: () => 1, tone: 'faint' as const }], grid: { cols: 32, rows: 30, pitch: 4 }, style: blankCard().style })),
    draw: cached('s:draw', () => ({ layers: [{ field: () => .35, tone: 'faint' as const }, { field: (u: number, v: number) => (Math.abs(Math.hypot(u - .5, v - .5) - .3) < .045 || (Math.abs(u - .5) < .04 && v > .3 && v < .7) ? 1 : 0), tone: 'value' as const }], grid: { cols: 24, rows: 24, pitch: 4 }, style: drawingCard().style })),
  }), [])
  const onPhoto = async (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    setBusy(true)
    try {
      const card = drawingCard(96, 96, 3.5, 1)
      card.name = file.name.replace(/\.[^.]+$/, '').slice(0, 40).toLowerCase() || 'photo'
      const field = await dotifyUpload(file, card.grid, 'bayer')
      const cells = new Uint8Array(card.grid.cols * card.grid.rows)
      for (let r = 0; r < card.grid.rows; r++) for (let c = 0; c < card.grid.cols; c++) cells[r * card.grid.cols + c] = Math.round(Math.max(0, Math.min(1, field(c / (card.grid.cols - 1), r / (card.grid.rows - 1)))) * 255)
      card.layers = [paintLayer(card.grid, { name: 'photo (dithered)', tone: 'auto', cells })]
      card.style = { ...card.style, quantizeSteps: undefined } // photos skip quantization (DESIGN.md)
      s.insertCard(card, { source: 'photo' }); done()
    } catch (e) { s.setNote(`photo failed: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return (
    <div className="ed-pane ed-assets" aria-label="Assets">
      <input className="ed-search" type="search" placeholder="Search cards, programs…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search assets" />
      {hit('blank frame tile wide tall drawing photo') && <section className="ed-agroup" aria-label="Start">
        <h3>START</h3>
        <ul className="ed-agrid">
          <Asset name="Blank tile" sub="144×144" thumb={startThumbs.tile} onPick={() => { s.insertCard(blankCard(TILE, 'tile'), { source: 'blank' }); done() }} />
          <Asset name="Blank wide" sub="216×108" thumb={startThumbs.wide} onPick={() => { s.insertCard(blankCard(SHARE_GRIDS.wide, 'wide'), { source: 'blank' }); done() }} />
          <Asset name="Drawing" sub="80×80 · paint" thumb={startThumbs.draw} onPick={() => { const id = s.insertCard(drawingCard(), { source: 'draw' }); const f = frameById(useEditor.getState().h.present, id); s.select({ frame: id, layer: f?.card.layers[0]?.id }); s.setTool('draw'); done() }} />
          <li><button type="button" className="ed-asset ed-asset--photo" disabled={busy} onClick={() => photo.current?.click()} title="A photo, dithered into a paint layer (stays on this device)"><span className="ed-thumb ed-thumb--photo" aria-hidden="true">{busy ? '…' : 'IMG'}</span><span>{busy ? 'Dithering…' : 'Photo'}</span><small>bayer · local</small></button>
            <input ref={photo} type="file" accept="image/*" hidden aria-label="Photo to dither into dots" onChange={e => { void onPhoto(e.target.files?.[0]); e.target.value = '' }} /></li>
          <Asset name="Card 80×74" sub="legacy" thumb={startThumbs.card} onPick={() => { s.insertCard(blankCard({ ...CARD, pitch: 4 }, 'card'), { source: 'blank' }); done() }} />
        </ul>
      </section>}
      {EXAMPLES.some(x => hit(x.name, 'code program')) && <section className="ed-agroup" aria-label="Programs">
        <h3>CODE <small>Field IR programs</small></h3>
        <ul className="ed-agrid">{EXAMPLES.filter(x => hit(x.name, 'code program')).map(x => <Asset key={x.name} name={x.name} sub={`${x.grid} · ${x.lattice}×`} thumb={cardThumb(exampleCard(x), `x:${x.name}`)} onPick={() => { s.insertProgram(x); s.setRight('code'); done() }} />)}</ul>
      </section>}
      {saved.some(c => hit(c.name, 'saved')) && <section className="ed-agroup" aria-label="Saved cards">
        <h3>SAVED <small>this browser</small></h3>
        <ul className="ed-agrid">{saved.filter(c => hit(c.name, 'saved')).map(c => <Asset key={c.id} name={c.name} sub={`${c.layers.length} layers`} thumb={cardThumb(c)} onPick={() => { s.insertCard(structuredClone(c), { source: 'saved' }); done() }} />)}</ul>
      </section>}
      {boards.map(b => {
        const items = b.items.filter(p => hit(p.name, p.id, p.group, b.id, b.title ?? ''))
        if (!items.length) return null
        const closed = shut[b.id] && !needle
        return (
          <section key={b.id} className="ed-agroup" aria-label={`Board ${b.id}`}>
            <h3><button type="button" aria-expanded={!closed} onClick={() => setShut(x => ({ ...x, [b.id]: !closed }))}>{closed ? '▸' : '▾'} {(b.title ?? b.id).toUpperCase()}</button><small>{items.length}</small></h3>
            {!closed && <ul className="ed-agrid">{items.map((p, i) => <Asset key={p.id + i} name={p.name} sub={p.id} thumb={presetThumb(p)} onPick={() => { s.insertPreset(p.id); done() }} />)}</ul>}
          </section>
        )
      })}
    </div>
  )
}
