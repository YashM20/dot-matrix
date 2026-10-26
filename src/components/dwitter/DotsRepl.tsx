/**
 * DOTS tab — "Dwitter for dots": a Field IR REPL with a live card, a time scrubber, `data.*` sliders,
 * short share links (`?make=code&p=…`, MAKE · CODE) and a local remix graph. Every frame goes through the normal
 * pipeline (DotCanvas → sampler → renderer); shared programs are only parsed, never run when invalid.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { IR_LIMITS, type IREnv, type IRProgram } from '../../engine/ir'
import { decodeShare, encodeShare, programHash, shareUrl, SHARE_GRIDS, SHARE_LATTICES, SHARE_TONES, type ShareGrid, type SharedProgram, type ShareTone } from '../../lib/share'
import type { WidgetContext } from '../../widgets/types'
import { DotCanvas } from '../DotCanvas'
import { CodeEditor } from './CodeEditor'
import { EXAMPLES } from './examples'
import { clearGallery, loadGallery, recordProgram, type Entry } from './gallery'
import { compileSource, dataFor, DOTS_STYLE, programLayers } from './program'
import { RemixGraph } from './RemixGraph'

type Settings = Omit<SharedProgram, 'src' | 'parent'>
const LOOPS = [2, 4, 8, 16, 32]
const GRID_LABEL: Record<ShareGrid, string> = { square: 'SQUARE 144×144', wide: 'WIDE 216×108', tall: 'TALL 108×162' }
const NO_KEYS: string[] = []
const now = () => performance.now() / 1000
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function DotsRepl() {
  const first = EXAMPLES[0]
  const [src, setSrc] = useState(first.src)
  const [settings, setSettings] = useState<Settings>({ grid: first.grid, lattice: first.lattice, tone: first.tone })
  // remix lineage: `base` is the program that was loaded (or last run); an edit of it is its remix
  const [base, setBase] = useState<{ id: string; parent?: string }>({ id: programHash(first) })
  const [gallery, setGallery] = useState<Entry[]>(loadGallery)
  const [values, setValues] = useState<Record<string, number>>({})
  const [loadError, setLoadError] = useState('')
  const [link, setLink] = useState('')
  const [copied, setCopied] = useState(false)

  const compiled = useMemo(() => compileSource(src), [src])
  // the preview keeps the last good program while you type; loading a program clears it (a bad link shows nothing)
  // (boxed: a program is a function, which useState would call as an updater)
  const [good, setGood] = useState<{ p: IRProgram | null }>(() => ({ p: compiled.program ?? null }))
  if (compiled.program && compiled.program !== good.p) setGood({ p: compiled.program })
  const shown = compiled.program ?? good.p
  const keys = shown?.info.data ?? NO_KEYS
  const data = useMemo(() => dataFor(keys, values), [keys, values])

  const current: SharedProgram = { src, ...settings }
  const id = programHash(current)
  const parent = id === base.id ? base.parent : base.id

  // ── time: play/pause, scrub, loop length; the card reads t from here, not from the master clock
  const [loop, setLoop] = useState(8)
  const [playing, setPlaying] = useState(!reducedMotion())
  const clock = useRef({ playing: !reducedMotion(), offset: 0, wall0: now(), loop: 8 })
  const timeAt = () => { const c = clock.current; return c.playing ? (c.offset + now() - c.wall0) % c.loop : c.offset }
  const [tShown, setTShown] = useState(0)
  const [rev, setRev] = useState(0)
  useEffect(() => {
    if (!playing) return
    let raf = 0, last = 0
    const step = (ms: number) => { if (ms - last > 66) { last = ms; setTShown(timeAt()) } raf = requestAnimationFrame(step) }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps
  const setTime = (t: number) => { clock.current.offset = t; clock.current.wall0 = now(); setTShown(t); setRev(r => r + 1) }
  const toggle = () => {
    const c = clock.current, t = timeAt()
    c.offset = t; c.wall0 = now(); c.playing = !c.playing
    setPlaying(c.playing); setTShown(t)
  }
  const changeLoop = (l: number) => { const t = timeAt() % l; clock.current.loop = l; setLoop(l); setTime(t) }

  // ── the card: one stable layers function reading refs, so typing never re-subscribes the canvas
  const live = useRef({ program: shown, data, settings, pointer: undefined as IREnv['pointer'] })
  useLayoutEffect(() => { live.current.program = shown; live.current.data = data; live.current.settings = settings })
  const layers = useCallback((_ctx: WidgetContext) => {
    const l = live.current
    return l.program ? programLayers(l.program, { t: timeAt(), data: l.data, pointer: l.pointer }, l.settings) : []
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    live.current.pointer = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, down: e.buttons > 0 }
    if (!playing) setRev(x => x + 1)
  }
  const onLeave = () => { live.current.pointer = undefined; setRev(x => x + 1) }

  // the address bar is ours once a link has loaded (or there was none): a broken link stays put until you edit
  const urlOwned = useRef(!new URLSearchParams(location.search).get('p'))
  const edit = (next: string) => { urlOwned.current = true; setSrc(next) }
  // ── loading: examples, gallery entries and shared links all land here
  const load = useCallback((p: SharedProgram, from?: { parent?: string }) => {
    setGood({ p: null })
    setSrc(p.src); setSettings({ grid: p.grid, lattice: p.lattice, tone: p.tone })
    setBase({ id: programHash(p), parent: from?.parent ?? p.parent })
    setLoadError(''); setTime(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('p')
    if (!p) return
    let gone = false
    decodeShare(p).then(prog => {
      if (gone) return
      load(prog); urlOwned.current = true
      if (compileSource(prog.src).program) setGallery(g => recordProgram(g, prog))
    }, (e: Error) => { if (!gone) setLoadError(`Could not open this link: ${e.message}`) })
    return () => { gone = true }
  }, [load])

  // ── the share link follows the program (debounced); the address bar keeps it, so a reload restores it
  useEffect(() => {
    let gone = false
    const h = window.setTimeout(() => {
      encodeShare({ ...current, ...(parent && { parent }) }).then(enc => {
        if (gone) return
        setLink(enc)
        if (compiled.program && urlOwned.current) history.replaceState(null, '', `?make=code&p=${enc}`)
      }, () => { if (!gone) setLink('') })
    }, 250)
    return () => { gone = true; window.clearTimeout(h) }
  }, [src, settings.grid, settings.lattice, settings.tone, parent]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = () => {
    if (!compiled.program) return
    const p = { ...current, ...(parent && { parent }) }
    setGallery(g => recordProgram(g, p))
    setBase({ id, parent })
  }
  const copy = async () => {
    if (!link) return
    run()
    const url = shareUrl(link)
    try { await navigator.clipboard.writeText(url) } catch {
      const ta = document.createElement('textarea'); ta.value = url; document.body.appendChild(ta); ta.select()
      try { document.execCommand('copy') } catch { /* nothing else to try */ }
      ta.remove()
    }
    setCopied(true); window.setTimeout(() => setCopied(false), 1400)
  }

  const chars = src.length, near = chars > IR_LIMITS.source * .9
  const info = compiled.program?.info
  const grid = SHARE_GRIDS[settings.grid]
  return (
    <section className="dw-layout">
      <div className="dw-main">
        <section className="pg-panel dw-panel" aria-label="Program">
          <h2>PROGRAM <small>{parent ? `REMIX OF ${parent}` : 'ORIGINAL'} · #{id}</small></h2>
          {loadError && <p className="dw-banner" role="alert">{loadError}</p>}
          <CodeEditor value={src} onChange={edit} error={compiled.error} onRun={run} maxLength={IR_LIMITS.source} />
          <div className="dw-status" id="dw-status" aria-live="polite">
            <span className={near ? 'dw-warn' : ''}><b>{chars}</b>/{IR_LIMITS.source} CHARS</span>
            {info ? <span>{info.nodes} NODES · {info.work}× WORK{info.t ? ' · t' : ''}{info.pointer ? ' · POINTER' : ''}{info.data.length ? ` · DATA.${info.data.join(' DATA.')}` : ''}</span>
              : <span className="dw-bad">NOT RUNNING: FIX THE ERROR</span>}
          </div>
          <div className="dw-share">
            <button type="button" className="dw-run" onClick={run} disabled={!compiled.program} title="Ctrl+Enter">RUN + SAVE</button>
            <button type="button" onClick={copy} disabled={!link}>{copied ? 'COPIED' : 'COPY LINK'}</button>
            <output className="dw-url" title={link ? shareUrl(link) : ''}>{link ? <>LINK <b>{shareUrl(link).length}</b> CHARS · {link[0] === 'z' ? 'DEFLATE' : 'PLAIN'}</> : '—'}</output>
          </div>
        </section>
        <RemixGraph list={gallery} current={id} onPick={e => { urlOwned.current = true; load(e) }} onClear={() => setGallery(clearGallery())} />
      </div>
      <div className="dw-side">
        <div className="pg-stage dw-stage" onPointerMove={onPointer} onPointerDown={onPointer} onPointerUp={onPointer} onPointerLeave={onLeave} role="img" aria-label="Program preview">
          <DotCanvas layers={layers} grid={grid} style={DOTS_STYLE} animated={!reducedMotion()} fps={30} tick={rev * 4096 + (parseInt(id, 16) % 4096)} change={false} renderer="canvas" />
        </div>
        <section className="pg-panel dw-panel" aria-label="Time">
          <div className="dw-time">
            <button type="button" className="dw-play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? 'PAUSE' : 'PLAY'}</button>
            <input type="range" min={0} max={loop} step={.01} value={Math.min(tShown, loop)} aria-label="Time t"
              onChange={e => { if (clock.current.playing) toggle(); setTime(Number(e.target.value)) }} />
            <output>t {tShown.toFixed(2)}</output>
          </div>
          <label className="dw-field">LOOP <select value={loop} onChange={e => changeLoop(Number(e.target.value))}>{LOOPS.map(l => <option key={l} value={l}>{l} s</option>)}</select></label>
        </section>
        <section className="pg-panel dw-panel dw-pickers" aria-label="Card">
          <label className="dw-field">GRID <select value={settings.grid} onChange={e => setSettings(s => ({ ...s, grid: e.target.value as ShareGrid }))}>{Object.keys(SHARE_GRIDS).map(g => <option key={g} value={g}>{GRID_LABEL[g as ShareGrid]}</option>)}</select></label>
          <label className="dw-field">LATTICE <select value={settings.lattice} onChange={e => setSettings(s => ({ ...s, lattice: Number(e.target.value) }))}>{SHARE_LATTICES.map(l => <option key={l} value={l}>{l}× · {Math.floor(grid.cols / l)}×{Math.floor(grid.rows / l)} DOTS</option>)}</select></label>
          <label className="dw-field">TONE <select value={settings.tone} onChange={e => setSettings(s => ({ ...s, tone: e.target.value as ShareTone }))}>{SHARE_TONES.map(t => <option key={t} value={t}>{t.toUpperCase()}</option>)}</select></label>
        </section>
        <section className="pg-panel dw-panel" aria-label="Data">
          <h2>DATA</h2>
          {keys.length ? keys.map(k => (
            <label key={k} className="dw-slider"><span>data.{k}</span>
              <input type="range" min={0} max={1} step={.01} value={data[k]} onChange={e => { setValues(v => ({ ...v, [k]: Number(e.target.value) })); setRev(r => r + 1) }} />
              <output>{data[k].toFixed(2)}</output></label>
          )) : <p className="dw-hint">Write <code>data.speed</code> (any name) and a 0–1 slider appears here. <code>pointer.x</code>/<code>.y</code> follow the cursor over the card (−1 when away).</p>}
        </section>
      </div>
    </section>
  )
}
