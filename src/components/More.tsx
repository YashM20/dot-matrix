import { useState, useSyncExternalStore, type ReactNode } from 'react'
import { isPro, subscribePro } from '../site/pro'

/**
 * A named "More" fold for the MAKE modes (docs/UX-PLAN.md §5.4): collapsed by default, open by default
 * in Pro mode, and once a visitor opens or closes it that choice is kept per fold id (localStorage).
 * A native <details>, so the summary is keyboard-operable (Enter / Space) and announced as expandable.
 * The children stay mounted while folded, so state, timers and stores inside keep working.
 */
const KEY = 'dot480:fold:'
function readFold(id: string): boolean | undefined {
  try { const v = localStorage.getItem(KEY + id); return v === 'open' ? true : v === 'closed' ? false : undefined } catch { return undefined }
}
function writeFold(id: string, open: boolean) {
  try { localStorage.setItem(KEY + id, open ? 'open' : 'closed') } catch { /* private mode: not remembered */ }
}

/** `label` is the plain name, `tech` the engine term shown after it: "Animation (timeline)". */
export function More({ id, label, tech, className, children }: { id: string; label: string; tech?: string; className?: string; children: ReactNode }) {
  const pro = useSyncExternalStore(subscribePro, isPro, () => false)
  const [remembered, setRemembered] = useState(() => readFold(id))
  const open = remembered ?? pro
  return (
    <details className={className ? `more ${className}` : 'more'} data-fold={id} open={open}
      // fires for clicks and for React setting `open`; only a change the visitor made differs from `open`
      onToggle={e => { const now = e.currentTarget.open; if (now !== open) { setRemembered(now); writeFold(id, now) } }}>
      <summary><span>{label}</span>{tech && <small>({tech})</small>}</summary>
      <div className="more-body">{children}</div>
    </details>
  )
}
