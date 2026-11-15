import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from 'react'
import { flushSync } from 'react-dom'
import { Board, VIEW_EXIT_MS } from './components/Board'
import { LoadBoundary, LoadFailed } from './components/LoadBoundary'
import { BoardPicker, NextBoard } from './components/BoardPicker'
import { useExitSwap } from './hooks/useExitSwap'
import { prefetchBoard } from './widgets/manifest'
import { widgetPath, type WidgetRoute } from './site/routes'
import { onLayerWake } from './site/layer'
import { ABOUT_META, boardFromPath, setPageMeta, syncUrl } from './site/meta'
import { flag } from './site/flags'
import { pushUrl, replace } from './site/safe-url'
import { BROWSE_PARAMS } from './site/browse'
import { useFlag } from './site/useFlag'
import { SkipLink } from './site/SkipLink'
import { cardTransition } from './site/viewTransition'
import { TabBar, TopBar } from './site/app/bars'
import { GALLERY_BOARD, placeFromName, placeView, sameView, urlForView, viewFromUrl, type Mode, type View } from './site/views'
// the app's styles, then the phone styles over them: the order is the cascade, keep it
// the header mark (site/brand/mark.css) and the skip link come through src/index.css: shared modules, one stylesheet
import './site/app/chrome.css'
import './site/app/explore.css'
import './site/app/grid.css'
import './site/app/hero.css'
import './site/app/a11y.css'
import './site/app/log.css'
import './site/app/input.css'
import './site/app/dots.css'
import './site/app/xray.css'
import './site/app/tips.css'
import './site/app/palette.css'
import './site/app/pills.css'
import './site/app/raised.css'
import './site/app/tap.css'
import './site/app/skins.css'
import './site/app/ring.css'
import './site/app/views.css'
import './site/app/makers.css'
import './site/mobile/shell.css'
import './site/mobile/sheet.css'
import './site/mobile/tools.css'
import './site/mobile/phone.css'
import './site/mobile/touch.css'

