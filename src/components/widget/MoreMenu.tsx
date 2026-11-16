/**
 * The widget page's MORE menu (#184), the WAI-ARIA menu button pattern: the button has `aria-haspopup` and
 * `aria-expanded`; the list is `role="menu"` with `menuitem`s. Enter, Space or ↓ open it on the first item, ↑ on the
 * last; ↑ ↓ Home End move; Esc closes and focus goes back to the button; Tab closes and moves on. The menu is fixed,
 * anchored under its button with their right edges lined up (above it when there is no room) and kept inside the
 * viewport. It opens with no motion (DESIGN.md › Chrome states).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { MoreIcon } from './toolIcons'

export interface MoreItem {
  label: ReactNode
  /** Short meta after the label, on the same line (a short link, a format). */
  note?: ReactNode
  run: () => void
  /** Starts a new group (a hairline above it). */
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

  // anchor: measure the menu once on open (its size, and where its (0, 0) lands, in case an ancestor moves the
  // fixed box), then each placement reads only the button's rect and writes one transform
  useLayoutEffect(() => {
    if (!open) return
    const m = menu.current, b = btn.current
    if (!m || !b) return
    let o = { left: 0, top: 0, width: 0, height: 0 }
    const measure = () => { m.style.transform = 'none'; o = m.getBoundingClientRect() }
    const place = () => {
      const r = b.getBoundingClientRect(), { width: w, height: h } = o
      const x = Math.max(EDGE, Math.min(r.right - w, innerWidth - w - EDGE))
      let y = r.bottom + GAP
      if (y + h > innerHeight - EDGE && r.top - GAP - h >= EDGE) y = r.top - GAP - h
      y = Math.max(EDGE, Math.min(y, innerHeight - h - EDGE))
      m.style.transform = `translate(${Math.round(x - o.left)}px, ${Math.round(y - o.top)}px)`
    }
    measure(); place()
    // scroll and resize fire many times a frame: place once per frame (a resize measures again: the width cap moves)
    let raf = 0, again = false
    const queue = (e: Event) => {
      if (e.type === 'scroll' && m.contains(e.target as Node)) return
      if (e.type === 'resize') again = true
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (again) { again = false; measure() } place() })
    }
    window.addEventListener('resize', queue); window.addEventListener('scroll', queue, true)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', queue); window.removeEventListener('scroll', queue, true) }
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
    <button ref={btn} type="button" className="pill-btn pill-btn--icon wp-more-btn" aria-label="More" data-tip={open ? undefined : 'More'} aria-haspopup="menu" aria-expanded={!!open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(o => (o ? false : 'first'))} onKeyDown={onButtonKey}>
      <MoreIcon />
    </button>
    {open && <div ref={menu} id={id} className="wp-more" role="menu" aria-label="More actions" onKeyDown={onMenuKey}>
      {items.map((it, k) => <button key={k} type="button" role="menuitem" tabIndex={-1} className={`${it.group ? 'wp-more-group ' : ''}${it.className ?? ''}`}
        onClick={() => { close(); it.run() }}><span className="wp-more-label">{it.label}</span>{it.note && <small>{it.note}</small>}</button>)}
    </div>}
  </>
}
