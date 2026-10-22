import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { beginDrag, dragValue, pick, releaseValue, sharedClock, toLocal } from '../engine'
import type { ClockSubscriber, Control, ControlPatch, DragStart, GridConfig, Pointer } from '../engine'
import type { InteractionContext } from './useDotField'

/** How long a keyboard-pressed button stays down (ms). */
const KEY_PRESS_MS = 140
/** How long a released touch pointer lingers in `pointers[]` (ms), so tDown-based ripples (0.5 s) finish. */
const LINGER_MS = 520

interface Drag { control: Control; start: DragStart; before: ControlPatch }
interface Live { hover?: string; pressed?: string; focus?: string }

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
  /** Pointer handlers for the element that shows the whole grid (pointer capture lands on it). */
  handlers: {
    onPointerDown(e: ReactPointerEvent<HTMLElement>): void
    onPointerMove(e: ReactPointerEvent<HTMLElement>): void
    onPointerUp(e: ReactPointerEvent<HTMLElement>): void
    onPointerCancel(e: ReactPointerEvent<HTMLElement>): void
    onPointerLeave(e: ReactPointerEvent<HTMLElement>): void
    onLostPointerCapture(e: ReactPointerEvent<HTMLElement>): void
  }
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
  const unlinger = (id: number) => { const h = lingers.current.get(id); if (h !== undefined) { window.clearTimeout(h); lingers.current.delete(id) } }
  // reset the handles too: StrictMode re-runs effects, and a stale handle would block every later schedule()
  useEffect(() => () => {
    cancelAnimationFrame(raf.current); raf.current = 0; window.clearTimeout(keyTimer.current)
    for (const h of lingers.current.values()) window.clearTimeout(h)
    lingers.current.clear()
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
    if (changed) {
      inputAt.current = performance.now()
      committed.current = { ...l }
      setIx(ixRef.current)
    }
    if (patch) onInputRef.current?.(patch)
    if (liveSub.current) sharedClock().invalidate(liveSub.current)
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
    for (const d of drags.current.values()) key = d.control.key
    live.current.pressed = key
  }

  /** Update the pointer record for an event; returns it in card cells. */
  const track = (e: ReactPointerEvent<HTMLElement>, patch: Partial<Pointer> = {}): Pointer => {
    const rect = e.currentTarget.getBoundingClientRect(), g = gridRef.current
    const { x, y } = toLocal(e.clientX, e.clientY, rect, g)
    const prev = pointers.current.get(e.pointerId), last = stamps.current.get(e.pointerId)
    const dt = prev && last !== undefined ? (e.timeStamp - last) / 1000 : 0
    const p: Pointer = {
      id: e.pointerId, x, y,
      inside: x >= -.5 && y >= -.5 && x <= g.cols - .5 && y <= g.rows - .5,
      down: prev?.down ?? false, tDown: prev?.tDown ?? 0, tUp: prev?.tUp ?? 0,
      vx: dt > 0 ? (x - prev!.x) / dt : prev?.vx ?? 0, vy: dt > 0 ? (y - prev!.y) / dt : prev?.vy ?? 0,
      pressure: e.pressure,
      ...patch,
    }
    pointers.current.set(e.pointerId, p); stamps.current.set(e.pointerId, e.timeStamp)
    return p
  }
  const keyAt = (e: ReactPointerEvent<HTMLElement>, p: Pointer) =>
    pick(controlsRef.current, p.x, p.y) ?? ((e.target as HTMLElement).closest?.('[data-dot-hit]') as HTMLElement | null)?.dataset.dotHit ?? null
  const control = (key: string | null) => (key ? controlsRef.current?.find(c => c.key === key) : undefined)
  const hovers = (e: ReactPointerEvent<HTMLElement>) => e.isPrimary && e.pointerType !== 'touch'

  const finish = (e: ReactPointerEvent<HTMLElement>, cancel: boolean) => {
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

  const handlers: ControlInput['handlers'] = {
    onPointerDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      unlinger(e.pointerId)
      const p = track(e, { down: true, up: false, tDown: sharedClock().time() })
      const key = keyAt(e, p), c = control(key)
      if (!c) { schedule(); return }
      // no text selection, native drag or emulated mouse events; focus the control ourselves
      e.preventDefault()
      try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch { /* pointer already gone (synthetic events) */ }
      const target = e.currentTarget.querySelector<HTMLElement>(`[data-dot-focus="${CSS.escape(c.key)}"]`)
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
    },
    onPointerMove(e) {
      const p = track(e), d = drags.current.get(e.pointerId)
      if (d) { set(dragValue(d.control, d.start, p)); moved.current = true }
      else if (hovers(e)) live.current.hover = keyAt(e, p) ?? undefined
      schedule()
    },
    onPointerUp(e) { finish(e, false) },
    onPointerCancel(e) { finish(e, true) },
    onLostPointerCapture(e) { if (drags.current.has(e.pointerId)) finish(e, false) },
    onPointerLeave(e) {
      if (drags.current.has(e.pointerId) || pointers.current.get(e.pointerId)?.up) return
      pointers.current.delete(e.pointerId); stamps.current.delete(e.pointerId)
      if (e.isPrimary) live.current.hover = undefined
      schedule()
    },
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
  useEffect(() => { drags.current.clear(); live.current = {}; schedule() }, [controlKey, schedule])

  const bindLive = useCallback((sub: ClockSubscriber) => {
    liveSub.current = sub
    return () => { if (liveSub.current === sub) liveSub.current = null }
  }, [])

  return { ix, ixRef, inputAt, bindLive, handlers, value, set, press, focus }
}
