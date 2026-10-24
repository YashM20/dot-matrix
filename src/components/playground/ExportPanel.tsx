import { useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import { usePlayground, type PlaygroundState } from './store'
import { getTheme, renderCurrentSVG, resolveCurrent, snippetFor } from './render'
import { layerSource, plotterSVG, recordClip, type ClipFormat, type PlotResult, type Sweep } from '../../export'

function downloadPNG(svg: string) {
  const match = svg.match(/width="(\d+)" height="(\d+)"/)
  const width = match ? +match[1] : 400
  const height = match ? +match[2] : 300
  const image = new Image()
  image.onload = () => {
    const canvas = document.createElement('canvas')
    const scale = 3
    canvas.width = width * scale
    canvas.height = height * scale
    canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(blob => blob && saveAs(blob, 'dot480.png'), 'image/png')
  }
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

/** The preview card as a clip source: same layers, data, grid, style and theme as the preview. */
function sourceFor(state: PlaygroundState, sweepKey = '', seconds = 1) {
  const w = resolveCurrent(state), v = w.data[sweepKey] ?? 0
  const sweep: Sweep | undefined = sweepKey ? { key: sweepKey, from: 0, to: Math.max(1, v), seconds } : undefined
  return { id: w.id, src: layerSource(w.layers, w.grid, w.style, getTheme(state), w.data, sweep) }
}
const kb = (n: number) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`
const FORMATS: ClipFormat[] = ['apng', 'gif', 'webm', 'mp4']

function ClipExport() {
  const state = usePlayground()
  const [format, setFormat] = useState<ClipFormat>('gif')
  const [seconds, setSeconds] = useState(2), [fps, setFps] = useState(30), [scale, setScale] = useState(2)
  const [progress, setProgress] = useState<number | null>(null), [status, setStatus] = useState('')
  const [sweepKey, setSweepKey] = useState('')
  const abort = useRef<AbortController | null>(null)
  const keys = Object.keys(resolveCurrent(state).data)
  const record = async () => {
    const { id, src } = sourceFor(state, keys.includes(sweepKey) ? sweepKey : '', seconds)
    abort.current = new AbortController(); setProgress(0); setStatus('')
    try {
      const clip = await recordClip(src, { format, seconds, fps, scale, signal: abort.current.signal, onProgress: (d, n) => setProgress(d / n) })
      saveAs(clip.blob, `${id}.${clip.ext}`)
      setStatus(`${clip.width}×${clip.height} · ${clip.frames} frames (${clip.stored} stored) · ${(clip.durationMs / 1000).toFixed(2)} s · ${kb(clip.blob.size)} · ${clip.via}`)
    } catch (e) {
      setStatus(e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : `failed: ${(e as Error).message}`)
    } finally { setProgress(null); abort.current = null }
  }
  return (
    <>
      <div className="pg-export-opts">
        <b>CLIP</b>
        <select aria-label="Clip format" value={format} onChange={e => setFormat(e.target.value as ClipFormat)}>{FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select>
        <label>S <input aria-label="Seconds" type="number" min={0.5} max={20} step={0.5} value={seconds} onChange={e => setSeconds(Math.max(0.5, Math.min(20, +e.target.value || 2)))} /></label>
        <select aria-label="Frames per second" value={fps} onChange={e => setFps(+e.target.value)}>{[12, 15, 24, 30, 60].map(f => <option key={f} value={f}>{f} FPS</option>)}</select>
        <select aria-label="Sweep a data key over the clip" value={keys.includes(sweepKey) ? sweepKey : ''} onChange={e => setSweepKey(e.target.value)}><option value="">NO SWEEP</option>{keys.map(k => <option key={k} value={k}>SWEEP {k.toUpperCase()}</option>)}</select>
        <select aria-label="Scale" value={scale} onChange={e => setScale(+e.target.value)}>{[1, 2, 3].map(s => <option key={s} value={s}>{s}×</option>)}</select>
        <div className="pg-export-row">
          {progress === null ? <button onClick={record}>RECORD</button> : <button onClick={() => abort.current?.abort()}>CANCEL</button>}
        </div>
      </div>
      {progress !== null && <div className="pg-export-status"><progress value={progress} max={1} aria-label="Export progress" /></div>}
      {status && <div className="pg-export-status" role="status">{status}</div>}
    </>
  )
}

function PlotterExport() {
  const state = usePlayground()
  const [pen, setPen] = useState(0.35), [mm, setMm] = useState(0.5), [fill, setFill] = useState<'auto' | 'spiral' | 'hatch'>('auto')
  const [plot, setPlot] = useState<(PlotResult & { id: string }) | null>(null)
  const make = () => {
    const w = resolveCurrent(state), { src } = sourceFor(state)
    setPlot({ id: w.id, ...plotterSVG(src.frame(0), src.width, src.height, { penMm: pen, mmPerPx: mm, fill }) })
  }
  return (
    <>
      <div className="pg-export-opts">
        <b>PLOTTER</b>
        <label>PEN <input aria-label="Pen width mm" type="number" min={0.1} max={2} step={0.05} value={pen} onChange={e => setPen(+e.target.value || 0.35)} /></label>
        <label>MM/PX <input aria-label="Millimetres per pixel" type="number" min={0.1} max={3} step={0.1} value={mm} onChange={e => setMm(+e.target.value || 0.5)} /></label>
        <select aria-label="Dot fill" value={fill} onChange={e => setFill(e.target.value as typeof fill)}>{['auto', 'spiral', 'hatch'].map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select>
        <div className="pg-export-row">
          <button onClick={make}>PREVIEW</button>
          <button disabled={!plot} onClick={() => plot && saveAs(new Blob([plot.svg], { type: 'image/svg+xml' }), `${plot.id}-plot.svg`)}>SVG</button>
        </div>
      </div>
      {plot && (
        <div className="pg-plot">
          <img alt="Plotter preview" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(plot.svg)}`} />
          <div className="pg-export-status" role="status">
            {plot.widthMm.toFixed(0)}×{plot.heightMm.toFixed(0)} MM · {plot.strokes.length} STROKES<br />
            PEN DOWN {(plot.drawMm / 1000).toFixed(2)} M · TRAVEL {(plot.travelMm / 1000).toFixed(2)} M<br />
            (UNSORTED {(plot.naiveTravelMm / 1000).toFixed(2)} M)
          </div>
        </div>
      )}
    </>
  )
}

export function ExportPanel() {
  const state = usePlayground()
  const exportPNG = () => downloadPNG(renderCurrentSVG(state))
  const exportSVG = () => saveAs(new Blob([renderCurrentSVG(state)], { type: 'image/svg+xml' }), 'dot480.svg')
  const copySnippet = async () => { await navigator.clipboard.writeText(snippetFor(state)) }
  const exportHTML = () => {
    const html = `<!doctype html><html><body style="background:${getTheme(state).bg};display:grid;place-items:center;height:100vh;margin:0">${renderCurrentSVG(state)}</body></html>`
    saveAs(new Blob([html], { type: 'text/html' }), 'dot480.html')
  }
  return (
    <section className="pg-panel pg-export">
      <h2>EXPORT</h2>
      <div className="pg-export-row">
        <button onClick={exportPNG}>PNG</button>
        <button onClick={exportSVG}>SVG</button>
        <button onClick={exportHTML}>HTML</button>
        <button onClick={copySnippet}>REACT SNIPPET</button>
      </div>
      <ClipExport />
      <PlotterExport />
      <pre className="pg-snippet" tabIndex={0} aria-label="Component snippet">{snippetFor(state)}</pre>
    </section>
  )
}
