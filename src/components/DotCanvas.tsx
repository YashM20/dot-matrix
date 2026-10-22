import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { renderCanvas } from '../engine/renderer/canvasRenderer'
import { sampleLayers } from '../engine/sampler/gridSampler'
import { sharedClock } from '../engine/clock'
import { DataSprings, duration as motionDuration, ease, maskByName, revealDots, transitionDots, type MaskName } from '../engine/motion'
import { renderSVG } from '../engine/renderer/svgRenderer'
import type { DotInstance, DotStyle, Field, GridConfig, Layer, ThemeTokens } from '../engine'
import { dot480 } from '../engine'
import type { WidgetContext } from '../widgets/types'
import { useDotField } from '../hooks/useDotField'

export type RenderMode = 'svg' | 'canvas'
export interface DotCanvasProps {
  field?: Field
  layers?: (ctx: WidgetContext) => Layer[]
  data?: Record<string, number>
  grid: GridConfig
  style: DotStyle
  theme?: ThemeTokens
  /** Re-sample on the shared master clock (12 fps by default) — forces the Canvas renderer. */
  animated?: boolean
  fps?: number
  /** Bump to re-sample a static source (e.g. a clock on the minute). */
  tick?: number
  renderer?: RenderMode
  /**
   * Entrance: wait `delay` ms (the card is not even sampled until then — boards spread their
   * sampling cost over the stagger), then reveal the dots in `mask` order over `duration` ms.
   * Skipped under reduced motion. Read once at mount.
   */
  enter?: { delay: number; mask?: MaskName; duration?: number }
  /** Mask for change transitions (new data or minute tick dissolves the old frame into the new). `false` = hard cut. */
  change?: MaskName | false
  /**
   * Data keys smoothed by a critically damped spring: a change to one of them re-samples every
   * frame with the spring-interpolated value (no dissolve) until it settles. Opt-in per preset.
   */
  springKeys?: string[]
  onMode?: (mode: RenderMode) => void
  className?: string
}
const CANVAS_THRESHOLD = 2000
const MAX_BACKING_SCALE = 3
const CHANGE_MS = 360
/** Data-spring half-life (s): a value closes half the distance to its new target in this time. */
const SPRING_HALFLIFE = .12

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(cb: () => void) {
  const mql = window.matchMedia(reducedMotionQuery)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}
const usePrefersReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false)

/** True while the element is (near) the viewport. Only observes when `enabled`, so static cards pay nothing. */
function useOnScreen(ref: RefObject<Element | null>, enabled: boolean): boolean {
  const [onScreen, setOnScreen] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting), { rootMargin: '64px' })
    io.observe(el)
    return () => { io.disconnect(); setOnScreen(true) }
  }, [ref, enabled])
  return onScreen
}

/** Backing-store px per logical grid px: CSS upscale × devicePixelRatio, re-measured on resize and DPR change (zoom, monitor swap). */
function useBackingScale(ref: RefObject<HTMLCanvasElement | null>, enabled: boolean, width: number): number {
  const [scale, setScale] = useState(1)
  useEffect(() => {
    const canvas = ref.current
    if (!enabled || !canvas) return
    let mql: MediaQueryList | undefined
    function measure() {
      const css = canvas!.clientWidth / width || 1
      setScale(Math.min(MAX_BACKING_SCALE, Math.max(1, Math.round(css * (window.devicePixelRatio || 1) * 4) / 4)))
    }
    function watchDpr() {
      mql?.removeEventListener('change', onDprChange)
      mql = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
      mql.addEventListener('change', onDprChange)
    }
    function onDprChange() { measure(); watchDpr() }
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)
    watchDpr(); measure()
    return () => { ro.disconnect(); mql?.removeEventListener('change', onDprChange) }
  }, [ref, enabled, width])
  return scale
}

/** Same dots, same look? (A re-sample that changed nothing must not trigger a change transition.) */
function sameFrame(a: DotInstance[], b: DotInstance[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = b[i]
    if (p.x !== q.x || p.y !== q.y || p.r !== q.r || p.opacity !== q.opacity || p.color !== q.color) return false
  }
  return true
}

/** Short-lived animation drawn over the sampled frame: the entrance, or a change dissolve from the previous frame. */
type Transient = { kind: 'enter'; t0: number | null } | { kind: 'change'; t0: number | null; prev: DotInstance[] }
  | { kind: 'spring'; t0: number | null; sample: (data: Record<string, number>) => DotInstance[]; data: Record<string, number> }

