/**
 * Studio sidebar: scorecard (the fidelity gates, same code as `pnpm fidelity`), the live bar sheet
 * (port of `pnpm snap --bar`), the export menu (every WORKSPACE export format, plus the document and
 * spec JSON) and `toDevice` previews for each device profile.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import { DEVICES, plotPaths, plotterSVG as devicePlotSVG, previewProfile, toDevice, type DeviceFrame, type DeviceId } from '../../engine/device'
import { renderSVG } from '../../engine/renderer/svgRenderer'
import { dot480 } from '../../engine/theme/tokens'
import { plotterSVG, recordClip, type ClipFormat } from '../../export'
import { More } from '../More'
import { cardPreset, cardToJSON, type StudioCard } from './doc'
import { specV0 } from './adapter'
import { drawBarSheet, scoreCard, type Score } from './sheet'
import { compiledOf, useCard, useStudio } from './store'
import { boundValues, timelineFrame, timelineSource, type FrameInput } from './playback'

const theme = dot480
const slug = (c: StudioCard) => (c.name || 'card').toLowerCase().replace(/[^\w-]+/g, '-').slice(0, 40)
const inputOf = (card: StudioCard): FrameInput => ({ card, compiled: compiledOf(card), theme, bound: boundValues(card.bindings, 0, Date.now()) })
/** Run when the main thread is idle (setTimeout where requestIdleCallback is missing, e.g. Safari). */
const idle = (fn: () => void, timeout: number): (() => void) => {
  if (typeof requestIdleCallback === 'function') { const h = requestIdleCallback(fn, { timeout }); return () => cancelIdleCallback(h) }
  const h = setTimeout(fn, 30); return () => clearTimeout(h)
}
const useDebounced = <T,>(value: T, ms: number) => {
  const [v, setV] = useState(value)
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h) }, [value, ms])
  return v
}

function Scorecard() {
  const card = useDebounced(useCard(), 350)
  const [s, setS] = useState<Score | null>(null)
  useEffect(() => idle(() => setS(scoreCard(cardPreset(card, compiledOf(card)))), 800), [card])
  if (!s) return <section className="pg-panel st-panel" aria-label="Scorecard"><h2>SCORECARD</h2><p className="st-hint">Scoring…</p></section>
  const accentLayers = s.g2.activeLayers + s.g2.activeDimLayers
  const rows: [string, boolean | null, string][] = [
    ['G1 DOT INTEGRITY', s.g1.pass, `off-grid ${s.g1.offGrid} · non-finite ${s.g1.nonFinite} · zero-r ${s.g1.zeroRadius}${s.g1.jitter ? ' · jitter (skipped)' : ''}`],
    ['G2 ONE ACCENT', null, `${accentLayers} accent layer${accentLayers === 1 ? '' : 's'} · ${s.g2.redDots} red dots`],
    ['G3 LATTICE LADDER', s.g3.pass, s.g3.offLadder.length ? `off ladder: ${s.g3.offLadder.join(', ')}` : `lattices ${s.g3.lattices.join(', ') || '1'}`],
    ['G5 PERF', s.g5.pass, `${s.g5.ms.toFixed(2)} ms / ${s.g5.budgetMs} ms ${s.animated ? 'frame' : 'mount'}`],
  ]
  const passed = rows.filter(r => r[1] === true).length, gated = rows.filter(r => r[1] !== null).length
  return (
    <section className="pg-panel st-panel" aria-label="Scorecard">
      <h2>SCORECARD <small>{passed}/{gated} GATES</small></h2>
      <ul className="st-score">
        {rows.map(([name, ok, detail]) => <li key={name} className={ok === null ? 'info' : ok ? 'pass' : 'fail'}><b>{ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}</b> {name}<small>{detail}</small></li>)}
      </ul>
      <dl className="st-metrics">
        <dt>DOTS</dt><dd>{s.metrics.dots}</dd>
        <dt>TONAL HIST</dt><dd className="st-hist" aria-label="Tonal histogram">{s.metrics.histogram.map((n, i) => { const m = Math.max(1, ...s.metrics.histogram); return <i key={i} style={{ height: `${Math.max(2, (n / m) * 100)}%` }} /> })}</dd>
        <dt>SPREAD p90−p10</dt><dd>{s.metrics.spread.toFixed(2)}</dd>
        <dt>INK COVERAGE</dt><dd>{s.metrics.coverage.toFixed(1)}%</dd>
        <dt>DENSITY vs HERO</dt><dd>{s.metrics.blockDistance} blocks</dd>
        {s.motion && <><dt>MOTION</dt><dd>{s.motion.cellsPerFrame.toFixed(2)} cells/frame · {(s.motion.changedFraction * 100).toFixed(0)}% changed</dd></>}
      </dl>
      <p className="st-hint">G4 (critic) and G6 (flash) need the CLI / a human; not shown.</p>
    </section>
  )
}

