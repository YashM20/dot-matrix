/**
 * The dot shell (backtick): a tiny terminal whose screen is itself a dot-matrix card. Every line is a
 * `textAt` field on one grid, sampled and rendered by DotCanvas like any widget; a real (transparent)
 * input underneath takes the keys, and a live region reads the output to screen readers.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { describe } from '../../engine/describe'
import { textAt } from '../../engine/layout'
import { hasGlyph } from '../../engine/fields/bitmapFont'
import type { DotStyle, GridConfig, Layer } from '../../engine'
import { boardManifest, loadBoard } from '../../widgets/manifest'
import { tileStyle } from '../../widgets/types'
import { DotCanvas } from '../DotCanvas'
import { boardTime, probes, xrState } from '../xray/store'
import { fuzzy } from './fuzzy'
import { SKINS, TABS, allBoards, type CommandApi } from './api'

const CHARS = 78, LINES = 13, LH = 9, PAD = 3
const GRID: GridConfig = { cols: CHARS * 6 + PAD * 2, rows: (LINES + 1) * LH + PAD * 2, pitch: 2.25 }
const STYLE: DotStyle = tileStyle
type Line = { kind: 'in' | 'out' | 'dim' | 'err'; text: string }

const HELP: Line[] = [
  ['help', 'this list'], ['ls [board]', 'boards, or the cards on one'], ['open <board|tab|card>', 'go there (alias: load)'],
  ['xray [on|off]', 'x-ray every card'], ['fps', 'measure frames, list x-ray cards'], ['t [seconds]', 'freeze the clock at t; t alone prints it'],
  ['play', 'resume the clock'], ['describe <card>', 'what a card says about itself'], ['remix <card>', 'open a card in DOTS'], ['studio <card>', 'open a card in STUDIO'],
  ['skin <name>', 'display skin (soon)'], ['clear · exit', ''],
].map(([c, d]) => ({ kind: 'out', text: `  ${c.padEnd(24)}${d}` }) as Line)

/** Fold text into the 5×7 font: upper-case, unknown glyphs → `?`, wrapped at the screen width. */
function wrap(text: string): string[] {
  const clean = [...text].map(ch => (ch === ' ' || hasGlyph(ch) ? ch : '?')).join('')
  const out: string[] = []
  for (let s = clean; s.length || !out.length; s = s.slice(CHARS)) { out.push(s.slice(0, CHARS)); if (s.length <= CHARS) break }
  return out
}
function measureFps(ms = 600): Promise<number> {
  return new Promise(res => {
    let n = 0; const t0 = performance.now()
    const step = (now: number) => { n++; if (now - t0 < ms) requestAnimationFrame(step); else res(Math.round((n * 1000) / (now - t0))) }
    requestAnimationFrame(step)
  })
}
/** Best card id for a loose name (`queen`, `lv-queen`, `Level 07`). */
async function findCard(q: string) {
  const all = (await allBoards()).flatMap(b => b.items)
  const exact = all.find(p => p.id === q || p.name.toLowerCase() === q)
  if (exact) return exact
  let best: { p: (typeof all)[number]; s: number } | null = null
  for (const p of all) { const m = fuzzy(q, `${p.id} ${p.name}`); if (m && (!best || m.score > best.s)) best = { p, s: m.score } }
  return best?.p
}
function findBoard(q: string) {
  const bs = boardManifest
  return bs.find(b => b.id === q) ?? bs.find(b => b.id.startsWith(q)) ?? bs.find(b => b.title.toLowerCase().includes(q))
}

