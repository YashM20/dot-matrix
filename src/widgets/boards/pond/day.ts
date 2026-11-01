/**
 * The pond of the day and the ageing pond (docs/living-matter/X-advanced.md #5): a `Source` publishing
 *
 *   day · days since DAY_EPOCH of the pond's date (the `?day=YYYY-MM-DD` of a shared link, else the local date)
 *   age · days of visits − 1, from the opt-in pond memory (`src/site/pondMemory.ts`); 0 while it is off
 *
 * Its fixture is `{ day: 0, age: 0 }`, the canonical pond (seed 480) that goldens, thumbnails and Node checks see:
 * day 0 is DAY_EPOCH itself, so `?day=2025-10-27` shows exactly the golden pond. Cards that declare `day` / `age` in
 * their defaults receive them. The day is computed when the board first reads the source (no storage touched); the
 * age is read after idle, and a visit is counted then, only if the visitor turned the memory on. The day rolls over
 * at local midnight. Lives in the pond chunk (not first load, never in the worker).
 */
import type { Data, Snapshot, Source } from '../../../data/source'
import { localDay, onPondMemory, readPondMemory, recordPondVisit, type PondMemory } from '../../../site/pondMemory'

export const DAY_EPOCH = '2025-10-27'
export const POND_DAY_FIXTURE: Readonly<Data> = { day: 0, age: 0 }
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/
const utc = (s: string): number | undefined => {
  const m = YMD.exec(s)
  if (!m) return undefined
  const y = +m[1], mo = +m[2] - 1, d = +m[3], t = Date.UTC(y, mo, d), back = new Date(t)
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo && back.getUTCDate() === d ? t : undefined
}
const EPOCH_MS = utc(DAY_EPOCH)!
/** Days from DAY_EPOCH to `ymd` (YYYY-MM-DD), or undefined for a malformed date. */
export function dayIndex(ymd: string): number | undefined { const t = utc(ymd); return t === undefined ? undefined : Math.round((t - EPOCH_MS) / 86_400_000) }
/** The date of day index `i` as YYYY-MM-DD. */
export function dayString(i: number): string { return new Date(EPOCH_MS + i * 86_400_000).toISOString().slice(0, 10) }
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
/** A short caption for day index `i`: "OCT 31". */
export function dayLabel(i: number): string { const d = new Date(EPOCH_MS + i * 86_400_000); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` }
/** A valid `?day=` in `search`, else undefined. */
export function dayParam(search: string): string | undefined { const v = new URLSearchParams(search).get('day'); return v && utc(v) !== undefined ? v : undefined }
/** Age in days of visits (the first visit is 0). */
export const ageOf = (m: PondMemory | null): number => (m ? Math.max(0, m.visits - 1) : 0)

const listeners = new Set<(s: Snapshot) => void>()
let snap: Snapshot = { data: { ...POND_DAY_FIXTURE }, status: 'offline', updatedAt: null, error: null, retryInMs: null }
let read = false, midnight: ReturnType<typeof setTimeout> | undefined, idle: number | undefined, unMemory: (() => void) | undefined
const browser = () => typeof window !== 'undefined' && typeof location !== 'undefined'
const today = () => dayIndex(dayParam(location.search) ?? localDay()) ?? 0
function publish(patch: Data) {
  const data = { ...snap.data, ...patch }
  if (data.day === snap.data.day && data.age === snap.data.age && read) return
  read = true
  snap = { data, status: 'live', updatedAt: Date.now(), error: null, retryInMs: null }
  for (const l of listeners) l(snap)
}
function start() {
  publish({ day: today() })
  // the age (and today's visit, when the memory is on) after idle: storage is never read on first paint
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
  const after = () => { idle = undefined; publish({ age: ageOf(recordPondVisit()) }) }
  idle = w.requestIdleCallback ? w.requestIdleCallback(after, { timeout: 2000 }) : window.setTimeout(after, 800)
  unMemory = onPondMemory(() => publish({ age: ageOf(readPondMemory()) }))
  const roll = () => {
    const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5)
    midnight = setTimeout(() => { publish({ day: today(), age: ageOf(recordPondVisit()) }); roll() }, next.getTime() - now.getTime())
  }
  roll()
}
function stop() {
  if (midnight !== undefined) clearTimeout(midnight)
  if (idle !== undefined) { const w = window as Window & { cancelIdleCallback?: (h: number) => void }; if (w.cancelIdleCallback) w.cancelIdleCallback(idle); else clearTimeout(idle) }
  unMemory?.(); midnight = idle = unMemory = undefined
}

export const POND_DAY_ID = 'pond-day'
export const pondDaySource: Source<{ day?: string; age?: number }> = {
  id: POND_DAY_ID,
  keys: Object.keys(POND_DAY_FIXTURE),
  fixture: POND_DAY_FIXTURE as Data,
  // the board's first render reads the snapshot before it subscribes: give it today's pond already (no pop from day 0)
  snapshot: () => { if (!read && browser()) publish({ day: today() }); return snap },
  subscribe(listener) {
    listeners.add(listener)
    if (listeners.size === 1 && browser()) start()
    listener(snap)
    return () => { if (listeners.delete(listener) && listeners.size === 0) stop() }
  },
  // probes: { day: 'YYYY-MM-DD' } and / or { age }
  push(p) {
    const patch: Data = {}
    if (p?.day !== undefined) { const d = dayIndex(p.day); if (d !== undefined) patch.day = d }
    if (typeof p?.age === 'number' && p.age >= 0) patch.age = Math.floor(p.age)
    publish(patch)
  },
}