function BarSheet() {
  const card = useDebounced(useCard(), 600)
  const ref = useRef<HTMLCanvasElement>(null)
  const [big, setBig] = useState(false), [ms, setMs] = useState(0)
  useEffect(() => {
    return idle(() => { if (ref.current) setMs(drawBarSheet(ref.current, cardPreset(card, compiledOf(card)), useStudio.getState().t)) }, 1200)
  }, [card])
  return (
    <section className={`pg-panel st-panel st-bar${big ? ' st-bar--big' : ''}`} aria-label="Bar sheet">
      <h2>BAR SHEET <small>{ms ? `${ms.toFixed(0)} MS` : ''}</small></h2>
      <canvas ref={ref} role="img" aria-label="Bar sheet: this card beside level-03, afterlight, thermal-monitor and ui-toggle at 1×, 3×, blur and silhouette" />
      <button type="button" onClick={() => setBig(b => !b)} aria-pressed={big}>{big ? 'CLOSE' : 'FULL SIZE'}</button>
    </section>
  )
}

const FORMATS: ClipFormat[] = ['apng', 'gif', 'webm', 'mp4']
function svgOf(card: StudioCard, t: number) {
  const pitch = card.grid.pitch ?? 4
  return renderSVG(timelineFrame(inputOf(card), t), card.grid.cols * pitch, card.grid.rows * pitch)
}
function pngOf(svg: string, scale = 3): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const m = svg.match(/width="([\d.]+)" height="([\d.]+)"/), w = m ? +m[1] : 400, h = m ? +m[2] : 300, img = new Image()
    img.onload = () => { const c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; const x = c.getContext('2d')!; x.fillStyle = theme.surface; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png') }
    img.onerror = () => reject(new Error('svg did not load'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

function ExportMenu() {
  const card = useCard()
  const [format, setFormat] = useState<ClipFormat>('apng'), [fps, setFps] = useState(24), [scale, setScale] = useState(1)
  const [progress, setProgress] = useState<number | null>(null), [status, setStatus] = useState('')
  const abort = useRef<AbortController | null>(null)
  const name = slug(card)
  const record = async () => {
    abort.current = new AbortController(); setProgress(0); setStatus('')
    try {
      const clip = await recordClip(timelineSource(card, compiledOf(card), theme), { format, seconds: card.timeline.length, fps, scale, signal: abort.current.signal, onProgress: (d, n) => setProgress(d / n) })
      saveAs(clip.blob, `${name}.${clip.ext}`)
      ;(window as { __studioClip?: unknown }).__studioClip = { format, size: clip.blob.size, frames: clip.frames, durationMs: clip.durationMs, width: clip.width, height: clip.height, via: clip.via }
      setStatus(`${clip.ext.toUpperCase()} ${clip.width}×${clip.height} · ${clip.frames} frames · ${(clip.durationMs / 1000).toFixed(2)} s · ${(clip.blob.size / 1024).toFixed(1)} KB · ${clip.via}`)
    } catch (e) { setStatus(e instanceof DOMException && e.name === 'AbortError' ? 'cancelled' : `failed: ${(e as Error).message}`) }
    finally { setProgress(null); abort.current = null }
  }
  const t = () => useStudio.getState().t
  const spec = () => { const { spec, dropped } = specV0.toSpec(card); saveAs(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), `${name}.spec.json`); setStatus(dropped.length ? `spec v0: dropped ${dropped.length} non-IR layer(s): ${dropped.join(', ')}` : 'spec v0 written') }
  const plot = () => { const pitch = card.grid.pitch ?? 4, r = plotterSVG(timelineFrame(inputOf(card), t()), card.grid.cols * pitch, card.grid.rows * pitch); saveAs(new Blob([r.svg], { type: 'image/svg+xml' }), `${name}-plot.svg`); setStatus(`plotter: ${r.strokes.length} strokes · travel ${(r.travelMm / 1000).toFixed(2)} m`) }
  return (
    <section className="pg-panel st-panel" aria-label="Export">
      <h2>EXPORT <small>AT t {useStudio(s => s.t).toFixed(2)}</small></h2>
      <div className="st-row st-wrap">
        <button type="button" onClick={async () => saveAs(await pngOf(svgOf(card, t())), `${name}.png`)}>PNG</button>
        <button type="button" onClick={() => saveAs(new Blob([svgOf(card, t())], { type: 'image/svg+xml' }), `${name}.svg`)}>SVG</button>
        <button type="button" onClick={() => saveAs(new Blob([`<!doctype html><html><body style="background:${theme.bg};display:grid;place-items:center;height:100vh;margin:0">${svgOf(card, t())}</body></html>`], { type: 'text/html' }), `${name}.html`)}>HTML</button>
      </div>
      <More id="compose-export-more" label="Plotter, JSON & spec" tech="plotter SVG, doc JSON, spec v0">
        <div className="st-row st-wrap">
          <button type="button" onClick={plot}>PLOTTER SVG</button>
          <button type="button" onClick={() => saveAs(new Blob([cardToJSON(card)], { type: 'application/json' }), `${name}.studio.json`)}>DOC JSON</button>
          <button type="button" onClick={spec}>SPEC v0</button>
        </div>
      </More>
      <div className="st-row st-wrap">
        <b className="st-lbl">CLIP · TIMELINE {card.timeline.length} S</b>
        <select aria-label="Clip format" value={format} onChange={e => setFormat(e.target.value as ClipFormat)}>{FORMATS.map(f => <option key={f} value={f}>{f.toUpperCase()}</option>)}</select>
        <select aria-label="Frames per second" value={fps} onChange={e => setFps(+e.target.value)}>{[12, 15, 24, 30, 60].map(f => <option key={f} value={f}>{f} FPS</option>)}</select>
        <select aria-label="Clip scale" value={scale} onChange={e => setScale(+e.target.value)}>{[1, 2, 3].map(s => <option key={s} value={s}>{s}×</option>)}</select>
        {progress === null ? <button type="button" className="st-record" onClick={record}>RECORD</button> : <button type="button" onClick={() => abort.current?.abort()}>CANCEL</button>}
      </div>
      {progress !== null && <progress value={progress} max={1} aria-label="Export progress" />}
      {status && <p className="st-hint st-status" role="status">{status}</p>}
    </section>
  )
}

/** Preview sizes: the TRMNL panel is shown at ¼ resolution (its dither then lives at the preview pitch). */
const PREVIEW_K: Partial<Record<DeviceId, number>> = { 'trmnl-800x480': .25 }
function drawDevice(canvas: HTMLCanvasElement, f: DeviceFrame) {
  canvas.width = f.cols; canvas.height = f.rows
  const ctx = canvas.getContext('2d')!, img = ctx.createImageData(f.cols, f.rows)
  const paper = f.profile.physics?.kind === 'eink' || f.profile.physics?.kind === 'plotter'
  for (let i = 0; i < f.out.length; i++) {
    const v = f.mask[i] ? f.out[i] : 0, g = paper ? Math.round(235 - v * 215) : Math.round(18 + v * 237)
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = f.mask[i] ? g : 7; img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
}
function Devices() {
  const card = useDebounced(useCard(), 400), t = useDebounced(useStudio(s => s.t), 200)
  const refs = useRef(new Map<string, HTMLCanvasElement>())
  const ids = Object.keys(DEVICES) as DeviceId[]
  const frames = useMemo(() => {
    const pitch = card.grid.pitch ?? 4, dots = timelineFrame(inputOf(card), t)
    const src = { dots, width: card.grid.cols * pitch, height: card.grid.rows * pitch, style: card.style, pitch }
    return ids.map(id => { const k = PREVIEW_K[id], p = k ? previewProfile(DEVICES[id], k) : DEVICES[id]; return toDevice(src, p, { theme }) })
  }, [card, t]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { frames.forEach(f => { const c = refs.current.get(f.profile.id); if (c) drawDevice(c, f) }) }, [frames])
  const exportAll = async () => {
    const name = slug(card)
    for (const f of frames) {
      const c = refs.current.get(f.profile.id)
      if (!c) continue
      const up = document.createElement('canvas'), k = Math.max(1, Math.round(480 / Math.max(f.cols, f.rows)))
      up.width = f.cols * k; up.height = f.rows * k
      const x = up.getContext('2d')!; x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, up.width, up.height)
      const blob = await new Promise<Blob | null>(r => up.toBlob(r, 'image/png'))
      if (blob) saveAs(blob, `${name}-${f.profile.id.replace('@', '-')}.png`)
    }
    const plotter = frames.find(f => f.profile.physics?.kind === 'plotter')
    if (plotter && plotter.profile.physics?.kind === 'plotter') saveAs(new Blob([devicePlotSVG(plotPaths(plotter, plotter.profile.physics))], { type: 'image/svg+xml' }), `${name}-plotter-device.svg`)
  }
  return (
    <section className="pg-panel st-panel" aria-label="Devices">
      <h2>DEVICES <small>toDevice AT t {t.toFixed(2)}</small></h2>
      <div className="st-devices">
        {frames.map(f => (
          <figure key={f.profile.id}>
            <canvas ref={el => { if (el) refs.current.set(f.profile.id, el) }} style={{ width: f.cols >= f.rows ? 132 : (132 * f.cols) / f.rows, aspectRatio: `${f.cols} / ${f.rows}` }} role="img" aria-label={`${f.profile.name} preview`} />
            <figcaption>{f.profile.name.toUpperCase()}<small>{f.cols}×{f.rows} · {f.profile.bits} BIT</small></figcaption>
          </figure>
        ))}
      </div>
      <button type="button" onClick={exportAll}>EXPORT ALL DEVICES</button>
    </section>
  )
}

export function SidePanel() {
  return (
    <div className="st-side" role="region" aria-label="Review and export">
      <ExportMenu />
      <More id="compose-scorecard" label="Quality checks" tech="scorecard" className="more--panel"><Scorecard /></More>
      <More id="compose-barsheet" label="Speed" tech="bar sheet" className="more--panel"><BarSheet /></More>
      <More id="compose-devices" label="Device preview" tech="toDevice" className="more--panel"><Devices /></More>
    </div>
  )
}
