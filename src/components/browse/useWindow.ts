/**
 * Windowed mounting for BROWSE (#182): one IntersectionObserver watches every slot, and only slots within a
 * screen's height of the viewport get their card. A card that falls further away unmounts (its canvas and
 * clock go with it); one that comes near mounts on the next frame, a few per frame, so a fast scroll or a long
 * jump never builds dozens of cards in one task. Cards that are mounted still pause off screen on their own
 * (DotCanvas's `useOnScreen`), as on the boards.
 */
import { useEffect, useState } from 'react'

/** How far beyond the viewport a slot counts as near: one screen above and one below. */
const MARGIN = '100% 0px'
/** New cards mounted per animation frame. */
const PER_FRAME = 2

type Ref = (el: HTMLElement | null) => void

function createWindow(publish: (shown: ReadonlySet<string>) => void) {
  const near = new Set<string>(), els = new Map<string, HTMLElement>(), refs = new Map<string, Ref>()
  let shown: ReadonlySet<string> = new Set<string>(), raf = 0
  const pump = () => {
    raf = 0
    const next = new Set([...shown].filter(k => near.has(k)))
    let added = 0
    for (const k of near) { if (added >= PER_FRAME) break; if (!next.has(k)) { next.add(k); added++ } }
    const changed = next.size !== shown.size || [...next].some(k => !shown.has(k))
    shown = next
    if (changed) publish(next)
    if ([...near].some(k => !next.has(k))) schedule()
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(pump) }
  const io = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(entries => {
    for (const e of entries) {
      const k = (e.target as HTMLElement).dataset.slot
      if (k === undefined) continue
      if (e.isIntersecting) near.add(k); else near.delete(k)
    }
    schedule()
  }, { rootMargin: MARGIN })
  /** The ref for a slot keyed `key` (stable per key, so React never re-attaches it on a re-render). */
  const slot = (key: string): Ref => {
    let ref = refs.get(key)
    if (!ref) {
      ref = el => {
        const old = els.get(key)
        if (old && old !== el) { io?.unobserve(old); els.delete(key); near.delete(key); schedule() }
        if (!el || old === el) return
        els.set(key, el)
        if (io) io.observe(el); else { near.add(key); schedule() }
      }
      refs.set(key, ref)
    }
    return ref
  }
  return { slot, stop: () => { cancelAnimationFrame(raf); raf = 0 } }
}

/** `mounted`: the slot keys whose card may run now. `slot(key)`: the ref to put on that slot's element (it carries `data-slot={key}`). */
export function useWindow() {
  const [mounted, setMounted] = useState<ReadonlySet<string>>(() => new Set())
  const [win] = useState(() => createWindow(setMounted))
  useEffect(() => win.stop, [win])
  return { mounted, slot: win.slot }
}
