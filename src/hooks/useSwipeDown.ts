import { useEffect, useRef, type RefObject } from 'react'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** How far (px) or how fast (px/ms) a downward drag must go to dismiss a sheet. */
const DISMISS_PX = 90, DISMISS_V = 0.6

/**
 * Swipe down to dismiss (phones): a drag that starts on the grab handle, or anywhere in the sheet while
 * its scroller is at the top, moves the sheet with the finger; past `DISMISS_PX` (or a flick) it closes,
 * otherwise it springs back. Touch only: a mouse keeps its clicks and wheel.
 */
export function useSwipeDown(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let y0 = 0, t0 = 0, dy = 0, armed = false, moving = false
    const scroller = (t: EventTarget | null) => (t as Element | null)?.closest?.<HTMLElement>('[data-sheet-scroll]')
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) { armed = false; return }
      const s = scroller(e.target)
      armed = !s || s.scrollTop <= 0 || !!(e.target as Element).closest('[data-sheet-grab]')
      y0 = e.touches[0].clientY; t0 = performance.now(); dy = 0; moving = false
    }
    const move = (e: TouchEvent) => {
      if (!armed) return
      dy = e.touches[0].clientY - y0
      if (!moving && dy < 6) { if (dy < -6) armed = false; return }
      moving = true
      e.preventDefault() // the sheet moves, not the page or the list
      el.style.transition = 'none'
      el.style.transform = `translateY(${Math.max(0, dy)}px)`
    }
    const end = () => {
      if (!armed || !moving) return
      armed = moving = false
      const v = dy / Math.max(1, performance.now() - t0)
      el.style.transition = reduced() ? 'none' : ''
      if (dy > DISMISS_PX || v > DISMISS_V) { el.style.transform = `translateY(100%)`; window.setTimeout(() => close.current(), reduced() ? 0 : 160) }
      else el.style.transform = ''
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => { el.removeEventListener('touchstart', start); el.removeEventListener('touchmove', move); el.removeEventListener('touchend', end); el.removeEventListener('touchcancel', end) }
  }, [ref])
}
