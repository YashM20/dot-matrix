/**
 * Right panel, contextual to the selection: DESIGN (document / frame style + data — what TUNE did — or
 * the selected layer's properties), ANIMATE (timeline tracks, states — COMPOSE's timeline), CODE (the
 * Field IR editor with its share link — what CODE did) and EXPORT (every TUNE / COMPOSE export).
 */
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react'
import { IR_LIMITS } from '../../engine/ir'
import { ease, masks, type EaseName, type MaskName } from '../../engine/motion'
import { encodeShare, programHash, shareUrl, type SharedProgram } from '../../lib/share'
import type { ClipFormat } from '../../export'
import { More } from '../More'
import { CodeEditor } from '../dwitter/CodeEditor'
import { EXAMPLES } from '../dwitter/examples'
import { specV1 } from '../studio/adapter'
import type { IRLayer, Motion, SitesLayer, StudioLayer } from '../studio/doc'
import { trackSpans, type Track } from '../studio/playback'
import { newIRLayer, shareable, topDown, type EditorFrame, type Sel } from './doc'
import { copyText, framesLink, knownParent, programLink } from './actions'
import { canShareLink, isPhone, shareLink } from './phone'
import { Design } from './DesignPanels'
import { LinkLineage, RemixGraph } from './Lineage'
import { exporters, recordFrame } from './exporters'
import { selFrames } from './select'
import { compiledOf } from './render'
import { getEditor, useEditor, type RightTab } from './store'
import { useTarget } from './target'
import { attempt } from './attempt'
import { MiniDots, Num, Pick, Section, Slider, useCurve, useMask } from './ui'

// EXPORT's review folds load with the fold, not with the editor (device simulators, the fidelity scorecard)
const Devices = lazy(() => import('./Review').then(m => ({ default: m.Devices })))
const Quality = lazy(() => import('./Review').then(m => ({ default: m.Quality })))
const TABS: { id: RightTab; label: string }[] = [{ id: 'design', label: 'DESIGN' }, { id: 'animate', label: 'ANIMATE' }, { id: 'code', label: 'CODE' }, { id: 'export', label: 'EXPORT' }]

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
  const { f, card } = useTarget(), play = useEditor(s => s.play), preview = useEditor(s => s.preview), { setPlay, setPreview } = getEditor()
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
  const { f, l } = useTarget(), { setRight, select } = getEditor()
  if (f && l && (l.kind === 'ir' || l.kind === 'sites')) return <CodeLayer key={l.id} f={f} l={l} />
  if (!f) return <><p className="ed-hint">Select a code layer, or tap a frame with the code tool (<b>C</b>) to add one. A new code frame starts from an example.</p>
    <div className="ed-row-btns"><button type="button" onClick={() => { getEditor().insertProgram(EXAMPLES[0]) }}>NEW CODE FRAME</button></div><RemixGraph /></>
  const code = topDown(f.card).filter(x => x.kind === 'ir' || x.kind === 'sites')
  return <>
    <Section title="CODE LAYERS" aside={f.card.name}>
      {code.length ? <ul className="ed-mini-list">{code.map(x => <li key={x.id}><button type="button" onClick={() => select({ frame: f.id, layer: x.id })}>{x.name}</button></li>)}</ul> : <p className="ed-hint">This frame has no code layer.</p>}
      <div className="ed-row-btns"><button type="button" onClick={() => { getEditor().addLayerTo(f.id, newIRLayer(f.card.layers.length + 1)); setRight('code') }}>+ CODE LAYER</button></div>
    </Section>
    <SpecPeek f={f} />
    <LinkLineage f={f} />
    <RemixGraph current={f.source?.startsWith('program:') ? f.source.slice(8) : undefined} />
  </>
}
function SpecPeek({ f }: { f: EditorFrame }) {
  const [json, setJson] = useState('')
  useEffect(() => { const h = setTimeout(() => { try { setJson(JSON.stringify(specV1.toSpec(f.card).spec, (_, v) => (typeof v === 'string' && v.length > 240 ? `${v.slice(0, 60)}… (${v.length} chars)` : v), 1)) } catch (e) { setJson(`// ${(e as Error).message}`) } }, 200); return () => clearTimeout(h) }, [f.card])
  return <More id="editor-spec" label="This frame as card spec v1" tech="read-only JSON"><pre className="ed-json ed-json--ro" tabIndex={0} aria-label="Card spec v1 JSON">{json}</pre></More>
}
/**
 * A program's share link, encoded (after a pause) for the program on screen only, so nothing has to clear it when the
 * program changes. COPY records it in the remix gallery under its parent; `version` counts those for the graph.
 */
