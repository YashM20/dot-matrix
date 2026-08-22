import { useState } from 'react'
import { Board, boardIds } from './components/Board'
import { ControlsPanel } from './components/playground/ControlsPanel'
import { ExportPanel } from './components/playground/ExportPanel'
import { PhotoUpload } from './components/playground/PhotoUpload'
import { PreviewCanvas } from './components/playground/PreviewCanvas'
import { WidgetGallery } from './components/playground/WidgetGallery'
import './App.css'

export default function App() {
  const [tab, setTab] = useState<'BOARDS' | 'WORKSPACE'>('BOARDS')
  const [board, setBoard] = useState<(typeof boardIds)[number]>('henry')
  return <main className="shell">
    <header className="topbar"><div className="brand"><i/> DOT/480 <small>{tab === 'BOARDS' ? 'BOARDS' : 'PLAYGROUND'}</small></div>
      <nav>{(['BOARDS', 'WORKSPACE'] as const).map(t => <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>{t}</button>)}</nav>
      <div className="live"><i/> LIVE</div></header>
    {tab === 'BOARDS' ? (
      <section className="boards-view">
        <div className="board-tabs">{boardIds.map(id => <button key={id} className={board === id ? 'selected' : ''} onClick={() => setBoard(id)}>{id.toUpperCase()}</button>)}</div>
        <Board id={board} />
      </section>
    ) : (
      <section className="pg-layout">
        <WidgetGallery />
        <div className="pg-center">
          <PreviewCanvas />
          <ExportPanel />
        </div>
        <aside className="pg-side">
          <ControlsPanel />
          <PhotoUpload />
        </aside>
      </section>
    )}
    <footer className="bottom">DOT/480 / <b>CONFIGURATION 01</b><span>FIELD → GRID SAMPLER → RENDERER</span><span>STATUS: <b>NOMINAL</b></span></footer></main>
}