// every view but EXPLORE (and every MAKE mode) is its own chunk, fetched when it opens (first-load budget, docs/WEB-PLAN.md §1)
const later = <K extends string>(load: () => Promise<{ [k in K]: ComponentType }>, name: K) => lazy(() => load().then(m => ({ default: m[name] })))
const About = later(() => import('./components/About'), 'About')
// T2: the home's touchable hero card and the footer's live number band, their own chunks, mounted once the page is idle
const home = () => import('./components/hero/home')
const HeroCard = later(home, 'HeroCard'), LiveBand = later(home, 'LiveBand')
/** True once the page is idle (or 2 s on): what loads after first paint mounts then. */
const useIdle = () => {
  'use no memo'
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: Window['requestIdleCallback'] }, go = () => setIdle(true)
    if (!w.requestIdleCallback) { const t = window.setTimeout(go, 800); return () => window.clearTimeout(t) }
    const id = w.requestIdleCallback(go, { timeout: 2000 })
    return () => w.cancelIdleCallback(id)
  }, [])
  return idle
}
// a lazy part whose chunk fails (offline, or a second deploy inside the stale-deploy gap) shows `fallback` in its place,
// so the page around it keeps working (docs/STATE-MACHINES.md A2); a whole view says so and offers RELOAD
const viewFailed = <section className="view-loading"><LoadFailed what="This view" /></section>
// static markup: 'use no memo' keeps the compiler's memo slots (first-load bytes) out of these two
const slot = <div className="home-hero-slot" />
// the hero floats beside the header from 1280 px (src/site/app/hero.css) and follows the board below that: it sits
// there in the DOM too, so the Tab order matches what the eye sees (a phone's first stop is not at the page's end)
const HERO_BESIDE = '(min-width: 1280px)'
const onHeroBeside = (cb: () => void) => { const m = window.matchMedia(HERO_BESIDE); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb) }
const useHeroBeside = () => useSyncExternalStore(onHeroBeside, () => window.matchMedia(HERO_BESIDE).matches, () => true)
function Hero() {
  'use no memo'
  return <div className="home-hero">{useIdle() ? <LoadBoundary fallback={slot}><Suspense fallback={slot}><HeroCard /></Suspense></LoadBoundary> : slot}</div>
}
/** The footer band: the live number, then the site line (docs/LAYOUT-THEME-PLAN.md §1c #13). */
function SiteFooter({ onAbout }: { onAbout: () => void }) {
  'use no memo'
  const idle = useIdle(), lab = useFlag('lab')
  return <footer className="bottom">
    <div className="live-band">{idle && <LoadBoundary fallback={null}><Suspense fallback={null}><LiveBand /></Suspense></LoadBoundary>}</div>
    <div className="bottom-row"><span>MATRIX · <b>EVERY PIXEL IS A DOT SAMPLED FROM A FIELD</b></span>
      <span><a href="/blog/dot-matrix-essay/">HOW IT WORKS</a> · {lab && <><a href="/lab/">LAB</a> · </>}<a href="/blog/">BLOG</a> · <a href="/about/" onClick={e => { e.preventDefault(); onAbout() }}>SHORTCUTS</a> · <a href="https://github.com/YashM20/dot-matrix">SOURCE</a> · <a href="/privacy">PRIVACY</a> · <a href="/terms">TERMS</a></span></div>
  </footer>
}
// MAKE is one editor (docs/EDITOR-PLAN.md): frames on an infinite canvas, layers, a contextual inspector.
// The old modes (TUNE / COMPOSE / CODE / DRAW) are ways into it. Lazy: no other view loads the editor.
const Editor = lazy(() => import('./components/editor/Editor').then(m => ({ default: m.Editor })))
// ALL (#315, was BROWSE #182): EXPLORE's every-card grid on `/`, filtered and windowed; its data, styles and filters load with it
const Browse = lazy(() => import('./components/browse/Browse').then(m => ({ default: m.Browse })))
// the single-widget page (docs/SHARE-PLAN.md §4): /widget/<slug|uid>/, /<uid>, ?card=; lazy like the views
const WidgetPage = lazy(() => import('./components/widget/WidgetPage').then(m => ({ default: m.WidgetPage })))
// the phone board sheet: its own chunk, fetched on the first tap (or once the command layer has mounted)
const loadBoardSheet = () => import('./components/BoardSheet')
const BoardSheet = lazy(() => loadBoardSheet().then(m => ({ default: m.BoardSheet })))
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
  const [woken, setWoken] = useState(false)
  const [pending, setPending] = useState<KeyboardEvent | null>(null)
  const ready = useIdle() || woken
  useEffect(() => {
    if (ready) return
    const go = () => setWoken(true)
    const onKey = (e: KeyboardEvent) => {
      const editing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if (layerKey(e) && !(editing && !e.metaKey && !e.ctrlKey)) {
        if (e.metaKey || e.ctrlKey) e.preventDefault() // keep the browser's own ⌘K / Ctrl-K away
        setPending(e)
      }
      go()
    }
    window.addEventListener('keydown', onKey, { once: true })
    const unwake = onLayerWake(go) // a tap on the phone tab bar's TOOLS / SEARCH
    return () => { window.removeEventListener('keydown', onKey); unwake() }
  }, [ready])
  useEffect(() => { if (ready) void loadBoardSheet() }, [ready])
  return ready ? <LoadBoundary fallback={null}><Suspense fallback={null}><CommandLayerLazy {...props} /><ReplayKey ev={pending} /></Suspense></LoadBoundary> : null
}
// Deep links (all resolved in src/site/views.ts): `/<board>/` or ?board=<id> opens a board, ?make=<mode> a MAKE
// mode (?make=code&p=<encoded> a shared Field IR program), /about/ the about page, /widget/<slug|uid>/ (or /<uid>,
// or the old ?card=<id>) one card on its own page; every old ?tab= still opens the view it became.
// MAKE behind its flag (src/site/flags.ts): off, a MAKE URL opens the board it names (the home board for `?make`)
const urlView = (mode?: Mode) => { const v = viewFromUrl(location.search, location.pathname, mode); return v.view === 'MAKE' && !flag('make') ? { ...v, view: 'EXPLORE' as const } : v }
// a prebuilt widget page names its board (postbuild's dot480:widget meta): fetch that chunk alongside the page's
{ const hint = document.querySelector<HTMLMetaElement>('meta[name="dot480:widget"]')?.dataset.board; if (hint && urlView().widget) prefetchBoard(hint) }
/** One line of intent above the boards (docs/UX-PLAN.md §5.1): dismissible, and it stays dismissed. */
function IntroLine() {
  const [shown, setShown] = useState(() => { try { return localStorage.getItem('dot480:intro') !== 'off' } catch { return true } })
  const xray = useFlag('xray')
  if (!shown) return null
  return <p className="intro-line">
    {/* phones show the short line (one text line, so intro + picker stay ≤ 120 px; src/site/mobile/) */}
    <span className="intro-long"><span className="intro-lead">Interfaces drawn entirely in dots: every card is a live field, sampled onto a grid.</span> <span>{xray ? <>Touch the cards, try another <b>DISPLAY</b>, or press <b>X-RAY</b> to see how one works.</> : <>Touch the cards, or try another <b>DISPLAY</b>.</>}</span></span>
    <span className="intro-short">Every card is a live dot field.</span>
    <a href="/blog/dot-matrix-essay/">Read the essay →</a>
    <button type="button" aria-label="Hide this note" onClick={() => { setShown(false); try { localStorage.setItem('dot480:intro', 'off') } catch { /* private mode */ } }}>×</button>
  </p>
}
interface PlaceViewProps {
  /** The place on screen (a view or a MAKE mode) and its board, `*` for ALL: they trail the state during the exit swap. */
  place: string; shownBoard: string; leaving: boolean
  board: string; all: boolean; mode: Mode
  onPick: (id: string) => void; onPickAll: () => void; onSheet: () => void; onOpen: (slug: string) => void; onExit: () => void
}
/** The place on screen inside its load boundary: EXPLORE (ALL or one board), ABOUT, or MAKE's editor. */
function PlaceView({ place, shownBoard, leaving, board, all, mode, onPick, onPickAll, onSheet, onOpen, onExit }: PlaceViewProps) {
  const shownAll = shownBoard === '*', heroBeside = useHeroBeside()
  return <LoadBoundary key={place} fallback={viewFailed}>
    <Suspense fallback={<section className="view-loading" aria-busy="true" />}>
    {place === 'EXPLORE' ? (
      <section className="boards-view" role="tabpanel" aria-labelledby="tab-EXPLORE">
        {shownAll && heroBeside && <Hero />}
        <IntroLine />
        <BoardPicker board={board} all={all} onPick={onPick} onPickAll={onPickAll} onSheet={onSheet} />
        {shownAll
          ? <Browse onOpen={onOpen} cardPath={widgetPath} onBoard={id => { window.scrollTo(0, 0); onPick(id) }} />
          : <><Board key={shownBoard} id={shownBoard} leaving={leaving} /><NextBoard board={board} onPick={onPick} /></>}
        {shownAll && !heroBeside && <Hero />}
      </section>
    ) : place === 'ABOUT' ? (
      <section className="about-view" role="tabpanel" aria-labelledby="tab-ABOUT"><About /></section>
    ) : (
      // MAKE: one editor; `mode` (any old ?make= / ?tab= name) only picks its starting tool and panels
      <section className="make-view" role="tabpanel" aria-labelledby="tab-MAKE">
        <Suspense fallback={<div className="view-loading" aria-busy="true" style={{ minHeight: 'calc(100svh - 120px)' }}>Loading the editor…</div>}>
          <Editor mode={mode} onExit={onExit} />
        </Suspense>
      </section>
    )}
    </Suspense>
  </LoadBoundary>
}
// ?tab=essay, /privacy, /terms: those are their own pages (the essay is a post on the blog, blog.html; privacy.html and
// terms.html; each a separate Vite entry);
// the visit's theme params (?theme= / ?scheme= / ?accent=) go along, the pages' boot script reads them too
const handoff = urlView()
if (handoff.essay || handoff.legal) {
  const keep = location.search.match(/\b(theme|scheme|accent)=[^&]*/g)
  replace(`${handoff.legal ? `/${handoff.legal}.html` : '/blog/dot-matrix-essay/'}${keep ? `?${keep.join('&')}` : ''}${location.hash}`)
}

