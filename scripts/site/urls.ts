/**
 * URL hardening check (issue #148, `src/site/safe-url.ts`). With no browser:
 *  - `localUrl` keeps every target on the page's origin: `//host`, `/\host`, `\\host`, leading spaces or tabs, dot
 *    segments that end in `//host`, absolute URLs, `javascript:` and `data:` all land on a same-origin path. A page
 *    already at `//host` (the palette's `location.pathname + query`) gives `/host?query`. A small fuzz over slashes,
 *    backslashes, dots, whitespace and escapes checks the same for every short prefix;
 *  - `safeDecode` and `widgetRoute` return nothing for a bad escape (`#%E0`, `/widget/%E0/`) instead of throwing;
 *  - no file under `src/` calls `location.assign` / `location.replace` / `history.pushState` / `history.replaceState`
 *    / `decodeURI[Component]` or sets `location.href` itself: those go through `src/site/safe-url.ts`.
 *
 *   npx tsx scripts/site/urls.ts   → exit 1 on a failure (in `pnpm check`)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { localUrl, safeDecode } from '../../src/site/safe-url'
import { widgetRoute } from '../../src/site/routes'
import { checker } from '../lib/check'

const { assert, done } = checker('url')
const ORIGIN = 'https://matrix.reactopia.me', BASE = `${ORIGIN}/lock/?x=1`
const sameOrigin = (out: string, base = BASE) => { try { return new URL(out, base).origin === ORIGIN } catch { return false } }

const CASES: [target: string, want: string, base?: string][] = [
  ['//evil.example', '/evil.example'],
  ['//evil.example/x?y#z', '/evil.example/x?y#z'],
  ['/\\evil.example', '/evil.example'],
  ['\\\\evil.example/x', '/evil.example/x'],
  ['///evil.example', '/evil.example'],
  [' //evil.example', '/evil.example'],
  ['\t//evil.example', '/evil.example'],
  ['/\t/evil.example', '/evil.example'],
  ['/a/..//evil.example', '/evil.example'],
  ['/%2F%2Fevil.example', '/%2F%2Fevil.example'],
  ['https://evil.example/', '/'],
  ['https:evil.example', '/lock/evil.example'], // same scheme as the page: a relative path, by the URL spec
  ['http:evil.example', '/'],
  ['javascript:alert(1)', '/'],
  ['data:text/html,x', '/'],
  ['http://[bad', '/'],
  [`${ORIGIN}/mosaic/`, '/mosaic/'],
  ['/mosaic/', '/mosaic/'],
  ['?board=mosaic', '/lock/?board=mosaic'],
  ['#pipeline', '/lock/?x=1#pipeline'],
  ['', '/lock/?x=1'],
  // the palette's `location.pathname + query` on a page opened at //evil.example
  ['//evil.example?board=mosaic', '/evil.example?board=mosaic', `${ORIGIN}//evil.example`],
  ['?board=mosaic', '/evil.example?board=mosaic', `${ORIGIN}//evil.example`],
  ['#x', '/evil.example#x', `${ORIGIN}//evil.example`],
]
for (const [target, want, base = BASE] of CASES) {
  const out = localUrl(target, base)
  assert(`localUrl ${JSON.stringify(target)}${base === BASE ? '' : ` at ${base.slice(ORIGIN.length)}`}`, out === want && sameOrigin(out, base), `${out}; want ${want}`)
}

// every short prefix of these, followed by a host, stays on the site
const PARTS = ['/', '\\', '.', '..', ' ', '\t', '\n', '%2F', '%5C', ':', '@', 'https:']
let tried = 0, escaped: string[] = []
const walk = (prefix: string, depth: number) => {
  for (const tail of ['evil.example', 'evil.example/x']) {
    const out = localUrl(prefix + tail, BASE)
    tried++
    if (!sameOrigin(out) || !out.startsWith('/') || out.startsWith('//') || out.startsWith('/\\')) escaped.push(`${JSON.stringify(prefix + tail)} → ${out}`)
  }
  if (depth) for (const p of PARTS) walk(prefix + p, depth - 1)
}
walk('', 4)
assert(`localUrl fuzz: ${tried} targets stay on the origin`, !escaped.length, escaped.slice(0, 5).join('; '))
assert('localUrl: a bad base falls back to /', localUrl('/x', 'not a url') === '/')

for (const [s, want] of [['%E0', undefined], ['%zz', undefined], ['%', undefined], ['a%20b', 'a b'], ['pipeline', 'pipeline']] as const)
  assert(`safeDecode ${JSON.stringify(s)}`, safeDecode(s) === want, String(safeDecode(s)))
let route: unknown = 'threw'
try { route = widgetRoute('/widget/%E0/') } catch { /* stays 'threw' */ }
assert('widgetRoute /widget/%E0/: no route, no throw', route === undefined, String(route))
assert('widgetRoute /widget/timer/ still resolves', widgetRoute('/widget/timer/')?.key === 'timer')

// no raw navigation or decoding outside safe-url.ts
const RAW = /\b(location\.(assign|replace)|history\.(pushState|replaceState)|decodeURI(Component)?)\s*\(|\blocation\.href\s*=(?!=)/
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
})
for (const [line, hit] of [['location.assign(x)', true], ['window.history.replaceState(s, "", u)', true], ['decodeURIComponent(h)', true],
  ['location.href = u', true], ['if (location.href == u) {}', false], ['replaceUrl(u)', false], ['// see `safe-url.ts`', false]] as const)
  assert(`raw-call scan ${hit ? 'finds' : 'skips'} ${JSON.stringify(line)}`, RAW.test(line) === hit)
const raw: string[] = []
for (const f of files('src')) {
  const rel = relative('.', f).replace(/\\/g, '/')
  if (rel === 'src/site/safe-url.ts') continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (RAW.test(line)) raw.push(`${rel}:${i + 1}`) })
}
assert('no raw location.assign / replace, history.pushState / replaceState or decodeURIComponent in src/ (use src/site/safe-url.ts)', !raw.length, raw.join(', '))

done('URL handling holds')
