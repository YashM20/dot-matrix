import { useEffect, useRef, type ReactNode } from 'react'

/**
 * A bottom sheet (phones): a native modal `<dialog>`, so the page behind is inert (focus stays inside),
 * Escape closes it and focus returns to the opener. It is a scroll-snap sheet (src/site/mobile.css): the
 * dialog scrolls between two stops, "closed" (an empty screen above the panel) and "open" (the panel's
 * end), so dragging it down is the browser's own scroll, with no gesture code. It opens at the open stop; a
 * drag or flick that settles on the closed stop closes it, as do DONE, Escape and a tap above or beside the
 * panel. The scrim follows the scroll. The page under it doesn't scroll. Mounted only while open.
 */
export function Sheet({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const opener = document.activeElement as HTMLElement | null
    if (!d.open) d.showModal()
    // the marked row (the current board) takes focus and the middle of the list; else the dialog's default
    const sel = d.querySelector<HTMLElement>('[data-sheet-focus]')
    if (sel) { sel.focus({ preventScroll: true }); sel.scrollIntoView({ block: 'center' }) }
    // it arrives by scrolling from the closed stop to the open one (after scrollIntoView, which may have moved the
    // dialog too): no transform, so the snap geometry never moves; at once under reduced motion
    const end = () => d.scrollHeight - d.clientHeight
    let armed = false
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { d.scrollTop = end(); armed = true }
    else { d.scrollTop = 0; d.scrollTo({ top: end(), behavior: 'smooth' }) }
    const onScroll = () => { if (!armed) armed = d.scrollTop >= end() - 2; else if (d.scrollTop < 2) close.current() }
    d.addEventListener('scroll', onScroll, { passive: true })
    return () => { d.removeEventListener('scroll', onScroll); if (d.open) d.close(); opener?.focus?.({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={`sheet ${className}`} aria-label={label}
    onCancel={e => { e.preventDefault(); onClose() }}
    onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="sheet-rest" aria-hidden="true" onClick={onClose} />
    <div className="sheet-panel">
      <div className="sheet-grab" aria-hidden="true"><i /></div>
      <header className="sheet-head"><h2>{label}</h2><button type="button" className="sheet-done" onClick={onClose}>DONE</button></header>
      <div className="sheet-body">{children}</div>
    </div>
  </dialog>
}
