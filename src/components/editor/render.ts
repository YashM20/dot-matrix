/**
 * Drawing for the editor canvas. Each frame is its card sampled through the engine (compiled layers →
 * `sampleLayers` via the Studio playback → `renderCanvas`), on the Canvas renderer: frames are TILE-size
 * (> 2,000 dots) and many animate (DESIGN.md renderer rule). The pasteboard behind the frames is a dot
 * field too: a faint constant field on a screen-space grid, with the hover glow under the pointer
 * (`{interaction.hoverGlowRadius}` 6 cells, `value`/`mid`, never the accent). The one accent on it is the snap cue
 * (E6): for a moment after a drag snaps to a guide, the pasteboard's dots along that guide light up and fade.
 */
import { renderCanvas } from '../../engine/renderer/canvasRenderer'
import { sampleLayers } from '../../engine/sampler/gridSampler'
import { dot480 } from '../../engine/theme/tokens'
import type { DotInstance, DotStyle, Field, Layer } from '../../engine/types'
import { userPrograms, userRemote } from '../dwitter/program'
import { compileCard, type CompiledCard, type ProgramCache, type StudioCard } from '../studio/doc'
import { sampleCard, stateData, timelineFrame, type FrameInput } from '../studio/playback'
import { pitchOf, themeOf, type EditorFrame } from './doc'

const good: ProgramCache = new Map()
const memo = new WeakMap<StudioCard, CompiledCard>(), liveMemo = new WeakMap<StudioCard, CompiledCard>()
/**
 * One compile per card version; IR programs memoised, last good program kept per layer, all under the user-program guard.
 * This one samples on the main thread, for the callers that need a frame at once (export, device preview, thumbnails).
 */
export function compiledOf(card: StudioCard): CompiledCard {
  let c = memo.get(card)
  if (!c) memo.set(card, (c = compileCard(card, good, { guard: userPrograms })))
  return c
}
/** The canvas's compile: its programs sample in the IR sandbox worker while it runs (`drawFrame`). */
function liveOf(card: StudioCard): CompiledCard {
  let c = liveMemo.get(card)
  if (!c) liveMemo.set(card, (c = compileCard(card, good, { guard: userPrograms, remote: userRemote })))
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
/** A frame's dots, sampled at once on the main thread; `live`: with the canvas's compile (between `userRemote.begin` / `flush`). */
export function frameDots(f: EditorFrame, o: FrameDraw, live = false): DotInstance[] {
  const card = f.card, inp: FrameInput = { card, compiled: live ? liveOf(card) : compiledOf(card), theme: themeOf(f), pointer: o.pointer }
  if (o.timeline) return timelineFrame(inp, o.t)
  return sampleCard(inp, o.t, stateData(card, o.state ?? card.states[0]?.name ?? ''))
}
// ── the IR sandbox: a frame's programs sample in a worker, so their values land a moment after the frame asks ──
/** Per editor frame: the last draw whose program values came back from the worker (a frame drawn at it is complete). */
const landed = new Map<string, { card: StudioCard; o: FrameDraw }>()
const painted = new WeakSet<HTMLCanvasElement>()
let onLanded: (id: string) => void = () => {}
/** `fn(frame id)` runs when a frame waits on program values that just landed: the canvas should draw it again. */
export function whenLanded(fn: (id: string) => void) { onLanded = fn }

/** A frame's dots, with its programs' values from the worker; `pending`: some were missing (asked for, they read 0). */
function sampleFrame(f: EditorFrame, o: FrameDraw, wake?: { on: boolean }) {
  let dots: DotInstance[] = [], error: string | undefined
  userRemote.begin()
  try { dots = frameDots(f, o, true) } catch (e) { error = String((e as Error)?.message ?? e) } // a broken frame draws empty
  // a stand-in frame (no `wake`) only asks whether it is complete
  const card = f.card, pending = !userRemote.flush(() => { landed.set(f.id, { card, o }); if (wake?.on) onLanded(f.id) }, !!wake)
  return { dots, error, pending }
}

/**
 * Draw a frame into `canvas` at `k` canvas px per world px. Returns the frame time in ms, why it drew empty if it broke,
 * and `pending` while its program values are on their way from the worker: the canvas then keeps the last complete
 * frame (an animation shows the newest frame whose values landed, one tick behind) and `whenLanded` asks for a redraw
 * once they land. `soon`: the caller draws this frame again shortly anyway (a running animation), so no redraw is asked
 * for while an older complete frame stands in.
 */
export function drawFrame(canvas: HTMLCanvasElement, f: EditorFrame, k: number, o: FrameDraw, soon = false): { ms: number; error?: string; pending?: boolean; stale?: boolean } {
  const ctx = canvas.getContext('2d')
  if (!ctx) return { ms: 0 }
  const pitch = pitchOf(f.card), W = f.card.grid.cols * pitch, H = f.card.grid.rows * pitch
  const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k)), cleared = canvas.width !== cw || canvas.height !== ch
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  const a = performance.now(), wake = { on: true }
  let { dots, error, pending } = sampleFrame(f, o, wake), stale = false
  const last = pending ? landed.get(f.id) : undefined
  if (last && last.card === f.card && last.o !== o) {
    const r = sampleFrame(f, last.o)
    // the newest complete frame stands in (`stale`: not this one); a still frame (a scrub or pointer that stopped) draws
    // again when this one lands
    if (!r.pending) { ({ dots, error } = r); pending = false; stale = true; wake.on = !soon }
  }
  userPrograms.settle() // the frame is done: its programs that kept to the budget count as drawn
  // nothing complete to show: keep the canvas, unless it is blank (first draw, resized), then draw what there is
  if (pending && painted.has(canvas) && !cleared) return { ms: performance.now() - a, pending }
  painted.add(canvas)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = themeOf(f).surface
  ctx.fillRect(0, 0, cw, ch)
  ctx.setTransform(cw / W, 0, 0, ch / H, 0, 0)
  renderCanvas(ctx, dots)
  return { ms: performance.now() - a, ...(error !== undefined && { error }), ...(pending && { pending }), ...(stale && { stale }) }
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
/** The snap cue (E6): guides a drag just snapped to, in viewport px, and how lit they are (1 → 0 as it fades). */
export interface PasteCue { guides: { axis: 'x' | 'y'; at: number; from: number; to: number }[]; k: number }
/**
 * The pasteboard's dots for the camera `cam` over a `w`×`h` viewport (CSS px): one dot per world multiple of
 * the pitch, the glow under the pointer (`glow`, viewport px), and the snap cue: the dots along each guide
 * just snapped to, in the accent (`active`, the board's one accent; `accent` is the site theme's). Returns
 * the dots and where the sampled grid's origin sits on screen.
 */
