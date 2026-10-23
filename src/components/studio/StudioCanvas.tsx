/**
 * The Studio preview: the document sampled through the engine (layers → sampleLayers → renderCanvas),
 * with the timeline tracks or a fired state transition applied at the buffer level (revealDots /
 * transitionDots). Canvas renderer: 144² cards are > 2000 dots and animate (DESIGN.md renderer rule).
 * One rAF loop reads the store directly; it only redraws when something changed or time moves.
 */
import { useEffect, useRef, type PointerEvent } from 'react'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { dot480 } from '../../engine/theme/tokens'
import type { DotInstance } from '../../engine/types'
import { compiledOf, useCard, useStudio } from './store'
import { boundValues, firingFrame, sampleCard, stateData, timelineFrame, type FrameInput } from './playback'

declare global { interface Window { __studio?: { frameMs: number; maxMs: number; frames: number; dots: number; lit: number } } }
const SCALE = 1.5

export function StudioCanvas() {
  const card = useCard()
  const ref = useRef<HTMLCanvasElement>(null)
  const pointer = useRef<{ x: number; y: number; down: boolean } | undefined>(undefined)
  const dirty = useRef(true)
  const pitch = card.grid.pitch ?? 4, W = card.grid.cols * pitch, H = card.grid.rows * pitch

  useEffect(() => useStudio.subscribe(() => { dirty.current = true }), [])
  useEffect(() => {
    const canvas = ref.current, ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const k = SCALE * Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(W * k); canvas.height = Math.round(H * k)
    dirty.current = true
    const stats = (window.__studio = { frameMs: 0, maxMs: 0, frames: 0, dots: 0, lit: 0 })
    const wall0 = performance.now()
    let raf = 0, last = performance.now(), lastLive = 0, lastPublish = 0
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const s = useStudio.getState(), c = s.h.present, dt = Math.min(.1, (now - last) / 1000)
      last = now
      const compiled = compiledOf(c), animated = c.animated || compiled.usesT
      if (s.mode === 'timeline' && s.playing) {
        const t = (s.t + dt) % c.timeline.length
        s.t = t // read back by the next frame; published below at ~15 Hz
        if (now - lastPublish > 66) { lastPublish = now; useStudio.setState({ t }) }
        dirty.current = true
      }
      const live = s.mode === 'live'
      if (live && (s.firing || (animated && now - lastLive > 33) || c.bindings.some(b => b.kind === 'source'))) { lastLive = now; dirty.current = true }
      if (!dirty.current) return
      dirty.current = false
      const t = live ? (animated ? (now - wall0) / 1000 : s.t) : s.t
      const p = pointer.current
      const inp: FrameInput = { card: c, compiled, theme: dot480, pointer: p, bound: boundValues(c.bindings, t, Date.now(), p && { u: p.x / c.grid.cols, v: p.y / c.grid.rows }) }
      const a = performance.now()
      let dots: DotInstance[]
      if (!live) dots = timelineFrame(inp, t)
      else if (s.firing) {
        const f = firingFrame(inp, t, s.firing, now)
        dots = f.dots
        if (f.done) s.settle()
      } else dots = sampleCard(inp, t, stateData(c, s.state))
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.fillStyle = dot480.surface; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.setTransform(k, 0, 0, k, 0, 0)
      renderCanvas(ctx, dots)
      const ms = performance.now() - a
      stats.frameMs = ms; stats.maxMs = Math.max(stats.maxMs, ms); stats.frames++; stats.dots = dots.length
      stats.lit = dots.reduce((n, d) => n + (d.opacity > 0 && d.r > 0 ? 1 : 0), 0)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [W, H])

  const onPointer = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    pointer.current = { x: ((e.clientX - r.left) / r.width) * card.grid.cols, y: ((e.clientY - r.top) / r.height) * card.grid.rows, down: e.buttons > 0 }
    dirty.current = true
  }
  return (
    <div className="st-stage">
      <canvas ref={ref} className="st-canvas" style={{ width: W * SCALE, height: H * SCALE }} role="img" aria-label={`Preview of ${card.name}`}
        onPointerMove={onPointer} onPointerDown={onPointer} onPointerUp={onPointer} onPointerLeave={() => { pointer.current = undefined; dirty.current = true }} />
    </div>
  )
}
