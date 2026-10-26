import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Board, VIEW_EXIT_MS } from './components/Board'
import { BoardPicker, NextBoard } from './components/BoardPicker'
import { DotWidget } from './components/DotWidget'
import { SkinSwitcher } from './components/skins/SkinSwitcher'
import { useExitSwap } from './hooks/useExitSwap'
import { useXR } from './components/xray/store'
import { boardLabel, liveBoards } from './widgets/manifest'
import { onLayerWake, requestLayer } from './site/layer'
import { setPageMeta, syncUrl } from './site/meta'
import { GALLERY_BOARD, MODE_LINES, MODES, VIEWS, placeFromName, placeView, sameView, urlForView, viewFromUrl, type Mode, type View } from './site/views'
import './App.css'
import './site/mobile.css'

// every view but EXPLORE (and every MAKE mode) is its own chunk, fetched when it opens (first-load budget, docs/WEB-PLAN.md §1)
const later = <K extends string>(load: () => Promise<{ [k in K]: ComponentType }>, name: K) => lazy(() => load().then(m => ({ default: m[name] })))
const About = later(() => import('./components/About'), 'About')
const DrawBoard = later(() => import('./components/draw/DrawBoard'), 'DrawBoard')
const DotsRepl = later(() => import('./components/dwitter/DotsRepl'), 'DotsRepl')
const ControlsPanel = later(() => import('./components/playground/ControlsPanel'), 'ControlsPanel')
const DataEditor = later(() => import('./components/playground/DataEditor'), 'DataEditor')
const ExportPanel = later(() => import('./components/playground/ExportPanel'), 'ExportPanel')
const PhotoUpload = later(() => import('./components/playground/PhotoUpload'), 'PhotoUpload')
const PreviewCanvas = later(() => import('./components/playground/PreviewCanvas'), 'PreviewCanvas')
const TransitionLab = later(() => import('./components/playground/TransitionLab'), 'TransitionLab')
const WidgetGallery = later(() => import('./components/playground/WidgetGallery'), 'WidgetGallery')

