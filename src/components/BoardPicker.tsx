import { useEffect, useRef, useState } from 'react'
import { boardGroups, boardLabel, groupOf, prefetchBoard, type BoardGroupId } from '../widgets/manifest'
import { useBlurbs } from './useBlurbs'

/** A group by id (every `BoardGroupId` names one; the fallback only satisfies the type). */
const groupById = (g: BoardGroupId) => boardGroups.find(x => x.id === g) ?? boardGroups[0]
const inGroup = (g: BoardGroupId, id: string) => (groupById(g).boards as readonly string[]).includes(id)
const homeGroup = (id: string): BoardGroupId => inGroup('start', id) ? 'start' : groupOf(id)
const smooth = (): ScrollBehavior => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'

/**
 * Board picker (docs/UX-PLAN.md §4.2): group tabs, then ALL (every card, the home view, #315) and the open group's
 * boards. On phones both rows are thumb strips that scroll sideways (the open group and board slide into view), and
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
  const root = useRef<HTMLDivElement>(null)
  // phones: bring the selected group and board into the strips (a no-op where the rows wrap)
  useEffect(() => {
    for (const el of root.current?.querySelectorAll<HTMLElement>('.selected') ?? []) {
      const strip = el.parentElement!
      if (strip.scrollWidth <= strip.clientWidth) continue
      strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2, behavior: smooth() })
    }
  }, [board, group, all])
  return <div className="board-picker" ref={root}>
    <div className="board-groups" role="group" aria-label="Board groups">
      {onSheet && <button type="button" className="board-all" aria-haspopup="dialog" onClick={onSheet}>BOARDS<span aria-hidden="true"> ▾</span></button>}
      {boardGroups.map(g => <button key={g.id} type="button" className={g.id === group ? 'selected' : ''} aria-pressed={g.id === group} onClick={() => setGroup(g.id)}>{g.label}</button>)}
      {b && <span className="board-group-blurb">{b.groupBlurbs[group]}</span>}
    </div>
    <div className="board-tabs" role="group" aria-label={`Boards: ${open.label}`}>
      <button type="button" data-board="all" className={all ? 'selected' : ''} aria-pressed={all} title="Every card from every board" onClick={onPickAll}>ALL</button>
      {open.boards.map(id => <button key={id} type="button" data-board={id} className={!all && board === id ? 'selected' : ''} aria-pressed={!all && board === id} title={b?.boardBlurbs[id]}
        onClick={() => onPick(id)} onPointerEnter={() => prefetchBoard(id)} onFocus={() => prefetchBoard(id)}>{boardLabel(id)}</button>)}
    </div>
  </div>
}

/**
 * The end of a board, at every width: the next one in its group, so nobody has to go back up to move on. A real link
 * (`/<board>/`, so it opens in a new tab too) in the site's pill (src/site/app/pills.css), like the widget page's
 * PREV / NEXT; a plain click switches the board in place.
 */
export function NextBoard({ board, onPick }: { board: string; onPick: (id: string) => void }) {
  const list = groupById(homeGroup(board)).boards as readonly string[]
  const next = list[(list.indexOf(board) + 1) % list.length]
  return <div className="next-board"><div className="pill">
    <a className="pill-btn" href={`/${next}/`} onPointerEnter={() => prefetchBoard(next)} onFocus={() => prefetchBoard(next)}
      onClick={e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); window.scrollTo({ top: 0, behavior: smooth() }); onPick(next) }}>
      NEXT BOARD<span className="pill-glyph" aria-hidden="true">·</span><b>{boardLabel(next)}</b><span className="pill-glyph" aria-hidden="true">→</span>
    </a>
  </div></div>
}
