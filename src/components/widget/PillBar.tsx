/**
 * The site's toolbar (docs/SHARE-PLAN.md §4.3; DESIGN.md › Chrome components › toolbar): related buttons share one
 * hairline group (`.pill`) with a hairline between them, a bar is one or more groups. A real toolbar: ← → (and
 * Home / End) move between its buttons. Grey chrome only: the card keeps the one accent. (The class names are the
 * old capsule's; probes and NEXT BOARD use them.)
 */
import type { ReactNode } from 'react'
import { useRoving } from '../../hooks/useRoving'

export function PillBar({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  const onKey = useRoving({ items: '.pill-btn' })
  return <div className={`pill-bar ${className}`} role="toolbar" aria-label={label} onKeyDown={onKey}>{children}</div>
}

/** One group of related actions. */
export const Pill = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`pill ${className}`}>{children}</div>

export interface PillButtonProps {
  /** Short visible label (text, so the accessible name can hold it); `title` is the full name (the tooltip, and the
   * accessible name after the label). */
  label: string
  title: string
  /** An icon from toolIcons.tsx, before the label. */
  icon?: ReactNode
  /** Show the icon alone: the label adds nothing to it (LINK, SHARE, PREV, NEXT). The tooltip and the name are `title`. */
  iconOnly?: boolean
  /** The key that does the same, shown as a keycap in the tooltip. */
  kbd?: string
  /** `detail` is the click count: 0 for a click from the keyboard. */
  onClick?: (e?: { detail: number }) => void
  onPointerDown?: () => void
  pressed?: boolean
  expanded?: boolean
  className?: string
  href?: string
}
export function PillButton({ label, title, icon, iconOnly, kbd, onClick, onPointerDown, pressed, expanded, className = '', href }: PillButtonProps) {
  const inner = <>{icon}{!iconOnly && <span className="pill-label">{label}</span>}</>
  // the name holds the words it shows (WCAG 2.5.3: a voice user says what they see): the label leads unless the title has it
  const words = (t: string) => ` ${t.toLowerCase().replace(/[^\p{L}\p{N}-]+/gu, ' ').trim()} `
  const name = iconOnly || words(title).includes(words(label)) ? title : `${label}, ${title}`
  const cls = `pill-btn${iconOnly ? ' pill-btn--icon' : ''} ${className}`
  // `data-tip` is the bar's grouped tooltip (src/site/app/tips.css), in place of the native `title`
  if (href) return <a className={cls} href={href} data-tip={title} data-kbd={kbd} aria-label={name} onClick={e => { if (onClick && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); onClick() } }}>{inner}</a>
  return <button type="button" className={cls} data-tip={title} data-kbd={kbd} aria-label={name} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick} onPointerDown={onPointerDown}>{inner}</button>
}
