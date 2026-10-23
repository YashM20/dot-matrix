import { saveAs } from 'file-saver'
import { usePlayground } from './store'
import { getTheme, renderCurrentSVG, snippetFor } from './render'

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
      <pre className="pg-snippet" tabIndex={0} aria-label="Component snippet">{snippetFor(state)}</pre>
    </section>
  )
}
