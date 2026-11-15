/**
 * `dotRing` for first-load chrome (the header's DISPLAY ▾, THEME ▾ and CLACK): the same ref callback, with the ring
 * code fetched as its own small chunk so it stays out of the first-load budget. Until it lands the control keeps the
 * browser's dotted border (src/site/app/ring.css). Lazy chunks import `dotRing` itself.
 */
export function ringLater(el: HTMLElement | null) {
  let off: (() => void) | undefined
  if (el) void import('./dotRing').then(m => { off = m.dotRing(el) })
  return () => off?.()
}
