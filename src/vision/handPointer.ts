/**
 * HAND mode (WEB-PLAN C6): the webcam hand tracker as a virtual pointer for the whole page.
 *
 * While on, each new camera frame (≤ 30 fps) is drawn mirrored into a 96×72 canvas, tracked
 * (`createHandTracker`), mapped from the comfortable middle of the camera view to the viewport, and replayed
 * as real `PointerEvent`s (`pointerId` = `HAND_POINTER_ID`, `pointerType: 'pen'`): `pointerover` / `out`
 * when the element under the hand changes, `pointermove` every frame, `pointerdown` / `up` on pinch. The
 * cards' own input layer (`useControlInput`) handles them like a mouse, so every knob, slider and toggle
 * works by hand, and `ctx.pointers` carries the hand as `id: 'hand'`. Pointer capture is emulated: while
 * pinched, events keep going to the element the pinch started on.
 *
 * Privacy: frames stay in this tab (a `<video>`, one small canvas, typed arrays); nothing is uploaded or
 * stored. The camera is only requested from `handMode.set(true)` (a user's tap), released when switched off
 * or the tab is hidden. Browser only, framework-free; React reads it through `useSyncExternalStore`.
 */
import { acquireCamera, releaseCamera } from '../media/stream'
import { createHandTracker, type HandObservation, type HandTracker } from './tracker'

import { HAND_POINTER_ID } from './pointerId'
export { HAND_POINTER_ID }
const W = 96, H = 72
/** The part of the camera view that maps to the whole viewport (arms rarely reach the frame edge). */
const REACH = { x0: .15, x1: .85, y0: .12, y1: .78 }

export type HandStatus = 'idle' | 'starting' | 'live' | 'denied' | 'error'
export interface HandModeState {
  on: boolean
  status: HandStatus
  /** A hand is currently tracked. */
  present: boolean
  /** Pinched (pointer down). */
  down: boolean
}
/** Per-frame debug / test hook: `globalThis.__dotHandLog(obs, ms, t)` after every tracked frame. */
type LogHook = { __dotHandLog?: (obs: HandObservation, ms: number, t: number) => void }

let state: HandModeState = { on: false, status: 'idle', present: false, down: false }
const subs = new Set<() => void>()
const emit = (patch: Partial<HandModeState>) => {
  const next = { ...state, ...patch }
  if (next.on === state.on && next.status === state.status && next.present === state.present && next.down === state.down) return
  state = next
  for (const f of subs) f()
}

let video: HTMLVideoElement | null = null, holding = false, token = 0, raf = 0, lastTime = -1, lastProc = -Infinity
let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null
let tracker: HandTracker | null = null
let over: Element | null = null, captured: Element | null = null, downAt: Element | null = null
let cursor: HTMLDivElement | null = null, hud: HTMLDivElement | null = null

function fire(type: string, target: Element, x: number, y: number, buttons: number, related: Element | null = null) {
  target.dispatchEvent(new PointerEvent(type, {
    bubbles: type !== 'pointerenter' && type !== 'pointerleave', cancelable: true, composed: true,
    pointerId: HAND_POINTER_ID, pointerType: 'pen', isPrimary: true,
    clientX: x, clientY: y, screenX: x, screenY: y, button: type === 'pointermove' || type === 'pointerover' || type === 'pointerout' ? -1 : 0, buttons,
    pressure: buttons ? .5 : 0, width: 24, height: 24, relatedTarget: related,
  }))
}

function ui() {
  if (cursor || typeof document === 'undefined') return
  cursor = Object.assign(document.createElement('div'), { className: 'hand-cursor' })
  cursor.setAttribute('aria-hidden', 'true')
  Object.assign(cursor.style, { position: 'fixed', left: '0', top: '0', width: '26px', height: '26px', margin: '-13px 0 0 -13px', borderRadius: '50%', border: '2px solid #fff', color: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.55), inset 0 0 0 1px rgba(0,0,0,.35)', pointerEvents: 'none', zIndex: '2147483646', display: 'none', transition: 'background-color .08s' })
  hud = document.createElement('div')
  hud.setAttribute('role', 'status')
  Object.assign(hud.style, { position: 'fixed', left: '50%', bottom: '14px', transform: 'translateX(-50%)', zIndex: '2147483646', font: '500 12px/1.2 var(--mono, monospace)', letterSpacing: '.04em', padding: '7px 10px 7px 12px', borderRadius: '999px', background: 'var(--bg, #fafafa)', color: 'var(--text-h, #111)', border: '1px solid var(--border, rgba(0,0,0,.1))', boxShadow: '0 2px 12px rgba(0,0,0,.08)', display: 'none', alignItems: 'center', gap: '10px', textAlign: 'left' })
  const text = document.createElement('span'), stop = document.createElement('button')
  text.className = 'hand-hud-text'
  stop.type = 'button'; stop.textContent = 'STOP'; stop.setAttribute('aria-label', 'Stop hand mode and the camera')
  Object.assign(stop.style, { font: 'inherit', padding: '2px 8px', borderRadius: '999px', border: '1px solid currentColor', background: 'transparent', color: 'inherit', cursor: 'pointer' })
  stop.addEventListener('click', () => handMode.set(false))
  hud.append(text, stop)
  document.body.append(cursor, hud)
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && state.on) handMode.set(false) })
}
function hudText(s: string) {
  if (!hud) return
  hud.style.display = state.on ? 'flex' : 'none'
  const t = hud.querySelector('.hand-hud-text'); if (t) t.textContent = s
}
const HUD: Record<HandStatus, string> = {
  idle: '', starting: 'HAND · ALLOW CAMERA', denied: 'HAND · NO CAMERA', error: 'HAND · NO CAMERA',
  live: 'HAND · PINCH TO PRESS · VIDEO STAYS ON THIS DEVICE · ESC',
}

