import { Suspense, use, useCallback, useEffect, useId, useState, type CSSProperties } from 'react'
import { DotWidget } from './DotWidget'
import { usePlayground } from './playground/store'
import { presets } from '../engine/theme/tokens'
import { boardMeta, loadBoard, type BoardDef } from '../widgets/manifest'
import type { ControlPatch } from '../engine'
import { duration } from '../engine/motion'
import type { DotCanvasProps } from './DotCanvas'
import { pick, useLiveData } from '../data/useLiveData'
import { HiveStart } from './game/HiveStart'

/** Total exit window for a view of cards: the last card on the diagonal finishes by then. */
export const VIEW_EXIT_MS = 420
const CARD_EXIT_MS = 220

/**
 * Card choreography for a grid of `count` cards in `columns`: enter on a diagonal stagger
 * (row + column) with a Bayer reveal; exit on the same diagonal, quicker, so the whole view
 * clears inside `VIEW_EXIT_MS`.
 */
export function cardMotion(i: number, columns: number, count: number, leaving: boolean): Pick<DotCanvasProps, 'enter' | 'exit'> {
  const diag = Math.floor(i / columns) + (i % columns)
  const lastDiag = Math.max(1, Math.floor((count - 1) / columns) + Math.min(columns, count) - 1)
  return {
    enter: { delay: diag * duration.stagger, mask: 'bayer' },
    exit: leaving ? { delay: diag * (VIEW_EXIT_MS - CARD_EXIT_MS) / lastDiag, mask: 'bayer', duration: CARD_EXIT_MS } : null,
  }
}

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

/** Initial board store: each shared key takes the first card default that defines it. */
function seedShared(board: BoardDef): ControlPatch {
  const out: ControlPatch = {}
  for (const key of board.shared ?? []) {
    const owner = board.items.find(p => typeof p.defaults?.[key] === 'number')
    if (owner) out[key] = owner.defaults![key]
  }
  return out
}

/** A board by id: its chunk loads on first open (`widgets/manifest`); the title holds the place meanwhile. */
export function Board({ id, leaving = false }: { id: string; leaving?: boolean }) {
  return <Suspense fallback={<section className="board-view" aria-busy="true"><h2 className="board-title">{boardMeta(id)?.title}</h2></section>}>
    <LoadedBoard id={id} leaving={leaving} />
  </Suspense>
}

function LoadedBoard({ id, leaving }: { id: string; leaving: boolean }) {
  const board = use(loadBoard(id))
  const themeName = usePlayground(s => s.theme)
  const theme = presets[themeName]
  const tick = useMinuteTick()
  const titleId = useId()
  // board-level shared data (`BoardDef.shared`): one store, merged into every card, written by any card's controls
  // (the Board is keyed by id, so the store starts fresh on every board switch)
  const [shared, setShared] = useState(() => seedShared(board))
  const onShared = useCallback((patch: ControlPatch) => setShared(prev => ({ ...prev, ...patch })), [])
  const sharing = !!board.shared?.length
  // live sources (`BoardDef.sources`): fixture → cached → live data, merged over each card's defaults
  const live = useLiveData(board.sources)
  return (
    <section className="board-view" aria-labelledby={titleId}>
      <h2 className="board-title" id={titleId}>{board.title}</h2>
      {/* C4: the levels board opens HIVE in play mode (the cards stay as attract-mode previews) */}
      {board.id === 'levels' && <HiveStart theme={theme} />}
      {/* column count is a CSS var so the responsive breakpoints in App.css can step it down (3 → 2 → 1) */}
      <div className="board-grid" style={{ '--board-cols': board.columns } as CSSProperties}>
        {/* cards enter (and exit) on a diagonal stagger, each revealing its dots in Bayer order */}
        {board.items.map((preset, i) => <DotWidget key={preset.id} type={preset.id} preset={preset} theme={theme} tick={preset.clock ? tick : undefined}
          data={board.sources ? pick(live, preset.defaults) : undefined}
          {...(sharing ? { shared, sharedKeys: board.shared, onShared } : {})} {...cardMotion(i, board.columns, board.items.length, leaving)} />)}
      </div>
    </section>
  )
}
