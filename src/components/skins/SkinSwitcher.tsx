import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { SKINS, SKIN_NAMES } from '../../engine/display/names'
import { getSkin, setClack, setSkin, useClack, useDisplaySkin } from './store'

/** The one-line description: the skin title after its "NAME: " prefix. */
const blurb = (title: string) => title.slice(title.indexOf(': ') + 2)

/**
 * The header's DISPLAY ▾ menu button (docs/UX-PLAN.md §4.3): one compact button that opens a menu of
 * the skins, each with its one-line description. WAI-ARIA menu button with `menuitemradio` items:
 * Enter/Space/arrows open it on the current skin, arrows/Home/End/first letter move, Enter/Space/click
 * pick, Escape or Tab closes (Escape returns focus), a press outside closes. The flip-disc skin adds a
 * clack toggle (muted by default).
 */
export function SkinSwitcher() {
  const skin = useDisplaySkin(), clack = useClack()
  const [open, setOpen] = useState(false), [right, setRight] = useState(true)
  const wrap = useRef<HTMLDivElement>(null), btn = useRef<HTMLButtonElement>(null)
  const items = useRef<(HTMLButtonElement | null)[]>([])
  const id = useId()

  const show = () => {
    const r = btn.current?.getBoundingClientRect()
    // open towards the side with room (the button sits right on desktop, may wrap left on phones)
    setRight(!r || r.left + r.width / 2 > window.innerWidth / 2)
    setOpen(true)
  }
  const close = (refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus() }
  const pick = (name: typeof SKIN_NAMES[number]) => { setSkin(name); close(true) }
  // hover intent (a mouse resting 100 ms opens it, without taking focus); leaving closes a hover-opened menu
  // after 150 ms, so the gap between button and menu can be crossed; a click keeps it open
  const timer = useRef(0), byHover = useRef(false)
  const intent = (e: ReactPointerEvent<HTMLDivElement>, enter: boolean) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(timer.current)
    if (enter && !open) timer.current = window.setTimeout(() => { byHover.current = true; show() }, 100)
    else if (!enter && open && byHover.current) timer.current = window.setTimeout(() => setOpen(false), 150)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  // focus the current skin on open (not when hover opened it); a press anywhere outside closes
  useEffect(() => {
    if (!open) { byHover.current = false; return }
    if (!byHover.current) items.current[SKIN_NAMES.indexOf(getSkin())]?.focus()
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    // a hover-opened menu has no focus inside: Escape still closes it
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', esc) }
  }, [open])

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show() }
  }
  const onMenuKey = (e: KeyboardEvent) => {
    const n = SKIN_NAMES.length, i = items.current.indexOf(document.activeElement as HTMLButtonElement)
    let j = -1
    if (e.key === 'ArrowDown') j = (i + 1) % n
    else if (e.key === 'ArrowUp') j = (i + n - 1) % n
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = n - 1
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return }
    else if (e.key === 'Tab') { close(false); return }
    else if (e.key.length === 1 && /\w/.test(e.key)) {
      const k = e.key.toUpperCase()
      for (let s = 1; s <= n && j < 0; s++) if (SKINS[SKIN_NAMES[(i + s) % n]].label.startsWith(k)) j = (i + s) % n
    }
    if (j < 0) return
    e.preventDefault()
    items.current[j]?.focus()
  }

  return (
    <div className="skin-switch" ref={wrap} onPointerEnter={e => intent(e, true)} onPointerLeave={e => intent(e, false)}>
      <button ref={btn} type="button" className="skin-menu-btn" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined}
        onClick={() => { clearTimeout(timer.current); if (open && !byHover.current) close(false); else if (open) { byHover.current = false; items.current[SKIN_NAMES.indexOf(skin)]?.focus() } else show() }} onKeyDown={onButtonKey}>
        DISPLAY: <b>{SKINS[skin].label}</b><span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id={id} className={`skin-menu${right ? ' skin-menu--right' : ''}`} role="menu" aria-label="Display" onKeyDown={onMenuKey}>
          {SKIN_NAMES.map((name, i) => (
            <button key={name} ref={el => { items.current[i] = el }} type="button" role="menuitemradio" aria-checked={skin === name} tabIndex={-1}
              data-skin={name} className={skin === name ? 'selected' : ''} onClick={() => pick(name)}>
              <i aria-hidden="true" /><b>{SKINS[name].label}</b><span>{blurb(SKINS[name].title)}</span>
            </button>
          ))}
        </div>
      )}
      {skin === 'flipdisc' && (
        <button type="button" className={`skin-clack${clack ? ' selected' : ''}`} aria-pressed={clack} title="Flip-disc clack (sound)" onClick={() => setClack(!clack)}>
          {clack ? 'CLACK ON' : 'CLACK OFF'}
        </button>
      )}
    </div>
  )
}

