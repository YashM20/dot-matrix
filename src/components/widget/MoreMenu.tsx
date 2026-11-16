/**
 * The widget page's MORE menu (#184): the site's menu button (`useMenuButton`, #352) with a list of `menuitem`s. Enter,
 * Space or ↓ open it on the first item, ↑ on the last; ↑ ↓ Home End and a letter move; Esc closes and focus goes back
 * to the button; Tab closes and moves on. The menu is fixed (WidgetPage.css); the hook anchors it under the button.
 */
import type { ReactNode } from 'react'
import { useMenuButton } from '../../hooks/useMenuButton'
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

export function MoreMenu({ items }: { items: readonly MoreItem[] }) {
  const m = useMenuButton()
  return <>
    <button {...m.button} type="button" className="pill-btn pill-btn--icon wp-more-btn" aria-label="More" data-tip={m.open ? undefined : 'More'} onClick={m.toggle}>
      <MoreIcon />
    </button>
    {m.open && <div {...m.menu} className="wp-more" aria-label="More actions">
      {items.map((it, k) => <button key={k} type="button" role="menuitem" tabIndex={-1} className={`menu-row${it.group ? ' wp-more-group' : ''}${it.className ? ` ${it.className}` : ''}`}
        onClick={() => { m.close(); it.run() }}><span className="wp-more-label">{it.label}</span>{it.note && <small>{it.note}</small>}</button>)}
    </div>}
  </>
}
