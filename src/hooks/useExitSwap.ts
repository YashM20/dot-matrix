import { useEffect, useRef, useState } from 'react'

/**
 * Lags a view key behind the requested one by an exit window (`exitMs(shown)`, so views with
 * nothing to animate can leave at once), so the old view can animate out before it unmounts. Returns `[shown, leaving]`. Requests made during the window don't restart
 * it: the view swaps to the latest request when the window ends. Asking for the shown view again
 * cancels the exit.
 */
export function useExitSwap<T>(requested: T, exitMs: (shown: T) => number): [T, boolean] {
  const [shown, setShown] = useState(requested)
  const latest = useRef(requested)
  const leaving = requested !== shown
  const ms = exitMs(shown)
  useEffect(() => { latest.current = requested })
  useEffect(() => {
    if (!leaving) return
    const id = window.setTimeout(() => setShown(latest.current), ms)
    return () => window.clearTimeout(id)
  }, [leaving, ms])
  return [shown, leaving]
}