/** Field → Grid Sampler → Renderer. Picks SVG for sparse static output, Canvas above ~2000 dots or when animated. */
export function DotCanvas({ field, layers, data, grid, style, theme = dot480, animated, fps, tick = 0, renderer, enter, change = 'ign', springKeys, onMode, className }: DotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const motion = !!animated && !reducedMotion
  // the observed element is whichever renderer is mounted; `mode` is stable for animated cards (always canvas unless forced)
  const onScreen = useOnScreen(renderer === 'svg' ? svgRef : canvasRef, motion)
  // live = drawn imperatively from the master clock (no React render per frame; the clock itself pauses
  // while the page is hidden). Otherwise the card is one sampled frame: t=0 for animated cards under
  // reduced motion or off-screen, `tick` for wall-clock cards.
  const live = motion && onScreen && !!layers

  // entrance: sampling waits for the stagger delay, so a board spreads its sampling cost over the stagger
  const [enterSpec] = useState(() => (enter && !window.matchMedia(reducedMotionQuery).matches ? enter : undefined))
  const [ready, setReady] = useState(!enterSpec)
  useEffect(() => {
    if (!enterSpec) return
    const id = window.setTimeout(() => setReady(true), enterSpec.delay)
    return () => window.clearTimeout(id)
  }, [enterSpec])

  const dots = useDotField(layers ? { layers } : { field: field ?? (() => 0) }, grid, style, theme, animated ? 0 : tick, data, ready)
  const pitch = grid.pitch ?? theme.gridPx
  const width = grid.cols * pitch, height = grid.rows * pitch

  // the ref drives frames; the `transient` state only keeps the canvas renderer mounted while one runs
  const transientRef = useRef<Transient | null>(enterSpec ? { kind: 'enter', t0: null } : null)
  const [transient, setTransient] = useState<Transient['kind'] | null>(enterSpec ? 'enter' : null)
  const shownRef = useRef<DotInstance[]>(dots), firstRef = useRef(true)
  // data springs: re-target on every data change; a static card runs a `spring` transient that
  // re-samples with the interpolated values (and skips the dissolve), a live card reads them per frame
  const springsRef = useRef<DataSprings | null>(null), springGoalRef = useRef(''), springKickRef = useRef(false)
  const dataKey = JSON.stringify(data ?? {})
  const springKey = springKeys?.join(',') ?? ''
  useLayoutEffect(() => {
    springKickRef.current = false
    if (!springKey) return
    const all = JSON.parse(dataKey) as Record<string, number>, target: Record<string, number> = {}
    for (const k of springKey.split(',')) if (typeof all[k] === 'number') target[k] = all[k]
    const goal = JSON.stringify(target), springs = springsRef.current ??= new DataSprings(SPRING_HALFLIFE)
    const moved = springGoalRef.current !== '' && springGoalRef.current !== goal
    springGoalRef.current = goal
    const now = sharedClock().time()
    // reduced motion / not yet entered / mid-entrance: jump straight to the new values
    if (reducedMotion || !ready || change === false || transientRef.current?.kind === 'enter') { springsRef.current = new DataSprings(SPRING_HALFLIFE); springsRef.current.set(target, now); return }
    springs.set(target, now)
    if (!moved || live || !layers) return
    const g = { cols: grid.cols, rows: grid.rows, pitch: grid.pitch }, t = animated ? 0 : tick
    const sample = (d: Record<string, number>) => sampleLayers(layers({ t, frame: 0, data: d, grid: g }), g, style, theme)
    transientRef.current = { kind: 'spring', t0: null, sample, data: all }
    springKickRef.current = true
    setTransient('spring')
  }, [dataKey, springKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // a new static frame (data edit, minute tick) dissolves from what is on screen now
  useLayoutEffect(() => {
    if (!ready || live) { shownRef.current = dots; return }
    if (firstRef.current) { firstRef.current = false; shownRef.current = dots; return }
    if (sameFrame(shownRef.current, dots)) return
    if (springKickRef.current) { springKickRef.current = false; shownRef.current = dots; return }
    if (change !== false && !reducedMotion && transientRef.current?.kind !== 'enter' && shownRef.current.length) {
      transientRef.current = { kind: 'change', t0: null, prev: shownRef.current }
      setTransient('change')
    }
    shownRef.current = dots
  }, [dots, ready, live]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => { let n = 0; for (const d of dots) if (d.opacity > 0 && d.r > 0) n++; return n }, [dots])
  // transients animate on canvas; a sparse card hands back to SVG when they finish
  const mode: RenderMode = renderer ?? (animated || transient || visible > CANVAS_THRESHOLD ? 'canvas' : 'svg')
  const svg = useMemo(() => mode === 'svg' ? renderSVG(dots, width, height) : '', [mode, dots, width, height])
  const scale = useBackingScale(canvasRef, mode === 'canvas', width)
  useEffect(() => { onMode?.(mode) }, [mode, onMode])

  const prepare = (canvas: HTMLCanvasElement) => {
    const context = canvas.getContext('2d')
    if (!context) return null
    const w = Math.round(width * scale), h = Math.round(height * scale)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    context.setTransform(scale, 0, 0, scale, 0, 0)
    return context
  }
  const draw = (canvas: HTMLCanvasElement, frame: DotInstance[]) => {
    const context = prepare(canvas)
    if (!context) return
    context.clearRect(0, 0, width, height)
    renderCanvas(context, frame)
  }
  /** Apply the running transient (if any) to a frame at clock time `t`; ends it when complete. */
  const applyTransient = (frame: DotInstance[], t: number): DotInstance[] => {
    const tr = transientRef.current
    if (!tr) return frame
    if (tr.t0 === null) tr.t0 = t
    const elapsed = t - tr.t0, geometry = { cols: grid.cols, rows: grid.rows, pitch }
    if (tr.kind === 'enter') {
      const p = ease.decelerate(elapsed / ((enterSpec?.duration ?? motionDuration.enter) / 1000))
      if (p >= 1) { transientRef.current = null; setTransient(null); return frame }
      return revealDots(frame, { ...geometry, p, mask: maskByName(enterSpec?.mask), edge: .06 })
    }
    if (tr.kind === 'spring') {
      const springs = springsRef.current
      if (!springs || springs.settled(t)) { transientRef.current = null; setTransient(null); return frame }
      try { return tr.sample({ ...tr.data, ...springs.at(t) }) }
      catch { transientRef.current = null; setTransient(null); return frame }
    }
    const p = ease.standard(elapsed / (CHANGE_MS / 1000))
    if (p >= 1) { transientRef.current = null; setTransient(null); return frame }
    return transitionDots(tr.prev, frame, { ...geometry, p, mask: maskByName(change || undefined), edge: .05 })
  }

  // transient on a static card: a short-lived 30 fps clock subscription (first frame drawn before paint)
  useLayoutEffect(() => {
    if (!ready || !transient || live || mode !== 'canvas') return
    const canvas = canvasRef.current
    if (!canvas) return
    const clock = sharedClock()
    draw(canvas, applyTransient(shownRef.current, clock.time()))
    return clock.subscribe({ fps: 30, onFrame: t => draw(canvas, applyTransient(shownRef.current, t)) })
  }, [ready, transient, live, mode, width, height, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  // static frame (also the paused / reduced-motion frame of an animated card)
  useEffect(() => {
    if (mode !== 'canvas' || live || transient) return
    const canvas = canvasRef.current
    if (canvas) draw(canvas, dots)
  }, [mode, live, transient, dots, width, height, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  // live frames straight from the master clock; a throwing frame keeps the last good one on screen
  const { cols, rows, pitch: gridPitch } = grid
  const { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps } = style
  useEffect(() => {
    if (!live || !ready || mode !== 'canvas' || !layers) return
    const canvas = canvasRef.current
    if (!canvas) return
    const g = { cols, rows, pitch: gridPitch }, s = { shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps }
    const frameData = JSON.parse(dataKey) as Record<string, number>
    let failed = false
    return sharedClock().subscribe({
      fps: fps ?? 12,
      onFrame(t: number, frame: number) {
        const d = springKey && springsRef.current ? { ...frameData, ...springsRef.current.at(t) } : frameData
        try { draw(canvas, applyTransient(sampleLayers(layers({ t, frame, data: d, grid: g }), g, s, theme), t)) }
        catch (error) {
          if (!failed) console.error('DotCanvas: frame failed, keeping the last good frame', error)
          failed = true
        }
      },
    })
  }, [live, ready, mode, layers, cols, rows, gridPitch, shape, sizeMin, sizeMax, cornerRoundness, opacityMode, jitter, quantizeSteps, theme, dataKey, springKey, fps, width, height, scale]) // eslint-disable-line react-hooks/exhaustive-deps

  if (mode === 'canvas') {
    return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: `${width} / ${height}` }} aria-hidden="true" />
  }
  return <div ref={svgRef} className={`dot-svg ${className ?? ''}`} style={{ aspectRatio: `${width} / ${height}`, width: '100%', height: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} aria-hidden="true" />
}
