/**
 * App shell state machine checks (docs/STATE-MACHINES.md, section A), one per bug fixed, each on a fresh copy of the
 * module in a fake browser (no DOM, no network):
 *  - A2 stale-deploy: a failed chunk while offline never reloads the page (the reload would land on the browser's
 *    offline screen) and leaves the once-per-gap stamp unused; online it reloads once, then holds.
 *  - A5 likes client: a like, a choice or a forget in another tab reaches this tab's record (the `storage` event), and
 *    a write here is a read-modify-write of what is stored, so it never drops another tab's likes.
 * On its own: `npx tsx scripts/verify/appstate.ts` (also part of `pnpm verify`).
 */
import { checker, type Assert } from '../lib/check'

type Listener = (e: { key: string | null }) => void
/** A fake browser: storage maps, `navigator.onLine`, `location.reload`, and the window's listeners. Restored by `done()`. */
function fakeBrowser(online: boolean) {
  const g = globalThis as Record<string, unknown>
  const names = ['window', 'location', 'localStorage', 'sessionStorage', 'navigator'] as const
  const keep = names.map(n => [n, Object.getOwnPropertyDescriptor(g, n)] as const)
  const map = () => { const m = new Map<string, string>(); return { m, api: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k) } } }
  const local = map(), session = map(), listeners = new Map<string, Listener[]>(), reloads = { n: 0 }
  const set = (n: string, value: unknown) => Object.defineProperty(g, n, { value, configurable: true, writable: true })
  set('window', { addEventListener: (t: string, f: Listener) => listeners.set(t, [...(listeners.get(t) ?? []), f]), removeEventListener() {} })
  set('location', { reload: () => { reloads.n++ }, href: 'https://example.test/', search: '' })
  set('localStorage', local.api); set('sessionStorage', session.api)
  set('navigator', { onLine: online })
  return {
    local: local.m, session: session.m, reloads,
    fire: (type: string, e: { key: string | null }) => (listeners.get(type) ?? []).forEach(f => f(e)),
    setOnline: (on: boolean) => set('navigator', { onLine: on }),
    done: () => { for (const [n, d] of keep) if (d) Object.defineProperty(g, n, d); else delete g[n] },
  }
}

export async function appStateChecks(assert: Assert) {
  // ── A2: the stale-deploy reload ──
  {
    const b = fakeBrowser(false)
    try {
      const m = await import(`../../src/site/stale-deploy.ts?appstate=${Date.now()}`) as typeof import('../../src/site/stale-deploy')
      const t = 1_000_000_000
      const offline = m.reloadForStaleChunk(t)
      assert('stale-deploy: offline, a failed chunk does not reload the page and leaves the stamp unused',
        offline === false && b.reloads.n === 0 && !b.session.has('dot480:stale-reload'), `returned ${offline}, ${b.reloads.n} reloads`)
      b.setOnline(true)
      const first = m.reloadForStaleChunk(t + 1000), again = m.reloadForStaleChunk(t + 2000), later = m.reloadForStaleChunk(t + 1000 + 5 * 60_000)
      assert('stale-deploy: back online, it reloads once, holds inside the 5 min gap, and may reload again after it',
        first && !again && later && b.reloads.n === 2, `${first} ${again} ${later}, ${b.reloads.n} reloads`)
    } finally { b.done() }
  }

  // ── A5: the likes client's record across tabs ──
  {
    const b = fakeBrowser(true), KEY = 'dot480:likes'
    const W1 = 'w:aaaaaaa1', W2 = 'w:bbbbbbb2', W3 = 'w:ccccccc3', W4 = 'w:ddddddd4'
    b.local.set(KEY, JSON.stringify({ c: 'r', d: 1, mine: { [W1]: 3 } }))
    try {
      const m = await import(`../../src/components/likes/client.ts?appstate=${Date.now()}`) as typeof import('../../src/components/likes/client')
      let heard = 0
      m.subscribeLocal(() => { heard++ })
      const before = m.local()
      // the other tab likes W2 and says so
      b.local.set(KEY, JSON.stringify({ c: 'r', d: 1, mine: { [W1]: 3, [W2]: 0 } }))
      b.fire('storage', { key: KEY })
      const after = m.local()
      assert('likes: a like in another tab reaches this tab (storage event: cache dropped, subscribers told)',
        W1 in before.mine && !(W2 in before.mine) && W2 in after.mine && heard === 1 && after !== before, JSON.stringify(after))
      // the other tab likes W3, and this tab likes W4 before that tab's event arrives
      b.local.set(KEY, JSON.stringify({ c: 'r', d: 1, mine: { [W1]: 3, [W2]: 0, [W3]: 7 } }))
      m.updateLocal(l => ({ ...l, mine: { ...l.mine, [W4]: 1 } }))
      const stored = JSON.parse(b.local.get(KEY) ?? '{}') as { mine?: Record<string, number> }
      assert('likes: a like here keeps the likes another tab stored meanwhile (read-modify-write)',
        [W1, W2, W3, W4].every(k => k in (stored.mine ?? {})), JSON.stringify(stored))
      // the other tab forgets this browser
      b.local.delete(KEY)
      b.fire('storage', { key: KEY })
      const gone = m.local()
      assert('likes: "Forget this browser" in another tab clears the choice and the likes here too', gone.c === undefined && !Object.keys(gone.mine).length, JSON.stringify(gone))
      b.fire('storage', { key: 'dot480:theme' })
      assert('likes: other keys\' storage events leave the record alone', heard === 3, `${heard} notifications`)
    } finally { b.done() }
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/appstate.ts')) {
  const { assert, done } = checker('appstate')
  await appStateChecks(assert)
  done('appstate: all checks passed')
}
