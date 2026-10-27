import { useEffect, useRef, useState } from 'react'
import { boardGroups, boardLabel, groupOf, prefetchBoard, type BoardGroupId } from '../widgets/manifest'
import { useBlurbs } from './useBlurbs'

const inGroup = (g: BoardGroupId, id: string) => (boardGroups.find(x => x.id === g)!.boards as readonly string[]).includes(id)
const homeGroup = (id: string): BoardGroupId => inGroup('start', id) ? 'start' : groupOf(id)
const smooth = (): ScrollBehavior => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * Board picker (docs/UX-PLAN.md §4.2): group tabs, then the open group's boards. On phones both rows are
 * thumb strips that scroll sideways (the open group and board slide into view), and ALL opens a sheet with
 * every board. A board opened elsewhere (palette, shell, Back) opens its group.
 */
export function BoardPicker({ board, onPick, onAll }: { board: string; onPick: (id: string) => void; onAll?: () => void }) {
  const [view, setView] = useState<{ board: string; group: BoardGroupId }>(() => ({ board, group: homeGroup(board) }))
  let group = view.group
  if (view.board !== board) { // adjust during render (no effect): keep the open group if it has the board
    group = inGroup(group, board) ? group : groupOf(board)
    setView({ board, group })
  }
  const setGroup = (g: BoardGroupId) => setView({ board, group: g })
  const b = useBlurbs()
  const open = boardGroups.find(g => g.id === group)!
  const root = useRef<HTMLDivElement>(null)
  // phones: bring the selected group and board into the strips (a no-op where the rows wrap)
  useEffect(() => {
    for (const el of root.current?.querySelectorAll<HTMLElement>('.selected') ?? []) {
      const strip = el.parentElement!
      if (strip.scrollWidth <= strip.clientWidth) continue
      strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: smooth() })
    }
  }, [board, group])
  return <div className="board-picker" ref={root}>
    <div className="board-groups" role="group" aria-label="Board groups">
      {onAll && <button type="button" className="board-all" aria-haspopup="dialog" onClick={onAll}>ALL<span aria-hidden="true"> ▾</span></button>}
      {boardGroups.map(g => <button key={g.id} type="button" className={g.id === group ? 'selected' : ''} aria-pressed={g.id === group} onClick={() => setGroup(g.id)}>{g.label}</button>)}
      {b && <span className="board-group-blurb">{b.groupBlurbs[group]}</span>}
    </div>
    <div className="board-tabs" role="group" aria-label={`Boards: ${open.label}`}>
      {open.boards.map(id => <button key={id} type="button" data-board={id} className={board === id ? 'selected' : ''} aria-pressed={board === id} title={b?.boardBlurbs[id]}
        onClick={() => onPick(id)} onPointerEnter={() => prefetchBoard(id)} onFocus={() => prefetchBoard(id)}>{boardLabel(id)}</button>)}
    </div>
  </div>
}

/** The end of a board (phones): the next one in its group, so a thumb never has to go back up. */
export function NextBoard({ board, onPick }: { board: string; onPick: (id: string) => void }) {
  const list = boardGroups.find(g => g.id === homeGroup(board))!.boards as readonly string[]
  const next = list[(list.indexOf(board) + 1) % list.length]
  return <button type="button" className="next-board" onPointerEnter={() => prefetchBoard(next)} onFocus={() => prefetchBoard(next)}
    onClick={() => { window.scrollTo({ top: 0, behavior: smooth() }); onPick(next) }}>
    <small>NEXT BOARD</small><b>{boardLabel(next)}</b><span aria-hidden="true">→</span>
  </button>
}
