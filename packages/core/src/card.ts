/**
 * `@dot480/core/card`: mount a card preset into any DOM element, no framework. Preset layers →
 * `sampleLayers` → `renderSVG` / `renderCanvas`, with the playground's runtime rules:
 * - renderer: SVG for static cards under 2000 dots (copy-pasteable), Canvas for animated or dense ones;
 * - animated cards run on the shared master clock at their frame rate, paused off-screen;
 *   `clock` cards re-sample on the minute;
 * - `springKeys` glide to new data on a critically damped spring;
 * - controls: pointer + keyboard edit `data[key]` and fill hover / pressed / focus;
 * - reduced motion: one still frame (t = 0), no entrance, springs cut.
 */
import { sharedClock, quantizeTime } from '../../../src/engine/clock'
import { describe } from '../../../src/engine/describe'
import { beginDrag, dragValue, keyValue, pick, releaseValue, toLocal, type ControlPatch, type DragStart } from '../../../src/engine/interaction/controls'
import { duration, ease } from '../../../src/engine/motion/easing'
import { maskByName, type MaskName } from '../../../src/engine/motion/masks'
import { revealDots } from '../../../src/engine/motion/reveal'
import { DataSprings } from '../../../src/engine/motion/spring'
import { renderCanvas } from '../../../src/engine/renderer/canvasRenderer'
import { renderSVG } from '../../../src/engine/renderer/svgRenderer'
import { sampleLayers } from '../../../src/engine/sampler/gridSampler'
import { dot480 } from '../../../src/engine/theme/tokens'
import type { Control, FrameContext } from '../../../src/engine/context'
import type { DotInstance, DotStyle, GridConfig, ThemeTokens } from '../../../src/engine/types'
import { withChrome, type WidgetPreset } from '../../../src/widgets/types'

export type RendererChoice = 'auto' | 'svg' | 'canvas'
export interface CardOptions {
  preset: WidgetPreset
  /** Merged over `preset.defaults`. */
  data?: Record<string, number>
  theme?: ThemeTokens
  renderer?: RendererChoice
  /** Dot pitch in px (the density lever); default the preset's own. */
  pitch?: number
  /** Run the clock. Default: `preset.animated`. */
  animated?: boolean
  /** Default: the `prefers-reduced-motion` media query. */
  reducedMotion?: boolean
  /** Staggered entrance mask; `false` = none. Skipped under reduced motion. */
  enter?: MaskName | false
  /** Control edits (the card keeps them in its own data too). */
  onInput?: (patch: ControlPatch, data: Record<string, number>) => void
}
export interface CardHandle {
  update(opts: Partial<CardOptions>): void
  /** Sample + draw one frame now (also returns the dots, for tests). */
  render(): DotInstance[]
  readonly data: Record<string, number>
  readonly mode: 'svg' | 'canvas'
  destroy(): void
}

const CANVAS_THRESHOLD = 2000, MAX_SCALE = 3, FPS = 12, HALFLIFE = .12

