/**
 * The C7 display stage around one card surface (DotCanvas wraps its canvas / SVG in this, nothing else).
 * Skin `oled` = `display: contents` and no overlay: the card is exactly as before. Any other skin
 * stacks an overlay canvas on the surface and hides the original, then feeds the engine's display
 * stage (`src/engine/display/stage.ts`):
 *   - a running canvas card (live / transient): its canvas is copied once per its own clock tick;
 *   - a static card (SVG or canvas): its `dots` are rasterized here once, so a skin switch re-skins
 *     without re-sampling.
 * The stage then draws on its own rAF only while it has something moving (decay, flips, refresh).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createDisplayStage, type DisplayStage, type SkinName, type StageColors } from '../../engine/display'
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sharedClock } from '../../engine/clock'
import type { DotInstance } from '../../engine/types'
import { createClack, type Clack } from '../../media/clack'
import { getClack, skinChangedAt, useDisplaySkin } from './store'

export interface SkinSurfaceProps {
  /** Which surface DotCanvas mounted ('canvas' | 'svg'). */
  mode: string
  /** The card's static frame (what an SVG / static canvas shows). */
  dots: DotInstance[]
  /** The canvas is being redrawn on the clock (live frames or a transient): copy it per tick instead. */
  running: boolean
  fps: number
  cols: number
  rows: number
  /** Logical px of the frame (cols × pitch, rows × pitch). */
  width: number
  height: number
  /** The card theme's `dotActive`: VFD and LED glow in it; a theme switch rebuilds the stage settled, no reload. */
  accent?: string
  /**
   * The card theme's neutral tones. The reflective skins take their panel from the scheme and their ink from the theme
   * (docs/LAYOUT-THEME-PLAN.md §4 "Theme versus display skin"): on a light card e-ink is the card's own paper with the
   * theme's ink, and flip-disc discs turn from the faint tone to the ink on the card surface. On a dark card the stage
   * keeps its physics colours (`STAGE_COLORS`), so today's dark skins don't change.
   */
  tones?: { surface: string; value: string; dotFaint: string }
}

/** Light card (the surface is light): the reflective skins' colours from the theme, else the stage's own. */
function stageColors(tones: SkinSurfaceProps['tones']): Partial<StageColors> | undefined {
  if (!tones || !/^#[0-9a-f]{6}$/i.test(tones.surface)) return undefined
  const n = parseInt(tones.surface.slice(1), 16), luma = .2126 * (n >> 16) + .7152 * ((n >> 8) & 255) + .0722 * (n & 255)
  return luma > 128 ? { paper: tones.surface, ink: tones.value, panel: tones.surface, bright: tones.value, off: tones.dotFaint, tile: tones.surface, grout: tones.dotFaint } : undefined
}

const MAX_BACKING_SCALE = 3
const now = () => performance.now() / 1000
const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// ── perf probe (read by scripts/skins-perf.ts): ms of stage work per card frame, last 2000 ──
interface SkinPerf { skin: SkinName; frame: number[]; render: number[] }
const perf: Record<string, SkinPerf> = {}
function record(skin: SkinName, kind: 'frame' | 'render', ms: number) {
  const p = perf[skin] ??= { skin, frame: [], render: [] }, a = p[kind]
  a.push(ms); if (a.length > 2000) a.shift()
}
if (typeof window !== 'undefined') (window as unknown as { __skinPerf: typeof perf }).__skinPerf = perf

// one clack voice for the page, capped so a whole board flipping is a rattle, not a roar
let clack: Clack | null | undefined, clackWindow = 0, clackCount = 0
function playClack(events: { at: number; count: number }[]) {
  if (!getClack()) return
  clack ??= createClack()
  const t = performance.now()
  if (t - clackWindow > 250) { clackWindow = t; clackCount = 0 }
  for (const e of events) if (clackCount++ < 10) clack?.play(e.at, e.count)
}

/** Per-card mutable state outside React's render: the stage, its 2D context, the rAF loop, the scratch raster. */
class Runner {
  stage: DisplayStage | null = null
  ctx: CanvasRenderingContext2D | null = null
  raf = 0
  scratch: HTMLCanvasElement | null = null
  built: SkinName | null = null
  gain = 1
  step = () => {
    this.raf = 0
    const { stage, ctx } = this
    if (!stage || !ctx) return
    const t0 = performance.now(), more = stage.render(ctx, now())
    record(stage.skin, 'render', performance.now() - t0)
    if (more) this.raf = requestAnimationFrame(this.step)
  }
  pump() { if (!this.raf) this.raf = requestAnimationFrame(this.step) }
  /** Hand a frame to the stage; it is drawn on the next animation frame. */
  feed(src: CanvasImageSource) {
    const stage = this.stage
    if (!stage) return
    const t0 = performance.now()
    stage.frame(src, now())
    record(stage.skin, 'frame', performance.now() - t0)
    this.pump()
  }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; this.stage?.dispose(); this.stage = null }
}

