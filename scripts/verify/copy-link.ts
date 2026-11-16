/**
 * Copy link (#353): one path for every copy-link action. In a fake browser (a `location`, `localStorage` and a
 * clipboard that copies, refuses or never answers):
 *  - `shareLink` makes the link absolute, adds `?theme=` only with the share opt-in on (replacing the link's own theme
 *    params), and gives pond links the page's `?day=` (a hostile one is dropped for today); other links pass through;
 *  - `copyLink` copies that link (a `pond-` card's carries its day), and says how it went: "link copied", or "copy
 *    failed" with the link, for a refused write, no clipboard, and a write that never settles (the timeout);
 *  - in the source: one `copyText`, `link_copied` sent only by `copyLink`, every copy-link caller on it, and no raw
 *    `navigator.clipboard` call outside the two clipboard modules (both behind the timeout).
 * The browser half (a card ALL hasn't mounted) is in scripts/site/browse-browser.ts. On its own: `npx tsx scripts/verify/copy-link.ts`.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checker, type Assert } from '../lib/check'

type Clip = 'ok' | 'refuse' | 'hang' | 'none'

export async function copyLinkChecks(assert: Assert) {
  const g = globalThis as Record<string, unknown>
  const saved = { location: g.location, localStorage: g.localStorage, window: g.window, navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator') }
  const data = new Map<string, string>(), copies: string[] = []
  let clip: Clip = 'ok'
  const at = (href: string) => { const u = new URL(href); g.location = { href: u.href, origin: u.origin, pathname: u.pathname, search: u.search } }
  at('https://x/')
  g.localStorage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) }
  g.window ??= { setTimeout, clearTimeout }
  const clipboard = { writeText: (t: string) => clip === 'refuse' ? Promise.reject(new Error('denied')) : clip === 'hang' ? new Promise<void>(() => {}) : (copies.push(t), Promise.resolve()) }
  Object.defineProperty(globalThis, 'navigator', { value: { get clipboard() { return clip === 'none' ? undefined : clipboard } }, configurable: true, writable: true })
  try {
    const { shareLink, copyLink } = await import('../../src/components/copyLink')
    const { setShareTheme } = await import('../../src/site/theme/share')
    const { getTheme } = await import('../../src/site/theme/theme')
    const { localDay } = await import('../../src/site/pondMemory')
    const { xrState } = await import('../../src/components/xray/store')
    const today = localDay(), theme = getTheme().name

    setShareTheme(false)
    const plain = [shareLink('/widget/clock/'), shareLink('/widget/clock/?theme=light_amber'), shareLink('https://x/lock/', false)]
    assert('copy link: without the opt-in a link is absolute and kept as it is',
      plain.join() === 'https://x/widget/clock/,https://x/widget/clock/?theme=light_amber,https://x/lock/', plain.join(' '))
    setShareTheme(true)
    const themed = [shareLink('/widget/clock/'), shareLink('/widget/clock/?scheme=light&accent=amber&hue=20&contrast=more&tag=ring')]
    assert('copy link: with the opt-in a link carries the visitor\'s ?theme=, replacing its own theme params and keeping the rest',
      themed[0] === `https://x/widget/clock/?theme=${theme}` && themed[1] === `https://x/widget/clock/?tag=ring&theme=${theme}`, themed.join(' '))
    const ponds = [shareLink('/widget/pond-koi/', true)]
    at('https://x/pond/?day=2026-03-04'); ponds.push(shareLink('/pond/', true))
    at('https://x/pond/?day=..%2Fx'); ponds.push(shareLink('/pond/', true))
    at('https://x/')
    assert('copy link: a pond link carries the page\'s ?day= (a malformed one gives today), after the theme',
      ponds[0] === `https://x/widget/pond-koi/?theme=${theme}&day=${today}` && ponds[1] === `https://x/pond/?theme=${theme}&day=2026-03-04` && ponds[2] === `https://x/pond/?theme=${theme}&day=${today}`, ponds.join(' '))
    setShareTheme(false)

    const said = () => xrState().toast?.text ?? ''
    const ok = await copyLink('/widget/pond-koi/', { card: 'pond-koi' }), okSaid = said()
    const short = await copyLink('/k3/', { card: 'clock', said: 'short link copied: /k3/' }), shortSaid = said()
    assert('copy link: copies the shared link (a pond- card\'s with its day) and says "link copied", or the caller\'s words',
      ok.outcome === 'copied' && copies[0] === `https://x/widget/pond-koi/?day=${today}` && ok.url === copies[0] && okSaid === 'link copied'
      && short.outcome === 'copied' && copies[1] === 'https://x/k3/' && shortSaid === 'short link copied: /k3/', JSON.stringify({ ok, okSaid, short, shortSaid, copies }))
    const fails: string[] = []
    for (const c of ['refuse', 'none', 'hang'] as const) {
      clip = c
      const t0 = Date.now(), r = await copyLink('/widget/clock/', { card: 'clock' }), ms = Date.now() - t0
      if (r.outcome !== 'failed' || said() !== 'copy failed: https://x/widget/clock/' || ms > 3000) fails.push(`${c}: ${r.outcome} "${said()}" ${ms} ms`)
    }
    clip = 'ok'
    const quiet = xrState().toast?.id, silent = await copyLink('/', { view: 'EXPLORE', toast: false })
    assert('copy link: a refused write, no clipboard and a write that never settles all end as "copy failed" with the link; toast: false says nothing',
      !fails.length && silent.outcome === 'copied' && xrState().toast?.id === quiet, fails.join('; '))
  } finally {
    g.location = saved.location; g.localStorage = saved.localStorage; g.window = saved.window
    if (saved.navigator) Object.defineProperty(globalThis, 'navigator', saved.navigator); else delete g.navigator
  }

  // the source: one helper, one event, every caller on it
  const files = readdirSync('src', { recursive: true, encoding: 'utf8' }).filter(f => /\.tsx?$/.test(f)).map(f => join('src', f).replace(/\\/g, '/'))
  const text = new Map(files.map(f => [f, readFileSync(f, 'utf8')]))
  const having = (re: RegExp) => files.filter(f => re.test(text.get(f)!))
  const defs = having(/export (async )?function copyText\b/), events = having(/['"]link_copied['"]/)
  // outside the helper itself, a clipboard write only inside `inTime` (the timeout)
  const raw = having(/(?<!inTime\()navigator\.clipboard\??\.(writeText|write)\(/).filter(f => f !== 'src/lib/copyText.ts')
  const callers = ['src/components/CardRow.tsx', 'src/components/palette/CommandLayer.tsx', 'src/components/widget/WidgetActions.tsx'].filter(f => !/\bcopyLink\(/.test(text.get(f) ?? ''))
  assert('copy link: one copyText (src/lib/copyText.ts), link_copied sent only by copyLink, the card row, command layer and widget page on copyLink, no raw clipboard write without the timeout',
    defs.join() === 'src/lib/copyText.ts' && events.join() === 'src/components/copyLink.ts' && !callers.length && !raw.length,
    JSON.stringify({ defs, events, callers, raw }))
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/copy-link.ts')) {
  const { assert, done } = checker('copy link')
  await copyLinkChecks(assert)
  done('copy link: all checks passed')
}
