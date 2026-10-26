/**
 * ⌘K / Ctrl-K command palette: fuzzy search over actions, views, boards and cards. Keyboard-first
 * (↑ ↓ Home End, Enter runs, Esc closes) and an ARIA combobox: the input owns a listbox and points
 * at the highlighted option with `aria-activedescendant`, so focus never leaves the input.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { rank } from './fuzzy'
import { allBoards, paletteItems, type CommandApi } from './api'
import type { BoardDef } from '../../widgets/manifest'
import { useSwipeDown } from '../../hooks/useSwipeDown'

function Highlight({ text, hits }: { text: string; hits: number[] }): ReactNode {
  if (!hits.length) return text
  const set = new Set(hits), out: ReactNode[] = []
  let run = '', inHit = false
  const flush = (k: number) => { if (run) out.push(inHit ? <mark key={k}>{run}</mark> : run); run = '' }
  for (let i = 0; i < text.length; i++) { const h = set.has(i); if (h !== inHit) { flush(i); inHit = h } run += text[i] }
  flush(text.length)
  return out
}

export function Palette({ api, hoveredCard, onClose }: { api: CommandApi; hoveredCard?: string; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null), listRef = useRef<HTMLUListElement>(null), palRef = useRef<HTMLDivElement>(null)
  useSwipeDown(palRef, onClose) // phones: the palette is a sheet
  const listId = useId(), base = useId()
  // boards come from the manifest at once; their cards join the search when the board chunks have loaded
  const [boards, setBoards] = useState<BoardDef[]>([])
  useEffect(() => { let live = true; allBoards().then(b => { if (live) setBoards(b) }, () => {}); return () => { live = false } }, [])
  const items = useMemo(() => paletteItems(hoveredCard, boards), [hoveredCard, boards])
  const results = useMemo(() => rank(items, query, 60), [items, query])
  const sel = Math.min(index, Math.max(0, results.length - 1))
  const optionId = (i: number) => `${base}-o${i}`

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    inputRef.current?.focus()
    return () => { prev?.focus?.() }
  }, [])
  useEffect(() => { listRef.current?.querySelector(`[id="${CSS.escape(optionId(sel))}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel]) // eslint-disable-line react-hooks/exhaustive-deps

  const run = (i: number) => { const r = results[i]; if (!r) return; onClose(); r.item.run(api) }
  const onKey = (e: KeyboardEvent) => {
    const n = results.length
    if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((sel + 1) % Math.max(1, n)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((sel - 1 + n) % Math.max(1, n)) }
    else if (e.key === 'Home' && e.ctrlKey) { e.preventDefault(); setIndex(0) }
    else if (e.key === 'End' && e.ctrlKey) { e.preventDefault(); setIndex(n - 1) }
    else if (e.key === 'PageDown') { e.preventDefault(); setIndex(Math.min(n - 1, sel + 8)) }
    else if (e.key === 'PageUp') { e.preventDefault(); setIndex(Math.max(0, sel - 8)) }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
    else if (e.key === 'Tab') e.preventDefault()
  }
  // a group's first row gets the separator gap
  const heads = results.map((r, i) => i === 0 || results[i - 1].item.group !== r.item.group)
  return (
    <div className="pal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={palRef} className="pal" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="sheet-grab pal-grab" data-sheet-grab aria-hidden="true"><i /></div>
        <div className="pal-field">
          <span className="pal-prompt" aria-hidden="true">⌘K</span>
          <input ref={inputRef} className="pal-input" role="combobox" aria-expanded="true" aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={results.length ? optionId(sel) : undefined} aria-label="Search boards, cards and actions"
            placeholder="Search boards, cards, actions…" value={query} onChange={e => { setQuery(e.target.value); setIndex(0) }} onKeyDown={onKey} spellCheck={false} autoComplete="off" enterKeyHint="go" />
          <button type="button" className="pal-cancel" onClick={onClose}>CANCEL</button>
        </div>
        <ul ref={listRef} id={listId} className="pal-list" role="listbox" aria-label="Results" data-sheet-scroll>
          {results.map(({ item, hits }, i) => {
            const head = heads[i] ? item.group : ''
            return <li key={item.id} id={optionId(i)} role="option" aria-selected={i === sel} className={`pal-item${i === sel ? ' pal-item--sel' : ''}`}
              data-group={head || undefined} onMouseMove={() => { if (i !== sel) setIndex(i) }} onMouseDown={e => e.preventDefault()} onClick={() => run(i)}>
              <span className="pal-group">{item.group.toUpperCase()}</span>
              <span className="pal-text"><Highlight text={item.text} hits={hits} /></span>
              {item.hint && <kbd className="pal-hint">{item.hint}</kbd>}
            </li>
          })}
          {!results.length && <li className="pal-empty" role="option" aria-selected="false" aria-disabled="true">No match. Try a board (“levels”), a card (“queen”) or an action (“xray”).</li>}
        </ul>
        <footer className="pal-foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> run</span><span><kbd>ESC</kbd> close</span><span><kbd>`</kbd> dot shell</span></footer>
        <div className="sr-only" aria-live="polite">{results.length} results</div>
      </div>
    </div>
  )
}
