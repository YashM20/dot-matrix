/**
 * Time machine bar: shown while the shared clock is frozen. Drag the scrubber (or ← / →, hold T and
 * move the pointer) to move board time for every animated card at once; Space resumes from there.
 */
import { useEffect, useState } from 'react'
import { boardTime, resume, scrub, useXR } from './store'

export function TimeMachine() {
  const frozen = useXR(s => s.frozen)
  const [t, setT] = useState(0), [span, setSpan] = useState(60)
  useEffect(() => {
    if (!frozen) return
    // the clock is the source of truth (keys and the T-drag scrub it too); the span grows past the end
    let raf = 0
    const poll = () => { const now = boardTime(); setT(now); setSpan(s => (now > s - 5 ? Math.max(60, Math.ceil(now / 30) * 30 + 30) : s)); raf = requestAnimationFrame(poll) }
    raf = requestAnimationFrame(poll)
    return () => cancelAnimationFrame(raf)
  }, [frozen])
  if (!frozen) return null
  const go = (x: number) => { const v = Math.max(0, x); scrub(v); setT(v) }
  return (
    <div className="xr-time" role="region" aria-label="Time machine">
      <b className="xr-time-label">■ TIME MACHINE</b>
      <button aria-label="Back one second" onClick={() => go(t - 1)}>−1S</button>
      <button aria-label="Back one frame" onClick={() => go(t - 1 / 12)}>◀</button>
      <input type="range" min={0} max={span} step={1 / 60} value={Math.min(t, span)} aria-label="Board time in seconds" aria-valuetext={`${t.toFixed(2)} seconds`} onChange={e => go(+e.target.value)} />
      <button aria-label="Forward one frame" onClick={() => go(t + 1 / 12)}>▶</button>
      <button aria-label="Forward one second" onClick={() => go(t + 1)}>+1S</button>
      <output className="xr-time-t" aria-live="off">T = {t.toFixed(2)}s</output>
      <button className="xr-time-go" onClick={() => resume()}>RESUME <kbd>SPACE</kbd></button>
    </div>
  )
}
