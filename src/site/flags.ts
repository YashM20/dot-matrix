/**
 * Release flags (#144): features turned on or off per environment without a code change, with a URL override for
 * testing on previews. Modelled on `./pro.ts`; Pro stays there, since it is a visitor's preference and these are
 * release switches. Plain module, no React: shaped for `useSyncExternalStore(subscribeFlags, () => flag(id))`
 * (`./useFlag.ts`). Safe in Node and in the sample worker (no storage or URL there: build value, then default).
 *
 * A flag's value, each step overriding the one before:
 * 1. the registry default below;
 * 2. the build value `VITE_FLAG_<ID>`: `on` or `off` (also `1` / `0`), set per Vercel environment (docs/DEPLOY.md);
 * 3. this browser's saved overrides, `localStorage['dot480:flags']` (`setFlag`);
 * 4. the URL, for this page load only: `?flags=xray,-worker` turns `xray` on and `worker` off, and `?flags=reset`
 *    clears the saved overrides. A flag with a `param` also takes its older `?<param>=1|0` and `dot480:<param>` key.
 *
 * `VITE_FLAG_<ID>=kill` is stronger: the flag is off whatever the overrides say, and the feature's lazy chunks are
 * left out of the build. That needs the test inline where the chunk is imported, so the bundler sees a constant:
 * `import.meta.env.VITE_FLAG_XRAY === 'kill' ? null : lazy(() => import(…))`.
 */
export interface FlagDef {
  id: string
  default: boolean
  description: string
  /** An older URL param (and `dot480:<param>` storage key) that still sets this flag: `1` / `on`, `0` / `off`. */
  param?: string
}

export const FLAGS = [
  { id: 'xray', default: false, description: 'X-ray: the per-card ⓘ overlay and inspector, the dock button and TOOLS tile, the X keys, the palette action and the shell command' },
  { id: 'worker', default: true, description: 'Sample cards in a web worker; off samples on the main thread', param: 'worker' },
  { id: 'clack', default: false, description: 'The flip-disc clack sound', param: 'clack' },
] as const satisfies readonly FlagDef[]

export type FlagId = (typeof FLAGS)[number]['id']
type Values = Record<FlagId, boolean>

const KEY = 'dot480:flags'
const browser = typeof window !== 'undefined'
const listeners = new Set<() => void>()
const isId = (s: string): s is FlagId => FLAGS.some(f => f.id === s)
const paramOf = (id: FlagId): string | undefined => (FLAGS.find(f => f.id === id) as FlagDef | undefined)?.param

const word = (v: unknown): boolean | undefined =>
  v === true || v === '1' || v === 'on' || v === 'true' ? true : v === false || v === '0' || v === 'off' || v === 'false' ? false : undefined
// Vite replaces `import.meta.env` with the build's env object; Node (verify, tsx) has none
const ENV: Record<string, unknown> = import.meta.env ?? {}
const buildValue = (id: FlagId): unknown => ENV[`VITE_FLAG_${id.toUpperCase()}`]
/** Killed at build time (`VITE_FLAG_<ID>=kill`): off for good, no override brings it back. */
export const flagKilled = (id: FlagId): boolean => buildValue(id) === 'kill'

function read(key: string): string | null {
  if (!browser) return null
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string | null) {
  if (!browser) return
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value) } catch { /* private mode: this page only */ }
}
function saved(): Partial<Values> {
  const out: Partial<Values> = {}
  try {
    const o: unknown = JSON.parse(read(KEY) ?? '{}')
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) if (isId(k) && typeof v === 'boolean') out[k] = v
  } catch { /* a broken entry counts as none */ }
  return out
}
const save = (o: Partial<Values>) => write(KEY, Object.keys(o).length ? JSON.stringify(o) : null)

function fromUrl(): { set: Partial<Values>; reset: boolean } {
  const set: Partial<Values> = {}
  if (!browser || typeof location === 'undefined') return { set, reset: false }
  const q = new URLSearchParams(location.search)
  for (const f of FLAGS) { const p = paramOf(f.id), v = p ? word(q.get(p)) : undefined; if (v !== undefined) set[f.id] = v }
  let reset = false
  for (const raw of (q.get('flags') ?? '').split(',')) {
    const t = raw.trim().toLowerCase(), off = t.startsWith('-'), id = off ? t.slice(1) : t
    if (t === 'reset') reset = true
    else if (isId(id)) set[id] = !off
  }
  return { set, reset }
}

const url = fromUrl()
if (url.reset) { save({}); for (const f of FLAGS) { const p = paramOf(f.id); if (p) write(`dot480:${p}`, null) } }

function resolve(): Values {
  const s = saved(), out = {} as Values
  for (const { id, default: d } of FLAGS) {
    const p = paramOf(id)
    out[id] = flagKilled(id) ? false : url.set[id] ?? s[id] ?? (p ? word(read(`dot480:${p}`)) : undefined) ?? word(buildValue(id)) ?? d
  }
  return out
}

let values = resolve()
const notify = () => listeners.forEach(l => l())

/** The flag's value for this page. */
export const flag = (id: FlagId): boolean => values[id]

/**
 * Saves an override for this browser (`null` drops it) and notifies subscribers. Like `setPro`, it wins over the URL
 * for the rest of this page load. A killed flag stays off.
 */
export function setFlag(id: FlagId, on: boolean | null) {
  const s = saved()
  if (on === null) delete s[id]; else s[id] = on
  save(s)
  const p = paramOf(id)
  if (p) write(`dot480:${p}`, null) // the older key would otherwise outlive the override
  const next = flagKilled(id) ? false : on ?? resolve()[id]
  if (next === values[id]) return
  values = { ...values, [id]: next }
  notify()
}

// another tab saved an override
const onStorage = (e: StorageEvent) => {
  if (e.key !== KEY && e.key !== null) return
  const next = resolve()
  if (FLAGS.some(f => next[f.id] !== values[f.id])) { values = next; notify() }
}

export function subscribeFlags(listener: () => void) {
  if (!listeners.size && browser) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (!listeners.size && browser) window.removeEventListener('storage', onStorage)
  }
}
