/**
 * Sound hooks: the sim emits event names (`shoot`, `hit`, `key`, `jump`, `stage:queen`, …). If an
 * audio module exists at `src/audio/index.ts` (built separately), it is loaded lazily and the first
 * of `sfx` / `play` / `trigger` it exports is called with the event name. No module → no-op.
 * Feature-detected with `import.meta.glob`, so a missing module is not an import error.
 */
type Player = (name: string) => void
const found = typeof import.meta.glob === 'function' ? import.meta.glob('../audio/index.ts') : {}
let player: Player | null = null, loading = false

export function sound(events: readonly string[]): void {
  if (!events.length) return
  if (player) { for (const e of events) try { player(e) } catch { /* a sound must never break the game */ } return }
  const load = found['../audio/index.ts']
  if (!load || loading) return
  loading = true
  load().then(m => {
    const mod = m as Record<string, unknown>
    const fn = ['sfx', 'play', 'trigger'].map(k => mod[k]).find(f => typeof f === 'function') as Player | undefined
    if (fn) player = fn
  }).catch(() => { /* stays silent */ })
}