// COMPOSE (the Studio, P6-D) is its own mode, not a TUNE upgrade: TUNE stays the one-preset tuner (style,
// photo, exports); COMPOSE edits a layered card document. Lazy, so the other views don't load the editor.
// the phone board sheet: its own chunk, fetched on the first tap (or once the command layer has mounted)
const loadBoardSheet = () => import('./components/BoardSheet')
const BoardSheet = lazy(() => loadBoardSheet().then(m => ({ default: m.BoardSheet })))
const Studio = lazy(() => import('./components/studio/Studio').then(m => ({ default: m.Studio })))
// x-ray / time machine / ⌘K palette / dot shell (C10): out of the first load, mounted once the page is idle
// (or on the first key press). A layer key that triggered the mount (⌘K / Ctrl-K, `, X) is replayed to the
// layer once it is listening, so a quick ⌘K still opens the palette instead of being swallowed.
const CommandLayerLazy = lazy(() => import('./components/palette/CommandLayer').then(m => ({ default: m.CommandLayer })))
type CommandLayerProps = Parameters<typeof import('./components/palette/CommandLayer').CommandLayer>[0]
const layerKey = (e: KeyboardEvent) => ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') || (!e.metaKey && !e.ctrlKey && !e.altKey && (e.key === '`' || e.key === 'x' || e.key === 'X'))
/** Re-dispatches the key that mounted the layer; rendered after it, so its effect runs once the layer listens. */
function ReplayKey({ ev }: { ev: KeyboardEvent | null }) {
  useEffect(() => {
    if (!ev) return
    const target = ev.target instanceof Node && ev.target.isConnected ? ev.target : window
    target.dispatchEvent(new KeyboardEvent('keydown', { key: ev.key, code: ev.code, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey, shiftKey: ev.shiftKey, altKey: ev.altKey, bubbles: true, cancelable: true }))
  }, [ev])
  return null
}
function CommandLayer(props: CommandLayerProps) {
  const [ready, setReady] = useState(false)
  const [pending, setPending] = useState<KeyboardEvent | null>(null)
  useEffect(() => {
    if (ready) return
    const go = () => setReady(true)
    const onKey = (e: KeyboardEvent) => {
      const editing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if (layerKey(e) && !(editing && !e.metaKey && !e.ctrlKey)) {
        if (e.metaKey || e.ctrlKey) e.preventDefault() // keep the browser's own ⌘K / Ctrl-K away
        setPending(e)
      }
      go()
    }
    const w = window as Window & { requestIdleCallback?: Window['requestIdleCallback']; cancelIdleCallback?: Window['cancelIdleCallback'] }
    const hasIdle = typeof w.requestIdleCallback === 'function'
    const idle = hasIdle ? w.requestIdleCallback!(go, { timeout: 2000 }) : window.setTimeout(go, 800)
    window.addEventListener('keydown', onKey, { once: true })
    const unwake = onLayerWake(go) // a tap on the phone tab bar's TOOLS / SEARCH
    return () => {
      if (hasIdle) w.cancelIdleCallback?.(idle); else window.clearTimeout(idle)
      window.removeEventListener('keydown', onKey); unwake()
    }
  }, [ready])
  useEffect(() => { if (ready) void loadBoardSheet() }, [ready])
  return ready ? <Suspense fallback={null}><CommandLayerLazy {...props} /><ReplayKey ev={pending} /></Suspense> : null
}
// Deep links (all resolved in src/site/views.ts): `/<board>/` or ?board=<id> opens a board, ?make=<mode> a MAKE
// mode (?make=code&p=<encoded> a shared Field IR program), ?about the about page, ?card=<id> one card alone
// (handy for screenshots/bisecting); every old ?tab= still opens the view it became.
const urlView = (mode?: Mode) => viewFromUrl(location.search, location.pathname, mode)
const singleCard = urlView().card
/** A row of real tabs: arrow keys move between them, the selected one is the only tab stop. */
function Tabs<T extends string>({ label, items, value, onPick, className }: { label: string; items: readonly T[]; value: T; onPick: (t: T) => void; className: string }) {
  const onKey = (e: ReactKeyboardEvent<HTMLButtonElement>, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + items.length) % items.length
    onPick(items[j]); (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus()
  }
  return <div className={className} role="tablist" aria-label={label}>{items.map((t, i) => <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={value === t} tabIndex={value === t ? 0 : -1} className={value === t ? 'selected' : ''} onClick={() => onPick(t)} onKeyDown={e => onKey(e, i)}>{t}</button>)}</div>
}

/** One line of intent above the boards (docs/UX-PLAN.md §5.1): dismissible, and it stays dismissed. */
function IntroLine() {
  const [shown, setShown] = useState(() => { try { return localStorage.getItem('dot480:intro') !== 'off' } catch { return true } })
  if (!shown) return null
  return <p className="intro-line">
    <span>Interfaces drawn entirely in dots: every card is a live field, sampled onto a grid. Touch the cards, switch the display, or press <b>X-RAY</b><span className="intro-tools"> in TOOLS</span> to see how one works.</span>
    <a href="/essay.html">Read the essay →</a>
    <button type="button" aria-label="Hide this note" onClick={() => { setShown(false); try { localStorage.setItem('dot480:intro', 'off') } catch { /* private mode */ } }}>×</button>
  </p>
}
/** A 5×5 dot glyph for the tab bar: chrome, drawn as dots like everything else ('1' = a dot). */
function Glyph({ rows }: { rows: string }) {
  return <svg className="glyph" viewBox="0 0 5 5" aria-hidden="true">{[...rows.replace(/\s/g, '')].map((c, i) => <circle key={i} cx={i % 5 + .5} cy={Math.floor(i / 5) + .5} r={c === '1' ? .36 : .14} className={c === '1' ? 'on' : ''} />)}</svg>
}
const GLYPHS: Record<View | 'TOOLS' | 'SEARCH', string> = {
  EXPLORE: '11011 11011 00000 11011 11011',
  MAKE: '00100 00100 11111 00100 00100',
  ABOUT: '00100 00000 00100 00100 00100',
  TOOLS: '10001 01010 00100 01010 10001',
  SEARCH: '01110 10001 10001 01110 00001',
}
const toTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })

/**
 * Phones: the bottom tab bar (EXPLORE / MAKE / ABOUT, then TOOLS for the dock, the DISPLAY menu and the
 * palette). The current view is `aria-current="page"`; tapping it again goes back to the top, and on
 * EXPLORE at the top it opens every board. TOOLS carries a dot while X-ray or the time machine is on.
 */
function TabBar({ view, onView, onBoards }: { view: View; onView: (v: View) => void; onBoards: () => void }) {
  const busy = useXR(s => s.global || s.on.size > 0 || s.frozen)
  const pick = (v: View) => {
    if (v !== view) { window.scrollTo(0, 0); return onView(v) }
    if (v === 'EXPLORE' && window.scrollY < 8) onBoards(); else toTop()
  }
  return <nav className="tabbar" aria-label="Main">
    {VIEWS.map(v => <button key={v} type="button" aria-current={view === v ? 'page' : undefined} onClick={() => pick(v)}><Glyph rows={GLYPHS[v]} /><span>{v}</span></button>)}
    <button type="button" aria-haspopup="dialog" className={busy ? 'busy' : ''} onClick={() => requestLayer('tools')}><Glyph rows={GLYPHS.TOOLS} /><span>TOOLS</span></button>
  </nav>
}

// ?tab=essay: the essay is its own page (essay.html, a separate Vite entry so it deploys alone)
if (urlView().essay) window.location.replace(`/essay.html${window.location.hash}`)

export default function App() {
  const [view, setView] = useState<View>(() => urlView().view)
  const [mode, setMode] = useState<Mode>(() => urlView().mode)
  const [board, setBoard] = useState(() => urlView().board)
  const [boards, setBoards] = useState(false) // the phone board sheet
  // per-view <title>, description and OG tags (crawlers get the same from the prebuilt dist/<board>/index.html),
  // and the address bar: moving to another view is a history entry; the first render, and a URL that already
  // names this view in an older form (a remix's ?tab=dots&p=…), are only normalised in place
  const first = useRef(true)
  useEffect(() => {
    setPageMeta(view === 'EXPLORE' ? board : undefined)
    const want = { view, mode, board }
    syncUrl(urlForView(want, location.search, location.pathname), !first.current && !sameView(urlView(mode), want))
    first.current = false
  }, [view, mode, board])
  useEffect(() => {
    const onPop = () => { const v = urlView(); setView(v.view); setBoard(v.board); if (v.view === 'MAKE') setMode(v.mode) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  /** A view or MAKE mode by any name it has had (palette, shell, command layer: old tab names too). */
  const go = (name: string) => {
    const p = placeFromName(name)
    if (!p) return
    if (name.toLowerCase() === 'gallery') setBoard(GALLERY_BOARD)
    const v = placeView(p, mode); setMode(v.mode); setView(v.view)
  }
  const place = view === 'MAKE' ? mode : view
  // the old view dissolves out before the new one mounts and enters (instant under reduced motion)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, leaving] = useExitSwap(`${place}|${board}`, s => reduced || !s.startsWith('EXPLORE|') ? 0 : VIEW_EXIT_MS)
  const [shownPlace, shownBoard] = shown.split('|') as [string, string]
  if (singleCard) return <main className="shell"><section className="gallery-view"><div className="gallery-grid"><DotWidget type={singleCard} /></div></section><CommandLayer tab="EXPLORE" board={board} /></main>
  const title = view === 'MAKE' ? `MAKE · ${mode}` : view === 'EXPLORE' ? boardLabel(board) : view
  return <main className="shell" data-view={view}>
    <h1 className="sr-only">DOT/480 dot-matrix UI engine</h1>
    <header className="topbar"><div className="brand"><i aria-hidden="true"/> DOT/480 <small>{view === 'MAKE' ? `MAKE · ${mode}` : view}</small></div>
      {/* phones: the place's name (on EXPLORE it opens every board) and search; the tab bar holds the views */}
      {view === 'EXPLORE'
        ? <button type="button" className="topbar-place" aria-haspopup="dialog" aria-label={`Board: ${title}. All boards`} onClick={() => setBoards(true)}>{title}<span aria-hidden="true"> ▾</span></button>
        : <span className="topbar-place">{title}</span>}
      <Tabs className="view-tabs" label="Views" items={VIEWS} value={view} onPick={setView} />
      <SkinSwitcher />
      {/* red means live: only while a board streams real data */}
      {view === 'EXPLORE' && liveBoards.includes(board) && <div className="live"><i aria-hidden="true"/> LIVE DATA</div>}
      <button type="button" className="topbar-search" aria-label="Search boards, cards and actions" aria-haspopup="dialog" onClick={() => requestLayer('palette')}><Glyph rows={GLYPHS.SEARCH} /></button></header>
    <Suspense fallback={<section className="view-loading" aria-busy="true" />}>
    {shownPlace === 'EXPLORE' ? (
      <section className="boards-view" role="tabpanel" aria-labelledby="tab-EXPLORE">
        <IntroLine />
        <BoardPicker board={board} onPick={setBoard} onAll={() => setBoards(true)} />
        <Board key={shownBoard} id={shownBoard} leaving={leaving} />
        <NextBoard board={board} onPick={setBoard} />
      </section>
    ) : shownPlace === 'ABOUT' ? (
      <section className="about-view" role="tabpanel" aria-labelledby="tab-ABOUT"><About /></section>
    ) : (
      // MAKE: the mode switch stays put while a mode's chunk loads
      <section className="make-view" role="tabpanel" aria-labelledby="tab-MAKE">
        <div className="make-head">
          <Tabs className="make-modes" label="Make mode" items={MODES} value={mode} onPick={setMode} />
          <p className="make-line">{MODE_LINES[mode]}</p>
        </div>
        <div className="make-panel" role="tabpanel" aria-labelledby={`tab-${shownPlace}`}>
        <Suspense fallback={<section className="view-loading" aria-busy="true" />}>
        {shownPlace === 'COMPOSE' ? (
          <Suspense fallback={<p className="st-hint">Loading the Studio…</p>}><Studio /></Suspense>
        ) : shownPlace === 'CODE' ? (
          <DotsRepl />
        ) : shownPlace === 'DRAW' ? (
          <DrawBoard />
        ) : (
          <section className="pg-layout">
            <WidgetGallery />
            <div className="pg-center">
              <PreviewCanvas />
              <ExportPanel />
              <div className="pg-bottom-row">
                <DataEditor />
                <PhotoUpload />
                <TransitionLab />
              </div>
            </div>
            <div className="pg-side" role="region" aria-label="Controls">
              <ControlsPanel />
            </div>
          </section>
        )}
        </Suspense>
        </div>
      </section>
    )}
    </Suspense>
    {/* C10: ⌘K palette, dot shell, X-ray inspector, time machine; `tab` is the place (a view or a MAKE mode) */}
    <CommandLayer tab={place} board={board} setTab={go} setBoard={setBoard} />
    {boards && <Suspense fallback={null}><BoardSheet board={board} onClose={() => setBoards(false)} onPick={id => { window.scrollTo(0, 0); setView('EXPLORE'); setBoard(id) }} /></Suspense>}
    <TabBar view={view} onView={setView} onBoards={() => setBoards(true)} />
    <footer className="bottom"><span>DOT/480 · <b>EVERY PIXEL IS A DOT SAMPLED FROM A FIELD</b></span><span>FIELD → GRID SAMPLER → RENDERER</span>
      <span><a href="/essay.html">HOW IT WORKS</a> · <a href="?about" onClick={e => { e.preventDefault(); setView('ABOUT') }}>SHORTCUTS</a> · <a href="https://github.com/YashM20/dot-matrix">SOURCE</a></span></footer></main>
}
