import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import { SKINS, SKIN_NAMES } from '../../engine/display/names'
import { useMenuButton } from '../../hooks/useMenuButton'
import { setSkin, useDisplaySkin } from './store'

/** The one-line description: the skin title after its "NAME: " prefix. */
const blurb = (title: string) => title.slice(title.indexOf(': ') + 2)

/**
 * The header's DISPLAY ▾ menu button (docs/UX-PLAN.md §4.3): one compact button that opens a menu of the skins, each
 * with its one-line description. The site's menu button (`useMenuButton`, #352) with `menuitemradio` items: Enter,
 * Space or ↓ open it on the current skin, ↑ on the last; arrows, Home, End and a letter move; Enter, Space or a click
 * pick; Escape or Tab closes (Escape returns focus); a press outside closes. A mouse resting on it opens it too.
 */
export function SkinSwitcher() {
  const skin = useDisplaySkin()
  const m = useMenuButton(), open = m.open
  const pick = (name: typeof SKIN_NAMES[number]) => { setSkin(name); m.close() }
  // hover intent (a mouse resting 100 ms opens it, without taking focus); leaving closes a hover-opened menu
  // after 150 ms, so the gap between button and menu can be crossed; a click keeps it open
  const timer = useRef(0)
  const intent = (e: ReactPointerEvent<HTMLDivElement>, enter: boolean) => {
    if (e.pointerType !== 'mouse') return
    clearTimeout(timer.current)
    if (enter && !open) timer.current = window.setTimeout(() => m.setOpen('hover'), 100)
    else if (!enter && open === 'hover') timer.current = window.setTimeout(() => m.setOpen(false), 150)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <div className="skin-switch" onPointerEnter={e => intent(e, true)} onPointerLeave={e => intent(e, false)}>
      <button {...m.button} type="button" className="skin-menu-btn dot-ring"
        onClick={() => { clearTimeout(timer.current); if (open === 'hover') m.setOpen('first'); else m.toggle() }}>
        DISPLAY: <b>{SKINS[skin].label}</b><span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div {...m.menu} className="skin-menu" aria-label="Display">
          {SKIN_NAMES.map(name => (
            <button key={name} type="button" role="menuitemradio" aria-checked={skin === name} tabIndex={-1}
              data-skin={name} className={skin === name ? 'selected' : ''} onClick={() => pick(name)}>
              <i aria-hidden="true" /><b>{SKINS[name].label}</b><span>{blurb(SKINS[name].title)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
