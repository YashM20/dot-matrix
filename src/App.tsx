import { useState } from 'react'
import { Board, boardIds } from './components/Board'
import { DrawBoard } from './components/draw/DrawBoard'
import { DotWidget } from './components/DotWidget'
import { ControlsPanel } from './components/playground/ControlsPanel'
import { DataEditor } from './components/playground/DataEditor'
import { ExportPanel } from './components/playground/ExportPanel'
import { PhotoUpload } from './components/playground/PhotoUpload'
import { PreviewCanvas } from './components/playground/PreviewCanvas'
import { WidgetGallery } from './components/playground/WidgetGallery'
import './App.css'

const galleryItems = [
  'recorder', 'clock', 'timer',
  'weather-card', 'fitness-rings', 'album-art',
  'system-stats-bars', 'ev-charge', 'breathing-circles',
]

export default function App() {
  const [tab, setTab] = useState<'BOARDS' | 'GALLERY' | 'WORKSPACE' | 'DRAW'>('BOARDS')
  const [board, setBoard] = useState<(typeof boardIds)[number]>('henry')
  return <main className="shell">
    <header className="topbar"><div className="brand"><i/> DOT/480 <small>{tab === 'BOARDS' ? 'BOARDS' : tab === 'GALLERY' ? 'GALLERY' : tab === 'DRAW' ? 'DRAW' : 'PLAYGROUND'}</small></div>
      <nav>{(['BOARDS', 'GALLERY', 'WORKSPACE', 'DRAW'] as const).map(t => <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <div className="live"><i/> LIVE</div></header>
    {tab === 'BOARDS' ? (
      <section className="boards-view">
        <div className="board-tabs">{boardIds.map(id => <button key={id} className={board === id ? 'selected' : ''} onClick={() => setBoard(id)}>{id.toUpperCase()}</button>)}</div>
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
