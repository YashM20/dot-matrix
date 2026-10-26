import { useMemo, type MouseEvent } from 'react'
import { DotCanvas } from '../DotCanvas'
import { More } from '../More'
import { graphLayers, layoutGraph, nodeAt, type Entry } from './gallery'
import { DOTS_STYLE } from './program'

const graphStyle = { ...DOTS_STYLE, sizeMin: .15, sizeMax: .62 }

/** The examples + your programs as buttons, plus (folded) the remix graph in dots (click a thumbnail to open it). */
export function RemixGraph({ list, current, onPick, onClear }: { list: Entry[]; current?: string; onPick: (e: Entry) => void; onClear: () => void }) {
  const graph = useMemo(() => layoutGraph(list), [list])
  const layers = useMemo(() => { const l = graphLayers(graph, current); return () => l }, [graph, current])
  const pick = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), n = nodeAt(graph, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height)
    if (n) onPick(n.entry)
  }
  const own = list.filter(e => !e.seed).length
  return (
    <section className="pg-panel dw-gallery" aria-label="Remix gallery">
      <h2>EXAMPLES <small>PICK ONE, CHANGE A NUMBER · {list.length} PROGRAMS · {own} YOURS</small></h2>
      <More id="code-remix-graph" label="Remix graph" tech="who remixed what">
        <div className="dw-graph" onClick={pick} title="Open a program">
          <DotCanvas layers={layers} grid={graph.grid} style={graphStyle} change={false} />
        </div>
      </More>
      <ul className="dw-list">
        {list.map(e => (
          <li key={e.id}><button type="button" className={`pg-thumb${e.id === current ? ' selected' : ''}`} aria-pressed={e.id === current} onClick={() => onPick(e)}
            title={e.parent ? `remix of ${e.parent}` : e.seed ? 'example' : 'original'}>{e.name}{e.seed ? '' : ` ${e.id.slice(0, 4)}`}</button></li>
        ))}
      </ul>
      {own > 0 && <button type="button" className="dw-link-btn" onClick={onClear}>CLEAR MY PROGRAMS</button>}
    </section>
  )
}
