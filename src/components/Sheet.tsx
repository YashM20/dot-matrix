import { useEffect, useRef, type ReactNode } from 'react'
import { useSwipeDown } from '../hooks/useSwipeDown'

/**
 * A bottom sheet (phones): a native modal `<dialog>`, so the page behind is inert (focus stays inside),
 * Escape closes it and focus returns to the opener. A grab handle, swipe-down-to-dismiss, a tap on the
 * dimmed backdrop closes; the page under it doesn't scroll. Mounted only while open.
 */
export function Sheet({ label, onClose, children, className = '' }: { label: string; onClose: () => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  useSwipeDown(ref, onClose)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    const opener = document.activeElement as HTMLElement | null
    if (!d.open) d.showModal()
    // the marked row (the current board) takes focus and the middle of the list; else the dialog's default
    const sel = d.querySelector<HTMLElement>('[data-sheet-focus]')
    if (sel) { sel.focus({ preventScroll: true }); sel.scrollIntoView({ block: 'center' }) }
    return () => { if (d.open) d.close(); opener?.focus?.({ preventScroll: true }) }
  }, [])
  return <dialog ref={ref} className={`sheet ${className}`} aria-label={label}
    onCancel={e => { e.preventDefault(); onClose() }}
    onClick={e => { // the backdrop is the dialog's own box outside the panel
      const r = e.currentTarget.getBoundingClientRect()
      if (e.target === e.currentTarget && (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right)) onClose()
    }}>
    <div className="sheet-grab" data-sheet-grab aria-hidden="true"><i /></div>
    <header className="sheet-head" data-sheet-grab><h2>{label}</h2><button type="button" className="sheet-done" onClick={onClose}>DONE</button></header>
    <div className="sheet-body" data-sheet-scroll>{children}</div>
  </dialog>
}
