/**
 * How the editor fits the screen: which layout the viewport gets (desktop, a phone upright, a phone on its side),
 * the part an on-screen keyboard leaves, the desktop height below the site bar, and the phone's full-screen lock.
 * The rules themselves are React-free in phone.ts and typing.ts; these hooks wire them to the page.
 */
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type RefObject } from 'react'
import { keyboardBox, LANDSCAPE_QUERY, PHONE_QUERY, type Layout } from './phone'
import { keepTypingInView } from './typing'

const subscribeMQ = (cb: () => void) => {
  const ms = [matchMedia(PHONE_QUERY), matchMedia(LANDSCAPE_QUERY)]
  for (const m of ms) m.addEventListener('change', cb)
  return () => { for (const m of ms) m.removeEventListener('change', cb) }
}
const layoutNow = (): Layout => (!matchMedia(PHONE_QUERY).matches ? 'desktop' : matchMedia(LANDSCAPE_QUERY).matches ? 'landscape' : 'portrait')
export const useLayout = () => useSyncExternalStore(subscribeMQ, layoutNow, (): Layout => 'desktop')

type KeyboardBox = ReturnType<typeof keyboardBox>
const sameBox = (a: KeyboardBox, b: KeyboardBox) => a?.top === b?.top && a?.height === b?.height
/**
 * Phone: the part of the screen an on-screen keyboard leaves (`visualViewport`), or undefined when none is
 * open. The editor then fills just that part, so the sheet sits on the keyboard and the canvas above it.
 */
export function useKeyboard(phone: boolean): KeyboardBox {
  const [box, setBox] = useState<KeyboardBox>(undefined)
  useEffect(() => {
    const vv = window.visualViewport
    if (!phone || !vv) return
    let raf = 0
    const on = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => { const b = keyboardBox(window.innerHeight, vv); setBox(p => (sameBox(p, b) ? p : b)) })
    }
    on()
    vv.addEventListener('resize', on); vv.addEventListener('scroll', on)
    return () => { cancelAnimationFrame(raf); vv.removeEventListener('resize', on); vv.removeEventListener('scroll', on) }
  }, [phone])
  return phone ? box : undefined
}

/**
 * Desktop: the editor fills the window below the site bar (the footer sits below the fold). Re-measured when the page
 * above changes height too: the site bar grows after mount (the lazily loaded tool dock is portaled into it), and a
 * height measured once would leave the editor's bottom edge below the window.
 */
export function useFillWindow(rootRef: RefObject<HTMLElement | null>, phone: boolean) {
  useLayoutEffect(() => {
    const el = rootRef.current
    if (!el || phone) return
    const size = () => { const top = el.getBoundingClientRect().top + window.scrollY; el.style.setProperty('--ed-h', `${Math.max(520, window.innerHeight - top)}px`) }
    size()
    window.addEventListener('resize', size)
    // next frame, not inside the callback: resizing the editor resizes the observed page (no RO loop error)
    let raf = 0
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(size) })
    ro.observe(document.documentElement)
    return () => { window.removeEventListener('resize', size); ro.disconnect(); cancelAnimationFrame(raf) }
  }, [rootRef, phone])
}

/**
 * Phone: the editor is the whole screen, so the page underneath must not scroll or rubber-band. When the keyboard
 * (`kbH`, its visible height) opens or closes, once the canvas has its new size, the text being typed and the field
 * with focus in the sheet move back into view (the caret stays visible).
 */
export function usePhoneScreen(phone: boolean, kbH: number | undefined) {
  useEffect(() => {
    if (!phone) return
    document.documentElement.classList.add('ed-scroll-lock')
    return () => document.documentElement.classList.remove('ed-scroll-lock')
  }, [phone])
  useEffect(() => {
    if (!phone) return
    const t = setTimeout(() => {
      keepTypingInView()
      const a = document.activeElement
      if (a instanceof HTMLElement && a.closest('.ed-sheet')) a.scrollIntoView({ block: 'nearest' })
    }, 120)
    return () => clearTimeout(t)
  }, [kbH, phone])
}
