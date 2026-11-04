/**
 * The widget page's MORE menu (#184), the WAI-ARIA menu button pattern: the button has `aria-haspopup` and
 * `aria-expanded`; the list is `role="menu"` with `menuitem`s. Enter, Space or ↓ open it on the first item, ↑ on the
 * last; ↑ ↓ Home End move; Esc closes and focus goes back to the button; Tab closes and moves on. The menu is fixed,
 * anchored under its button (above it when there is no room) and kept inside the viewport.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export interface MoreItem {
  label: ReactNode
  /** Small meta text after the label. */
  note?: ReactNode
  run: () => void
  /** Starts a new group (a dotted rule above it). */
  group?: boolean
  className?: string
}

const EDGE = 8, GAP = 4

export function MoreMenu({ items }: { items: readonly MoreItem[] }) {
  const [open, setOpen] = useState<false | 'first' | 'last'>(false)
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const rows = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])].filter(b => b.offsetParent !== null)
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus() }

  // anchor: under the button, its right edge on the button's, clamped to the viewport; flip above when it won't fit
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const m = menu.current, b = btn.current
      if (!m || !b) return
      const r = b.getBoundingClientRect(), w = m.offsetWidth, h = m.offsetHeight
      const left = Math.min(Math.max(EDGE, r.right - w), innerWidth - w - EDGE)
      let top = r.bottom + GAP
      if (top + h > innerHeight - EDGE && r.top - GAP - h >= EDGE) top = r.top - GAP - h
      m.style.left = `${Math.max(EDGE, left)}px`; m.style.top = `${Math.max(EDGE, Math.min(top, innerHeight - h - EDGE))}px`
    }
    place()
    window.addEventListener('resize', place); window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])
  useEffect(() => {
    if (!open) return
    const r = rows();
    (open === 'last' ? r[r.length - 1] : r[0])?.focus()
    const onDown = (e: PointerEvent) => { const t = e.target as Node; if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); setOpen(e.key === 'ArrowUp' ? 'last' : 'first') }
  }
  const onMenuKey = (e: KeyboardEvent) => {
    const r = rows(), i = r.indexOf(document.activeElement as HTMLButtonElement)
    const to = (j: number) => { e.preventDefault(); r[(j + r.length) % r.length]?.focus() }
    e.stopPropagation()
    if (e.key === 'ArrowDown') to(i + 1)
    else if (e.key === 'ArrowUp') to(i - 1)
    else if (e.key === 'Home') to(0)
    else if (e.key === 'End') to(r.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'Tab') close(false)
  }

  return <>
    <button ref={btn} type="button" className="pill-btn wp-more-btn" aria-haspopup="menu" aria-expanded={!!open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(o => (o ? false : 'first'))} onKeyDown={onButtonKey}>
      <span className="pill-glyph" aria-hidden="true">⋯</span><span className="pill-label">MORE</span>
    </button>
    {open && <div ref={menu} id={id} className="wp-more" role="menu" aria-label="More actions" onKeyDown={onMenuKey}>
      {items.map((it, k) => <button key={k} type="button" role="menuitem" tabIndex={-1} className={`${it.group ? 'wp-more-group ' : ''}${it.className ?? ''}`}
        onClick={() => { close(); it.run() }}>{it.label}{it.note && <small>{it.note}</small>}</button>)}
    </div>}
  </>
}
