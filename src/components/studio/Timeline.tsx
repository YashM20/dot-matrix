/**
 * Timeline: scrub t, and the enter / change / exit tracks with their mask, ease and duration. The
 * ease curve and the mask order are drawn as small dot cards (Field → Sampler → Renderer).
 */
import { useEffect, useMemo, useRef } from 'react'
import { polylineCells } from '../../engine/layout'
import { ease, masks, type EaseName, type MaskName } from '../../engine/motion'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { dot480 } from '../../engine/theme/tokens'
import type { Field, GridConfig, Layer } from '../../engine/types'
import { tileStyle } from '../../widgets'
import type { Motion } from './doc'
import { Num } from './Inspector'
import { useCard, useStudio } from './store'
import { changePair, trackSpans, type Track } from './timeline'

const MASKS = Object.keys(masks) as MaskName[], EASES = Object.keys(ease) as EaseName[]
const LENGTHS = [1.5, 2, 3, 4, 6, 8, 12]
const MINI: GridConfig = { cols: 30, rows: 18, pitch: 2.25 }

/** A tiny dot card for editor chrome (curves, masks). */
export function MiniDots({ layers, grid = MINI, label }: { layers: Layer[]; grid?: GridConfig; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d')
    if (!c || !ctx) return
    const p = grid.pitch ?? 4, k = 2
    c.width = grid.cols * p * k; c.height = grid.rows * p * k
    ctx.setTransform(k, 0, 0, k, 0, 0)
    renderCanvas(ctx, sampleLayers(layers, grid, { ...tileStyle, quantizeSteps: 4 }, dot480))
  }, [layers, grid])
  const p = grid.pitch ?? 4
  return <canvas ref={ref} className="st-mini" style={{ width: grid.cols * p, height: grid.rows * p }} role="img" aria-label={label} />
}
const curveLayers = (name: EaseName): Layer[] => {
  const f = ease[name], pts: [number, number][] = []
  for (let i = 0; i <= 28; i++) pts.push([1 + i, MINI.rows - 2 - Math.round(f(i / 28) * (MINI.rows - 3))])
  return [{ field: polylineCells(MINI, [[1, MINI.rows - 1], [MINI.cols - 2, MINI.rows - 1]], 2, .35), tone: 'faint' }, { field: polylineCells(MINI, pts, 1, 1), tone: 'value' }]
}
const maskLayers = (name: MaskName): Layer[] => {
  const m = masks[name], f: Field = (u, v) => 1 - m(Math.round(u * (MINI.cols - 1)), Math.round(v * (MINI.rows - 1)), MINI.cols, MINI.rows)
  return [{ field: f, tone: 'mid' }]
}

function TrackRow({ track, motion, t0, t1, length }: { track: Track; motion: Motion; t0: number; t1: number; length: number }) {
  const edit = useStudio(s => s.edit), card = useCard()
  const set = (p: Partial<Motion>, tag?: string) => edit(c => ({ ...c, transitions: { ...c.transitions, [track]: { ...c.transitions[track], ...p } } }), tag)
  const curve = useMemo(() => curveLayers(motion.ease), [motion.ease]), mask = useMemo(() => maskLayers(motion.mask), [motion.mask])
  const [a, b] = changePair(card)
  return (
    <div className="st-track" role="group" aria-label={`${track} track`}>
      <div className="st-track-head"><b>{track.toUpperCase()}</b>{track === 'change' && <small>{a.toUpperCase()} → {b.toUpperCase()}</small>}</div>
      <div className="st-lane" aria-hidden="true"><i style={{ left: `${(t0 / length) * 100}%`, width: `${Math.max(.5, ((t1 - t0) / length) * 100)}%` }} /></div>
      <div className="st-track-opts">
        <label className="st-num"><span>MASK</span><select value={motion.mask} onChange={e => set({ mask: e.target.value as MaskName })}>{MASKS.map(m => <option key={m}>{m}</option>)}</select></label>
        <label className="st-num"><span>EASE</span><select value={motion.ease} onChange={e => set({ ease: e.target.value as EaseName })}>{EASES.map(m => <option key={m}>{m}</option>)}</select></label>
        <Num label="MS" value={motion.ms} min={0} max={5000} step={10} onChange={ms => set({ ms }, `ms:${track}`)} />
        {track === 'change' && <Num label="AT S" value={card.timeline.changeAt} min={0} max={card.timeline.length} step={.05} onChange={changeAt => edit(c => ({ ...c, timeline: { ...c.timeline, changeAt } }), 'changeAt')} />}
        <MiniDots layers={mask} label={`${motion.mask} mask order`} />
        <MiniDots layers={curve} label={`${motion.ease} ease curve`} />
      </div>
    </div>
  )
}

export function Timeline() {
  const card = useCard(), { t, playing, setT, setPlaying, edit, mode, setMode } = useStudio()
  const L = card.timeline.length, spans = trackSpans(card)
  return (
    <section className="pg-panel st-panel st-timeline" aria-label="Timeline">
      <h2>TIMELINE <small>{mode === 'timeline' ? 'PREVIEWING TRACKS' : 'LIVE (STATE MACHINE)'}</small></h2>
      <div className="st-transport">
        <button type="button" className="st-play" aria-label={playing ? 'Pause timeline' : 'Play timeline'} onClick={() => { setMode('timeline'); setPlaying(!playing) }}>{playing ? 'PAUSE' : 'PLAY'}</button>
        <div className="st-scrub">
          <input type="range" min={0} max={L} step={.01} value={Math.min(t, L)} aria-label="Timeline time t (seconds)" onChange={e => { setPlaying(false); setT(Number(e.target.value)) }} />
          <div className="st-playhead" aria-hidden="true" style={{ left: `${(Math.min(t, L) / L) * 100}%` }} />
        </div>
        <output className="st-t">t {t.toFixed(2)} s</output>
        <label className="st-num"><span>LENGTH</span><select value={L} onChange={e => edit(c => ({ ...c, timeline: { ...c.timeline, length: Number(e.target.value), changeAt: Math.min(c.timeline.changeAt, Number(e.target.value)) } }))}>{LENGTHS.map(x => <option key={x} value={x}>{x} s</option>)}</select></label>
        {mode === 'live' && <button type="button" onClick={() => setMode('timeline')}>BACK TO TIMELINE</button>}
      </div>
      {spans.map(s => <TrackRow key={s.track} track={s.track} motion={s.motion} t0={s.t0} t1={s.t1} length={L} />)}
    </section>
  )
}
