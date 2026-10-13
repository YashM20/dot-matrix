import { useState } from 'react'
import { Board } from './components/Board'
import { DrawBoard } from './components/draw/DrawBoard'
import { DotWidget } from './components/DotWidget'
import { ControlsPanel } from './components/playground/ControlsPanel'
import { DataEditor } from './components/playground/DataEditor'
import { ExportPanel } from './components/playground/ExportPanel'
import { PhotoUpload } from './components/playground/PhotoUpload'
import { PreviewCanvas } from './components/playground/PreviewCanvas'
import { WidgetGallery } from './components/playground/WidgetGallery'
import { boardIds } from './widgets'
import './App.css'

const galleryItems = ['home-clock', 'music', 'timer', 'weather', 'fitness', 'messages', 'camera', 'settings', 'system']
type Tab = 'BOARDS' | 'GALLERY' | 'WORKSPACE' | 'DRAW'

// Deep links: ?board=<id> opens a board, ?card=<id> renders one card alone (handy for screenshots/bisecting).
const params = new URLSearchParams(window.location.search)
const singleCard = params.get('card')

export default function App() {
  const [tab, setTab] = useState<Tab>('BOARDS')
  const [board, setBoard] = useState(boardIds.includes(params.get('board') ?? '') ? params.get('board')! : boardIds[0])
  if (singleCard) return <main className="shell"><section className="gallery-view"><div className="gallery-grid"><DotWidget type={singleCard} /></div></section></main>
  return <main className="shell">
    <h1 className="sr-only">DOT/480 dot-matrix UI engine</h1>
    <header className="topbar"><div className="brand"><i aria-hidden="true"/> DOT/480 <small>{tab === 'WORKSPACE' ? 'PLAYGROUND' : tab}</small></div>
      <nav aria-label="Views">{(['BOARDS', 'GALLERY', 'WORKSPACE', 'DRAW'] as const).map(t => <button key={t} className={tab === t ? 'selected' : ''} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <div className="live"><i aria-hidden="true"/> LIVE</div></header>
    {tab === 'BOARDS' ? (
      <section className="boards-view">
        <div className="board-tabs" role="group" aria-label="Boards">{boardIds.map(id => <button key={id} className={board === id ? 'selected' : ''} aria-pressed={board === id} onClick={() => setBoard(id)}>{id.toUpperCase()}</button>)}</div>
        <Board id={board} />
      </section>
    ) : tab === 'GALLERY' ? (
      <section className="gallery-view">
        <h2 className="gallery-title">DOT/480 — 480×480 OLED MICRO INTERFACE SYSTEM</h2>
        <div className="gallery-grid">
          {galleryItems.map(type => <DotWidget key={type} type={type} />)}
        </div>
      </section>
    ) : tab === 'DRAW' ? (
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
          </div>
        </div>
        <aside className="pg-side">
          <ControlsPanel />
        </aside>
      </section>
    )}
    <footer className="bottom">DOT/480 / <b>CONFIGURATION 01</b><span>FIELD → GRID SAMPLER → RENDERER</span><span>STATUS: <b>NOMINAL</b></span></footer></main>
}