function useProgramLink(share: SharedProgram | string, bad: boolean) {
  const [made, setMade] = useState<{ key: string; url: string } | null>(null), [copied, setCopied] = useState(false), [version, setVersion] = useState(0)
  const shareKey = typeof share === 'string' ? share : `${share.src}|${share.grid}|${share.lattice}|${share.tone}|${share.parent}`
  const link = typeof share !== 'string' && !bad && made?.key === shareKey ? made.url : ''
  useEffect(() => {
    if (typeof share === 'string' || bad) return
    let gone = false
    const h = setTimeout(() => { encodeShare(share).then(url => { if (!gone) setMade({ key: shareKey, url }) }, () => { if (!gone) setMade(null) }) }, 250)
    return () => { gone = true; clearTimeout(h) }
  }, [shareKey, bad, version]) // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async () => {
    if (!link || typeof share === 'string') return
    const m = await programLink(share) // records it in the remix gallery, under its parent
    getEditor().setLink(m); setVersion(v => v + 1) // the graph shows it now, whatever the clipboard does
    await copyText(m.url) // clipboard closed: the link is shown below
    setCopied(true); setTimeout(() => setCopied(false), 1400)
  }
  return { link, copied, copy, version }
}

/** SHARE: COPY LINK and the link's size, or why this layer has no link. */
function ShareSection({ share, link, copied, onCopy }: { share: SharedProgram | string; link: string; copied: boolean; onCopy: () => void }) {
  return <Section title="SHARE" aside="?make=code&p=…">
    {typeof share === 'string' ? <p className="ed-hint">{share}.</p> : <>
      <div className="ed-row-btns ed-share">
        <button type="button" className="ed-primary" onClick={onCopy} disabled={!link}>{copied ? 'COPIED' : 'COPY LINK'}</button>
        <output className="ed-url" title={link ? shareUrl(link) : ''}>{link ? <>LINK <b>{shareUrl(link).length}</b> CHARS · {link[0] === 'z' ? 'DEFLATE' : 'PLAIN'}</> : '—'}</output>
      </div>
      {share.parent && <p className="ed-hint">Remix of <b>#{share.parent}</b>: the link records it.</p>}
      <p className="ed-hint">The link opens this program in the editor on any device; nothing is uploaded. The whole frame (style, data, every layer) has a link in EXPORT · LINK.</p></>}
  </Section>
}

function CodeLayer({ f, l }: { f: EditorFrame; l: IRLayer | SitesLayer }) {
  const { layer, card } = useTarget()
  const compiled = compiledOf(f.card), err = compiled.errors.get(l.id)
  const share = shareable(f, l, knownParent), hash = typeof share === 'string' ? undefined : programHash(share)
  const { link, copied, copy, version } = useProgramLink(share, !!err)
  const keys = [...new Set(compiled.keys)].filter(k => l.src.includes(`data.${k}`))
  const near = l.src.length > IR_LIMITS.source * .9
  return <>
    <Section title="PROGRAM" aside={hash === undefined ? l.name : `#${hash}`}>
      <CodeEditor value={l.src} onChange={src => layer(x => ({ ...x, src }) as StudioLayer, `src:${l.id}`)} error={err} maxLength={IR_LIMITS.source} />
      <div className="dw-status" id="dw-status" aria-live="polite">{err ? <span className="dw-bad">ERROR {err.line}:{err.col} · LAST GOOD PROGRAM SHOWN</span> : <span className={near ? 'dw-warn' : ''}><b>{l.src.length}</b>/{IR_LIMITS.source} CHARS · OK</span>}</div>
      <label className="ed-field ed-wide"><span>START FROM AN EXAMPLE</span><select value="" onChange={e => { const x = EXAMPLES.find(y => y.name === e.target.value); if (x) layer(y => ({ ...y, src: x.src, ...(y.kind === 'ir' && { lattice: x.lattice, tone: x.tone }) }) as StudioLayer) }}>
        <option value="">…</option>{EXAMPLES.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}</select></label>
    </Section>
    <ShareSection share={share} link={link} copied={copied} onCopy={copy} />
    {keys.length > 0 && <Section title="DATA" aside="data.* sliders">
      {keys.map(k => <Slider key={k} label={`data.${k}`} value={f.card.data[k] ?? 0} min={0} max={1} step={.01} onChange={v => card(c => ({ ...c, data: { ...c.data, [k]: v } }), `data:${k}`)} />)}
    </Section>}
    <RemixGraph current={hash} version={version} />
  </>
}

// ── EXPORT ─────────────────────────────────────────────────────────────────
const FORMATS: ClipFormat[] = ['apng', 'gif', 'webm', 'mp4']
function Export() {
  const { f } = useTarget(), t = useEditor(s => s.play.t)
  const [format, setFormat] = useState<ClipFormat>('apng'), [fps, setFps] = useState(24), [scale, setScale] = useState(1)
  const [progress, setProgress] = useState<number | null>(null), [status, setStatus] = useState('')
  const abort = useRef<AbortController | null>(null)
  if (!f) return <><LinkPanel /><p className="ed-hint">Select a frame (or a layer in it) to export it as PNG, SVG, HTML, a clip of its timeline, a plotter SVG, a card spec, every device, or to check its quality.</p></>
  const T = Math.min(t, f.card.timeline.length)
  const run = (fn: () => unknown) => attempt(async () => { const r = await fn(); setStatus(typeof r === 'string' ? r : 'saved') }, e => setStatus(`failed: ${e.message}`))
  const record = () => {
    const signal = (abort.current = new AbortController()).signal
    setProgress(0); setStatus('')
    return attempt(async () => setStatus(await recordFrame(f, { format, fps, scale, signal, onProgress: setProgress })),
      e => setStatus(e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : `failed: ${e.message}`),
      () => { setProgress(null); abort.current = null })
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
    <LinkPanel />
    <More id="editor-export-devices" label="Devices" tech="toDevice · every profile"><WhenOpen>{() => <Devices f={f} t={T} />}</WhenOpen></More>
    <More id="editor-export-quality" label="Quality" tech="scorecard · bar sheet"><WhenOpen>{() => <Quality f={f} t={T} />}</WhenOpen></More>
  </>
}

/** Children only while the enclosing fold is open (a `More` keeps its children mounted), behind a lazy chunk. */
function WhenOpen({ children }: { children: () => ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null), [open, setOpen] = useState(false)
  useEffect(() => {
    const d = ref.current?.closest('details')
    if (!d) return
    const on = () => setOpen(d.open)
    on(); d.addEventListener('toggle', on)
    return () => d.removeEventListener('toggle', on)
  }, [])
  return <><span ref={ref} hidden />{open && <Suspense fallback={<p className="ed-hint">Loading…</p>}>{children()}</Suspense>}</>
}

const KIND_LABEL = { program: 'PROGRAM', frame: 'FRAME', doc: 'FRAMES' } as const
/**
 * EXPORT · LINK (E5): a link of the selected frame (or frames), or of the whole document: deflated JSON in
 * `?make&d=…`, copied when the page may and shown to copy by hand. Too big for a URL: the reason, and the file.
 * E6: a phone with a share sheet also gets SHARE… for the last link (cancelled says nothing).
 */
function LinkPanel() {
  const doc = useEditor(s => s.h.present), sel = useEditor(s => s.sel), last = useEditor(s => s.link)
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState('')
  const ids = sel.frame ? (sel.layer ? [sel.frame] : selFrames(sel)) : []
  const make = (which: string[]) => {
    setBusy(true); setMsg('')
    return attempt(async () => {
      const m = await framesLink(which)
      getEditor().setLink(m)
      setMsg(await copyText(m.url) ? 'COPIED' : 'READY: copy it below')
    }, e => setMsg(`no link: ${e.message}. DOWNLOAD JSON (DESIGN with nothing selected) keeps it all.`), () => setBusy(false))
  }
  return <Section title="LINK" aside="?make&d=… · nothing uploaded">
    <div className="ed-row-btns">
      {ids.length > 0 && <button type="button" disabled={busy} onClick={() => make(ids)}>{ids.length === 1 ? 'FRAME LINK' : `LINK ${ids.length} FRAMES`}</button>}
      <button type="button" disabled={busy || !doc.frames.length} onClick={() => make([])}>DOCUMENT LINK</button>
    </div>
    {msg && <p className={msg.startsWith('no link') ? 'ed-bad' : 'ed-hint'} role="status">{msg}</p>}
    {last && <>
      {isPhone() && canShareLink(globalThis.navigator, { url: last.url, title: doc.name }) && <div className="ed-row-btns">
        <button type="button" className="ed-primary" onClick={async () => { const o = await shareLink({ url: last.url, title: `${doc.name} · MATRIX` }, copyText); if (o !== 'cancelled') setMsg(o === 'shared' ? 'SHARED' : o === 'copied' ? 'COPIED' : 'READY: copy it below') }}>SHARE…</button>
      </div>}
      <input className="ed-link-url" readOnly value={last.url} aria-label="The last link made" onFocus={e => e.currentTarget.select()} />
      <output className="ed-url">{KIND_LABEL[last.kind]} LINK <b>{last.chars}</b> CHARS · {last.deflated ? 'DEFLATE' : 'PLAIN'} · #{last.id}{last.parent ? ` · REMIX OF #${last.parent}` : ''}</output>
    </>}
    <p className="ed-hint">A frame link carries the whole card (style, data, every layer, groups, locks); a document link every frame. Opening one adds its frames to that canvas, once: a reload or Back re-selects them.</p>
  </Section>
}
export type { Sel }
