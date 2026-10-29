/**
 * Per-card X-ray overlay: the sampler grid (card lattice + coarser layer lattices), a crosshair and the
 * winning dot's box under the pointer, a tooltip that explains that dot (value → size step, tone,
 * layer), and a HUD strip (renderer, fps, dot count, grid). Mounted only while the card is X-rayed;
 * it never touches the card's canvas (it is a sibling drawn on top, `pointer-events: none`).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { quantizeTime, sharedClock } from '../../engine/clock'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import type { DotStyle, GridConfig, Layer, ThemeTokens } from '../../engine'
import type { WidgetContext, WidgetPreset } from '../../widgets/types'
import { workerPresetId } from '../../workers/client'
import { fmt, probeDot, type DotProbe } from './probe'
import { probes, setXR, xrState, type CardProbe } from './store'
import type { XRayHook } from './useXRay'

export interface XRayOverlayProps {
  xr: XRayHook
  preset: WidgetPreset
  /** The card's full layer function (before solo / mute). */
  layers: (ctx: WidgetContext) => Layer[]
  data: Record<string, number>
  grid: GridConfig
  style: DotStyle
  theme: ThemeTokens
  animated: boolean
  fps?: number
  tick?: number
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const workerOff = () => typeof Worker === 'undefined' || new URLSearchParams(location.search).get('worker') === '0'

