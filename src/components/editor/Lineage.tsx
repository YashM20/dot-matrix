/**
 * Remix lineage in CODE (E5). Programs: the old RemixGraph (deleted in round 2, restored from f9bafb2) — the
 * eight examples and the programs this browser shared or opened, drawn in dots: each node a thumbnail of
 * the program, dotted edges from a program to its remixes, the current one framed in the accent. A click
 * on a node opens it as a frame (or selects the frame it made). Frames: the chain of frame / document links
 * the selected frame came from, as far as this browser saw them.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { useThemeTokens } from '../../site/theme/useTheme'
import { clearGallery, graphLayers, layoutGraph, loadGallery, nodeAt, type Entry } from '../dwitter/gallery'
import { DOTS_STYLE } from '../dwitter/program'
import type { EditorFrame } from './doc'
import { lineage, linkSource, loadLinks } from './link'
import { useEditor } from './store'
import { Section } from './ui'

const graphStyle = { ...DOTS_STYLE, sizeMin: .15, sizeMax: .62 }
/**
 * localStorage reads keyed by a stamp the caller bumps after a write. The stamp is an input on purpose: the React
 * Compiler memoizes by what a callback reads, so a dependency the callback never reads would never refresh it.
 */
const galleryAt = (_stamp: number) => loadGallery()
const linksAt = (_stamp: number) => loadLinks()

/** The remix graph; `current` is the selected program's hash, `version` bumps when the gallery changed. */
export function RemixGraph({ current, version = 0 }: { current?: string; version?: number }) {
  const [cleared, setCleared] = useState(0)
  const list = useMemo(() => galleryAt(version + cleared), [version, cleared])
  const graph = useMemo(() => layoutGraph(list), [list])
  const theme = useThemeTokens(), ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    const h = setTimeout(() => {
      const ctx = c.getContext('2d'), g = graph.grid, k = Math.min(2, window.devicePixelRatio || 1)
      if (!ctx) return
      c.width = Math.round(g.cols * g.pitch! * k); c.height = Math.round(g.rows * g.pitch! * k)
      ctx.setTransform(k, 0, 0, k, 0, 0); ctx.fillStyle = theme.surface; ctx.fillRect(0, 0, c.width, c.height)
      renderCanvas(ctx, sampleLayers(graphLayers(graph, current), g, graphStyle, theme))
      c.dataset.nodes = String(graph.nodes.length); c.dataset.cols = String(g.cols); c.dataset.rows = String(g.rows)
    }, 60)
    return () => clearTimeout(h)
  }, [graph, current, theme])
  const open = (e: Entry) => { useEditor.getState().insertProgram(e) }
  const pick = (e: MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), n = nodeAt(graph, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    if (n) open(n.entry)
  }
  const own = list.filter(e => !e.seed), byId = new Map(list.map(e => [e.id, e] as const))
  const chain: Entry[] = []
  for (let at = current ? byId.get(current) : undefined; at && chain.length < 16; at = at.parent ? byId.get(at.parent) : undefined) chain.push(at)
  return <Section title="REMIX" aside={`${list.length} programs · ${own.length} yours`}>
    {chain.length > 1 && <p className="ed-lineage" aria-label="Remix lineage">{chain.map((e, i) => <span key={e.id}>{i ? ' ← ' : ''}<b>{e.name}</b> #{e.id}</span>)}</p>}
    {current && chain.length <= 1 && <p className="ed-hint">{chain.length ? 'An original: nothing above it here.' : 'Not shared yet: COPY LINK adds it to the graph, under the program it came from.'}</p>}
    <div className="ed-graph"><canvas ref={ref} onClick={pick} role="img" aria-label={`Remix graph: ${list.length} programs; click one to open it`} title="Open a program" style={{ aspectRatio: `${graph.grid.cols} / ${graph.grid.rows}` }} /></div>
    {own.length > 0 && <ul className="ed-mini-list ed-remixes">{own.map(e => <li key={e.id}><button type="button" aria-current={e.id === current || undefined} title={e.parent ? `remix of #${e.parent}` : 'original'} onClick={() => open(e)}>{e.name} <small>#{e.id}{e.parent ? ` ← #${e.parent}` : ''}</small></button></li>)}</ul>}
    {own.length > 0 && <div className="ed-row-btns"><button type="button" onClick={() => { clearGallery(); setCleared(n => n + 1) }}>CLEAR MY PROGRAMS</button></div>}
  </Section>
}

/** The frame / document links a frame came from (E5). */
export function LinkLineage({ f, version = 0 }: { f: EditorFrame; version?: number }) {
  const id = linkSource(f)
  const chain = useMemo(() => (id ? lineage(id, linksAt(version)) : []), [id, version])
  return <Section title="LINK LINEAGE" aside={id ? `#${id}` : 'not from a link'}>
    {chain.length ? <ol className="ed-lineage ed-lineage--list" aria-label="Link lineage">{chain.map((r, i) => <li key={r.id}>{i === 0 ? 'OPENED FROM' : 'REMIX OF'} <b>#{r.id}</b>{'name' in r ? ` · ${r.name} · ${r.kind === 'frame' ? 'frame' : `${r.frames} frames`}` : ' · not seen in this browser'}</li>)}</ol>
      : <p className="ed-hint">This frame was made here. Share it from EXPORT · LINK; a frame opened from a link and shared again records that link as its parent.</p>}
  </Section>
}
