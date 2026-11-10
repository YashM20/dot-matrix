/**
 * The like button (#169), outside the card frame: on the widget page's rail and on gallery entries. Grey chrome;
 * liked is the "on" state, so it takes the theme's one accent like every other on state. Hidden while the API
 * answers 404 (likes not set up). The first like asks once whether to remember this browser (`RememberSheet`).
 * States: counting soon, already liked, limit reached, likes paused. `aria-pressed`, and a polite live region that
 * reads out the state and the count.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { countOf, dailyVisit, ensureBot, gpc, local, programItem, sendForget, sendLike, sendVisit, setLocal, subscribeLocal, updateLocal, type Program } from './client'
import { RememberSheet } from './RememberSheet'
import './likes.css'

export interface LikeButtonProps {
  /** `w:<uid>` for a widget. */
  item?: string
  /** A gallery program (keyed by its content). */
  program?: Program
  /** What is liked, for the accessible name. */
  name: string
  /** A row in a list: no forget control (the list has one). */
  compact?: boolean
}

type Note = '' | 'soon' | 'already' | 'limit' | 'paused' | 'forgotten'
const NOTES: Record<Exclude<Note, ''>, string> = {
  soon: 'Liked. Counting soon.',
  already: 'Already liked.',
  limit: 'Limit reached. Try again later.',
  paused: 'Likes paused.',
  forgotten: 'This browser is forgotten.',
}

const plural = (n: number) => `${n} like${n === 1 ? '' : 's'}`

export default function LikeButton({ item: widgetItem, program, name, compact }: LikeButtonProps) {
  const mine = useSyncExternalStore(subscribeLocal, local, local)
  const [item, setItem] = useState(widgetItem)
  const [count, setCount] = useState<number | null>(null)
  const [state, setState] = useState<'loading' | 'off' | 'ready' | 'paused'>('loading')
  const [note, setNote] = useState<Note>('')
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [said, setSaid] = useState('')
  const src = program?.src, grid = program?.grid, lattice = program?.lattice, tone = program?.tone

  useEffect(() => {
    let live = true
    const key = widgetItem ? Promise.resolve(widgetItem) : src !== undefined ? programItem({ src, grid: grid!, lattice: lattice!, tone: tone! }) : Promise.reject(new Error('nothing to like'))
    key.then(async k => {
      const r = await countOf(k)
      if (!live) return
      setItem(k)
      if (r.ok) { setCount(r.body); setState('ready'); void ensureBot(); dailyVisit() } else setState(r.why === 'off' ? 'off' : 'paused')
    }, () => { if (live) setState('off') })
    return () => { live = false }
  }, [widgetItem, src, grid, lattice, tone])

  if (state === 'off' || state === 'loading' || !item) return null
  const base = mine.mine[item], liked = base !== undefined
  const shown = Math.max(count ?? 0, liked ? base + 1 : 0)

  const send = async (on: boolean) => {
    setBusy(true)
    await ensureBot()
    const r = await sendLike(program && !widgetItem ? { program } : { item }, on)
    setBusy(false)
    if (!r.ok) { setNote(r.why === 'limit' ? 'limit' : 'paused'); setSaid(NOTES[r.why === 'limit' ? 'limit' : 'paused']); return }
    updateLocal(l => {
      const next = { ...l.mine }
      if (r.body.on) next[item] = count ?? 0; else delete next[item]
      return { ...l, mine: next }
    })
    const n = r.body.on ? Math.max(count ?? 0, (count ?? 0) + 1) : count ?? 0
    const nn: Note = !r.body.on ? '' : r.body.already ? 'already' : r.body.soon ? 'soon' : ''
    setNote(nn)
    setSaid(`${r.body.on ? 'Liked' : 'Like removed'}. ${n > 0 ? plural(n) + '.' : ''} ${nn === 'soon' ? 'Counting soon.' : nn === 'already' ? 'Already liked.' : ''}`.replace(/\s+/g, ' ').trim())
  }

  const click = () => {
    if (busy) return
    if (liked) { void send(false); return }
    if (gpc() || local().c) { void send(true); return }
    setAsking(true)
  }
  const choose = async (c: 'r' | 'o' | null) => {
    setAsking(false)
    if (!c) return
    updateLocal(l => ({ ...l, c, ...(c === 'r' && { d: Math.floor(Date.now() / 864e5) }) }))
    if (c === 'r') { setBusy(true); await ensureBot(); await sendVisit(); setBusy(false) }
    await send(true)
  }
  const forget = async () => {
    setBusy(true)
    const r = await sendForget()
    setBusy(false)
    if (!r.ok) { setNote('paused'); setSaid(NOTES.paused); return }
    setLocal(null)
    setNote('forgotten'); setSaid(NOTES.forgotten)
  }

  const paused = state === 'paused'
  const label = `${liked ? 'Unlike' : 'Like'} ${name}${shown > 0 ? `, ${plural(shown)}` : ''}`
  const visible = paused ? NOTES.paused : note ? NOTES[note] : ''
  return <div className={`lk${compact ? ' lk--compact' : ''}`} data-likes={item}>
    <button type="button" className="lk-btn" aria-pressed={liked} aria-label={label} title={paused ? NOTES.paused : label} disabled={paused || busy} onClick={click}>
      <span className="lk-glyph" aria-hidden="true">{liked ? '♥' : '♡'}</span>
      <span className="lk-label">{liked ? 'LIKED' : 'LIKE'}</span>
      {shown > 0 && <span className="lk-count">{shown.toLocaleString('en')}</span>}
    </button>
    <span className="lk-note" aria-hidden="true">{visible}</span>
    {!compact && mine.c === 'r' && <button type="button" className="lk-forget" disabled={busy} onClick={() => void forget()}>Forget this browser</button>}
    <span className="sr-only" role="status" aria-live="polite">{said}</span>
    {asking && <RememberSheet onChoose={c => void choose(c)} />}
  </div>
}
