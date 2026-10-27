import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { flushSync } from 'react-dom'
import { TOUCH, beginDrag, classifyMove, dragValue, isTap, pick, releaseValue, toLocal, touchIntent } from '../engine/interaction'
import { quantizeTime, sharedClock } from '../engine/clock'
import type { ClockSubscriber, Control, ControlPatch, DragStart, GridConfig, Pointer, TouchIntent } from '../engine'
import type { InteractionContext } from './useDotField'
import { LATENCY_PROBE, resolveMarks, type LatencyMark } from './latencyProbe'
import { HAND_POINTER_ID } from '../vision/pointerId'

/** How long a keyboard-pressed button stays down (ms). */
const KEY_PRESS_MS = 140
/** How long a released touch pointer lingers in `pointers[]` (ms), so tDown-based ripples (0.5 s) finish. */
const LINGER_MS = 520
/** A long-press context menu this soon (ms) after a touch on the card is swallowed. */
const CONTEXT_MENU_MS = 1500

interface Drag { control: Control; start: DragStart; before: ControlPatch }
interface Live { hover?: string; pressed?: string; focus?: string }
/** The fields of a pointer event the input layer reads, copied: React clears `currentTarget` after dispatch, and candidate touches replay later. */
interface Ev { pointerId: number; clientX: number; clientY: number; timeStamp: number; pressure: number; pointerType: string; isPrimary: boolean; root: HTMLElement; target: EventTarget | null }
const copy = (e: ReactPointerEvent<HTMLElement>): Ev => ({ pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY, timeStamp: e.timeStamp, pressure: e.pressure, pointerType: e.pointerType, isPrimary: e.isPrimary, root: e.currentTarget, target: e.target })
/** A touch that has not shown yet that it is meant for the card (`engine/interaction/gesture.ts`): no value, no pointer, no capture. */
interface Candidate { down: Ev; last: Ev; key: string | null; intent: TouchIntent | 'none'; tClock: number; shown: boolean; timer: number }

