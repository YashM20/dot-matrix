import { useEffect, useId, useRef, useState } from 'react'
import { useRoving } from '../hooks/useRoving'
import { boardGroups, boardLabel, groupOf, prefetchBoard, type BoardGroupId } from '../widgets/manifest'
import { useBlurbs } from './useBlurbs'
import { intent } from '../site/prefetch'
import { NextIcon } from './icons'
import { scrollBehavior } from '../site/motion'

/** A group by id (every `BoardGroupId` names one; the fallback only satisfies the type). */
const groupById = (g: BoardGroupId) => boardGroups.find(x => x.id === g) ?? boardGroups[0]
const inGroup = (g: BoardGroupId, id: string) => (groupById(g).boards as readonly string[]).includes(id)
const homeGroup = (id: string): BoardGroupId => inGroup('start', id) ? 'start' : groupOf(id)

/**
 * Board picker (docs/UX-PLAN.md §4.2): group tabs, then ALL (every card, the home view, #315) and the open group's
 * boards. The groups are real tabs (#352: ← → Home End move and open a group, the open one is the tab stop) and the
 * boards row is their panel; a board is a pressed button. On phones both rows are thumb strips that scroll sideways (the open group and board slide into view), and
 * BOARDS opens a sheet with every board. A board opened elsewhere (palette, shell, Back) opens its group.
 */
export function BoardPicker({ board, all, onPick, onPickAll, onSheet }: { board: string; all: boolean; onPick: (id: string) => void; onPickAll: () => void; onSheet?: () => void }) {
  const [view, setView] = useState<{ board: string; group: BoardGroupId }>(() => ({ board, group: homeGroup(board) }))
  let group = view.group
  if (view.board !== board) { // adjust during render (no effect): keep the open group if it has the board
    group = inGroup(group, board) ? group : groupOf(board)
    setView({ board, group })
  }
  const setGroup = (g: BoardGroupId) => setView({ board, group: g })
  const b = useBlurbs()
  const open = groupById(group)
  const root = useRef<HTMLDivElement>(null), ids = useId()
  const groupKey = useRoving({ items: '[role=tab]', pick: true })
  // phones: bring the selected group and board into the strips (a no-op where the rows wrap)
  useEffect(() => {
    for (const el of root.current?.querySelectorAll<HTMLElement>('.selected') ?? []) {
      const strip = el.closest<HTMLElement>('.board-groups, .board-tabs')
      if (!strip) continue
      if (strip.scrollWidth <= strip.clientWidth) continue
      strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: scrollBehavior() })
    }
  }, [board, group, all])
  return <div className="board-picker" ref={root}>
    <div className="board-groups">
      {onSheet && <button type="button" className="board-all" aria-haspopup="dialog" onClick={onSheet}>BOARDS<span aria-hidden="true"> ▾</span></button>}
      <div className="board-group-tabs" role="tablist" aria-label="Board groups" onKeyDown={groupKey}>
        {boardGroups.map(g => <button key={g.id} type="button" role="tab" id={`${ids}-${g.id}`} aria-selected={g.id === group} aria-controls={`${ids}-boards`} tabIndex={g.id === group ? 0 : -1}
          className={g.id === group ? 'selected' : ''} onClick={() => setGroup(g.id)}>{g.label}</button>)}
      </div>
      {b && <span className="board-group-blurb">{b.groupBlurbs[group]}</span>}
    </div>
    <div className="board-tabs" role="tabpanel" id={`${ids}-boards`} aria-labelledby={`${ids}-${group}`}>
      <button type="button" data-board="all" className={all ? 'selected' : ''} aria-pressed={all} title="Every card from every board" onClick={onPickAll}>ALL</button>
      {open.boards.map(id => <button key={id} type="button" data-board={id} className={!all && board === id ? 'selected' : ''} aria-pressed={!all && board === id} title={b?.boardBlurbs[id]}
        onClick={() => onPick(id)} {...intent(() => prefetchBoard(id))}>{boardLabel(id)}</button>)}
    </div>
  </div>
}

/**
 * The end of a board, at every width: the next one in its group, so nobody has to go back up to move on. A real link
 * (`/<board>/`, so it opens in a new tab too) in the site's toolbar group (src/site/app/pills.css), like the widget page's
 * PREV / NEXT; a plain click switches the board in place.
 */
export function NextBoard({ board, onPick }: { board: string; onPick: (id: string) => void }) {
  const list = groupById(homeGroup(board)).boards as readonly string[]
  const next = list[(list.indexOf(board) + 1) % list.length]
  return <div className="next-board"><div className="pill">
    <a className="pill-btn" href={`/${next}/`} {...intent(() => prefetchBoard(next))}
      onClick={e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); window.scrollTo({ top: 0, behavior: scrollBehavior() }); onPick(next) }}>
      <span className="pill-label">NEXT BOARD</span><b>{boardLabel(next)}</b><NextIcon />
    </a>
  </div></div>
}
