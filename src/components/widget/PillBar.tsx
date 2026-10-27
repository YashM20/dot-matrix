/**
 * iOS-style action pills (docs/SHARE-PLAN.md §4.3): related buttons share one floating capsule, a bar is one or
 * more capsules. A real toolbar: ← → (and Home / End) move between its buttons. Grey chrome only: the card
 * keeps the one accent.
 */
import type { KeyboardEvent, ReactNode } from 'react'

export function PillBar({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End']
    if (!keys.includes(e.key) || !(e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement)) return
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('.pill-btn')].filter(b => b.offsetParent !== null && !(b as HTMLButtonElement).disabled)
    const i = items.indexOf(e.target as HTMLElement)
    if (i < 0) return
    e.preventDefault(); e.stopPropagation()
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length
    items[j].focus()
  }
  return <div className={`pill-bar ${className}`} role="toolbar" aria-label={label} onKeyDown={onKey}>{children}</div>
}

/** One capsule of related actions. */
export const Pill = ({ children, className = '' }: { children: ReactNode; className?: string }) => <div className={`pill ${className}`}>{children}</div>

export interface PillButtonProps {
  /** Short visible label; `title` is the full name (tooltip and accessible name). */
  label: ReactNode
  title: string
  glyph?: string
  /** The key that does the same, shown as a keycap in the tooltip. */
  kbd?: string
  onClick?: () => void
  onPointerDown?: () => void
  pressed?: boolean
  expanded?: boolean
  className?: string
  href?: string
}
export function PillButton({ label, title, glyph, kbd, onClick, onPointerDown, pressed, expanded, className = '', href }: PillButtonProps) {
  const inner = <>{glyph && <span className="pill-glyph" aria-hidden="true">{glyph}</span>}<span className="pill-label">{label}</span></>
  // `data-tip` is the bar's grouped tooltip (App.css › tooltip), in place of the native `title`
  if (href) return <a className={`pill-btn ${className}`} href={href} data-tip={title} data-kbd={kbd} aria-label={title} onClick={e => { if (onClick && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) { e.preventDefault(); onClick() } }}>{inner}</a>
  return <button type="button" className={`pill-btn ${className}`} data-tip={title} data-kbd={kbd} aria-label={title} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick} onPointerDown={onPointerDown}>{inner}</button>
}