export function Shell({ api, onClose }: { api: CommandApi; onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>(() => [
    { kind: 'dim', text: 'DOT/480 SHELL — FIELD → GRID SAMPLER → RENDERER. TYPE HELP.' },
  ])
  const [input, setInput] = useState('')
  const history = useRef<string[]>([]), cursor = useRef(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { inputRef.current?.focus() }, [])
  const print = (...ls: (Line | string)[]) => setLines(prev => [...prev, ...ls.map(l => (typeof l === 'string' ? { kind: 'out', text: l } as Line : l))].slice(-200))

  async function exec(raw: string) {
    const [cmd = '', ...rest] = raw.trim().split(/\s+/), arg = rest.join(' ').toLowerCase()
    switch (cmd.toLowerCase()) {
      case '': return
      case 'help': case '?': return print(...HELP)
      case 'clear': case 'cls': return setLines([])
      case 'exit': case 'quit': return onClose()
      case 'ls': {
        if (arg) {
          const m = findBoard(arg)
          if (!m) return print({ kind: 'err', text: `ls: no board "${arg}"` })
          const b = await loadBoard(m.id)
          return print(`${b.id} — ${b.title}`, ...b.items.map(p => `  ${p.id.padEnd(22)}${p.name}${p.animated ? ' ·' : ''}`))
        }
        const ids = boardManifest.map(b => (b.id === api.board ? `*${b.id}` : ` ${b.id}`))
        for (let i = 0; i < ids.length; i += 5) print(ids.slice(i, i + 5).map(s => s.padEnd(15)).join(''))
        return print({ kind: 'dim', text: `${boardManifest.length} boards · ls <board> lists its cards · tabs: ${TABS.join(' ').toLowerCase()}` })
      }
      case 'open': case 'load': case 'cd': {
        if (!arg) return print({ kind: 'err', text: `${cmd}: which board? try ls` })
        const tab = TABS.find(t => t.toLowerCase() === arg)
        if (tab) { api.openTab(tab); return print(`→ ${tab}`) }
        const b = findBoard(arg)
        if (b) { api.openBoard(b.id); return print(`→ ${b.id.toUpperCase()}`) }
        const c = await findCard(arg)
        if (c) { void api.focusCard(c.id); return print(`→ ${c.name}`) }
        return print({ kind: 'err', text: `${cmd}: nothing called "${arg}"` })
      }
      case 'xray': case 'x-ray': {
        const on = arg === 'on' ? true : arg === 'off' ? false : !(xrState().global || xrState().on.size > 0)
        api.toggleXray(on)
        return print(`x-ray ${on ? 'on: hover any dot to see why it is that size' : 'off'}`)
      }
      case 'fps': {
        if (arg === 'hud') { api.toggleFps(); return print('fps meter toggled') }
        print({ kind: 'dim', text: 'measuring…' })
        const fps = await measureFps()
        print(`page ${fps} fps · clock ${xrState().frozen ? 'frozen' : 'running'} at t ${boardTime().toFixed(2)}s`)
        const cards = [...probes.values()]
        if (!cards.length) return print({ kind: 'dim', text: 'xray on for per-card fps and dot counts (fps hud: meter)' })
        return print(...cards.slice(0, 8).map(p => `  ${p.preset.id.padEnd(20)}${(p.animated ? `${p.stats.fps}/${p.fps} fps` : 'static').padEnd(14)}${String(p.stats.dots).padStart(6)} dots  ${p.mode()}${p.worker() ? '+worker' : ''}`))
      }
      case 't': case 'time': {
        if (!arg) return print(`t = ${boardTime().toFixed(2)}s (${xrState().frozen ? 'frozen' : 'running'})`)
        if (arg === 'resume' || arg === 'play') { api.resume(); return print('clock running') }
        const s = Number(arg.replace(/s$/, ''))
        if (!Number.isFinite(s) || s < 0) return print({ kind: 'err', text: 't: seconds, e.g. t 12.5' })
        api.scrub(s)
        return print(`clock frozen at t = ${s.toFixed(2)}s · space or play resumes`)
      }
      case 'play': case 'resume': api.resume(); return print('clock running')
      case 'describe': case 'cat': {
        const c = arg ? await findCard(arg) : undefined
        if (!c) return print({ kind: 'err', text: `${cmd}: which card? e.g. describe queen` })
        return print(...wrapLines(describe(c, {}).summary))
      }
      case 'remix': {
        const c = arg ? await findCard(arg) : undefined
        if (!c) return print({ kind: 'err', text: 'remix: which card? e.g. remix rings' })
        void api.remix(c.id); return print(`→ DOTS with ${c.id}`)
      }
      case 'studio': case 'edit': {
        const c = arg ? await findCard(arg) : undefined
        if (!c) return print({ kind: 'err', text: `${cmd}: which card? e.g. studio queen` })
        void api.studio(c.id); return print(`→ STUDIO with ${c.id}`)
      }
      case 'skin': {
        if (!arg || !(SKINS as readonly string[]).includes(arg)) return print({ kind: 'err', text: `skin: one of ${SKINS.join(', ')}` })
        api.setSkin(arg); return print(`display: ${arg}`)
      }
      case 'boss': case 'konami': case 'queen': api.boss(); onClose(); return
      case 'whoami': return print('a visitor, sampled at 144×144')
      case 'sudo': return print({ kind: 'err', text: 'permission denied: dots answer only to fields' })
      default: return print({ kind: 'err', text: `${cmd}: command not found (help)` })
    }
  }
  const wrapLines = (s: string): string[] => s.match(new RegExp(`.{1,${CHARS}}(\\s|$)`, 'g'))?.map(x => x.trimEnd()) ?? [s]

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const raw = input
      setInput(''); cursor.current = -1
      if (raw.trim()) history.current = [raw, ...history.current.filter(h => h !== raw)].slice(0, 50)
      print({ kind: 'in', text: raw })
      void exec(raw)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      const h = history.current, next = Math.max(-1, Math.min(h.length - 1, cursor.current + (e.key === 'ArrowUp' ? 1 : -1)))
      cursor.current = next; setInput(next < 0 ? '' : h[next])
    } else if (e.key === 'Escape' || (e.key === '`' && !input)) { e.preventDefault(); onClose() }
    else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); setLines([]) }
  }

  // the screen: the last LINES wrapped lines + the prompt, each a textAt field on one grid
  const shown = useMemo(() => {
    const rows: { text: string; kind: Line['kind'] }[] = []
    for (const l of lines) for (const w of wrap(l.kind === 'in' ? `> ${l.text}` : l.text)) rows.push({ text: w, kind: l.kind })
    return rows.slice(-LINES)
  }, [lines])
  const prompt = `> ${input}`.slice(-(CHARS - 1))
  const layers = useMemo(() => {
    const ls: Layer[] = shown.map((r, i) => ({ field: textAt(GRID, r.text, PAD, PAD + i * LH), tone: r.kind === 'dim' ? 'faint' : r.kind === 'err' ? 'mid' : r.kind === 'in' ? 'value' : 'idle' }))
    const y = PAD + LINES * LH
    ls.push({ field: textAt(GRID, '>', PAD, y), tone: 'active' })
    if (prompt.length > 1) ls.push({ field: textAt(GRID, prompt.slice(1), PAD + 6, y), tone: 'value' })
    ls.push({ field: textAt(GRID, '■', PAD + prompt.length * 6, y), tone: 'active' })
    return () => ls
  }, [shown, prompt])
  const lastOut = lines.filter(l => l.kind !== 'in').slice(-3).map(l => l.text).join('. ')
  return (
    <div className="pal-shell" role="dialog" aria-modal="true" aria-label="Dot shell" onMouseDown={() => inputRef.current?.focus()}>
      <div className="pal-shell-screen">
        <DotCanvas layers={layers} grid={GRID} style={STYLE} change={false} enter={{ delay: 0, mask: 'scan', duration: 260 }} />
        <input ref={inputRef} className="pal-shell-input" aria-label="Shell command" value={input} spellCheck={false} autoComplete="off" autoCapitalize="off"
          onChange={e => setInput(e.target.value)} onKeyDown={onKey} />
      </div>
      <div className="pal-shell-foot" aria-hidden="true">DOT SHELL · <kbd>↵</kbd> RUN · <kbd>↑</kbd> HISTORY · <kbd>ESC</kbd> CLOSE</div>
      <div className="sr-only" aria-live="polite">{lastOut}</div>
    </div>
  )
}