/** Leave the page: release a pinch, then out of the element under the hand (the input layer drops the pointer). */
function vanish(x: number, y: number) {
  if (captured) { fire('pointerup', captured, x, y, 0); captured = null; downAt = null }
  if (over) { fire('pointerout', over, x, y, 0, null); over = null }
  if (cursor) cursor.style.display = 'none'
  emit({ present: false, down: false })
}

let lx = 0, ly = 0
function apply(o: HandObservation) {
  if (!o.present) { if (state.present) vanish(lx, ly); return }
  const u = Math.min(1, Math.max(0, (o.x - REACH.x0) / (REACH.x1 - REACH.x0))), v = Math.min(1, Math.max(0, (o.y - REACH.y0) / (REACH.y1 - REACH.y0)))
  const x = u * (innerWidth - 1), y = v * (innerHeight - 1)
  lx = x; ly = y
  if (cursor) {
    cursor.style.display = 'block'
    cursor.style.transform = `translate(${x}px, ${y}px) scale(${o.pinch ? .7 : 1})`
    cursor.style.backgroundColor = o.pinch ? 'currentColor' : 'transparent'
  }
  const hit = document.elementFromPoint(x, y)
  if (!captured && hit !== over) {
    if (over) fire('pointerout', over, x, y, 0, hit)
    if (hit) fire('pointerover', hit, x, y, 0, over)
    over = hit
  }
  const target = captured ?? hit
  if (target) fire('pointermove', target, x, y, captured ? 1 : 0)
  if (o.pinch && !captured && hit) { captured = hit; downAt = hit; fire('pointerdown', hit, x, y, 1) }
  else if (!o.pinch && captured) {
    const was = captured
    captured = null
    fire('pointerup', was, x, y, 0)
    // page chrome (tabs, links) gets a click; cards act on down / up themselves
    if (downAt && hit && downAt === hit && !hit.closest('.dot-card')) (hit.closest('button, a, [role="tab"]') as HTMLElement | null)?.click()
    downAt = null
  }
  emit({ present: true, down: !!captured })
}

/** Next tick: once per decoded camera frame where supported (no polling, no missed frames), else per animation frame. */
let vfc = 0
const schedule = () => { if (video?.requestVideoFrameCallback) vfc = video.requestVideoFrameCallback((t, meta) => frame(t, meta.presentedFrames)); else raf = requestAnimationFrame(frame) }
const stopLoop = () => { cancelAnimationFrame(raf); raf = 0; if (vfc) video?.cancelVideoFrameCallback?.(vfc); vfc = 0 }

function frame(now: number, presented?: number) {
  schedule()
  const vd = video
  // ≤ ~45 fps of tracking even on a 60 fps camera
  const key = presented ?? vd?.currentTime ?? -1
  if (!vd || vd.readyState < 2 || key === lastTime || now - lastProc < 22) return
  const vw = vd.videoWidth, vh = vd.videoHeight
  if (!vw || !vh) return
  if (!ctx) {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H })
    ctx = c.getContext('2d', { willReadFrequently: true }) as typeof ctx
    if (!ctx) return
  }
  lastTime = key; lastProc = now
  const aspect = W / H, sw = Math.min(vw, vh * aspect), sh = sw / aspect
  ctx.setTransform(-1, 0, 0, 1, W, 0)
  ctx.drawImage(vd, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, W, H)
  const a = performance.now(), px = ctx.getImageData(0, 0, W, H).data
  const o = (tracker ??= createHandTracker(W, H)).push(px, now / 1000)
  apply(o)
  ;(globalThis as LogHook).__dotHandLog?.(o, performance.now() - a, now)
}

async function start() {
  const mine = ++token
  emit({ status: 'starting' }); hudText(HUD.starting)
  try {
    const s = await acquireCamera()
    if (mine !== token) { releaseCamera(); return }
    holding = true
    video ??= Object.assign(document.createElement('video'), { muted: true, playsInline: true })
    video.srcObject = s
    await video.play()
    if (mine !== token) return
    tracker?.reset(); lastTime = -1
    stopLoop(); schedule()
    emit({ status: 'live' }); hudText(HUD.live)
  } catch (e) {
    if (mine !== token) return
    const name = (e as DOMException)?.name, status: HandStatus = name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error'
    emit({ status }); hudText(HUD[status])
  }
}
function halt() {
  token++
  stopLoop()
  vanish(lx, ly)
  if (video) { video.pause(); video.srcObject = null }
  if (holding) { holding = false; releaseCamera() }
}
const onVisibility = () => { if (!state.on) return; if (document.hidden) { halt(); emit({ status: 'idle' }) } else void start() }

export const handMode = {
  get: (): HandModeState => state,
  subscribe(f: () => void): () => void { subs.add(f); return () => { subs.delete(f) } },
  /** Turn HAND mode on (asks for the camera: call from a user action) or off (releases it). */
  set(on: boolean): void {
    if (on === state.on) return
    ui()
    emit({ on })
    if (on) { document.addEventListener('visibilitychange', onVisibility); void start() }
    else { document.removeEventListener('visibilitychange', onVisibility); halt(); emit({ status: 'idle' }); hudText('') }
  },
}
