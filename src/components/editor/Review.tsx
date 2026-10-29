/**
 * EXPORT's two review folds (E5), loaded only when a fold opens (`React.lazy` in `Inspector.tsx`), so the
 * device simulators and the fidelity scorecard never ship with the editor:
 * - DEVICES: the frame through `toDevice` on every device profile (previews), and EXPORT ALL DEVICES (a PNG
 *   per profile at its own resolution, plus the plotter's pen plan as SVG).
 * - QUALITY: the scorecard (gates G1–G3, G5 and the metrics, the same code as `pnpm fidelity`) and the bar
 *   sheet (the frame beside the reference cards at 1×, 3×, blur and silhouette, as `pnpm snap --bar`).
 * Both are recomputed when the main thread is idle, after the frame stops changing.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { saveAs } from 'file-saver'
import type { DeviceFrame } from '../../engine/device'
import { cardPreset } from '../studio/doc'
import { deviceFile, deviceFrames, devicePixels, exportScale, plotterPlan } from './devices'
import type { EditorFrame } from './doc'
import { slug } from './exporters'
import { drawBarSheet, scoreCard, type Score } from './quality'
import { compiledOf } from './render'

/** Run when the main thread is idle (setTimeout where requestIdleCallback is missing, e.g. Safari). */
const idle = (fn: () => void, timeout: number): (() => void) => {
  if (typeof requestIdleCallback === 'function') { const h = requestIdleCallback(fn, { timeout }); return () => cancelIdleCallback(h) }
  const h = setTimeout(fn, 30); return () => clearTimeout(h)
}
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => { const h = setTimeout(() => setV(value), ms); return () => clearTimeout(h) }, [value, ms])
  return v
}
const presetOf = (f: EditorFrame) => cardPreset(f.card, compiledOf(f.card))

function paint(canvas: HTMLCanvasElement, fr: DeviceFrame, k = 1) {
  const src = document.createElement('canvas')
  src.width = fr.cols; src.height = fr.rows
  src.getContext('2d')!.putImageData(new ImageData(devicePixels(fr), fr.cols, fr.rows), 0, 0)
  canvas.width = fr.cols * k; canvas.height = fr.rows * k
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
}

export function Devices({ f, t }: { f: EditorFrame; t: number }) {
  const frame = useDebounced(f, 400), at = useDebounced(t, 200)
  const [frames, setFrames] = useState<DeviceFrame[]>([]), [status, setStatus] = useState(''), [busy, setBusy] = useState(false)
  const refs = useRef(new Map<string, HTMLCanvasElement>())
  useEffect(() => idle(() => { try { setFrames(deviceFrames(frame, at)) } catch (e) { setStatus(`failed: ${(e as Error).message}`) } }, 800), [frame, at])
  useEffect(() => { frames.forEach(fr => { const c = refs.current.get(fr.profile.id); if (c) paint(c, fr) }) }, [frames])
  const exportAll = async () => {
    setBusy(true); setStatus('')
    try {
      const name = slug(f.card.name), full = deviceFrames(f, t, false), files: string[] = []
      for (const fr of full) {
        const c = document.createElement('canvas'); paint(c, fr, exportScale(fr))
        const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/png'))
        if (blob) { saveAs(blob, deviceFile(name, fr)); files.push(`${fr.profile.id} ${fr.cols}×${fr.rows}`) }
      }
      const plan = full.map(plotterPlan).find(Boolean)
      if (plan) { saveAs(new Blob([plan], { type: 'image/svg+xml' }), `${name}-plotter-device.svg`); files.push('plotter pen plan SVG') }
      ;(window as { __editorDevices?: string[] }).__editorDevices = files
      setStatus(`${files.length} files: ${files.join(' · ')}`)
    } catch (e) { setStatus(`failed: ${(e as Error).message}`) } finally { setBusy(false) }
  }
  return <div className="ed-devices-wrap">
    <div className="ed-devices">{frames.map(fr => (
      <figure key={fr.profile.id}>
        <canvas ref={el => { if (el) refs.current.set(fr.profile.id, el) }} data-device={fr.profile.id} style={{ aspectRatio: `${fr.cols} / ${fr.rows}` }} role="img" aria-label={`${fr.profile.name} preview`} />
        <figcaption>{fr.profile.name.toUpperCase()}<small>{fr.cols}×{fr.rows} · {fr.profile.bits} BIT</small></figcaption>
      </figure>))}
      {!frames.length && <p className="ed-hint">Sampling onto each device…</p>}
    </div>
    <div className="ed-row-btns"><button type="button" disabled={busy} onClick={exportAll}>{busy ? 'EXPORTING…' : 'EXPORT ALL DEVICES'}</button></div>
    <p className="ed-hint">At t {t.toFixed(2)}: a PNG per device at its own resolution (TRMNL 800×480), and the plotter's pen plan as SVG.</p>
    {status && <p className="ed-hint ed-status" role="status">{status}</p>}
  </div>
}

