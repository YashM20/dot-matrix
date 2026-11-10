/**
 * The editor canvas's render loop (split from Canvas.tsx): the registry of mounted frame canvases, and `useFrameLoop`,
 * one rAF that draws every frame that changed, is animating or is being previewed, skips frames off screen, and
 * repaints the pasteboard (its glow and the snap cue).
 */
import { useEffect, useRef } from 'react'
import { frameById, frameSize, pitchOf, type EditorFrame } from './doc'
import { drawFrame, drawPaste, isAnimated, resolutionFor, whenLanded, type PasteCue } from './render'
import { selIds, type Guide } from './select'
import { CUE_MS } from './phone'
import { setEditor, getEditor, drew, type Camera } from './store'
import { TEST_HOOKS } from '../../lib/testHooks'

/** Probe hooks (scripts/editor-browser.ts): draw stats, the selected frame id and every selected id. */
/** Render stats for the browser probes. `tl`: the timeline t each frame last drew at while ANIMATE previews it, so a
 *  probe can wait for the scrubbed frame itself instead of sleeping. */
declare global { interface Window { __editor?: { frames: number; drawn: number; maxMs: number; lastMs: number; sel?: string; layer?: string; picks?: string[]; cues?: number; cueLit?: number; tl?: Record<string, number> } } }

// ── render registry: one entry per mounted frame canvas ──────────────────────────────────────────
interface Drawn { card: EditorFrame['card']; theme: string; k: number; state?: string; tl: boolean; t: number }
interface Entry { canvas: HTMLCanvasElement; drawn?: Drawn; dirty: boolean; last: number; pointer?: { x: number; y: number; down: boolean }; broke?: boolean }
const entries = new Map<string, Entry>()
export const markDirty = (id: string) => { const e = entries.get(id); if (e) e.dirty = true }
whenLanded(markDirty) // program values from the IR sandbox worker landed: draw the frame with them
/** The pointer (in card cells) for the frame under it, if that card reads `pointer`; every other frame loses it. */
export function feedPointer(f: EditorFrame | undefined, wx: number, wy: number) {
  for (const [id, en] of entries) if (en.pointer && id !== f?.id) { en.pointer = undefined; en.dirty = true }
  const en = f && entries.get(f.id)
  if (f && en) { const p = pitchOf(f.card); en.pointer = { x: (wx - f.x) / p, y: (wy - f.y) / p, down: false }; en.dirty = true }
}
export const readsPointer = (f: EditorFrame) => f.card.layers.some(l => (l.kind === 'ir' || l.kind === 'sites') && l.src.includes('pointer'))
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** A card that cannot compile counts as still: the draw below reports it once. */
const animates = (c: EditorFrame['card']) => { try { return isAnimated(c) } catch { return false } }

/** A frame's canvas joins the registry while it is mounted (Canvas.tsx `FrameView`); the cleanup takes it out. */
export function registerFrame(id: string, canvas: HTMLCanvasElement): () => void {
  entries.set(id, { canvas, dirty: true, last: 0 })
  return () => { entries.delete(id) }
}

/** `fn()`, or `fallback` when it throws. Outside the component: the compiler can't yet lower the render loop's try/catch. */
function guarded<T>(fn: () => T, fallback: T): T {
  try { return fn() } catch { return fallback }
}
/** Draw one frame; a throw becomes its `error` (it draws empty and says so). */
function tryDraw(...args: Parameters<typeof drawFrame>): ReturnType<typeof drawFrame> {
  try { return drawFrame(...args) } catch (err) { return { ms: 0, error: String((err as Error)?.message ?? err) } }
}

/** The snap cue showing: the guides a drag just reached, since `t0`, in the site's accent. */
export type Cue = { guides: Guide[]; t0: number; accent?: string }

/**
 * The render loop: frames through the registry, then the pasteboard when it, the camera or the viewport changed. Returns
 * the pasteboard's canvas, its repaint flag, the pointer glow and the snap cue, which input writes.
 */
