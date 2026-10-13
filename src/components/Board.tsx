import { useEffect, useId, useState, type CSSProperties } from 'react'
import { DotWidget } from './DotWidget'
import { usePlayground } from './playground/store'
import { presets } from '../engine/theme/tokens'
import { boardById, boards } from '../widgets'

/** Minute counter aligned to the wall clock, so clock cards flip exactly on :00. */
function useMinuteTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let timer = 0
    const arm = () => { timer = window.setTimeout(() => { setTick(t => t + 1); arm() }, 60_000 - (Date.now() % 60_000)) }
    arm()
    return () => clearTimeout(timer)
  }, [])
  return tick
}

export function Board({ id }: { id: string }) {
  const board = boardById(id) ?? boards[0]
  const themeName = usePlayground(s => s.theme)
  const theme = presets[themeName]
  const tick = useMinuteTick()
  const titleId = useId()
  return (
    <section className="board-view" aria-labelledby={titleId}>
      <h2 className="board-title" id={titleId}>{board.title}</h2>
      {/* column count is a CSS var so the responsive breakpoints in App.css can step it down (3 → 2 → 1) */}
      <div className="board-grid" style={{ '--board-cols': board.columns } as CSSProperties}>
        {board.items.map(preset => <DotWidget key={preset.id} type={preset.id} preset={preset} theme={theme} tick={tick} />)}
      </div>
    </section>
  )
}
