import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { renderCanvas } from '../engine/renderer/canvasRenderer'
import { renderSVG } from '../engine/renderer/svgRenderer'
import type { DotStyle, Field, GridConfig, Layer, ThemeTokens } from '../engine'
import { dot480 } from '../engine'
import type { WidgetContext } from '../widgets/types'
import { useClock, useDotField } from '../hooks/useDotField'

export type RenderMode = 'svg' | 'canvas'
export interface DotCanvasProps {
  field?: Field
  layers?: (ctx: WidgetContext) => Layer[]
  data?: Record<string, number>
  grid: GridConfig
  style: DotStyle
  theme?: ThemeTokens
  /** Re-sample on a running clock (12 fps by default) — forces the Canvas renderer. */
  animated?: boolean
  fps?: number
  /** Bump to re-sample a static source (e.g. a clock on the minute). */
  tick?: number
  renderer?: RenderMode
  onMode?: (mode: RenderMode) => void
  className?: string
}
const CANVAS_THRESHOLD = 2000
const MAX_BACKING_SCALE = 3

const reducedMotionQuery = '(prefers-reduced-motion: reduce)'
function subscribeReducedMotion(cb: () => void) {
  const mql = window.matchMedia(reducedMotionQuery)
  mql.addEventListener('change', cb)
  return () => mql.removeEventListener('change', cb)
}
function subscribeVisibility(cb: () => void) {
  document.addEventListener('visibilitychange', cb)
  return () => document.removeEventListener('visibilitychange', cb)
}
const usePrefersReducedMotion = () => useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(reducedMotionQuery).matches, () => false)
const usePageVisible = () => useSyncExternalStore(subscribeVisibility, () => document.visibilityState !== 'hidden', () => true)

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

/** Field → Grid Sampler → Renderer. Picks SVG for sparse static output, Canvas above ~2000 dots or when animated. */
export function DotCanvas({ field, layers, data, grid, style, theme = dot480, animated, fps, tick = 0, renderer, onMode, className }: DotCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const svgRef = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()
  const pageVisible = usePageVisible()
  const motion = !!animated && !reducedMotion
  // the observed element is whichever renderer is mounted; `mode` is stable for animated cards (always canvas unless forced)
  const onScreen = useOnScreen(renderer === 'svg' ? svgRef : canvasRef, motion)
  // paused (off-screen / hidden tab / reduced motion) → clock stops and the card holds a single static frame at t=0
  const t = useClock(motion && pageVisible && onScreen, fps)
  const dots = useDotField(layers ? { layers } : { field: field ?? (() => 0) }, grid, style, theme, animated ? t : tick, data)
  const pitch = grid.pitch ?? theme.gridPx
  const width = grid.cols * pitch, height = grid.rows * pitch
  const visible = useMemo(() => { let n = 0; for (const d of dots) if (d.opacity > 0 && d.r > 0) n++; return n }, [dots])
  const mode: RenderMode = renderer ?? (animated || visible > CANVAS_THRESHOLD ? 'canvas' : 'svg')
  const svg = useMemo(() => mode === 'svg' ? renderSVG(dots, width, height) : '', [mode, dots, width, height])
  const scale = useBackingScale(canvasRef, mode === 'canvas', width)

  useEffect(() => { onMode?.(mode) }, [mode, onMode])
  useEffect(() => {
    if (mode !== 'canvas') return
    const canvas = canvasRef.current, context = canvas?.getContext('2d')
    if (!canvas || !context) return
    const w = Math.round(width * scale), h = Math.round(height * scale)
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h }
    context.setTransform(scale, 0, 0, scale, 0, 0)
    context.clearRect(0, 0, width, height)
    renderCanvas(context, dots)
  }, [mode, dots, width, height, scale])

  if (mode === 'canvas') {
    return <canvas ref={canvasRef} className={className} style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: `${width} / ${height}` }} aria-hidden="true" />
  }
  return <div ref={svgRef} className={`dot-svg ${className ?? ''}`} style={{ aspectRatio: `${width} / ${height}`, width: '100%', height: 'auto' }} dangerouslySetInnerHTML={{ __html: svg }} aria-hidden="true" />
}
