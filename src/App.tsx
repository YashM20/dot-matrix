import { lazy, Suspense, useEffect, useState, type ComponentType } from 'react'
import { Board, VIEW_EXIT_MS, cardMotion } from './components/Board'
import { DotWidget } from './components/DotWidget'
import { SkinSwitcher } from './components/skins/SkinSwitcher'
import { useExitSwap } from './hooks/useExitSwap'
import { boardIds, prefetchBoard } from './widgets/manifest'
import { boardFromPath, setPageMeta } from './site/meta'
import './App.css'

// every view but BOARDS is its own chunk, fetched when its tab opens (first-load budget, docs/WEB-PLAN.md §1)
const later = <K extends string>(load: () => Promise<{ [k in K]: ComponentType }>, name: K) => lazy(() => load().then(m => ({ default: m[name] })))
const Changelog = later(() => import('./components/Changelog'), 'Changelog')
const DrawBoard = later(() => import('./components/draw/DrawBoard'), 'DrawBoard')
const DotsRepl = later(() => import('./components/dwitter/DotsRepl'), 'DotsRepl')
const ControlsPanel = later(() => import('./components/playground/ControlsPanel'), 'ControlsPanel')
const DataEditor = later(() => import('./components/playground/DataEditor'), 'DataEditor')
const ExportPanel = later(() => import('./components/playground/ExportPanel'), 'ExportPanel')
const PhotoUpload = later(() => import('./components/playground/PhotoUpload'), 'PhotoUpload')
const PreviewCanvas = later(() => import('./components/playground/PreviewCanvas'), 'PreviewCanvas')
const TransitionLab = later(() => import('./components/playground/TransitionLab'), 'TransitionLab')
const WidgetGallery = later(() => import('./components/playground/WidgetGallery'), 'WidgetGallery')

const galleryItems = ['home-clock', 'music', 'timer', 'weather', 'fitness', 'messages', 'camera', 'settings', 'system']
// DRAW stays last: the narrow layout hides the last tab
// STUDIO (P6-D) is its own tab, not a WORKSPACE upgrade: WORKSPACE stays the one-preset tuner (style,
// photo, exports); STUDIO edits a layered card document. Lazy, so the other tabs don't load the editor.
const Studio = lazy(() => import('./components/studio/Studio').then(m => ({ default: m.Studio })))
const tabs = ['BOARDS', 'GALLERY', 'WORKSPACE', 'STUDIO', 'LOG', 'DOTS', 'DRAW'] as const
type Tab = typeof tabs[number]

// Deep links: ?board=<id> opens a board, ?card=<id> renders one card alone (handy for screenshots/bisecting),
// ?tab=dots&p=<encoded> opens a shared Field IR program in the DOTS REPL.
const params = new URLSearchParams(window.location.search)
const singleCard = params.get('card')

export default function App() {
  const [tab, setTab] = useState<Tab>(tabs.find(t => t === params.get('tab')?.toUpperCase()) ?? 'BOARDS')
  const [board, setBoard] = useState(boardIds.includes(params.get('board') ?? '') ? params.get('board')! : boardFromPath(window.location.pathname) ?? boardIds[0])
  // per-view <title>, description and OG tags (crawlers get the same from the prebuilt dist/<board>/index.html)
  useEffect(() => setPageMeta(tab === 'BOARDS' ? board : undefined), [tab, board])
  // the old view dissolves out before the new one mounts and enters (instant under reduced motion)
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [view, leaving] = useExitSwap(`${tab}|${board}`, shown => reduced || !/^(BOARDS|GALLERY)\|/.test(shown) ? 0 : VIEW_EXIT_MS)
  const [shownTab, shownBoard] = view.split('|') as [Tab, string]
  if (singleCard) return <main className="shell"><section className="gallery-view"><div className="gallery-grid"><DotWidget type={singleCard} /></div></section></main>
  return <main className="shell">
    <h1 className="sr-only">DOT/480 dot-matrix UI engine</h1>
    <header className="topbar"><div className="brand"><i aria-hidden="true"/> DOT/480 <small>{tab === 'WORKSPACE' ? 'PLAYGROUND' : tab}</small></div>
      <nav aria-label="Views">{tabs.map(t => <button key={t} className={tab === t ? 'selected' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <SkinSwitcher />
      <div className="live"><i aria-hidden="true"/> LIVE</div></header>
    <Suspense fallback={<section className="view-loading" aria-busy="true" />}>
    {shownTab === 'BOARDS' ? (
      <section className="boards-view">
        <div className="board-tabs" role="group" aria-label="Boards">{boardIds.map(id => <button key={id} className={board === id ? 'selected' : ''} aria-pressed={board === id} onClick={() => setBoard(id)} onPointerEnter={() => prefetchBoard(id)} onFocus={() => prefetchBoard(id)}>{id.toUpperCase()}</button>)}</div>
        <Board key={shownBoard} id={shownBoard} leaving={leaving} />
      </section>
    ) : shownTab === 'GALLERY' ? (
      <section className="gallery-view">
        <h2 className="gallery-title">DOT/480 — 480×480 OLED MICRO INTERFACE SYSTEM</h2>
        <div className="gallery-grid">
          {galleryItems.map((type, i) => <DotWidget key={type} type={type} {...cardMotion(i, 3, galleryItems.length, leaving)} />)}
        </div>
      </section>
    ) : shownTab === 'LOG' ? (
      <Changelog />
    ) : shownTab === 'STUDIO' ? (
      <Suspense fallback={<p className="st-hint">Loading the Studio…</p>}><Studio /></Suspense>
    ) : shownTab === 'DOTS' ? (
      <DotsRepl />
    ) : shownTab === 'DRAW' ? (
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
    <footer className="bottom">DOT/480 / <b>CONFIGURATION 01</b><span>FIELD → GRID SAMPLER → RENDERER</span><span>STATUS: <b>NOMINAL</b></span></footer></main>
}