export function Quality({ f, t }: { f: EditorFrame; t: number }) {
  const card = useDebounced(f, 500)
  const [s, setS] = useState<Score | null>(null), [err, setErr] = useState('')
  useEffect(() => idle(() => { try { setS(scoreCard(presetOf(card))); setErr('') } catch (e) { setErr((e as Error).message) } }, 800), [card])
  return <>
    {err ? <p className="ed-bad" role="alert">{err}</p> : s ? <Scorecard s={s} /> : <p className="ed-hint">Scoring…</p>}
    <BarSheet f={card} t={t} />
  </>
}

function Scorecard({ s }: { s: Score }) {
  const accent = s.g2.activeLayers + s.g2.activeDimLayers
  const rows: [string, boolean | null, string][] = [
    ['G1 DOT INTEGRITY', s.g1.pass, `off-grid ${s.g1.offGrid} · non-finite ${s.g1.nonFinite} · zero-r ${s.g1.zeroRadius}${s.g1.jitter ? ' · jitter (skipped)' : ''}`],
    ['G2 ONE ACCENT', null, `${accent} accent layer${accent === 1 ? '' : 's'} · ${s.g2.redDots} red dots`],
    ['G3 LATTICE LADDER', s.g3.pass, s.g3.offLadder.length ? `off ladder: ${s.g3.offLadder.join(', ')}` : `lattices ${s.g3.lattices.join(', ') || '1'}`],
    ['G5 PERF', s.g5.pass, `${s.g5.ms.toFixed(2)} ms / ${s.g5.budgetMs} ms ${s.animated ? 'frame' : 'mount'}`],
  ]
  const passed = rows.filter(r => r[1] === true).length, gated = rows.filter(r => r[1] !== null).length
  const hist = useMemo(() => { const m = Math.max(1, ...s.metrics.histogram); return s.metrics.histogram.map(n => Math.max(2, (n / m) * 100)) }, [s])
  return <div className="ed-score-wrap" aria-label="Scorecard">
    <p className="ed-score-sum"><b>{passed}/{gated}</b> GATES PASS</p>
    <ul className="ed-score">{rows.map(([name, ok, detail]) => <li key={name} className={ok === null ? 'info' : ok ? 'pass' : 'fail'}><b>{ok === null ? 'INFO' : ok ? 'PASS' : 'FAIL'}</b> {name}<small>{detail}</small></li>)}</ul>
    <dl className="ed-metrics">
      <dt>DOTS</dt><dd>{s.metrics.dots}</dd>
      <dt>TONAL HIST</dt><dd className="ed-hist" aria-label="Tonal histogram">{hist.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</dd>
      <dt>SPREAD p90−p10</dt><dd>{s.metrics.spread.toFixed(2)}</dd>
      <dt>INK COVERAGE</dt><dd>{s.metrics.coverage.toFixed(1)}%</dd>
      <dt>DENSITY vs HERO</dt><dd>{s.metrics.blockDistance} blocks</dd>
      {s.motion && <><dt>MOTION</dt><dd>{s.motion.cellsPerFrame.toFixed(2)} cells/frame · {(s.motion.changedFraction * 100).toFixed(0)}% changed</dd></>}
    </dl>
    <p className="ed-hint">G4 (the critic) and G6 (flash) need the CLI or a person; not shown.</p>
  </div>
}

function BarSheet({ f, t }: { f: EditorFrame; t: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [big, setBig] = useState(false), [ms, setMs] = useState(0)
  useEffect(() => idle(() => { if (ref.current) setMs(drawBarSheet(ref.current, presetOf(f), t)) }, 1200), [f]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className={`ed-bar${big ? ' ed-bar--big' : ''}`}>
    <p className="ed-score-sum">BAR SHEET <small>{ms ? `${ms.toFixed(0)} MS` : ''}</small></p>
    <div className="ed-bar-scroll"><canvas ref={ref} role="img" aria-label="Bar sheet: this frame beside level-03, afterlight, thermal-monitor and ui-toggle at 1×, 3×, blur and silhouette" /></div>
    <div className="ed-row-btns"><button type="button" aria-pressed={big} onClick={() => setBig(b => !b)}>{big ? 'FIT' : 'FULL SIZE'}</button></div>
  </div>
}