export function useFrameLoop(phone: boolean) {
  const paste = useRef<HTMLCanvasElement>(null), pasteDirty = useRef(true)
  const glow = useRef<{ x: number; y: number } | undefined>(undefined), cue = useRef<Cue | undefined>(undefined)
  useEffect(() => {
    let raf = 0, lastCam: Camera | undefined, lastVp = '', lastPublish = 0, lastTick = performance.now()
    const wall0 = performance.now(), still = reduced()
    const stats: NonNullable<Window["__editor"]> = { frames: 0, drawn: 0, maxMs: 0, lastMs: 0, tl: {} }
    if (TEST_HOOKS) window.__editor = stats
    const step = (now: number) => {
      raf = requestAnimationFrame(step)
      const s = getEditor(), d = s.h.present, c = s.cam, dpr = Math.min(2, window.devicePixelRatio || 1), dt = Math.min(.1, (now - lastTick) / 1000)
      lastTick = now
      const selFrame = frameById(d, s.sel.frame), timeline = !!selFrame && s.right === 'animate' && (!phone || s.sheet === 'inspector')
      if (timeline && s.play.playing) {
        const t = (s.play.t + dt) % selFrame!.card.timeline.length
        s.play.t = t
        if (now - lastPublish > 66) { lastPublish = now; setEditor({ play: { t, playing: true } }) }
      }
      // each frame through `guarded` (a module function): the compiler can't yet lower this loop's try/catch in place
      let budget = 0
      for (const f of d.frames) budget += guarded(() => {
        const e = entries.get(f.id)
        if (f.hidden) drew(f.id) // a hidden frame never draws: nothing to wait for
        if (!e || f.hidden) return 0
        const { w, h } = frameSize(f), x0 = f.x * c.z + c.x, y0 = f.y * c.z + c.y
        if (x0 > s.vp.w || y0 > s.vp.h || x0 + w * c.z < 0 || y0 + h * c.z < 0) return 0
        const k = resolutionFor(c.z, dpr, w, h), tl = timeline && f.id === selFrame!.id, anim = !still && animates(f.card)
        const t = tl ? s.play.t : anim ? (now - wall0) / 1000 : 0, state = s.preview[f.id], p = e.drawn
        const due = e.dirty || !p || p.card !== f.card || p.theme !== f.theme || p.k !== k || p.state !== state || p.tl !== tl || (tl && p.t !== t) || (!tl && anim && now - e.last > 33)
        if (!due || budget > 24) return 0 // past ~24 ms this tick: the rest draw next frame
        const { ms, error, pending, stale } = tryDraw(e.canvas, f, k, { timeline: tl, t, state, pointer: e.pointer }, tl ? s.play.playing : anim)
        // a frame that breaks draws empty and says so once; one that drew may be autosaved (an import is held until then)
        if (error === undefined) { e.broke = false; if (!pending) drew(f.id) } else if (!e.broke) { e.broke = true; s.setNote(`frame "${f.card.name}" could not be drawn: ${error.slice(0, 120)}`) }
        stats.lastMs = ms; stats.maxMs = Math.max(stats.maxMs, ms); stats.drawn++
        e.drawn = { card: f.card, theme: f.theme, k, state, tl, t }; e.dirty = false; e.last = now
        // the probes' "drawn at t": only once the canvas shows t, not while its program values are on the way (the
        // last frame kept, or an older complete one standing in); their landing draws it again (#28)
        if (!tl) delete stats.tl![f.id]; else if (!pending && !stale) stats.tl![f.id] = t
        return ms
      }, 0) // a frame too broken to place is skipped; the recovery screen says what broke
      stats.frames = d.frames.length; stats.sel = s.sel.frame; stats.layer = s.sel.layer; stats.picks = selIds(s.sel)
      const vpKey = `${s.vp.w}x${s.vp.h}x${dpr}`
      // the snap cue: lit while it lasts, fading (reduced motion: held), then drawn away once
      let cueNow: PasteCue | undefined
      const cu = cue.current
      if (cu) {
        const age = now - cu.t0
        if (age > CUE_MS) cue.current = undefined
        else cueNow = { k: still ? 1 : Math.max(.25, 1 - age / CUE_MS), guides: cu.guides.map(g => g.axis === 'x' ? { axis: g.axis, at: g.at * c.z + c.x, from: g.from * c.z + c.y, to: g.to * c.z + c.y } : { axis: g.axis, at: g.at * c.z + c.y, from: g.from * c.z + c.x, to: g.to * c.z + c.x }) }
        pasteDirty.current = true
      }
      if (paste.current && (pasteDirty.current || c !== lastCam || vpKey !== lastVp)) {
        drawPaste(paste.current, c, s.vp.w, s.vp.h, dpr, glow.current, cueNow, cu?.accent)
        stats.cueLit = cueNow ? cueNow.k : 0
        lastCam = c; lastVp = vpKey; pasteDirty.current = false
      }
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [phone])
  return { pasteRef: paste, pasteDirtyRef: pasteDirty, glowRef: glow, cueRef: cue }
}