export function pasteDots(cam: { x: number; y: number; z: number }, w: number, h: number, glow?: { x: number; y: number }, cue?: PasteCue, accent?: string) {
  const s = pastePitch(cam.z) * cam.z, cols = Math.ceil(w / s) + 2, rows = Math.ceil(h / s) + 2
  // grid cell c sits at screen ox + (c - 1) s: the sampler puts its centre at (c + .5) s, so shift by ox - 1.5 s
  const ox = ((cam.x % s) + s) % s, oy = ((cam.y % s) + s) % s, sx = ox - 1.5 * s, sy = oy - 1.5 * s
  const at = (u: number, v: number) => [sx + (u * (cols - 1) + .5) * s, sy + (v * (rows - 1) + .5) * s] as const
  // the snap cue: the columns (rows) of dots either side of each guide (a frame edge covers one of them),
  // along its span and two dots past each end, so some always show beside the frames
  const cued = cue && cue.k > 0 && cue.guides.length ? cue.guides : undefined
  const onCue = (x: number, y: number) => !!cued && cued.some(g => { const [a, b] = g.axis === 'x' ? [x, y] : [y, x]; return Math.abs(a - g.at) <= s && b >= g.from - 2 * s && b <= g.to + 2 * s })
  // a cued dot is the cue's alone (the sampler keeps the strongest layer: a fading cue must not lose to the base)
  const base: Field = cued ? (u, v) => (onCue(...at(u, v)) ? 0 : .8) : () => .8
  const layers: Layer[] = [{ field: base, tone: 'faint' }]
  if (glow) {
    const R = 6 * s
    const f: Field = (u, v) => { const [x, y] = at(u, v), d = Math.hypot(x - glow.x, y - glow.y); return d >= R || onCue(x, y) ? 0 : .5 + .5 * (1 - d / R) }
    layers.push({ field: f, tone: 'mid' })
  }
  if (cued) layers.push({ field: (u, v) => (onCue(...at(u, v)) ? cue!.k : 0), tone: 'active' })
  const theme = accent ? { ...dot480, dotActive: accent } : dot480
  const dots = sampleLayers(layers, { cols, rows, pitch: s }, { ...PASTE_STYLE, sizeMax: Math.min(1.6, .9 + s / 40) }, theme)
  return { dots, sx, sy, pitch: s }
}
/** The pasteboard into a viewport-size canvas (CSS px × dpr): `pasteDots` through the Canvas renderer. */
export function drawPaste(canvas: HTMLCanvasElement, cam: { x: number; y: number; z: number }, w: number, h: number, dpr: number, glow?: { x: number; y: number }, cue?: PasteCue, accent?: string) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const cw = Math.round(w * dpr), ch = Math.round(h * dpr)
  if (canvas.width !== cw) canvas.width = cw
  if (canvas.height !== ch) canvas.height = ch
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, cw, ch)
  const { dots, sx, sy } = pasteDots(cam, w, h, glow, cue, accent)
  ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr)
  renderCanvas(ctx, dots)
}
