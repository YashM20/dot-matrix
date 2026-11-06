/**
 * Release flags (#144): features turned on or off per environment without a code change. Modelled on `./pro.ts`; Pro
 * stays there, since it is a visitor's preference and these are release switches. Plain module, no React: shaped for
 * `useSyncExternalStore(subscribeFlags, () => flag(id))` (`./useFlag.ts`). Safe in Node and in the sample worker (no
 * storage there: build value, then default).
 *
 * A flag's value, each step overriding the one before:
 * 1. the registry default below;
 * 2. the build value `VITE_FLAG_<ID>`: `on` or `off` (also `1` / `0`), set per Vercel environment (docs/DEPLOY.md);
 * 3. this browser's saved overrides, `localStorage['dot480:flags']` (`setFlag`, or by hand in DevTools on a preview).
 *    A flag with a `param` also reads its older `dot480:<param>` key.
 *
 * The URL never sets a flag: visitors can't turn on a feature by editing a link.
 *
 * `VITE_FLAG_<ID>=kill` is stronger: the flag is off whatever the overrides say, and the feature's lazy chunks are
 * left out of the build. That needs the test inline where the chunk is imported, so the bundler sees a constant:
 * `import.meta.env.VITE_FLAG_XRAY === 'kill' ? null : lazy(() => import(…))`.
 */
export interface FlagDef {
  id: string
  default: boolean
  description: string
  /** The flag's older storage key, `dot480:<param>`, still read: `1` / `on`, `0` / `off`. */
  param?: string
}

export const FLAGS = [
  { id: 'xray', default: false, description: 'X-ray: the per-card ⓘ overlay and inspector, the dock button and TOOLS tile, the widget page pill and menu item, the intro line, the X keys, the palette action and the shell command' },
  { id: 'worker', default: true, description: 'Sample cards in a web worker; off samples on the main thread', param: 'worker' },
  { id: 'clack', default: false, description: 'The flip-disc clack sound', param: 'clack' },
  { id: 'analytics', default: true, description: 'PostHog analytics, opt-in (src/site/analytics.ts): the consent banner and the TOOLS and palette switches. Needs VITE_POSTHOG_PROJECT_TOKEN' },
  { id: 'likes', default: true, description: 'Likes (#169): the like button on widget pages and gallery programs; it also hides while the likes API answers 404' },
  { id: 'make', default: false, description: 'MAKE, the editor: the view tab and phone tab, the palette and shell places, REMIX and studio actions, About and essay links. Off, a MAKE URL opens the home board' },
  { id: 'lab', default: false, description: 'The lab page (/lab/): the header, footer, TOOLS, About, blog nav and sitemap links. Off, /lab/ goes home' },
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
// the build scripts (postbuild, seo) run in Node, where the build value is a plain environment variable
const NODE_ENV: Record<string, unknown> = (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env ?? {}
const buildValue = (id: FlagId): unknown => ENV[`VITE_FLAG_${id.toUpperCase()}`] ?? NODE_ENV[`VITE_FLAG_${id.toUpperCase()}`]
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

function resolve(): Values {
  const s = saved(), out = {} as Values
  for (const { id, default: d } of FLAGS) {
    const p = paramOf(id)
    out[id] = flagKilled(id) ? false : s[id] ?? (p ? word(read(`dot480:${p}`)) : undefined) ?? word(buildValue(id)) ?? d
  }
  return out
}

let values = resolve()
const notify = () => listeners.forEach(l => l())

/** The flag's value for this page. */
export const flag = (id: FlagId): boolean => values[id]

/**
 * Saves an override for this browser (`null` drops it) and notifies subscribers. A killed flag stays off.
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