export function mountCard(host: HTMLElement, options: CardOptions): CardHandle {
  let o: CardOptions = { ...options }
  const doc = host.ownerDocument, win = doc.defaultView ?? window
  const rmq = win.matchMedia?.('(prefers-reduced-motion: reduce)')
  const reduced = () => o.reducedMotion ?? !!rmq?.matches
  const svgBox = doc.createElement('div'), canvas = doc.createElement('canvas')
  for (const el of [svgBox, canvas]) { el.style.display = 'block'; el.style.width = '100%'; el.style.touchAction = 'none' }
  svgBox.setAttribute('aria-hidden', 'true'); canvas.setAttribute('aria-hidden', 'true')
  host.append(svgBox, canvas)

  let local: ControlPatch = {}
  let hover: string | undefined, pressed: string | undefined, focus: string | undefined
  let drag: { control: Control; start: DragStart; id: number } | null = null
  let mode: 'svg' | 'canvas' = 'svg', t0 = -1, enterT0 = -1, onScreen = true, unsub: (() => void) | null = null, minute = 0, raf = 0
  const springs = new DataSprings(HALFLIFE)
  const now = () => performance.now() / 1000

  const geometry = () => {
    const p = o.preset, native = p.grid.pitch ?? (o.theme ?? dot480).gridPx, pitch = o.pitch ?? native, k = pitch / native
    const grid: GridConfig = { ...p.grid, pitch }
    const style: DotStyle = { ...p.style, sizeMin: p.style.sizeMin * k, sizeMax: p.style.sizeMax * k }
    return { grid, style, w: grid.cols * pitch, h: grid.rows * pitch }
  }
  const baseData = () => ({ ...o.preset.defaults, ...o.data, ...local })
  const animated = () => (o.animated ?? !!o.preset.animated) && !reduced()
  let layers = withChrome(o.preset)

  function frame(tSec: number): DotInstance[] {
    const { grid, style } = geometry(), theme = o.theme ?? dot480
    const keys = o.preset.springKeys
    const data = keys?.length && !reduced() ? { ...baseData(), ...springs.at(tSec) } : baseData()
    const t = animated() ? quantizeTime(t0 < 0 ? 0 : tSec - t0, FPS).t : 0
    const ctx: FrameContext = { t, data, grid, hover, pressed, focus, reducedMotion: reduced() }
    let dots: DotInstance[]
    try { dots = sampleLayers(layers(ctx), grid, style, theme) } catch { dots = [] } // a broken card draws blank
    if (enterT0 >= 0) {
      const p = ease.decelerate(Math.min(1, (tSec - enterT0) / (duration.enter / 1000)))
      if (p >= 1) enterT0 = -1
      else dots = revealDots(dots, { cols: grid.cols, rows: grid.rows, pitch: grid.pitch!, p, mask: maskByName(o.enter || undefined), edge: .06 })
    }
    return dots
  }

  function draw(dots: DotInstance[]) {
    const { w, h } = geometry(), choice = o.renderer ?? 'auto'
    mode = choice !== 'auto' ? choice : animated() || dots.length >= CANVAS_THRESHOLD ? 'canvas' : 'svg'
    svgBox.style.display = mode === 'svg' ? 'block' : 'none'; canvas.style.display = mode === 'canvas' ? 'block' : 'none'
    host.style.aspectRatio = `${w} / ${h}`
    if (mode === 'svg') {
      svgBox.innerHTML = renderSVG(dots, w, h)
      const svg = svgBox.firstElementChild as SVGElement | null
      if (svg) { svg.setAttribute('viewBox', svg.getAttribute('viewBox') ?? `0 0 ${w} ${h}`); svg.style.display = 'block'; svg.style.width = '100%'; svg.style.height = 'auto' }
      return
    }
    const css = canvas.clientWidth / w || 1
    const scale = Math.min(MAX_SCALE, Math.max(1, Math.round(css * (win.devicePixelRatio || 1) * 4) / 4))
    const bw = Math.round(w * scale), bh = Math.round(h * scale)
    if (canvas.width !== bw || canvas.height !== bh) { canvas.width = bw; canvas.height = bh }
    const g = canvas.getContext('2d')
    if (!g) return
    g.setTransform(scale, 0, 0, scale, 0, 0); g.clearRect(0, 0, w, h)
    renderCanvas(g, dots)
  }

  function label() {
    try { return describe(o.preset, { data: baseData(), hover, pressed, focus }).summary } catch { return o.preset.name }
  }
  function render(): DotInstance[] {
    const dots = frame(now())
    draw(dots)
    host.setAttribute('aria-label', label())
    return dots
  }

  /** Something is moving (entrance, springs) → draw on rAF until it settles; the clock covers animated cards. */
  function kick() {
    if (raf) return
    const step = () => {
      raf = 0
      render()
      const settling = enterT0 >= 0 || (!!o.preset.springKeys?.length && !reduced() && !springs.settled(now()))
      if (settling && !unsub) raf = win.requestAnimationFrame(step)
    }
    raf = win.requestAnimationFrame(step)
  }
  function schedule() {
    unsub?.(); unsub = null
    if (animated() && onScreen) {
      if (t0 < 0) t0 = now()
      unsub = sharedClock().subscribe({ fps: FPS, onFrame: () => draw(frame(now())) })
    }
    clearTimeout(minute)
    if (o.preset.clock) minute = win.setTimeout(() => { render(); schedule() }, 60_000 - Date.now() % 60_000 + 20) as unknown as number
  }

  // ── input ──
  const controls = () => o.preset.controls ?? []
  const local01 = (e: PointerEvent) => toLocal(e.clientX, e.clientY, (mode === 'svg' ? svgBox : canvas).getBoundingClientRect(), geometry().grid)
  function apply(patch: ControlPatch | null) {
    if (!patch) return
    const before = baseData()
    local = { ...local, ...patch }
    if (o.preset.springKeys?.length) springs.set(pickKeys(baseData(), o.preset.springKeys), reduced() ? -1e3 : now())
    o.onInput?.(patch, baseData())
    if (JSON.stringify(before) !== JSON.stringify(baseData())) refresh()
  }
  const refresh = () => (animated() && unsub ? undefined : kick())
  const onMove = (e: PointerEvent) => {
    const p = local01(e)
    if (drag && drag.id === e.pointerId) { apply(dragValue(drag.control, drag.start, p)); return }
    const k = pick(controls(), p.x, p.y) ?? undefined
    if (k !== hover) { hover = k; host.style.cursor = k ? 'pointer' : ''; refresh() }
  }
  const onDown = (e: PointerEvent) => {
    const p = local01(e), k = pick(controls(), p.x, p.y), c = controls().find(q => q.key === k)
    if (!c) return
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    drag = { control: c, start: beginDrag(c, p.x, p.y, baseData()), id: e.pointerId }
    pressed = c.key; focus = undefined
    apply(dragValue(c, drag.start, p)); refresh()
  }
  const onUp = (e: PointerEvent) => {
    if (!drag || drag.id !== e.pointerId) return
    const c = drag.control
    drag = null; pressed = undefined
    apply(releaseValue(c)); refresh()
  }
  const onLeave = () => { if (!drag && hover) { hover = undefined; refresh() } }
  const onKey = (e: KeyboardEvent) => {
    const cs = controls()
    if (!cs.length) return
    if (e.key === 'Tab') {
      const i = focus ? cs.findIndex(c => c.key === focus) : -1, j = i + (e.shiftKey ? -1 : 1)
      if (j < 0 || j >= cs.length) { focus = undefined; refresh(); return } // let focus leave the card
      e.preventDefault(); focus = cs[j].key; refresh(); return
    }
    const c = cs.find(q => q.key === focus)
    if (!c) return
    const v = keyValue(c, Number(baseData()[c.key] ?? c.min ?? 0), e.key)
    if (v === null) return
    e.preventDefault(); apply({ [c.key]: v })
    if (c.kind === 'button') win.setTimeout(() => apply(releaseValue(c)), 120)
  }
  const onFocus = () => { if (!focus && controls().length) { focus = controls()[0].key; refresh() } }
  const onBlur = () => { if (focus) { focus = undefined; refresh() } }
  function wireInput() {
    const interactive = controls().length > 0
    host.setAttribute('role', interactive ? 'group' : 'img')
    if (interactive) host.tabIndex = 0; else host.removeAttribute('tabindex')
  }
  host.addEventListener('pointermove', onMove)
  host.addEventListener('pointerdown', onDown)
  host.addEventListener('pointerup', onUp)
  host.addEventListener('pointercancel', onUp)
  host.addEventListener('pointerleave', onLeave)
  host.addEventListener('keydown', onKey)
  host.addEventListener('focus', onFocus)
  host.addEventListener('blur', onBlur)

  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver(([en]) => { const v = en.isIntersecting; if (v !== onScreen) { onScreen = v; schedule() } }, { rootMargin: '64px' })
    : null
  io?.observe(host)
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (mode === 'canvas') refresh() }) : null
  ro?.observe(host)
  const onRmq = () => { schedule(); kick() }
  rmq?.addEventListener?.('change', onRmq)

  // ── mount ──
  if (o.preset.springKeys?.length) springs.set(pickKeys(baseData(), o.preset.springKeys), -1e3)
  if (o.enter !== false && !reduced()) enterT0 = now()
  wireInput(); render(); schedule(); kick()

  return {
    update(next) {
      const presetChanged = next.preset && next.preset !== o.preset
      o = { ...o, ...next }
      if (presetChanged) { layers = withChrome(o.preset); local = {}; t0 = -1; wireInput() }
      if (o.preset.springKeys?.length) springs.set(pickKeys(baseData(), o.preset.springKeys), reduced() || presetChanged ? -1e3 : now())
      render(); schedule(); kick()
    },
    render,
    get data() { return baseData() },
    get mode() { return mode },
    destroy() {
      unsub?.(); clearTimeout(minute); if (raf) win.cancelAnimationFrame(raf)
      io?.disconnect(); ro?.disconnect(); rmq?.removeEventListener?.('change', onRmq)
      host.removeEventListener('pointermove', onMove); host.removeEventListener('pointerdown', onDown)
      host.removeEventListener('pointerup', onUp); host.removeEventListener('pointercancel', onUp)
      host.removeEventListener('pointerleave', onLeave); host.removeEventListener('keydown', onKey)
      host.removeEventListener('focus', onFocus); host.removeEventListener('blur', onBlur)
      svgBox.remove(); canvas.remove()
    },
  }
}

function pickKeys(d: Record<string, number>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const k of keys) if (typeof d[k] === 'number') out[k] = d[k]
  return out
}
