import { useEffect, useMemo, useRef, useState } from 'react'
import type { DotInstance } from '../../engine'
import { ease, masks, maskByName, revealDots, transitionDots, type EaseName, type MaskName } from '../../engine/motion'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { widgetPresets, withChrome } from '../../widgets'
import { More } from '../More'
import { getTheme, resolveCurrent } from './render'
import { usePlayground } from './store'

type Mode = 'enter' | 'exit' | 'change'
const maskNames = Object.keys(masks) as MaskName[]
const easeNames = Object.keys(ease) as EaseName[]
const modes: Mode[] = ['enter', 'exit', 'change']

export function TransitionLab() {
  return <More id="tune-transitions" label="Enter & exit motion" tech="transition lab" className="more--panel"><TransitionPanel /></More>
}

/** Replays the engine's buffer-level transitions (revealDots / transitionDots) on the selected preset. */
function TransitionPanel() {
  const state = usePlayground()
  const [mask, setMask] = useState<MaskName>('bayer')
  const [ms, setMs] = useState(420)
  const [curve, setCurve] = useState<EaseName>('decelerate')
  const [mode, setMode] = useState<Mode>('enter')
  const [run, setRun] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // sample A (the preview, with its tweaked style) and B (the next preset, its own style) once per store change
  const { a, next, theme, frames } = useMemo(() => {
    const theme = getTheme(state), a = resolveCurrent(state)
    const next = widgetPresets[(Math.max(0, widgetPresets.findIndex(p => p.id === a.id)) + 1) % widgetPresets.length]
    const pitch = a.grid.pitch ?? theme.gridPx
    const prev = sampleLayers(a.layers({ t: 0, data: a.data }), a.grid, a.style, theme)
    const nextGrid = { ...next.grid, pitch: next.grid.pitch ?? theme.gridPx }
    const nextDots = sampleLayers(withChrome(next)({ t: 0, data: next.defaults ?? {} }), nextGrid, next.style, theme)
    const width = Math.max(a.grid.cols * pitch, nextGrid.cols * nextGrid.pitch), height = Math.max(a.grid.rows * pitch, nextGrid.rows * nextGrid.pitch)
    return { a, next, theme, frames: { prev, next: nextDots, width, height, geometry: { cols: Math.ceil(width / pitch), rows: Math.ceil(height / pitch), pitch } } }
  }, [state])

  useEffect(() => {
    const canvas = canvasRef.current, ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { prev, next: b, width, height, geometry } = frames
    canvas.width = width; canvas.height = height
    const m = maskByName(mask), curveFn = ease[curve]
    const frameAt = (p: number): DotInstance[] =>
      mode === 'change' ? transitionDots(prev, b, { ...geometry, p, mask: m, edge: .05 })
        : revealDots(prev, { ...geometry, p, mask: m, edge: .06, exit: mode === 'exit' })
    const draw = (p: number) => { ctx.clearRect(0, 0, width, height); renderCanvas(ctx, frameAt(p)) }
    if (!run) { draw(0); return } // rest frame until the first replay
    let raf = 0, t0: number | null = null
    const step = (now: number) => {
      t0 ??= now
      const linear = Math.min(1, (now - t0) / ms)
      draw(curveFn(linear))
      if (linear < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [frames, mask, ms, curve, mode, run])

  return (
    <section className="pg-panel pg-controls pg-tlab">
      <div className="pg-controls-head">
        <h2>TRANSITION LAB</h2>
        <div className="pg-controls-actions">
          <button onClick={() => setRun(r => r + 1)} title="Run the transition on the preview card">REPLAY</button>
        </div>
      </div>
      <div className="pg-tlab-stage" style={{ background: theme.bg }}>
        <canvas ref={canvasRef} style={{ aspectRatio: `${frames.width} / ${frames.height}` }} aria-hidden="true" />
      </div>
      <div className="pg-tlab-modes">
        {modes.map(x => <button key={x} className={x === mode ? 'on' : ''} aria-pressed={x === mode} onClick={() => { setMode(x); setRun(r => r + 1) }}>{x.toUpperCase()}</button>)}
      </div>
      <p className="pg-hint">{mode === 'change' ? `${a.name.toUpperCase()} → ${next.name.toUpperCase()}` : a.name.toUpperCase()}</p>
      <label>
        <span>MASK</span>
        <select value={mask} onChange={e => setMask(e.target.value as MaskName)}>{maskNames.map(x => <option key={x}>{x}</option>)}</select>
        <b>{mask.toUpperCase()}</b>
      </label>
      <label>
        <span>DURATION</span>
        <input type="range" min={150} max={1200} step={10} value={ms} onChange={e => setMs(+e.target.value)} />
        <b>{ms}MS</b>
      </label>
      <label>
        <span>EASING</span>
        <select value={curve} onChange={e => setCurve(e.target.value as EaseName)}>{easeNames.map(x => <option key={x}>{x}</option>)}</select>
        <b />
      </label>
    </section>
  )
}
