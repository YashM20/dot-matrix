/**
 * ALL (#315, was BROWSE #182): every card from every board in one grid, EXPLORE's view on `/`, under the board picker
 * (whose board chips are the board filter), with a tag filter and a name search. It opens in a curated order
 * (`ORDERED`, ./data.ts). Lazy (its own chunk with its data and styles). The filters live in the URL query, so a
 * filtered view can be shared. The grid is windowed (`./useWindow.ts`): every result has a slot (a square placeholder
 * and a caption with links), and only slots near the screen mount their card, through the same `DotWidget` the
 * boards use, so the ⋯ actions behave the same. The result count is announced politely.
 */
import { Suspense, use, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from 'react'
import { DotWidget } from '../DotWidget'
import { BoardTitle } from '../DotName'
import { useMinuteTick } from '../Board'
import { LoadBoundary, LoadFailed } from '../LoadBoundary'
import { boardLabel, loadBoard, prefetchBoard } from '../../widgets/manifest'
import { replaceUrl } from '../../site/safe-url'
import { ORDERED, ROWS, TAG_OPTIONS, cleanQuery, matches, readFilters, tagCountOf, writeFilters, type Filters, type Row } from './data'
import { useWindow } from './useWindow'
import './Browse.css'

export interface BrowseProps {
  /** Open a board (in place, a history entry). */
  onBoard: (id: string) => void
  /** Open a card's own page (in place, a history entry). */
  onOpen: (slug: string) => void
  /** A card page's path (`widgetPath`, src/site/routes.ts): passed in, so this chunk doesn't import the routes module
   * (sharing it would split it out of the first-load entry into a chunk of its own). */
  cardPath: (slug: string) => string
}

/** Search settles this long after the last key before the grid, the URL and the count follow. */
const SEARCH_MS = 180
const ENTER = { delay: 0, mask: 'bayer' } as const
const plain = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
/** ALL's own address: `/` (or `/index.html`); a widget page shown over it keeps its own. */
const home = () => /^\/(index\.html)?$/.test(location.pathname)

const Ghost = () => <div className="dot-card browse-ghost" aria-hidden="true" />
/** A slot whose board chunk failed (after the loader's retries): the card's square with the error state. */
const Failed = () => <LoadFailed what="This card" className="dot-card browse-ghost" />

/** One card, once its board chunk has landed (the slot suspends until then). */
function Card({ row, tick }: { row: Row; tick: number }) {
  const preset = use(loadBoard(row.board)).items.find(p => p.id === row.slug)
  return preset ? <DotWidget type={preset.id} preset={preset} tick={preset.clock ? tick : undefined} enter={ENTER} /> : <Ghost />
}

export function Browse({ onBoard, onOpen, cardPath }: BrowseProps) {
  // the board filter is the picker's board chips now: ALL filters by tag and name only
  const [f, setF] = useState<Filters>(() => ({ ...readFilters(location.search), board: '' }))
  const [typed, setTyped] = useState(f.q)
  const search = useRef<HTMLInputElement>(null)
  const ids = useId(), titleId = `${ids}t`, countId = `${ids}c`
  // the box answers each key; the grid, URL and count follow once typing pauses
  useEffect(() => {
    const t = window.setTimeout(() => setF(x => (x.q === typed.trim() ? x : { ...x, q: typed.trim() })), SEARCH_MS)
    return () => window.clearTimeout(t)
  }, [typed])
  // the address bar carries the filters (other params stay); only while the page is ALL's own
  useEffect(() => {
    if (!home()) return
    const want = location.pathname + writeFilters(f, location.search) + location.hash
    if (want !== location.pathname + location.search + location.hash) replaceUrl(want)
  }, [f])
  const rows = useMemo(() => ORDERED.filter(r => matches(r, f)), [f])
  const { mounted, slot } = useWindow()
  const tick = useMinuteTick()
  const any = !!(f.tag || f.q)
  const clear = () => { setTyped(''); setF({ board: '', tag: '', q: '' }); search.current?.focus() }
  const tags = f.tag && !TAG_OPTIONS.some(([t]) => t === f.tag) ? [...TAG_OPTIONS, [f.tag, tagCountOf(f.tag)] as const] : TAG_OPTIONS
  const go = (e: MouseEvent, run: () => void) => { if (!plain(e)) return; e.preventDefault(); run() }

  return <section className="browse" aria-labelledby={titleId}>
    <BoardTitle title="ALL CARDS" id={titleId} />
    <p className="board-blurb">Every card from every board, {ROWS.length} in all.</p>
    {/* role="search" too: browsers before <search> (Chrome and Firefox 118, Safari 17) still get the landmark */}
    <search className="browse-tools" role="search" aria-label="Filter the cards">
      <label className="browse-field browse-field--q"><span>SEARCH</span>
        <input ref={search} type="search" value={typed} maxLength={60} placeholder="clock, ring, game…" autoComplete="off" spellCheck={false}
          aria-describedby={countId} onChange={e => setTyped(cleanQuery(e.target.value))} />
      </label>
      <label className="browse-field"><span>TAG</span>
        <select value={f.tag} onChange={e => { const tag = e.target.value; setF(x => ({ ...x, tag })) }}>
          <option value="">All tags</option>
          {tags.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
        </select>
      </label>
      <button type="button" className="browse-clear" onClick={clear} disabled={!any}>CLEAR</button>
      <p className="browse-count" id={countId} role="status">{rows.length === ROWS.length ? `${rows.length} cards` : `${rows.length} of ${ROWS.length} cards`}</p>
    </search>
    {rows.length
      ? <ul className="browse-grid" data-density="standard" aria-labelledby={titleId}>
        {rows.map(r => <li key={r.slug} className="browse-item" data-slot={r.slug} ref={slot(r.slug)}>
          {mounted.has(r.slug) ? <LoadBoundary fallback={<Failed />}><Suspense fallback={<Ghost />}><Card row={r} tick={tick} /></Suspense></LoadBoundary> : <Ghost />}
          <p className="browse-cap">
            <a href={cardPath(r.slug)} onClick={e => go(e, () => onOpen(r.slug))}>{r.name}<span className="sr-only">: open its page</span></a>
            <a href={`/${r.board}/`} className="browse-board" onClick={e => go(e, () => onBoard(r.board))} onPointerEnter={() => prefetchBoard(r.board)}>
              <span className="sr-only">On the board </span>{boardLabel(r.board)}</a>
          </p>
        </li>)}
      </ul>
      : <div className="browse-empty"><p>No card matches these filters.</p><button type="button" className="browse-clear" onClick={clear}>CLEAR THE FILTERS</button></div>}
  </section>
}
