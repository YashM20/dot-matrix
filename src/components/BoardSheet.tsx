import { boardGroups, boardLabel, prefetchBoard } from '../widgets/manifest'
import { Sheet } from './Sheet'
import { useBlurbs } from './useBlurbs'

/** Every board, grouped, in a bottom sheet (phones): the current one is marked; picking one closes it. */
export function BoardSheet({ board, onPick, onClose }: { board: string; onPick: (id: string) => void; onClose: () => void }) {
  const b = useBlurbs()
  return <Sheet label="BOARDS" onClose={onClose} className="board-sheet">
    {boardGroups.map(g => <section key={g.id} aria-labelledby={`bs-${g.id}`}>
      <h3 id={`bs-${g.id}`}>{g.label}{b && <small>{b.groupBlurbs[g.id]}</small>}</h3>
      <ul>{g.boards.map(id => <li key={id}><button type="button" aria-current={board === id ? 'true' : undefined} data-sheet-focus={board === id || undefined} className={board === id ? 'selected' : ''}
        onClick={() => { onClose(); onPick(id) }} onFocus={() => prefetchBoard(id)}>
        <i aria-hidden="true" /><b>{boardLabel(id)}</b>{b && <span>{b.boardBlurbs[id]}</span>}
      </button></li>)}</ul>
    </section>)}
  </Sheet>
}
