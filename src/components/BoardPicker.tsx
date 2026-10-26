import { useState } from 'react'
import { boardGroups, boardLabel, groupOf, prefetchBoard, type BoardGroupId } from '../widgets/manifest'
import { useBlurbs } from './useBlurbs'

const inGroup = (g: BoardGroupId, id: string) => (boardGroups.find(x => x.id === g)!.boards as readonly string[]).includes(id)

/**
 * Board picker (docs/UX-PLAN.md §4.2): group tabs, then the open group's boards. Narrow screens get one
 * native select with the same groups instead. A board opened elsewhere (palette, shell, Back) opens its group.
 */
export function BoardPicker({ board, onPick }: { board: string; onPick: (id: string) => void }) {
  const [view, setView] = useState<{ board: string; group: BoardGroupId }>(() => ({ board, group: inGroup('start', board) ? 'start' : groupOf(board) }))
  let group = view.group
  if (view.board !== board) { // adjust during render (no effect): keep the open group if it has the board
    group = inGroup(group, board) ? group : groupOf(board)
    setView({ board, group })
  }
  const setGroup = (g: BoardGroupId) => setView({ board, group: g })
  const b = useBlurbs()
  const open = boardGroups.find(g => g.id === group)!
  return <div className="board-picker">
    <div className="board-groups" role="group" aria-label="Board groups">
      {boardGroups.map(g => <button key={g.id} type="button" className={g.id === group ? 'selected' : ''} aria-pressed={g.id === group} onClick={() => setGroup(g.id)}>{g.label}</button>)}
      {b && <span className="board-group-blurb">{b.groupBlurbs[group]}</span>}
    </div>
    <div className="board-tabs" role="group" aria-label={`Boards: ${open.label}`}>
      {open.boards.map(id => <button key={id} type="button" data-board={id} className={board === id ? 'selected' : ''} aria-pressed={board === id} title={b?.boardBlurbs[id]}
        onClick={() => onPick(id)} onPointerEnter={() => prefetchBoard(id)} onFocus={() => prefetchBoard(id)}>{boardLabel(id)}</button>)}
    </div>
    <label className="board-select"><span>BOARD</span>
      <select value={board} onChange={e => onPick(e.target.value)}>
        {boardGroups.map(g => <optgroup key={g.id} label={g.label}>{g.boards.map(id => <option key={id} value={id}>{boardLabel(id)}</option>)}</optgroup>)}
      </select>
    </label>
  </div>
}
