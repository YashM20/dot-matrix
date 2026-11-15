import { useEffect } from 'react'
import { keepMine, reloadOtherTab, useOtherTab, watchOtherTab } from './otherTab'

/**
 * "Changed in another tab", with RELOAD and KEEP MINE (`otherTab.ts`). A polite status: it never takes focus, and both
 * buttons are in the tab order. The region stays mounted so screen readers hear it when it fills.
 */
export function OtherTabNote() {
  const incoming = useOtherTab(s => s.incoming)
  useEffect(() => watchOtherTab(window), [])
  return (
    <div className="ed-other" role="status" aria-live="polite">
      {incoming !== null && <>
        <span>Changed in another tab.</span>
        <button type="button" onClick={reloadOtherTab} aria-label="Reload: open the other tab's version">RELOAD</button>
        <button type="button" onClick={keepMine} aria-label="Keep mine: this tab's next save wins">KEEP MINE</button>
      </>}
    </div>
  )
}
