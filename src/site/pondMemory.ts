/**
 * The ageing pond's memory (docs/living-matter/X-advanced.md #5, owner decision: opt-in). One small record in
 * localStorage, `dot480:pond` = `{ v: 1, born, last, visits }` (≈ 60 bytes), and it only exists while the visitor has
 * turned POND MEMORY on (TOOLS, or ⌘K "Pond memory: on"): nothing is written before that, turning it off deletes it,
 * and the record itself is the opt-in (there is no separate flag). Read only by the pond board's day source after
 * idle, and by the toggle; never on first load. Nothing leaves the device.
 */
export const POND_MEMORY_KEY = 'dot480:pond'
export interface PondMemory { v: 1; born: string; last: string; visits: number }

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
const store = (): Store | null => { try { return globalThis.localStorage ?? null } catch { return null } }
const listeners = new Set<() => void>()

/** The local calendar date as YYYY-MM-DD. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
/** The stored record, or null (memory off, storage blocked, or a corrupt record). */
export function readPondMemory(): PondMemory | null {
  try {
    const raw = store()?.getItem(POND_MEMORY_KEY)
    if (!raw) return null
    const m = JSON.parse(raw) as PondMemory
    return m && m.v === 1 && typeof m.born === 'string' && typeof m.visits === 'number' ? m : null
  } catch { return null }
}
export const pondMemoryOn = () => readPondMemory() !== null
/** Turn the memory on (a fresh record, born today) or off (the record is deleted). */
export function setPondMemory(on: boolean, today = localDay()): void {
  try {
    if (on) { if (!readPondMemory()) store()?.setItem(POND_MEMORY_KEY, JSON.stringify({ v: 1, born: today, last: today, visits: 1 } satisfies PondMemory)) }
    else store()?.removeItem(POND_MEMORY_KEY)
  } catch { /* quota or blocked: stays off */ }
  for (const l of listeners) l()
}
/** Count today's visit (once a day) when the memory is on; returns the record, or null when it is off. */
export function recordPondVisit(today = localDay()): PondMemory | null {
  const m = readPondMemory()
  if (!m || m.last === today) return m
  const next: PondMemory = { v: 1, born: m.born, last: today, visits: m.visits + 1 }
  try { store()?.setItem(POND_MEMORY_KEY, JSON.stringify(next)) } catch { return m }
  return next
}
/**
 * A pond link carries its day (owner decision: `/pond/` links carry `?day=`), so a shared pond is the one the sender
 * saw: the page's own `?day=` when it has one, else today's local date. Other links pass through.
 */
export function withPondDay(url: string, pond: boolean): string {
  if (!pond) return url
  const u = new URL(url, location.href), q = new URLSearchParams(location.search).get('day')
  u.searchParams.set('day', q && /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : localDay())
  return u.toString()
}
/** Called after every on / off switch. Returns the unsubscribe. */
export function onPondMemory(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }
