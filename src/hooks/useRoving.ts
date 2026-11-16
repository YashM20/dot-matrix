import type { KeyboardEvent } from 'react'

export interface RovingOptions {
  /** The focusable items, inside the element that gets the handler. */
  items: string
  /** Which arrows move: `x` ← →, `y` ↑ ↓, `both` all four (radio groups, as native radios do). */
  axis?: 'x' | 'y' | 'both'
  /** Moving also picks: the item is clicked (tabs, radios). Without it focus moves alone (toolbars, listboxes). */
  pick?: boolean
}

/**
 * Arrow-key focus inside a group (#352): the arrows of `axis` move to the next or previous item and wrap; Home and End
 * jump to the ends. Items hidden by CSS or `disabled` are skipped. Returns the group's `onKeyDown`; a handled key
 * stops there, so page-level arrow keys (the widget page's ← →) don't fire too. It holds no state: the caller keeps
 * the one tab stop (`tabIndex` 0 on the selected item) where the pattern needs one.
 */
export function useRoving({ items, axis = 'x', pick = false }: RovingOptions) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const next = e.key === 'Home' ? 'first' : e.key === 'End' ? 'last'
      : (axis !== 'y' && e.key === 'ArrowRight') || (axis !== 'x' && e.key === 'ArrowDown') ? 1
        : (axis !== 'y' && e.key === 'ArrowLeft') || (axis !== 'x' && e.key === 'ArrowUp') ? -1 : 0
    if (!next || e.altKey || e.ctrlKey || e.metaKey) return
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>(items)].filter(el => el.offsetParent !== null && !(el as HTMLButtonElement).disabled)
    const i = all.indexOf(e.target as HTMLElement)
    if (i < 0) return
    e.preventDefault(); e.stopPropagation()
    const to = all[next === 'first' ? 0 : next === 'last' ? all.length - 1 : (i + next + all.length) % all.length]
    to.focus()
    if (pick && to !== all[i]) to.click()
  }
}
