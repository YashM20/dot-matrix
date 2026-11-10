/**
 * A card's action strip (split from DotWidget.tsx): the touch hint on a dots-only card, DONE while a hold has the card,
 * and the ⋯ button with its menu (#181), which opens on demand so nothing sits on the drawing at rest or on hover.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { CardAction } from './xray/store'

/** The ⋯ menu (#181): the widget page's wording (its MORE menu), OPEN first since only a card has it. */
const ACTS: [CardAction, string][] = [['open', 'Open its page'], ['png', 'Download PNG'], ['link', 'Copy link'], ['remix', 'Remix in MAKE'], ['how', 'X-ray: how it works']]

export interface DotWidgetBarProps {
  name: string
  /** The hint shown in the strip (a dots-only card has no header to hold it), and its touch wording. */
  hint?: string
  touchHint?: string
  /** A hold has the card: DONE lets go. */
  letGo: (() => void) | null
  /** X-ray is on for this card (the HOW item is a checkbox); `xray` / `make`: those items show at all. */
  xrOn: boolean
  xray: boolean
  make: boolean
  onAct: (a: CardAction) => void
}

export function DotWidgetBar({ name, hint, touchHint, letGo, xrOn, xray, make, onAct }: DotWidgetBarProps) {
  const [menu, setMenu] = useState(false)
  // the ⋯ menu closes on a tap anywhere else, like a native menu; its keys are on the menu (onMenuKey)
  const bar = useRef<HTMLDivElement>(null), more = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!menu) return
    const away = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setMenu(false) }
    document.addEventListener('pointerdown', away, true)
    // the first item takes focus, so arrows, Enter and Escape work at once
    bar.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
    return () => document.removeEventListener('pointerdown', away, true)
  }, [menu])
  // X-ray only while its flag is on; REMIX opens MAKE, so only while the `make` flag is on
  const items = ACTS.filter(([a]) => (a !== 'how' || xray) && (a !== 'remix' || make))
  const close = () => { setMenu(false); more.current?.focus() }
  // menu keys: arrows and Home / End move, Escape closes back to ⋯, Tab closes onto ⋯ and goes on from there (items are out of the tab order)
  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')], i = all.indexOf(document.activeElement as HTMLElement)
    const to = e.key === 'ArrowDown' ? i + 1 : e.key === 'ArrowUp' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : null
    if (to !== null) { e.preventDefault(); all[(to + all.length) % all.length]?.focus() } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() } else if (e.key === 'Tab') close()
  }
  const act = (a: CardAction) => () => { close(); onAct(a) }
  return <div ref={bar} className={`dot-card-bar${menu ? ' open' : ''}`}>
    {hint && <small className="dot-card-hint" data-touch={touchHint} aria-hidden="true">{hint}</small>}
    {letGo && <button type="button" className="dot-card-done" aria-label={`${name}: let go of the card`} onClick={() => { setMenu(false); letGo() }}>DONE</button>}
    <button ref={more} type="button" className="dot-card-more" aria-label={`${name}: card actions`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>⋯</button>
    {menu && <div className="dot-card-menu" role="menu" aria-label={`${name}: card actions`} onKeyDown={onMenuKey}>
      {items.map(([a, label]) => a === 'how'
        ? <button key={a} type="button" tabIndex={-1} role="menuitemcheckbox" aria-checked={xrOn} onClick={act(a)}>{label}</button>
        : <button key={a} type="button" tabIndex={-1} role="menuitem" onClick={act(a)}>{label}</button>)}
    </div>}
  </div>
}
