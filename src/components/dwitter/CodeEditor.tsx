import { useRef, type KeyboardEvent } from 'react'
import type { IRError } from '../../engine/ir'

interface Props {
  value: string
  onChange: (src: string) => void
  error?: IRError
  /** Ctrl/Cmd+Enter. */
  onRun?: () => void
  maxLength: number
}

/**
 * A plain textarea with a line-number gutter and the IR error marked at its line:col — a mirror
 * `<pre>` behind the (transparent) textarea draws the highlight, so there is no editor dependency.
 */
export function CodeEditor({ value, onChange, error, onRun, maxLength }: Props) {
  const area = useRef<HTMLTextAreaElement>(null), gutter = useRef<HTMLDivElement>(null), mirror = useRef<HTMLPreElement>(null)
  const lines = value.split('\n')
  const at = error && error.pos >= 0 ? Math.min(error.pos, value.length) : -1
  const sync = () => {
    const a = area.current
    if (!a) return
    if (gutter.current) gutter.current.scrollTop = a.scrollTop
    if (mirror.current) { mirror.current.scrollTop = a.scrollTop; mirror.current.scrollLeft = a.scrollLeft }
  }
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onRun?.(); return }
    if (e.key === 'Tab' && !e.shiftKey) {
      // two spaces; Shift+Tab / Esc-then-Tab still leave the editor
      const a = e.currentTarget, s = a.selectionStart, end = a.selectionEnd
      e.preventDefault()
      onChange(value.slice(0, s) + '  ' + value.slice(end))
      requestAnimationFrame(() => { a.selectionStart = a.selectionEnd = s + 2 })
    }
  }
  const jump = () => {
    const a = area.current
    if (!a || at < 0) return
    a.focus(); a.selectionStart = at; a.selectionEnd = Math.min(value.length, at + 1)
  }
  return (
    <div className={`dw-editor${error ? ' dw-editor--error' : ''}`}>
      <div className="dw-gutter" ref={gutter} aria-hidden="true">
        {lines.map((_, i) => <span key={i} className={error && error.line === i + 1 ? 'dw-gutter-err' : ''}>{i + 1}</span>)}
      </div>
      <div className="dw-code">
        <pre className="dw-mirror" ref={mirror} aria-hidden="true">
          {at >= 0 ? <>{value.slice(0, at)}<mark>{value.slice(at, at + 1).replace('\n', ' ') || ' '}</mark>{value.slice(at + 1)}</> : value}{'\n'}
        </pre>
        <textarea ref={area} value={value} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" wrap="off"
          maxLength={maxLength} aria-label="Field IR program" aria-invalid={!!error} aria-describedby="dw-status"
          onChange={e => onChange(e.target.value)} onScroll={sync} onKeyDown={onKey} />
      </div>
      {error && <button type="button" className="dw-error" id="dw-error" onClick={jump} title="Jump to the error">
        <b>{error.pos >= 0 ? `${error.line}:${error.col}` : 'IR'}</b> {error.message.replace(/ at \d+:\d+$/, '')}
      </button>}
    </div>
  )
}
