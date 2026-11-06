/**
 * The dot shell (backtick): a small terminal whose screen is itself a dot-matrix card. Every visible row is a
 * `textAt` field on one grid, sampled and rendered by DotCanvas like any widget (`./shellScreen.ts`). Over the dots
 * sits the real output, a `role="log"` list with transparent text on the same cell grid, so the output can be
 * selected, copied and followed by link, a screen reader hears each new line, and scrolling it (wheel, PgUp / PgDn)
 * scrolls the dots. A transparent input over the prompt row takes the keys: Tab completes, ↑ ↓ walk this tab's
 * history, Ctrl+C cancels or stops, Ctrl+U and Ctrl+L clear. Commands run one at a time (`./shellRun.ts`).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { DotCanvas } from '../DotCanvas'
import { tileStyle } from '../../widgets/types'
import { useXR } from '../xray/store'
import type { CommandApi } from './api'
import { exec, sources, type Ctx, type Out } from './shellRun'
import { LINE_MAX, addHistory, complete, loadHistory, saveHistory } from './shellLine'
import { gridFor, screenLayers, screenSize, toRows, type Line } from './shellScreen'

const OUT_MAX = 500, TEXT_MAX = 2000
const aborted = () => new DOMException('aborted', 'AbortError')

function useScreenSize() {
  const [size, setSize] = useState(screenSize)
  useEffect(() => {
    const on = () => setSize(s => { const n = screenSize(); return n.chars === s.chars && n.lines === s.lines ? s : n })
    addEventListener('resize', on); visualViewport?.addEventListener('resize', on)
    return () => { removeEventListener('resize', on); visualViewport?.removeEventListener('resize', on) }
  }, [])
  return size
}

export function Shell({ api, onClose }: { api: CommandApi; onClose: () => void }) {
  const { chars, lines: LINES } = useScreenSize()
  const grid = useMemo(() => gridFor(chars, LINES), [chars, LINES])
  const nextId = useRef(1)
  const [lines, setLines] = useState<Line[]>(() => [{ id: 0, kind: 'dim', text: 'MATRIX SHELL · FIELD → GRID SAMPLER → RENDERER. TYPE HELP, TAB COMPLETES.' }])
  const [input, setInput] = useState(''), [caret, setCaret] = useState(0), [focused, setFocused] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [scrollRow, setScrollRow] = useState<number | null>(null) // null: following the newest line
  const inputRef = useRef<HTMLInputElement>(null), logRef = useRef<HTMLUListElement>(null), rootRef = useRef<HTMLDivElement>(null)
  const history = useRef<string[]>([]), hcur = useRef(-1), draft = useRef('')
  const queue = useRef<string[]>([]), running = useRef<AbortController | null>(null), quietUntil = useRef(0)
  const pendingCaret = useRef<number | null>(null), live = useRef({ input, caret })
  useLayoutEffect(() => { live.current = { input, caret } })

  const print = (...ls: Out[]) => setLines(prev => [...prev, ...ls.map(l => {
    const o = typeof l === 'string' ? { kind: 'out' as const, text: l } : l
    return { id: nextId.current++, kind: o.kind, text: o.text.slice(0, TEXT_MAX) }
  })].slice(-OUT_MAX))
  const setLine = (text: string, at = text.length) => { setInput(text); pendingCaret.current = at }
  useLayoutEffect(() => {
    const el = inputRef.current, at = pendingCaret.current
    if (!el || at === null) return
    pendingCaret.current = null; el.setSelectionRange(at, at); setCaret(at)
  }, [input])

  // open: history from this tab, focus in, a focus trap; close: stop what runs, focus back where it was
  useEffect(() => {
    history.current = loadHistory()
    const back = document.activeElement as HTMLElement | null, root = rootRef.current
    inputRef.current?.focus()
    const trap = (e: FocusEvent) => { if (root && e.target instanceof Node && !root.contains(e.target)) inputRef.current?.focus() }
    document.addEventListener('focusin', trap)
    return () => {
      document.removeEventListener('focusin', trap)
      running.current?.abort(); queue.current = []
      const a = document.activeElement
      if (back?.isConnected && back !== document.body && (!a || a === document.body || root?.contains(a))) back.focus({ preventScroll: true })
    }
  }, [])

  // what the shared API reports by toast (link copied, remix failed, no card…) lands in the shell too
  const note = useXR(s => s.toast), firstNote = useRef(note?.id)
  useEffect(() => {
    if (!note || note.id === firstNote.current || performance.now() < quietUntil.current) return
    print({ kind: 'dim', text: note.text })
  }, [note?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // one command at a time, in the order typed; Ctrl+C aborts the running one and drops the queue
  async function pump() {
    if (running.current) return
    for (let raw = queue.current.shift(); raw !== undefined; raw = queue.current.shift()) {
      const ac = new AbortController(); running.current = ac
      print({ kind: 'in', text: raw })
      const word = raw.trim().split(/\s+/)[0], slow = window.setTimeout(() => { if (!ac.signal.aborted) setBusy(raw.trim()) }, 120)
      const ctx: Ctx = {
        api, width: chars, signal: ac.signal,
        print: (...ls) => { if (!ac.signal.aborted) print(...ls) },
        clear: () => { setLines([]); setScrollRow(null) },
        close: onClose,
        wait: p => new Promise((res, rej) => {
          if (ac.signal.aborted) return rej(aborted())
          const stop = () => rej(aborted())
          ac.signal.addEventListener('abort', stop, { once: true })
          p.then(v => { ac.signal.removeEventListener('abort', stop); res(v) }, e => { ac.signal.removeEventListener('abort', stop); rej(e) })
        }),
        history: () => history.current,
        clearHistory: () => { history.current = []; saveHistory([]) },
        quiet: () => { quietUntil.current = performance.now() + 500 },
      }
      try { await exec(raw, ctx) } catch (e) { if (!ac.signal.aborted) print({ kind: 'err', text: `${word}: ${(e as Error)?.message || 'failed'}` }) }
      window.clearTimeout(slow)
      if (running.current === ac) running.current = null
      setBusy(null)
    }
  }

  async function tab() {
    const { input: was, caret: at } = live.current
    const r = await complete(was, at, sources).catch(() => null)
    if (!r || live.current.input !== was) return
    if (r.options.length) {
      const w = Math.min(chars, Math.max(...r.options.map(o => o.length)) + 2), per = Math.max(1, Math.floor(chars / w)), shown = r.options.slice(0, per * 6)
      const rows: Out[] = []
      for (let i = 0; i < shown.length; i += per) rows.push({ kind: 'dim', text: shown.slice(i, i + per).map(o => o.padEnd(w)).join('').trimEnd() })
      if (r.options.length > shown.length) rows.push({ kind: 'dim', text: `… ${r.options.length - shown.length} more` })
      print({ kind: 'in', text: was }, ...rows); setScrollRow(null)
    } else setLine(r.line, r.caret)
  }

  const page = (dir: 1 | -1) => { const log = logRef.current; if (log) log.scrollBy({ top: dir * (log.clientHeight - log.clientHeight / LINES) }) }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    const el = e.currentTarget, ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = input.slice(0, LINE_MAX)
      setLine(''); hcur.current = -1; draft.current = ''; setScrollRow(null)
      if (!raw.trim()) return print({ kind: 'in', text: '' })
      history.current = addHistory(history.current, raw); saveHistory(history.current)
      queue.current.push(raw); void pump()
    } else if (e.key === 'Tab') { e.preventDefault(); if (!e.shiftKey) void tab() }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const h = history.current, up = e.key === 'ArrowUp'
      if (!h.length) return
      if (hcur.current === -1 && up) draft.current = input
      const next = Math.max(-1, Math.min(h.length - 1, hcur.current + (up ? 1 : -1)))
      if (next === hcur.current) return
      hcur.current = next; setLine(next < 0 ? draft.current : h[next])
    } else if (e.ctrlKey && k === 'c' && !e.shiftKey && !e.altKey) {
      // text selected (in the line or the output): Ctrl+C copies it, as in a terminal
      if (el.selectionStart !== el.selectionEnd || window.getSelection()?.toString()) return
      e.preventDefault()
      if (running.current) { running.current.abort(); queue.current = []; setBusy(null); print({ kind: 'dim', text: '^C' }) }
      else { print({ kind: 'in', text: `${input}^C` }); setLine(''); hcur.current = -1; draft.current = '' }
      setScrollRow(null)
    } else if (e.ctrlKey && k === 'u') { e.preventDefault(); setLine(input.slice(caret), 0) }
    else if (e.ctrlKey && k === 'l') { e.preventDefault(); setLines([]); setScrollRow(null) }
    else if (e.key === 'PageUp' || e.key === 'PageDown') { e.preventDefault(); page(e.key === 'PageUp' ? -1 : 1) }
    else if (e.key === 'Escape' || (e.key === '`' && !input && !ctrl)) { e.preventDefault(); onClose() }
  }

  // the rows on screen follow the log's scroll position (snapped to whole rows)
  const rows = useMemo(() => toRows(lines, chars), [lines, chars])
  const bottom = Math.max(0, rows.length - LINES), top = Math.min(scrollRow ?? bottom, bottom)
  useLayoutEffect(() => { const log = logRef.current; if (log && scrollRow === null) log.scrollTop = log.scrollHeight }, [rows, scrollRow, LINES])
  const onScroll = () => {
    const log = logRef.current
    if (!log) return
    const r = Math.round(log.scrollTop / (log.clientHeight / LINES))
    setScrollRow(r >= bottom ? null : r)
  }
  const layers = useMemo(() => {
    const ls = screenLayers(grid, rows.slice(top, top + LINES), chars, LINES, { input, caret, busy, focused, below: rows.length - top - LINES })
    return () => ls
  }, [grid, rows, top, chars, LINES, input, caret, busy, focused])
  const byLine = useMemo(() => {
    const m = new Map<number, typeof rows>()
    for (const r of rows) { const id = Number(r.key.split(':')[0]); m.set(id, [...(m.get(id) ?? []), r]) }
    return m
  }, [rows])

  const vars = { '--cols': grid.cols, '--chars': chars, '--lines': LINES } as CSSProperties
  return (
    <div ref={rootRef} className="pal-shell" role="dialog" aria-modal="true" aria-label="Dot shell"
      onMouseUp={() => { if (!window.getSelection()?.toString()) inputRef.current?.focus() }}
      onKeyDown={e => {
        if (e.target === inputRef.current) return
        if (e.key === 'Escape') onClose()
        else if (e.key === 'Tab' || (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey)) { if (e.key === 'Tab') e.preventDefault(); inputRef.current?.focus() }
      }}>
      <div className="pal-shell-screen" style={vars}>
        <DotCanvas layers={layers} grid={grid} style={tileStyle} change={false} enter={{ delay: 0, mask: 'scan', duration: 260 }} />
        <ul ref={logRef} className="pal-shell-log" role="log" aria-live="polite" aria-label="Shell output" aria-busy={!!busy} tabIndex={-1} onScroll={onScroll}>
          {lines.map(l => <li key={l.id} className={`pal-shell-${l.kind}`}>{byLine.get(l.id)?.map(r => (
            <span key={r.key} className="pal-shell-row">{r.parts.map((p, i) => (p.href ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer">{p.text}</a> : p.text))}</span>
          ))}</li>)}
        </ul>
        <input ref={inputRef} className="pal-shell-input" aria-label="Shell command" value={input} maxLength={LINE_MAX} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" enterKeyHint="go"
          onChange={e => { setInput(e.target.value); setCaret(e.target.selectionStart ?? e.target.value.length); hcur.current = -1 }}
          onSelect={e => setCaret(e.currentTarget.selectionStart ?? input.length)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={onKey} />
      </div>
      <div className="pal-shell-foot" aria-hidden="true">DOT SHELL · <kbd>TAB</kbd> COMPLETE · <kbd>↑</kbd> HISTORY · <kbd>CTRL C</kbd> CANCEL · <kbd>PGUP</kbd> SCROLL · <kbd>ESC</kbd> CLOSE · HELP KEYS</div>
    </div>
  )
}