const runnerOf = (ref: { current: Runner | null }): Runner => (ref.current ??= new Runner())
/**
 * The card's wrapper, read through the overlay's own canvas first: when the wrapper and the overlay mount in the
 * same commit (a board whose chunk lands after the overlay's), React attaches the wrapper's ref only after the
 * overlay's layout effects ran, so `wrapRef.current` is still null there (the card stayed OLED under CRT).
 */
const wrapOf = (overlay: RefObject<HTMLCanvasElement | null>, wrap: RefObject<HTMLDivElement | null>): HTMLDivElement | null =>
  (overlay.current?.parentElement as HTMLDivElement | null | undefined) ?? wrap.current

/**
 * Lazy part of the display stage (loaded on the first non-OLED skin): the overlay canvas and its stage,
 * mounted as a sibling of the card surface inside `DisplaySurface`'s wrapper, which it marks via `wrapRef`.
 */
export function SkinOverlay({ wrapRef, mode, dots, running, fps, cols, rows, width, height, accent, tones }:SkinSurfaceProps & { wrapRef: RefObject<HTMLDivElement | null> }) {
  const skin = useDisplaySkin()
  // the overlay keeps its last skin while it wipes off after a switch back to OLED
  const [last, setLast] = useState<SkinName>(skin)
  if (skin !== 'oled' && last !== skin) setLast(skin)
  const drawn: SkinName = skin !== 'oled' ? skin : last, leaving = skin === 'oled' && last !== 'oled'

  const overlayRef = useRef<HTMLCanvasElement>(null)
  const runnerRef = useRef<Runner | null>(null)
  const [scale, setScale] = useState(1)
  const [stageId, setStageId] = useState(0)

  // light gain for the cell-based skins: 1 / the cell coverage of the biggest dot on the card
  const gain = useMemo(() => {
    let r = 0
    for (const d of dots) if (d.opacity > 0 && d.r > r) r = d.r
    const pitch = width / cols, cover = r > 0 ? Math.min(1, (Math.PI * r * r) / (pitch * pitch)) : 1
    return Math.min(4, Math.max(1, 1 / cover))
  }, [dots, width, cols])
  useLayoutEffect(() => { runnerOf(runnerRef).gain = gain }, [gain])

  // backing scale: CSS size × DPR (same rule as DotCanvas), measured only while a skin is on
  useLayoutEffect(() => {
    const el = wrapOf(overlayRef, wrapRef)
    if (drawn === 'oled' || !el) return
    const measure = () => {
      const css = el.clientWidth / width || 1
      setScale(Math.min(MAX_BACKING_SCALE, Math.max(1, Math.round(css * (window.devicePixelRatio || 1) * 4) / 4)))
    }
    const ro = new ResizeObserver(measure)
    ro.observe(el); measure()
    return () => ro.disconnect()
  }, [wrapRef, drawn, width])

  const W = Math.round(width * scale), H = Math.round(height * scale)
  // only VFD and LED read the accent, so a theme switch rebuilds just those (the other stages keep their state)
  const tint = drawn === 'vfd' || drawn === 'led' ? accent : undefined
  // e-ink, flip-disc and the mosaic read the neutral tones (a light card); a string key, so an equal palette doesn't rebuild
  const colorKey = drawn === 'eink' || drawn === 'flipdisc' || drawn === 'grout' ? JSON.stringify(stageColors(tones) ?? null) : 'null'
  // the stage: one per (skin, backing size); a resize keeps the skin without replaying its power-on
  useLayoutEffect(() => {
    const runner = runnerOf(runnerRef), canvas = overlayRef.current, wrap = wrapOf(overlayRef, wrapRef)
    if (drawn === 'oled' || !canvas || !wrap) { runner.built = null; return }
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H }
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return
    const same = runner.built === drawn, calm = reduced(), switched = now() - skinChangedAt() < 1.5
    // a switch sweeps down the page like a raster scan; a fresh card (board change) refreshes at once
    const delay = switched && !same ? Math.min(1, Math.max(0, wrap.getBoundingClientRect().top / window.innerHeight)) * .3 : 0
    runner.stage = createDisplayStage(drawn, { cols, rows, w: W, h: H, gain: runner.gain, delay, instant: same || calm, noFlash: calm, onFlip: playClack, accent: tint, colors: JSON.parse(colorKey) ?? undefined })
    runner.ctx = ctx; runner.built = drawn
    setStageId(id => id + 1)
    return () => runner.stop()
  }, [wrapRef, drawn, W, H, cols, rows, tint, colorKey])

  const copying = running && mode === 'canvas'
  // static frame, no re-sample: a canvas card (2D or WebGL-composited) is copied once DotCanvas's own static
  // draw effect ran (a microtask after this effect flush); an SVG card's dots are rasterized here
  useEffect(() => {
    const runner = runnerOf(runnerRef)
    if (!runner.stage || copying) return
    if (mode === 'canvas') {
      let live = true
      queueMicrotask(() => { const src = wrapOf(overlayRef, wrapRef)?.firstElementChild; if (live && src instanceof HTMLCanvasElement && src.width) runner.feed(src) })
      return () => { live = false }
    }
    const c = runner.scratch ??= document.createElement('canvas')
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H }
    const x = c.getContext('2d')
    if (!x) return
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); x.setTransform(W / width, 0, 0, H / height, 0, 0)
    renderCanvas(x, dots)
    runner.feed(c)
  }, [stageId, dots, copying, mode]) // eslint-disable-line react-hooks/exhaustive-deps
  // running canvas: copy it once per its own tick, after DotCanvas drew (a microtask after the clock callbacks)
  useLayoutEffect(() => {
    const runner = runnerOf(runnerRef)
    if (!runner.stage || !copying) return
    let queued = false
    const copy = () => {
      queued = false
      const src = wrapOf(overlayRef, wrapRef)?.firstElementChild
      if (src instanceof HTMLCanvasElement && src.width) runner.feed(src)
    }
    const later = () => { if (!queued) { queued = true; queueMicrotask(copy) } }
    later()
    return sharedClock().subscribe({ fps, onFrame: later })
  }, [wrapRef, stageId, copying, fps])

  // the wrapper is DisplaySurface's; mark it with the skin being drawn (CSS hides the card under an overlay)
  useLayoutEffect(() => {
    const el = wrapOf(overlayRef, wrapRef)
    if (!el) return
    el.dataset.skin = drawn
    if (leaving) el.dataset.leaving = ''; else delete el.dataset.leaving
  }, [wrapRef, drawn, leaving])

  return drawn !== 'oled' ? <canvas ref={overlayRef} className={`skin-overlay${leaving ? ' skin-overlay--out' : ''}`} aria-hidden="true"
    style={{ width: '100%', height: 'auto', display: 'block', aspectRatio: `${width} / ${height}` }}
    onAnimationEnd={leaving ? e => { if (e.animationName === 'skin-off') setLast('oled') } : undefined} /> : null
}
