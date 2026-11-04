/**
 * "Remember this browser?" (#169), asked once, on the first like. Two equal buttons and nothing pre-selected:
 * focus goes to the sheet itself, not to either answer. Escape or a tap outside cancels the like.
 */
import { useEffect, useRef } from 'react'

export function RememberSheet({ onChoose }: { onChoose: (c: 'r' | 'o' | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onChoose(null); return }
      if (e.key !== 'Tab' || !ref.current) return
      const stops = [...ref.current.querySelectorAll<HTMLElement>('button, a[href]')]
      const i = stops.indexOf(document.activeElement as HTMLElement)
      if (e.shiftKey ? i <= 0 : i === stops.length - 1) { e.preventDefault(); stops[e.shiftKey ? stops.length - 1 : 0].focus() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => { window.removeEventListener('keydown', onKey, true); back?.focus?.() }
  }, [onChoose])
  return <div className="lk-scrim" onPointerDown={e => { if (e.target === e.currentTarget) onChoose(null) }}>
    <div className="lk-sheet" role="dialog" aria-modal="true" aria-labelledby="lk-sheet-title" aria-describedby="lk-sheet-body" tabIndex={-1} ref={ref}>
      <h2 id="lk-sheet-title">Remember this browser so your likes count fully?</h2>
      <p id="lk-sheet-body">Remember sets one cookie, used only for likes. Just this once sets none, and your like counts a little less. You can forget this browser at any time. <a href="/privacy/#likes">How likes work</a></p>
      <div className="lk-choices">
        <button type="button" onClick={() => onChoose('r')}>Remember</button>
        <button type="button" onClick={() => onChoose('o')}>Just this once</button>
      </div>
    </div>
  </div>
}
