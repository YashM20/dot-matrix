import { useState } from 'react'
import { Board, VIEW_EXIT_MS, cardMotion } from './components/Board'
import { Changelog } from './components/Changelog'
import { DrawBoard } from './components/draw/DrawBoard'
import { DotWidget } from './components/DotWidget'
import { DotsRepl } from './components/dwitter/DotsRepl'
import { SkinSwitcher } from './components/skins/SkinSwitcher'
import { ControlsPanel } from './components/playground/ControlsPanel'
import { DataEditor } from './components/playground/DataEditor'
import { ExportPanel } from './components/playground/ExportPanel'
import { PhotoUpload } from './components/playground/PhotoUpload'
import { PreviewCanvas } from './components/playground/PreviewCanvas'
import { TransitionLab } from './components/playground/TransitionLab'
import { WidgetGallery } from './components/playground/WidgetGallery'
import { useExitSwap } from './hooks/useExitSwap'
import { boardIds } from './widgets'
import './App.css'

const galleryItems = ['home-clock', 'music', 'timer', 'weather', 'fitness', 'messages', 'camera', 'settings', 'system']
// DRAW stays last: the narrow layout hides the last tab
const tabs = ['BOARDS', 'GALLERY', 'WORKSPACE', 'LOG', 'DOTS', 'DRAW'] as const
type Tab = typeof tabs[number]

// Deep links: ?board=<id> opens a board, ?card=<id> renders one card alone (handy for screenshots/bisecting),
// ?tab=dots&p=<encoded> opens a shared Field IR program in the DOTS REPL.
const params = new URLSearchParams(window.location.search)
const singleCard = params.get('card')

export default function App() {
  const [tab, setTab] = useState<Tab>(tabs.find(t => t === params.get('tab')?.toUpperCase()) ?? 'BOARDS')
  const [board, setBoard] = useState(boardIds.includes(params.get('board') ?? '') ? params.get('board')! : boardIds[0])
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
    {shownTab === 'BOARDS' ? (
      <section className="boards-view">
        <div className="board-tabs" role="group" aria-label="Boards">{boardIds.map(id => <button key={id} className={board === id ? 'selected' : ''} aria-pressed={board === id} onClick={() => setBoard(id)}>{id.toUpperCase()}</button>)}</div>
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
    <footer className="bottom">DOT/480 / <b>CONFIGURATION 01</b><span>FIELD → GRID SAMPLER → RENDERER</span><span>STATUS: <b>NOMINAL</b></span></footer></main>
}