export function XRayOverlay({ xr, preset, layers, data, grid, style, theme, animated, fps, tick = 0 }: XRayOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null), canvasRef = useRef<HTMLCanvasElement>(null)
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [hover, setHover] = useState<{ p: DotProbe; x: number; y: number } | null>(null)
  const [stats, setStats] = useState({ fps: 0, dots: 0, t: 0, mode: 'svg', worker: false })
  const cardFps = fps ?? (animated && !reduced() ? 12 : 0)
  const live = useRef({ layers, data, grid, style, skip: xr.skip, tick, animated, cardFps })
  useLayoutEffect(() => { live.current = { layers, data, grid, style, skip: xr.skip, tick, animated, cardFps } })
  const pointer = useRef<{ fx: number; fy: number; x: number; y: number } | null>(null)

  /** Board time the card is showing now (the static frame of a non-animated card is sampled at `tick`). */
  const nowT = () => { const c = live.current; return c.animated && c.cardFps ? quantizeTime(sharedClock().time(), c.cardFps).t : c.tick }
  const frameLayers = (t: number) => { const c = live.current; try { return c.layers({ t, frame: 0, data: c.data, grid: { cols: c.grid.cols, rows: c.grid.rows, pitch: c.grid.pitch } }) } catch { return [] } }

  // follow the card's surface (canvas / svg / a11y root): the overlay box is the dot grid, exactly
  useLayoutEffect(() => {
    const root = rootRef.current, body = root?.parentElement
    if (!root || !body) return
    // the first box-generating element: the OLED skin wrapper (`.skin-surface`) is `display: contents`, so
    // it has no rect of its own; step into it (past the skin overlay) to the canvas / svg it wraps
    const surface = () => {
      let s = [...body.children].find(el => el !== root && !el.classList.contains('xr-overlay')) as HTMLElement | undefined
      while (s && getComputedStyle(s).display === 'contents') s = [...s.children].find(el => !el.classList.contains('skin-overlay')) as HTMLElement | undefined
      return s
    }
    let observed: HTMLElement | undefined
    const ro = new ResizeObserver(() => measure())
    const mo = new MutationObserver(() => measure())
    const measure = () => {
      const s = surface(); if (!s) return
      if (s !== observed) {
        if (observed) ro.unobserve(observed)
        ro.observe(s); observed = s
        // the surface swaps (svg ↔ canvas) inside its wrapper on transients: watch the wrapper too
        if (s.parentElement && s.parentElement !== body) mo.observe(s.parentElement, { childList: true })
      }
      const b = body.getBoundingClientRect(), r = s.getBoundingClientRect()
      setBox(prev => {
        const next = { left: r.left - b.left + body.scrollLeft, top: r.top - b.top + body.scrollTop, width: r.width, height: r.height }
        return prev && Math.abs(prev.left - next.left) < .5 && Math.abs(prev.top - next.top) < .5 && Math.abs(prev.width - next.width) < .5 && Math.abs(prev.height - next.height) < .5 ? prev : next
      })
    }
    ro.observe(body)
    mo.observe(body, { childList: true })
    measure()
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])

  // hover: listen on the card body (the overlay itself lets every pointer event through to the card)
  useEffect(() => {
    const root = rootRef.current, body = root?.parentElement
    if (!root || !body) return
    let raf = 0
    const update = () => {
      raf = 0
      const p = pointer.current
      if (!p) { setHover(null); return }
      const c = live.current
      setHover({ p: probeDot(frameLayers(nowT()), c.grid, c.style, p.fx, p.fy, c.skip), x: p.x, y: p.y })
    }
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect()
      if (!r.width || !r.height) return
      const x = e.clientX - r.left, y = e.clientY - r.top
      if (x < 0 || y < 0 || x >= r.width || y >= r.height) { pointer.current = null }
      else pointer.current = { fx: (x / r.width) * live.current.grid.cols, fy: (y / r.height) * live.current.grid.rows, x, y }
      if (!raf) raf = requestAnimationFrame(update)
    }
    const onLeave = () => { pointer.current = null; if (!raf) raf = requestAnimationFrame(update) }
    const onEnter = () => { if (xrState().active !== xr.key) setXR({ active: xr.key }) }
    body.addEventListener('pointermove', onMove)
    body.addEventListener('pointerleave', onLeave)
    body.addEventListener('pointerenter', onEnter)
    // an animated card changes under a still pointer: re-probe a few times a second
    const timer = window.setInterval(() => { if (pointer.current && live.current.animated && !raf) raf = requestAnimationFrame(update) }, 150)
    return () => { body.removeEventListener('pointermove', onMove); body.removeEventListener('pointerleave', onLeave); body.removeEventListener('pointerenter', onEnter); clearInterval(timer); cancelAnimationFrame(raf) }
  }, [xr.key]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Is the card's live frame sampled in the worker? (the same test `remoteSampler` runs) */
  function workerOn() { return xr.mode() === 'canvas' && animated && !reduced() && !workerOff() && !!workerPresetId(xr.layers ?? {}) }

  // live stats: dots drawn now (re-sampled off the card's own path: once per data / solo / mute change, and
  // once a second while animated) and the frames the clock delivered at the card's rate
  const dataKey = JSON.stringify(data)
  useEffect(() => {
    let frames = 0, last = performance.now(), measured = 0
    const off = cardFps ? sharedClock().subscribe({ fps: cardFps, onFrame: () => { frames++ } }) : () => {}
    const sample = () => {
      const c = live.current, t = nowT(), now = performance.now()
      if (now - last >= 900) { measured = cardFps ? Math.round((frames * 1000) / (now - last)) : 0; frames = 0; last = now }
      let dots = 0
      try { for (const d of sampleLayers(frameLayers(t).filter((_, i) => !c.skip(i)), c.grid, c.style, theme)) if (d.opacity > 0 && d.r > 0) dots++ } catch { /* keep 0 */ }
      const mode = xr.mode(), worker = workerOn()
      setStats(s => (s.dots === dots && s.fps === measured && s.t === t && s.mode === mode && s.worker === worker ? s : { fps: measured, dots, t, mode, worker }))
    }
    sample()
    // static cards: a slow poll still catches renderer swaps (svg ↔ canvas around a dissolve)
    const timer = window.setInterval(sample, cardFps ? 1000 : 2000)
    return () => { clearInterval(timer); off() }
  }, [cardFps, theme, dataKey, xr.skip]) // eslint-disable-line react-hooks/exhaustive-deps

  // publish what the inspector needs
  const worker = () => stats.worker
  const probe: CardProbe = { key: xr.key, preset, layers, data, grid, style, theme, animated, fps: cardFps, mode: xr.mode, worker, stats }
  // on commit, not during render: a render React throws away (a sibling suspending on a lazy board chunk)
  // would otherwise leave a probe behind for a card that never showed an overlay (the shell's `fps` listed those)
  useLayoutEffect(() => { probes.set(xr.key, probe) })
  useEffect(() => () => { probes.delete(xr.key) }, [xr.key])

  // draw the grid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !box) return
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = box.width, H = box.height
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
    const g = canvas.getContext('2d'); if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H)
    const cw = W / grid.cols, ch = H / grid.rows
    const line = (x0: number, y0: number, x1: number, y1: number) => { g.moveTo(Math.round(x0) + .5, Math.round(y0) + .5); g.lineTo(Math.round(x1) + .5, Math.round(y1) + .5) }
    // card lattice: every cell when it is big enough, else every n-th; majors every 16 cells
    const step = cw >= 5 ? 1 : Math.ceil(5 / cw)
    // the ink is the theme's --tint (`.xr-grid { color }` in App.css: white on dark, ink on paper, the card's own
    // scheme on a dark inset); each guide is that ink at an alpha
    const ink = getComputedStyle(canvas).color || '#fff', at = (a: number) => { g.strokeStyle = g.fillStyle = ink; g.globalAlpha = a }
    g.beginPath(); at(.07); g.lineWidth = 1
    for (let c = 0; c <= grid.cols; c += step) line(c * cw, 0, c * cw, H)
    for (let r = 0; r <= grid.rows; r += step) line(0, r * ch, W, r * ch)
    g.stroke()
    g.beginPath(); at(.16)
    for (let c = 0; c <= grid.cols; c += 16) line(c * cw, 0, c * cw, H)
    for (let r = 0; r <= grid.rows; r += 16) line(0, r * ch, W, r * ch)
    g.stroke()
    // coarser layer lattices: dashed, inside each layer's bounds when it has some
    const seen = new Set<string>()
    for (const l of frameLayers(stats.t)) {
      const [kx, ky] = typeof l.lattice === 'object' ? l.lattice : [l.lattice ?? 1, l.lattice ?? 1]
      if (l.sites || (kx === 1 && ky === 1 && !l.origin)) continue
      const [ox, oy] = l.origin ?? [0, 0], id = `${kx}x${ky}|${ox},${oy}`
      if (seen.has(id)) continue
      seen.add(id)
      g.beginPath(); g.setLineDash([2, 3]); at(.22)
      for (let x = ox; x <= grid.cols + 1e-6; x += kx) line(x * cw, oy * ch, x * cw, H)
      for (let y = oy; y <= grid.rows + 1e-6; y += ky) line(ox * cw, y * ch, W, y * ch)
      g.stroke(); g.setLineDash([])
    }
    // the hovered dot: crosshair + its box (a site is a circle)
    if (hover) {
      const { p } = hover, [bx, by, bw, bh] = p.box
      at(.06)
      g.fillRect(0, by * ch, W, bh * ch); g.fillRect(bx * cw, 0, bw * cw, H)
      at(.92); g.lineWidth = 1.25
      g.beginPath()
      if (p.kind === 'site') g.arc((bx + bw / 2) * cw, (by + bh / 2) * ch, (bw / 2) * cw + 1, 0, Math.PI * 2)
      else g.rect(bx * cw - .5, by * ch - .5, bw * cw + 1, bh * ch + 1)
      g.stroke()
    }
    g.globalAlpha = 1
    // `theme`: a theme switch re-inks the guides (the card's tokens object changes with it)
  }, [box, hover, grid.cols, grid.rows, stats.t, theme]) // eslint-disable-line react-hooks/exhaustive-deps

  const mode = stats.mode, w = stats.worker
  const tip = hover?.p
  const flipX = hover && box ? hover.x > box.width * .55 : false, flipY = hover && box ? hover.y > box.height * .6 : false
  return (
    <div ref={rootRef} className="xr-overlay" style={box ? { left: box.left, top: box.top, width: box.width, height: box.height } : { display: 'none' }} aria-hidden="true">
      <canvas ref={canvasRef} className="xr-grid" />
      <div className="xr-hud">
        <b>X-RAY</b><span>{mode.toUpperCase()}{w ? ' · WORKER' : ''}</span>
        <span>{animated && cardFps ? `${stats.fps}/${cardFps} FPS` : 'STATIC'}</span>
        <span>{stats.dots.toLocaleString('en-US')} DOTS</span><span>{grid.cols}×{grid.rows}</span>
        {animated && <span>T {stats.t.toFixed(2)}</span>}
      </div>
      {tip && hover && <div className={`xr-tip${flipX ? ' xr-tip--left' : ''}${flipY ? ' xr-tip--up' : ''}`} style={{ left: hover.x, top: hover.y }}>
        <div className="xr-tip-dim">c{tip.col} r{tip.row} · u {fmt(tip.u)} v {fmt(tip.v)}</div>
        {tip.layer < 0 ? <div>empty cell · no layer lit</div> : <>
          <div>value <b>{fmt(tip.value)}</b>{tip.steps ? <> → size step <b>{tip.step}</b>/{tip.steps - 1}</> : <> (unquantized)</>} · r {tip.r.toFixed(2)}px</div>
          <div>tone <b>{tip.tone}</b> · layer <b>{tip.layer}</b> {layerLabel(tip)}</div>
          <div className="xr-tip-dim">{tip.kind === 'card' ? 'card lattice' : tip.kind === 'lattice' ? `lattice ${tip.box[2]}× dot` : `site dot ${tip.box[2]}×`}</div>
        </>}
      </div>}
    </div>
  )
}
const layerLabel = (p: DotProbe) => (p.name.startsWith('"') ? p.name : `'${p.name}'`)