export default function App() {
  const [view, setView] = useState<View>(() => urlView().view)
  const [mode, setMode] = useState<Mode>(() => urlView().mode)
  const [board, setBoard] = useState(() => urlView().board)
  // EXPLORE's ALL (every card, on `/`) or the board above
  const [all, setAll] = useState(() => urlView().all)
  const [widget, setWidget] = useState<WidgetRoute | undefined>(() => urlView().widget)
  const [boards, setBoards] = useState(false) // the phone board sheet
  // MAKE is a tool, not a page to index
  useEffect(() => {
    let el = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]')
    if (view !== 'MAKE') { el?.remove(); return }
    if (!el) { el = document.createElement('meta'); el.name = 'robots'; document.head.append(el) }
    el.content = 'noindex'
  }, [view])
  // per-view <title>, description and OG tags (crawlers get the same from the prebuilt dist/<board>/index.html),
  // and the address bar: moving to another view is a history entry; the first render, and a URL that already
  // names this view in an older form (a remix's ?tab=dots&p=…), are only normalised in place
  const first = useRef(true)
  useEffect(() => {
    if (widget) return // the widget page keeps its own URL and meta
    const want = { view, mode, board, all }, url = urlForView(want, location.search, location.pathname)
    // the home page (`/`, ALL) keeps the site's own title and canonical; ABOUT has its own; a board path gets the board's
    setPageMeta(view === 'ABOUT' ? ABOUT_META : view === 'EXPLORE' && !all && boardFromPath(url.split('?')[0]) ? board : undefined)
    syncUrl(url, !first.current && !sameView(urlView(mode), want))
    first.current = false
  }, [view, mode, board, all, widget])
  // board ⇄ widget page (Back / Forward, a card's OPEN) as a view transition: the card's frame flies (X1, #18)
  const shownWidget = useRef(widget)
  useEffect(() => { shownWidget.current = widget })
  useEffect(() => {
    const onPop = () => {
      const v = urlView(), was = shownWidget.current
      const apply = () => { setView(v.view); setBoard(v.board); setAll(v.all); setWidget(v.widget); if (v.view === 'MAKE') setMode(v.mode) }
      const slug = !v.widget !== !was ? (v.widget ?? was)?.key : undefined
      if (slug) cardTransition(slug, apply, flushSync, !v.widget); else apply()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  /** A view or MAKE mode by any name it has had (palette, shell, command layer: old tab names too). */
  const go = (name: string) => {
    const p = placeFromName(name)
    if (!p) return
    const v = placeView(p, mode)
    if (v.view === 'MAKE' && !flag('make')) return
    // GALLERY was a board; EXPLORE by any other name (BROWSE, ALL, BOARDS) lands on ALL, the home view
    if (name.toLowerCase() === 'gallery') { setBoard(GALLERY_BOARD); setAll(false) } else if (v.view === 'EXPLORE') setAll(true)
    setMode(v.mode); setView(v.view); setWidget(undefined)
  }
  // widget page ⇄ boards: each move is a history entry; back on a board, the card it came from is brought to the eye
  const openWidget = (slug: string) => {
    const q = new URLSearchParams(location.search); q.delete('card')
    for (const k of BROWSE_PARAMS) q.delete(k)
    pushUrl(widgetPath(slug) + (q.size ? `?${q}` : ''))
    setWidget({ key: slug, scope: '', via: 'path' })
  }
  const leaveWidget = (id: string, slug?: string) => {
    pushUrl(urlForView({ view: 'EXPLORE', mode, board: id, all: false }, location.search, location.pathname))
    const apply = () => { setWidget(undefined); setView('EXPLORE'); setBoard(id); setAll(false) }
    if (!slug) return apply()
    cardTransition(slug, apply, flushSync, true)
    const t0 = performance.now(), find = () => {
      const el = document.querySelector<HTMLElement>(`.board-view [data-card-id="${CSS.escape(slug)}"]`)
      if (el) el.scrollIntoView({ block: 'center' }); else if (performance.now() - t0 < 3000) window.setTimeout(find, 80)
    }
    window.setTimeout(find, 60)
  }
  /** A card's page → ALL (a history entry, like leaving to its board). */
  const leaveToAll = () => {
    pushUrl(urlForView({ view: 'EXPLORE', mode, board, all: true }, location.search, location.pathname))
    setWidget(undefined); setView('EXPLORE'); setAll(true)
  }
  /** One board in EXPLORE (leaves ALL); `showAll` is EXPLORE's ALL. */
  const pickBoard = (id: string) => { setWidget(undefined); setBoard(id); setAll(false) }
  const showAll = () => { setWidget(undefined); setAll(true); setView('EXPLORE') }
  const place = view === 'MAKE' ? mode : view
  // the old view dissolves out before the new one mounts and enters (instant under reduced motion)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // `*` is ALL in the swap key: ALL ⇄ a board dissolves like a board switch
  const [shown, leaving] = useExitSwap(`${place}|${all ? '*' : board}`, s => reduced || !s.startsWith('EXPLORE|') ? 0 : VIEW_EXIT_MS)
  const [shownPlace, shownBoard] = shown.split('|') as [string, string]
  if (widget) return <div className="shell shell--widget">
    <SkipLink />
    <main id="main" tabIndex={-1}>
      <LoadBoundary key={widget.key} fallback={viewFailed}><Suspense fallback={<section className="view-loading" aria-busy="true" />}><WidgetPage route={widget} onOpen={openWidget} onBoard={leaveWidget} /></Suspense></LoadBoundary>
      <CommandLayer tab="EXPLORE" board={board} setTab={go} setBoard={pickBoard} />
    </main>
    {/* the phone tab bar on a card's page: EXPLORE is ALL, the home view (#315); the page's own ‹ pill goes back to the card's board */}
    <TabBar onView={v => { if (v === 'EXPLORE') return leaveToAll(); setWidget(undefined); setView(v) }} />
    <SiteFooter onAbout={() => { setWidget(undefined); setView('ABOUT') }} />
  </div>
  return <div className="shell" data-view={view}>
    <SkipLink />
    <TopBar view={view} all={all} board={board} onView={setView} onBoards={() => setBoards(true)} />
    <main id="main" tabIndex={-1}>
    <h1 className="sr-only">MATRIX dot-matrix UI engine</h1>
    <PlaceView place={shownPlace} shownBoard={shownBoard} leaving={leaving} board={board} all={all} mode={mode}
      onPick={pickBoard} onPickAll={showAll} onSheet={() => setBoards(true)} onOpen={openWidget} onExit={() => setView('EXPLORE')} />
    {/* C10: ⌘K palette, dot shell, X-ray inspector, time machine; `tab` is the place (a view or a MAKE mode) */}
    <CommandLayer tab={place} board={board} all={all} setTab={go} setBoard={pickBoard} />
    </main>
    {boards && <LoadBoundary fallback={null}><Suspense fallback={null}><BoardSheet board={board} onClose={() => setBoards(false)} onPick={id => { window.scrollTo(0, 0); setView('EXPLORE'); pickBoard(id) }} /></Suspense></LoadBoundary>}
    <TabBar view={view} onView={setView} onBoards={() => setBoards(true)} />
    <SiteFooter onAbout={() => setView('ABOUT')} /></div>
}
