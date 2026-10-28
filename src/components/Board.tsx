import { lazy, Suspense, use, useCallback, useEffect, useId, useState, type CSSProperties } from 'react'
import { DotWidget } from './DotWidget'
import { useThemeTokens } from '../site/theme/useTheme'
import { boardMeta, loadBoard, type BoardDef, type BoardId } from '../widgets/manifest'
import type { ControlPatch } from '../engine'
import type { WidgetPreset } from '../widgets/types'
import { duration } from '../engine/motion'
import type { DotCanvasProps } from './DotCanvas'
import { pick, useLiveData } from '../data/useLiveData'
import { HiveStart } from './game/HiveStart'
import { useBlurbs } from './useBlurbs'

// sound (C5) is its own chunk: only the instrument / scope boards fetch the audio engine
const loadAudio = () => import('../audio/AudioCards')
const AudioCards = lazy(() => loadAudio().then(m => ({ default: m.AudioCards })))
const AUDIO_BOARDS = new Set(['instrument', 'scope'])

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
  if (AUDIO_BOARDS.has(id)) void loadAudio() // fetched alongside the board chunk, not after it
  return <Suspense fallback={<section className="board-view" aria-busy="true"><h2 className="board-title">{boardMeta(id)?.title}</h2></section>}>
    <LoadedBoard id={id} leaving={leaving} />
  </Suspense>
}

function LoadedBoard({ id, leaving }: { id: string; leaving: boolean }) {
  const board = use(loadBoard(id))
  // the site theme (src/site/theme): each card resolves its own tokens (a photo card pins the dark scheme)
  const theme = useThemeTokens()
  const tick = useMinuteTick()
  const titleId = useId()
  // board-level shared data (`BoardDef.shared`): one store, merged into every card, written by any card's controls
  // (the Board is keyed by id, so the store starts fresh on every board switch)
  const [shared, setShared] = useState(() => seedShared(board))
  const onShared = useCallback((patch: ControlPatch) => setShared(prev => ({ ...prev, ...patch })), [])
  const sharing = !!board.shared?.length
  // live sources (`BoardDef.sources`): fixture → cached → live data, merged over each card's defaults
  const live = useLiveData(board.sources)
  const blurb = useBlurbs()?.boardBlurbs[board.id as BoardId]
  const cards = (map: (p: WidgetPreset) => WidgetPreset) => board.items.map((preset, i) => <DotWidget key={preset.id} type={preset.id} preset={map(preset)} tick={preset.clock ? tick : undefined}
    data={board.sources ? pick(live, preset.defaults) : undefined}
    {...(sharing ? { shared, sharedKeys: board.shared, onShared } : {})} {...cardMotion(i, board.columns, board.items.length, leaving)} />)
  return (
    <section className="board-view" aria-labelledby={titleId}>
      <h2 className="board-title" id={titleId}>{board.title}</h2>
      <p className="board-blurb">{blurb}</p>
      {/* C4: the levels board opens HIVE in play mode (the cards stay as attract-mode previews) */}
      {board.id === 'levels' && <HiveStart theme={theme} />}
      {/* column count is a CSS var so the responsive breakpoints in App.css can step it down (3 → 2 → 1) */}
      <div className="board-grid" style={{ '--board-cols': board.columns } as CSSProperties}>
        {/* cards enter (and exit) on a diagonal stagger, each revealing its dots in Bayer order */}
        {/* sound (C5): on the instrument / scope boards the shared store drives src/audio and the cards get live analysis */}
        {AUDIO_BOARDS.has(board.id)
          ? <Suspense fallback={null}><AudioCards boardId={board.id} shared={shared} onShared={onShared} titleId={titleId}>{cards}</AudioCards></Suspense>
          : cards(p => p)}
      </div>
    </section>
  )
}
