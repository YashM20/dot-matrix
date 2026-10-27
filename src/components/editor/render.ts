/**
 * Drawing for the editor canvas. Each frame is its card sampled through the engine (compiled layers →
 * `sampleLayers` via the Studio playback → `renderCanvas`), on the Canvas renderer: frames are TILE-size
 * (> 2,000 dots) and many animate (DESIGN.md renderer rule). The pasteboard behind the frames is a dot
 * field too: a faint constant field on a screen-space grid, with the hover glow under the pointer
 * (`{interaction.hoverGlowRadius}` 6 cells, `value`/`mid`, never the accent).
 */
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { dot480 } from '../../engine/theme/tokens'
import type { DotInstance, DotStyle, Field, Layer } from '../../engine/types'
import { compileCard, type CompiledCard, type ProgramCache, type StudioCard } from '../studio/doc'
import { sampleCard, stateData, timelineFrame, type FrameInput } from '../studio/playback'
import { pitchOf, themeOf, type EditorFrame } from './doc'

const good: ProgramCache = new Map()
const memo = new WeakMap<StudioCard, CompiledCard>()
/** One compile per card version; IR programs memoised, last good program kept per layer. */
export function compiledOf(card: StudioCard): CompiledCard {
  let c = memo.get(card)
  if (!c) memo.set(card, (c = compileCard(card, good)))
  return c
}
export const isAnimated = (card: StudioCard) => card.animated || compiledOf(card).usesT

export interface FrameDraw {
  /** Timeline preview at t (ANIMATE tab), else live at `t` in the previewed state. */
  timeline?: boolean
  t: number
  state?: string
  pointer?: { x: number; y: number; down: boolean }
}
export function frameDots(f: EditorFrame, o: FrameDraw): DotInstance[] {
  const card = f.card, inp: FrameInput = { card, compiled: compiledOf(card), theme: themeOf(f), pointer: o.pointer }
  if (o.timeline) return timelineFrame(inp, o.t)
  return sampleCard(inp, o.t, stateData(card, o.state ?? card.states[0]?.name ?? ''))
}
/** Draw a frame into `canvas` at `k` canvas px per world px. Returns the frame time in ms. */
export function drawFrame(canvas: HTMLCanvasElement, f: EditorFrame, k: number, o: FrameDraw): number {
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  const pitch = pitchOf(f.card), W = f.card.grid.cols * pitch, H = f.card.grid.rows * pitch
  const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k))
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  const a = performance.now()
  let dots: DotInstance[] = []
  try { dots = frameDots(f, o) } catch { /* a broken frame draws empty */ }
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = themeOf(f).surface
  ctx.fillRect(0, 0, cw, ch)
  ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0)
  renderCanvas(ctx, dots)
  return performance.now() - a
}
/** Canvas resolution for a zoom: power-of-two steps of zoom × devicePixelRatio, capped by a 4096 px edge. */
export function resolutionFor(z: number, dpr: number, w: number, h: number): number {
  const k = Math.pow(2, Math.round(Math.log2(Math.max(.25, z * dpr))))
  return Math.min(k, 4, 4096 / Math.max(w, h))
}

// ── pasteboard ─────────────────────────────────────────────────────────────
const PASTE_STYLE: DotStyle = { shape: 'circle', sizeMin: 0, sizeMax: 1.2, cornerRoundness: 0, opacityMode: 'fromValue', quantizeSteps: 4 }
/** World pitch of the pasteboard dots for a zoom: 16 px, doubled or halved so screen spacing stays 11–32 px. */
export function pastePitch(z: number): number {
  let p = 16
  while (p * z < 11) p *= 2
  while (p * z > 32 && p > 2) p /= 2
  return p
}
/**
 * The pasteboard for the camera `cam` into a viewport-size canvas (CSS px × dpr): one dot per world
 * multiple of the pitch. `glow` = pointer in viewport px (or undefined).
 */
export function drawPaste(canvas: HTMLCanvasElement, cam: { x: number; y: number; z: number }, w: number, h: number, dpr: number, glow?: { x: number; y: number }) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cw = Math.round(w * dpr), ch = Math.round(h * dpr)
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  const s = pastePitch(cam.z) * cam.z, cols = Math.ceil(w / s) + 2, rows = Math.ceil(h / s) + 2
  // grid cell c sits at screen ox + (c - 1) s: the sampler puts its centre at (c + .5) s, so shift by ox - 1.5 s
  const ox = ((cam.x % s) + s) % s, oy = ((cam.y % s) + s) % s, sx = ox - 1.5 * s, sy = oy - 1.5 * s
  const base: Field = () => .8
  const layers: Layer[] = [{ field: base, tone: 'faint' }]
  if (glow) {
    const R = 6 * s
    const f: Field = (u, v) => { const x = sx + (u * (cols - 1) + .5) * s, y = sy + (v * (rows - 1) + .5) * s, d = Math.hypot(x - glow.x, y - glow.y); return d >= R ? 0 : .5 + .5 * (1 - d / R) }
    layers.push({ field: f, tone: 'mid' })
  }
  const dots = sampleLayers(layers, { cols, rows, pitch: s }, { ...PASTE_STYLE, sizeMax: Math.min(1.6, .9 + s / 40) }, dot480)
  ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr)
  renderCanvas(ctx, dots)
}
