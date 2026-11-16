import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'

/** How the menu opened: on its first item (a click, Enter, Space, ↓), its last (↑), or with no focus (hover intent). */
export type MenuOpen = false | 'first' | 'last' | 'hover'

const EDGE = 8, GAP = 4
const ITEMS = '[role^="menuitem"]'

/**
 * The WAI-ARIA menu button (#352), shared by the card row's MORE, the widget page's MORE and DISPLAY ▾:
 *  - the button has `aria-haspopup`, `aria-expanded` and, while open, `aria-controls`; ↑ ↓ on it open the menu on the
 *    last or the first item (in a radio menu the checked item wins over the first);
 *  - in the menu ↑ ↓ wrap, Home and End jump, a letter moves to the next item that starts with it; Escape closes with
 *    focus back on the button; Tab closes and moves on; a press outside the button and the menu closes;
 *  - one placement rule: under the button with the right edges lined up, above it when there is no room below, kept
 *    8 px inside the viewport. The menu's own CSS gives its resting place; this moves it with one transform, read
 *    again each frame while the page scrolls or resizes. It opens with no motion (DESIGN.md › Chrome states).
 * Spread `button` on the button and `menu` on the menu; the menu's items are `[role^=menuitem]` with `tabIndex={-1}`.
 */
export function useMenuButton() {
  const [open, setOpen] = useState<MenuOpen>(false)
  const btn = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null)
  const id = useId()
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])].filter(el => el.offsetParent !== null)
  const close = (focus = true) => { setOpen(false); if (focus) btn.current?.focus({ preventScroll: true }) }
  const shown = !!open

  useLayoutEffect(() => {
    const m = menu.current, b = btn.current
    if (!shown || !m || !b) return
    const place = () => {
      m.style.transform = 'none'
      const o = m.getBoundingClientRect(), r = b.getBoundingClientRect()
      const x = Math.max(EDGE, Math.min(r.right - o.width, innerWidth - o.width - EDGE))
      let y = r.bottom + GAP
      if (y + o.height > innerHeight - EDGE && r.top - GAP - o.height >= EDGE) y = r.top - GAP - o.height
      y = Math.max(EDGE, Math.min(y, innerHeight - o.height - EDGE))
      m.style.transform = `translate(${Math.round(x - o.left)}px, ${Math.round(y - o.top)}px)`
    }
    place()
    // scroll and resize fire many times a frame: place once per frame (a scroll inside the menu moves nothing)
    let raf = 0
    const queue = (e: Event) => {
      if (e.type === 'scroll' && m.contains(e.target as Node)) return
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; place() })
    }
    addEventListener('resize', queue); addEventListener('scroll', queue, true)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', queue); removeEventListener('scroll', queue, true) }
  }, [shown])

  useEffect(() => {
    if (!open) return
    if (open !== 'hover') {
      const all = items(), to = open === 'last' ? all[all.length - 1] : all.find(el => el.matches('[role=menuitemradio][aria-checked=true]')) ?? all[0]
      to?.focus({ preventScroll: true })
    }
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false) }
    // a menu opened by hover holds no focus: Escape still closes it
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape' && !menu.current?.contains(e.target as Node)) close(document.activeElement === btn.current) }
    document.addEventListener('pointerdown', away, true)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', esc) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault(); e.stopPropagation()
    setOpen(e.key === 'ArrowUp' ? 'last' : 'first')
  }
  const onMenuKey = (e: KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Escape') { e.preventDefault(); close(); return }
    if (e.key === 'Tab') { close(false); return }
    const all = items(), n = all.length, i = all.indexOf(document.activeElement as HTMLElement)
    let j = e.key === 'ArrowDown' ? (i + 1) % n : e.key === 'ArrowUp' ? (i - 1 + n) % n : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : -1
    if (j < 0 && e.key.length === 1 && /\w/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = e.key.toLowerCase()
      for (let s = 1; s <= n && j < 0; s++) if (all[(i + s) % n].textContent?.trim().toLowerCase().startsWith(k)) j = (i + s) % n
    }
    if (j < 0 || !n) return
    e.preventDefault(); all[j].focus()
  }

  return {
    open, setOpen, close,
    /** A click on the button: open on the first item, or close (focus stays on the button). */
    toggle: () => setOpen(o => (o ? false : 'first')),
    button: { ref: btn, 'aria-haspopup': 'menu' as const, 'aria-expanded': shown, 'aria-controls': shown ? id : undefined, onKeyDown: onButtonKey },
    menu: { ref: menu, id, role: 'menu' as const, onKeyDown: onMenuKey },
  }
}
