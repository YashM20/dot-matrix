import { lazy, Suspense, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

// the popover's content is its own chunk: warmed while the mouse rests on the button (the 100 ms of hover intent)
const load = () => import('./ThemePicker')
const ThemePopover = lazy(() => load().then(m => ({ default: m.ThemePopover })))

/**
 * The header's THEME button, next to DISPLAY ▾ (docs/LAYOUT-THEME-PLAN.md §4 Picker): its dot is the current
 * accent (`--red`). It opens the THEME popover (scheme, the 7 accents, the share-link opt-in) after 100 ms of
 * hover intent without taking focus, closing 150 ms after the mouse leaves; a click, ArrowDown or Enter opens it
 * with focus inside and it stays until Escape, a press outside or focus leaving it. Desktop only: phones have the
 * same controls in TOOLS › THEME. It doesn't assume a static header (it measures nothing).
 */
export function ThemeButton() {
  // first-load code: no compiler memo slots (it renders only on its own state, like App's static parts)
  'use no memo'
  // 'hover': opened by intent, closes when the mouse leaves; 'click': pinned, focus inside
  const [open, setOpen] = useState<false | 'hover' | 'click'>(false)
  const wrap = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null), timer = useRef(0)
  const at = useRef<[number, number]>([0, 0]) // the mouse's last position
  const id = useId()
  const close = (refocus: boolean) => { clearTimeout(timer.current); setOpen(false); if (refocus) btn.current?.focus() }
  const intent = (e: ReactPointerEvent, enter: boolean) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(timer.current)
    at.current = [e.clientX, e.clientY]
    if (enter) void load()
    if (enter && !open) timer.current = window.setTimeout(() => setOpen('hover'), 100)
    else if (!enter && open === 'hover') timer.current = window.setTimeout(leave, 150)
  }
  // a view transition (the theme wipe this popover just started) moves hit-testing off the page, which reads as the
  // mouse leaving: wait for the wipe to end, then close only if a fresh hit test at the mouse is really elsewhere
  const leave = () => {
    if (document.documentElement.classList.contains('theme-wipe')) { timer.current = window.setTimeout(leave, 150); return }
    const el = document.elementFromPoint(...at.current)
    if (!el || !wrap.current?.contains(el)) setOpen(false)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(open === 'click') } }
    const track = (e: PointerEvent) => { at.current = [e.clientX, e.clientY] }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', esc)
    document.addEventListener('pointermove', track, { passive: true })
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', esc); document.removeEventListener('pointermove', track) }
  }, [open])
  return (
    <div className="theme-switch" ref={wrap} onPointerEnter={e => intent(e, true)} onPointerLeave={e => intent(e, false)}
      onBlur={e => { if (open === 'click' && e.relatedTarget && !wrap.current?.contains(e.relatedTarget as Node)) close(false) }}>
      <button ref={btn} type="button" className="skin-menu-btn theme-menu-btn" aria-haspopup="dialog" aria-expanded={!!open} aria-controls={open ? id : undefined}
        onClick={() => { clearTimeout(timer.current); if (open === 'click') close(false); else setOpen('click') }}
        onKeyDown={e => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen('click') } }}>
        THEME<i aria-hidden="true" /><span aria-hidden="true">▾</span>
      </button>
      {open && <Suspense fallback={null}><ThemePopover id={id} focus={open === 'click'} /></Suspense>}
    </div>
  )
}