/** A touch that lands this soon (ms) after the page scrolled is stopping a fling, not touching the card. */
const FLING_MS = 120
/** `performance.now()` of the page's last scroll (any scroller), from one passive capture listener for every card. */
let lastScroll = -Infinity, watchingScroll = false
function watchScroll() {
  if (watchingScroll || typeof window === 'undefined') return
  watchingScroll = true
  window.addEventListener('scroll', () => { lastScroll = performance.now() }, { capture: true, passive: true })
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
/** One short tick when a hold grabs a card: feature-detected, never under reduced motion or before the page had a real activation. */
function haptic() {
  try { if (!reducedMotion() && navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(10) } catch { /* unsupported */ }
}

/** Plain snapshot for the frame context; undefined at rest so a resting card samples exactly as before. */
function snapshot(live: Live, pointers: Map<number, Pointer>): InteractionContext | undefined {
  const out: InteractionContext = {}
  if (live.hover) out.hover = live.hover
  if (live.pressed) out.pressed = live.pressed
  if (live.focus) out.focus = live.focus
  if (pointers.size) out.pointers = [...pointers.values()].map(p => ({ ...p }))
  return Object.keys(out).length ? out : undefined
}

export interface ControlInput {
  /** Committed interaction context (static sampling path); changes at most once per animation frame. */
  ix: InteractionContext | undefined
  /** Latest interaction context (live path and transients read it per frame). */
  ixRef: { readonly current: InteractionContext | undefined }
  /** `performance.now()` of the last input-driven commit: frames it causes cut instead of dissolving. */
  inputAt: { readonly current: number }
  /** Register the live clock subscriber (invalidated on input so feedback does not wait for the card's fps tick); returns the unbind. */
  bindLive(sub: ClockSubscriber): () => void
  /** Pointer handlers (and the ref / state attribute) for the element that shows the whole grid (pointer capture lands on it). */
  handlers: {
    ref(el: HTMLElement | null): void
    'data-engaged'?: ''
    onPointerDown(e: ReactPointerEvent<HTMLElement>): void
    onPointerMove(e: ReactPointerEvent<HTMLElement>): void
    onPointerUp(e: ReactPointerEvent<HTMLElement>): void
    onPointerCancel(e: ReactPointerEvent<HTMLElement>): void
    onPointerLeave(e: ReactPointerEvent<HTMLElement>): void
    onLostPointerCapture(e: ReactPointerEvent<HTMLElement>): void
    onContextMenu(e: ReactMouseEvent<HTMLElement>): void
    /** Dev latency probe only: stamps keyboard input on the overlay's controls. */
    onKeyDownCapture?(e: ReactKeyboardEvent<HTMLElement>): void
  }
  /**
   * Touch: the card is engaged (a hold grabbed one of its drag controls). Its drag controls then take every
   * touch at once, page scroll included, until `disengage()`: a touch outside the card, Escape, DONE, or idle.
   */
  engaged: boolean
  disengage(): void
  /** Call after every canvas draw with the data it drew (input → frame bookkeeping; feeds the dev latency probe). */
  drawn(data: Record<string, number>): void
  /** Current value of a data key (pending input included). */
  value(key: string): number
  /** Apply a patch (keyboard / assistive tech); committed on the next animation frame. */
  set(patch: ControlPatch): void
  /** Momentary keyboard press of a button: down now, released after a beat. */
  press(control: Control): void
  /** Keyboard focus moved to `key` (undefined = left); only `visible` focus shows in the context. */
  focus(key: string | undefined, visible: boolean): void
}

/**
 * The app side of the input layer: pointer / touch / keyboard → `data` patches (via `onInput`) and
 * `hover` / `pressed` / `focus` / `pointers` for the frame context. Everything is batched to one
 * commit per animation frame; a static card re-samples only when hover / press / focus / data change
 * or while a drag moves (plain hovering does not re-sample it).
 *
 * Mouse and pen act on press. Touch is scroll-first (`TOUCH` policy, docs/UX-PLAN.md › Touch policy): a
 * touch is a candidate the card does not see until it is a still tap (acts on lift), a horizontal drag on
 * a drag control, or a hold; only a claimed touch captures the pointer and blocks the page's scroll.
 */
export function useControlInput(controls: Control[] | undefined, grid: GridConfig, data: Record<string, number>, onInput?: (patch: ControlPatch) => void): ControlInput {
  const [ix, setIx] = useState<InteractionContext | undefined>(undefined)
  const ixRef = useRef<InteractionContext | undefined>(undefined)
  const inputAt = useRef(-Infinity)
  const liveSub = useRef<ClockSubscriber | null>(null)
  const dataRef = useRef(data), onInputRef = useRef(onInput), controlsRef = useRef(controls), gridRef = useRef(grid)
  useLayoutEffect(() => { dataRef.current = data; onInputRef.current = onInput; controlsRef.current = controls; gridRef.current = grid })

  const pointers = useRef(new Map<number, Pointer>()), stamps = useRef(new Map<number, number>())
  const drags = useRef(new Map<number, Drag>())
  const live = useRef<Live>({}), committed = useRef<Live>({})
  const pending = useRef<ControlPatch | null>(null), moved = useRef(false), keyPress = useRef<string | undefined>(undefined)
  const raf = useRef(0), keyTimer = useRef(0)
  const lingers = useRef(new Map<number, number>()), lingerDirty = useRef(false)
  // touch policy: candidates, touches the card claimed (they block the page's scroll), taps being replayed
  const candidates = useRef(new Map<number, Candidate>()), claimed = useRef(new Set<number>()), taps = useRef(new Map<number, number>())
  const touchAt = useRef(-Infinity), root = useRef<HTMLElement | null>(null)
  const [engaged, setEngaged] = useState(false)
  const engagedRef = useRef(false), idleTimer = useRef(0)
  // dev latency probe (P2-G): event stamps since the last flush, and marks waiting for the draw that shows them
  const stamped = useRef<number[]>([]), marks = useRef<LatencyMark[]>([])
  /** Canvas draws reported by the owner (`drawn`): tells `flush` whether its commit already redrew the card. */
  const draws = useRef(0)
  const note = (e: { timeStamp: number }) => { if (LATENCY_PROBE) stamped.current.push(e.timeStamp) }
  const unlinger = (id: number) => { const h = lingers.current.get(id); if (h !== undefined) { window.clearTimeout(h); lingers.current.delete(id) } }
  // reset the handles too: StrictMode re-runs effects, and a stale handle would block every later schedule()
  useEffect(() => () => {
    cancelAnimationFrame(raf.current); raf.current = 0; window.clearTimeout(keyTimer.current); window.clearTimeout(idleTimer.current)
    for (const h of lingers.current.values()) window.clearTimeout(h)
    for (const c of candidates.current.values()) window.clearTimeout(c.timer)
    for (const h of taps.current.values()) window.clearTimeout(h)
    lingers.current.clear(); candidates.current.clear(); taps.current.clear(); claimed.current.clear()
  }, [])

  const value = useCallback((key: string) => {
    const p = pending.current?.[key]
    return p ?? dataRef.current[key] ?? 0
  }, [])

  const flush = useCallback(() => {
    raf.current = 0
    const patch = pending.current
    pending.current = null
    const l = live.current, c = committed.current
    ixRef.current = snapshot(l, pointers.current)
    const changed = !!patch || l.hover !== c.hover || l.pressed !== c.pressed || l.focus !== c.focus || (!!l.pressed && moved.current) || lingerDirty.current
    moved.current = false; lingerDirty.current = false
    if (LATENCY_PROBE && stamped.current.length) {
      // only events that changed something wait for a frame; the rest had nothing to show
      if (changed) for (const stamp of stamped.current) marks.current.push({ stamp, patch: patch ?? undefined })
      stamped.current = []
    }
    if (changed) { inputAt.current = performance.now(); committed.current = { ...l } }
    // commit inside this animation frame (not on React's next scheduler task, which lands after the paint), so the
    // card's layout effect draws the edit before this frame paints: one frame from input to pixels, not two
    const before = draws.current
    if (changed || patch) flushSync(() => {
      if (changed) setIx(ixRef.current)
      if (patch) onInputRef.current?.(patch)
    })
    // a live card that the commit did not redraw (hover / press / focus only: ix is read per frame) draws now,
    // inside this frame, instead of on the clock's next one
    const sub = liveSub.current
    if (sub && changed && draws.current === before) { const { t, frame } = quantizeTime(sharedClock().time(), sub.fps); sub.onFrame(t, frame) }
    else if (sub) sharedClock().invalidate(sub)
  }, [])
  const schedule = useCallback(() => { if (!raf.current) raf.current = requestAnimationFrame(flush) }, [flush])

  const set = useCallback((patch: ControlPatch | null) => {
    if (!patch) return
    let differs = false
    for (const k in patch) if (value(k) !== patch[k]) differs = true
    if (!differs) return
    pending.current = { ...pending.current, ...patch }
    schedule()
  }, [value, schedule])

  const syncPressed = () => {
    let key = keyPress.current
    // a still candidate on a tap control shows its press after the press delay (no value change yet)
    for (const c of candidates.current.values()) if (c.shown && c.key) key = c.key
    for (const d of drags.current.values()) key = d.control.key
    live.current.pressed = key
  }

  // engagement (touch): a hold grabbed the card; the card lets go on a touch elsewhere, Escape, DONE or when idle
  const disengage = useCallback(() => {
    window.clearTimeout(idleTimer.current)
    if (!engagedRef.current) return
    engagedRef.current = false
    setEngaged(false)
  }, [])
  const bumpIdle = () => {
    window.clearTimeout(idleTimer.current)
    if (!engagedRef.current) return
    const wait = () => { idleTimer.current = window.setTimeout(() => { if (claimed.current.size) wait(); else disengage() }, TOUCH.idle) }
    wait()
  }
  const engage = () => {
    if (!engagedRef.current) { engagedRef.current = true; setEngaged(true) }
    bumpIdle()
  }
  useEffect(() => {
    if (!engaged) return
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) disengage() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') disengage() }
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key) }
  }, [engaged, disengage])

  // a claimed touch owns the gesture: its touchmoves stop the page scroll (non-passive, on this card only; an
  // unclaimed touch is never prevented, so scrolling over a card stays on the compositor's fast path)
  const [touchMove] = useState(() => (e: TouchEvent) => { if (claimed.current.size && e.cancelable) e.preventDefault() })
  const ref = useCallback((el: HTMLElement | null) => {
    root.current?.removeEventListener('touchmove', touchMove)
    root.current = el
    el?.addEventListener('touchmove', touchMove, { passive: false })
    if (el) watchScroll()
  }, [touchMove])

  /** Pointer position in card cells (no bookkeeping). */
  const locate = (e: Ev) => toLocal(e.clientX, e.clientY, e.root.getBoundingClientRect(), gridRef.current)
  /** Update the pointer record for an event; returns it in card cells. */
  const track = (e: Ev, patch: Partial<Pointer> = {}): Pointer => {
    const g = gridRef.current, { x, y } = locate(e)
    const prev = pointers.current.get(e.pointerId), last = stamps.current.get(e.pointerId)
    const dt = prev && last !== undefined ? (e.timeStamp - last) / 1000 : 0
    const p: Pointer = {
      id: e.pointerId === HAND_POINTER_ID ? 'hand' : e.pointerId, x, y,
      inside: x >= -.5 && y >= -.5 && x <= g.cols - .5 && y <= g.rows - .5,
      down: prev?.down ?? false, tDown: prev?.tDown ?? 0, tUp: prev?.tUp ?? 0,
      vx: dt > 0 ? (x - prev!.x) / dt : prev?.vx ?? 0, vy: dt > 0 ? (y - prev!.y) / dt : prev?.vy ?? 0,
      pressure: e.pressure,
      ...patch,
    }
    pointers.current.set(e.pointerId, p); stamps.current.set(e.pointerId, e.timeStamp)
    return p
  }
  const keyAt = (e: Ev, p: { x: number; y: number }) =>
    pick(controlsRef.current, p.x, p.y) ?? ((e.target as HTMLElement | null)?.closest?.('[data-dot-hit]') as HTMLElement | null)?.dataset.dotHit ?? null
  const control = (key: string | null) => (key ? controlsRef.current?.find(c => c.key === key) : undefined)
  const hovers = (e: Ev) => e.isPrimary && e.pointerType !== 'touch'

  /**
   * Press a control: the pointer goes down on it, the drag starts and the value answers. `claim` (mouse, pen and
   * claimed touches) captures the pointer; a touch claim also blocks the page's scroll while it lasts.
   */
  const grab = (e: Ev, c: Control, claim: boolean, tDown = sharedClock().time()) => {
    const p = track(e, { down: true, up: false, tDown })
    if (claim) {
      try { e.root.setPointerCapture?.(e.pointerId) } catch { /* pointer already gone (synthetic events) */ }
      if (e.pointerType === 'touch') claimed.current.add(e.pointerId)
    }
    const target = e.root.querySelector<HTMLElement>(`[data-dot-focus="${CSS.escape(c.key)}"]`)
    // pointer-initiated focus is never "visible": no focus ring in the context (keyboard use turns it back on)
    target?.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
    live.current.focus = undefined
    const d = dataRef.current, start = beginDrag(c, p.x, p.y, { ...d, ...pending.current })
    const before: ControlPatch = { [c.key]: value(c.key) }
    if (c.kind === 'xy') { const ky = c.keyY ?? `${c.key}Y`; before[ky] = value(ky) }
    drags.current.set(e.pointerId, { control: c, start, before })
    set(dragValue(c, start, p))
    if (hovers(e)) live.current.hover = c.key
    syncPressed(); schedule()
  }
  const drag = (e: Ev) => {
    const p = track(e), d = drags.current.get(e.pointerId)
    if (d) { set(dragValue(d.control, d.start, p)); moved.current = true }
    else if (hovers(e)) live.current.hover = keyAt(e, p) ?? undefined
    schedule()
  }

  const finish = (e: Ev, cancel: boolean) => {
    claimed.current.delete(e.pointerId)
    const d = drags.current.get(e.pointerId)
    if (d) { drags.current.delete(e.pointerId); set(cancel ? d.before : releaseValue(d.control)) }
    const p = pointers.current.get(e.pointerId)
    if (p) {
      // touch pointers end with the contact; a mouse stays (hovering) until it leaves
      if (cancel) { unlinger(e.pointerId); pointers.current.delete(e.pointerId); stamps.current.delete(e.pointerId) }
      else if (e.pointerType === 'touch') {
        // a released touch lingers (up, not inside / down) so the press ripple plays out; it never counts as hover / pressed
        pointers.current.set(e.pointerId, { ...p, down: false, inside: false, up: true, tUp: sharedClock().time() })
        unlinger(e.pointerId); lingerDirty.current = true
        lingers.current.set(e.pointerId, window.setTimeout(() => {
          lingers.current.delete(e.pointerId)
          if (pointers.current.get(e.pointerId)?.up) { pointers.current.delete(e.pointerId); stamps.current.delete(e.pointerId) }
          lingerDirty.current = true; schedule()
        }, LINGER_MS))
      } else pointers.current.set(e.pointerId, { ...p, down: false, tUp: sharedClock().time() })
    }
    if (e.pointerType === 'touch' && e.isPrimary) live.current.hover = undefined
    syncPressed(); schedule()
  }

  // ── touch candidates ──
  const drop = (c: Candidate) => {
    window.clearTimeout(c.timer)
    candidates.current.delete(c.down.pointerId)
    if (c.shown) { c.shown = false; syncPressed(); schedule() }
  }
  const candidate = (e: Ev, key: string | null, intent: TouchIntent | 'none') => {
    const c = control(key), cand: Candidate = { down: e, last: e, key, intent, tClock: sharedClock().time(), shown: false, timer: 0 }
    if (c && intent === 'tap') cand.timer = window.setTimeout(() => {
      // still after the press delay: the press shows; a button goes down for real (held while the finger stays)
      if (c.kind === 'button') { drop(cand); grab(cand.last, c, false, cand.tClock); return }
      cand.shown = true; syncPressed(); schedule()
    }, TOUCH.pressDelay)
    else if (c && intent === 'drag') {
      const hold = (late: boolean) => {
        // a late timer means the main thread was busy: moves may still be queued, so let them in first (once)
        if (!late && performance.now() - cand.down.timeStamp > TOUCH.hold + 60) { cand.timer = window.setTimeout(() => hold(true), 30); return }
        // held still: grab it (any direction from here on) and engage the card
        drop(cand); grab(cand.last, c, true, cand.tClock); engage(); haptic()
      }
      cand.timer = window.setTimeout(() => hold(false), TOUCH.hold)
    }
    candidates.current.set(e.pointerId, cand)
  }
  /** A real tap: replay it as a short press where the finger landed (so toggles, options, steppers and sliders act on lift). */
  const tap = (cand: Candidate) => {
    const e = cand.down, c = control(cand.key)
    if (c) grab(e, c, false, cand.tClock)
    else { track(e, { down: true, up: false, tDown: cand.tClock }); schedule() }
    taps.current.set(e.pointerId, window.setTimeout(() => { taps.current.delete(e.pointerId); finish(e, false) }, TOUCH.tapPress))
  }

  const handlers: ControlInput['handlers'] = {
    ref,
    ...(engaged ? { 'data-engaged': '' as const } : {}),
    onPointerDown(r) {
      if (r.pointerType === 'mouse' && r.button !== 0) return
      note(r)
      unlinger(r.pointerId)
      const e = copy(r)
      if (e.pointerType === 'touch') {
        touchAt.current = performance.now(); bumpIdle()
        // a finger that lands to stop a fling (the page was just scrolling) is the page's: no tap, no hold
        if (touchAt.current - lastScroll < FLING_MS) return
        const key = keyAt(e, locate(e)), c = control(key), intent = c ? touchIntent(c) : 'none'
        // an engaged card's drag controls answer at once (their hit pads are `touch-action: none` then)
        if (c && intent === 'drag' && engagedRef.current) { r.preventDefault(); grab(e, c, true); return }
        candidate(e, key, intent)
        return
      }
      const c = control(keyAt(e, locate(e)))
      if (!c) { track(e, { down: true, up: false, tDown: sharedClock().time() }); schedule(); return }
      // no text selection, native drag or emulated mouse events; focus the control ourselves
      r.preventDefault()
      grab(e, c, true)
    },
    onPointerMove(r) {
      note(r)
      const e = copy(r), cand = candidates.current.get(e.pointerId)
      if (cand) {
        cand.last = e
        const verdict = classifyMove(cand.intent, e.clientX - cand.down.clientX, e.clientY - cand.down.clientY)
        if (verdict === 'scroll') drop(cand)
        else if (verdict === 'claim') { drop(cand); grab(cand.down, control(cand.key)!, true, cand.tClock); drag(e) }
        return
      }
      // a button pressed by a still finger is not claimed: moving away is a scroll, so the press is called off
      if (e.pointerType === 'touch' && drags.current.has(e.pointerId) && !claimed.current.has(e.pointerId) && !taps.current.has(e.pointerId)) {
        const p = pointers.current.get(e.pointerId), here = locate(e), g = gridRef.current, rect = e.root.getBoundingClientRect()
        if (p && Math.hypot((here.x - p.x) * rect.width / g.cols, (here.y - p.y) * rect.height / g.rows) > TOUCH.slop) { finish(e, true); return }
      }
      if (taps.current.has(e.pointerId)) return
      drag(e)
    },
    onPointerUp(r) {
      note(r)
      const e = copy(r), cand = candidates.current.get(e.pointerId)
      if (cand) {
        drop(cand)
        if (isTap(control(cand.key), Math.hypot(e.clientX - cand.down.clientX, e.clientY - cand.down.clientY), e.timeStamp - cand.down.timeStamp)) tap(cand)
        return
      }
      if (taps.current.has(e.pointerId)) return
      finish(e, false)
    },
    onPointerCancel(r) {
      note(r)
      const e = copy(r), cand = candidates.current.get(e.pointerId)
      if (cand) { drop(cand); return }
      finish(e, true)
    },
    // capture moving from a child (the implicit touch capture) to the root bubbles up here: only the root's own loss ends a drag
    onLostPointerCapture(r) { if (r.target === r.currentTarget && drags.current.has(r.pointerId)) finish(copy(r), false) },
    onPointerLeave(r) {
      const cand = candidates.current.get(r.pointerId)
      if (cand) { drop(cand); return }
      if (drags.current.has(r.pointerId) || taps.current.has(r.pointerId) || pointers.current.get(r.pointerId)?.up) return
      pointers.current.delete(r.pointerId); stamps.current.delete(r.pointerId)
      if (r.isPrimary) live.current.hover = undefined
      schedule()
    },
    // a long press on a card is not a request for the page's context menu (or a "save image" sheet)
    onContextMenu(r) { if (performance.now() - touchAt.current < CONTEXT_MENU_MS) r.preventDefault() },
    // keydown reaches the root before the overlay control handles it; the flush drops it if nothing changed
    ...(LATENCY_PROBE ? { onKeyDownCapture(e: ReactKeyboardEvent<HTMLElement>) { note(e); schedule() } } : {}),
  }

  const press = useCallback((c: Control) => {
    const down = dragValue(c, beginDrag(c, 0, 0, dataRef.current), { x: 0, y: 0 }), up = releaseValue(c)
    keyPress.current = c.key; live.current.pressed = c.key
    pending.current = { ...pending.current, ...down }; schedule()
    window.clearTimeout(keyTimer.current)
    keyTimer.current = window.setTimeout(() => {
      keyPress.current = undefined
      let key: string | undefined
      for (const d of drags.current.values()) key = d.control.key
      live.current.pressed = key
      if (up) pending.current = { ...pending.current, ...up }
      schedule()
    }, KEY_PRESS_MS)
  }, [schedule])

  const focus = useCallback((key: string | undefined, visible: boolean) => {
    live.current.focus = visible ? key : undefined
    schedule()
  }, [schedule])

  // controls removed (e.g. preset swap): drop stale state
  const controlKey = controls?.map(c => c.key).join(',') ?? ''
  useEffect(() => {
    drags.current.clear(); claimed.current.clear(); live.current = {}
    for (const c of candidates.current.values()) window.clearTimeout(c.timer)
    candidates.current.clear()
    schedule()
  }, [controlKey, schedule])

  const bindLive = useCallback((sub: ClockSubscriber) => {
    liveSub.current = sub
    return () => { if (liveSub.current === sub) liveSub.current = null }
  }, [])

  const drawn = useCallback((d: Record<string, number>) => { draws.current++; if (LATENCY_PROBE) resolveMarks(marks.current, d) }, [])

  return { ix, ixRef, inputAt, bindLive, handlers, engaged, disengage, value, set, press, focus, drawn }
}
