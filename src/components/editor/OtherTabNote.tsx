import { useEffect } from 'react'
import { keepMine, reloadOtherTab, useOtherTab, watchOtherTab } from './otherTab'

/**
 * "Changed in another tab", with RELOAD and KEEP MINE (`otherTab.ts`): a slim bar across the top of the canvas, the
 * text left and the two actions right in one toolbar group (they wrap together under the text on a narrow screen).
 * A polite status: it never takes focus, and both buttons are in the tab order. The region stays mounted so screen
 * readers hear it when it fills.
 */
export function OtherTabNote() {
  const incoming = useOtherTab(s => s.incoming)
  useEffect(() => watchOtherTab(window), [])
  return (
    <div className="ed-other" role="status" aria-live="polite">
      {incoming !== null && <>
        <span className="ed-other-text">Changed in another tab.</span>
        <span className="pill ed-other-acts">
          <button type="button" className="pill-btn" onClick={reloadOtherTab} aria-label="Reload: open the other tab's version">RELOAD</button>
          <button type="button" className="pill-btn" onClick={keepMine} aria-label="Keep mine: this tab's next save wins">KEEP MINE</button>
        </span>
      </>}
    </div>
  )
}
