/**
 * Security headers check (issue #141, docs/DEPLOY.md "Headers"). Reads `vercel.json` and checks, with no server:
 *  - every path a visitor can reach (the app, a board, a widget page, the blog, the legal pages, the Lab, a deep
 *    `/lab/motion-lab/x`, every HTML file in the repo and in a fresh `dist/`) gets the CSP and the hardening headers
 *    from the header blocks whose `source` matches it. No header block excludes paths with a negative lookahead;
 *  - the CSP: `frame-ancestors 'self'`, no inline or eval scripts, no WebSocket or localhost sources in `connect-src`;
 *    `'unsafe-eval'` and `'wasm-unsafe-eval'` appear nowhere in vercel.json or a page's meta CSP (#158);
 *    exactly one block sets it (the theme probes serve that one);
 *  - Trusted Types (#149, report-only for now): `require-trusted-types-for 'script'`, `trusted-types` naming exactly the policies src/
 *    creates, and those policies (src/lib/trusted.ts) pass the SVG renderer's output and same-origin script URLs only;
 *  - Permissions-Policy turns off the features the site doesn't use;
 *  - every inline script in the HTML pages has its sha256 in `script-src` (the boot script's hash still matches), and
 *    every hash in `script-src` belongs to one of them (no stale grant).
 *
 *   npx tsx scripts/site/headers.ts   → exit 1 on a failure (in `pnpm check`, and again in CI after the build)
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checker } from '../lib/check'
import { sourceRegex } from '../lib/vercel-source'

interface Block { source: string; headers: { key: string; value: string }[] }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: Block[] }
const { assert, done } = checker('header')


// the matcher itself, on the shapes vercel.json uses (and the old exclusion, which must miss the deep path)
const m = (s: string, p: string) => sourceRegex(s).test(p)
assert('headers: the source matcher reads path-to-regexp like Vercel', m('/(.*)', '/') && m('/(.*)', '/lab/motion-lab/x') && m('/assets/(.*)', '/assets/a.js') && !m('/assets/(.*)', '/og/a.png')
  && m('/blog/:path*', '/blog') && m('/blog/:path*', '/blog/a/b') && !m('/blog/:path*', '/blogx') && m('/privacy', '/privacy/')
  && !m('/((?!lab/motion-lab).*)', '/lab/motion-lab/x') && m('/((?!lab/motion-lab).*)', '/light/'))

const walk = (d: string): string[] => !existsSync(d) ? [] : readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const html = (d: string) => walk(d).filter(f => f.endsWith('.html'))
const rootPages = readdirSync('.').filter(f => f.endsWith('.html'))
const sourcePages = [...rootPages, ...html('public')]
// a dist/ older than its sources is a leftover build (`pnpm check` runs before `vite build`): skip it, say so
const newest = Math.max(...rootPages.map(f => statSync(f).mtimeMs), statSync('src/site/theme/boot.ts').mtimeMs)
const distFresh = existsSync('dist/index.html') && statSync('dist/index.html').mtimeMs >= newest
if (existsSync('dist/index.html') && !distFresh) console.log('  headers: dist/ is older than the source pages (a stale build): its pages not checked; run `vite build` first')
const distPages = distFresh ? html('dist') : []

const urlOf = (f: string) => '/' + relative(f.startsWith('dist') ? 'dist' : f.startsWith('public') ? 'public' : '.', f).replace(/\\/g, '/')
const PATHS = [...new Set([
  '/', '/index.html', '/light/', '/light', '/lock/', '/components/', '/widget/clock/', '/?make=compose', '/about',
  '/blog', '/blog/', '/blog/dot-matrix-essay/', '/essay', '/privacy', '/privacy/', '/terms', '/lab', '/lab/',
  '/lab/motion-lab.html', '/lab/motion-lab', '/lab/motion-lab/', '/lab/motion-lab/x', '/lab/motion-labx/y', '/no/such/page', '/r/matrix-core.json',
  ...[...sourcePages, ...distPages].map(urlOf),
])]

assert('headers: no header source excludes paths with a negative lookahead (an exclusion drops headers for every path it matches)', !vercel.headers.some(b => b.source.includes('(?!')), vercel.headers.filter(b => b.source.includes('(?!')).map(b => b.source).join(', '))
const cspBlocks = vercel.headers.filter(b => b.headers.some(h => h.key.toLowerCase() === 'content-security-policy'))
assert('headers: exactly one header block sets the CSP (theme-boot.ts and theme-picker.ts serve it)', cspBlocks.length === 1, cspBlocks.map(b => b.source).join(', '))

/** The headers a path gets, per key: the values of every block whose source matches it (a key set twice fails below). */
const headersFor = (path: string) => {
  const out = new Map<string, string[]>()
  for (const b of vercel.headers) if (sourceRegex(b.source).test(path.split('?')[0])) for (const h of b.headers) out.set(h.key.toLowerCase(), [...(out.get(h.key.toLowerCase()) ?? []), h.value])
  return out
}
const REQUIRED: [string, (v: string) => boolean][] = [
  ['content-security-policy', v => v.includes("default-src 'self'")],
  ['x-frame-options', v => v === 'SAMEORIGIN'],
  ['cross-origin-opener-policy', v => v === 'same-origin'],
  ['strict-transport-security', v => Number(/max-age=(\d+)/.exec(v)?.[1]) >= 31536000 && /includeSubDomains/i.test(v)],
  ['x-content-type-options', v => v === 'nosniff'],
  ['referrer-policy', v => v === 'strict-origin-when-cross-origin'],
  ['permissions-policy', v => v.length > 0],
]
const gaps = PATHS.flatMap(p => { const h = headersFor(p); return REQUIRED.filter(([k, ok]) => h.get(k)?.length !== 1 || !ok(h.get(k)![0])).map(([k]) => `${p}: ${k}`) })
assert(`headers: all ${PATHS.length} paths (pages, boards, a widget, blog, legal, Lab, /lab/motion-lab/x, every HTML file) get the CSP, X-Frame-Options, COOP, HSTS, nosniff, Referrer-Policy and Permissions-Policy once each`, !gaps.length, gaps.slice(0, 8).join('; '))

// the shadcn registry (docs/REGISTRY.md): JSON the CLI fetches, cached for an hour, kept out of search results
const reg = headersFor('/r/matrix-core.json')
assert('headers: /r/*.json (the shadcn registry) gets a short Cache-Control and X-Robots-Tag noindex', /max-age=\d+/.test(reg.get('cache-control')?.join() ?? '') && !/immutable/.test(reg.get('cache-control')?.join() ?? '') && reg.get('x-robots-tag')?.join() === 'noindex', JSON.stringify([...reg.entries()].filter(([k]) => k === 'cache-control' || k === 'x-robots-tag')))

// the CSP's directives
const csp = cspBlocks[0]?.headers.find(h => h.key.toLowerCase() === 'content-security-policy')?.value ?? ''
const dir = new Map(csp.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(([k, ...v]) => [k, v] as [string, string[]]))
const script = dir.get('script-src') ?? [], connect = dir.get('connect-src') ?? []
assert("headers: CSP frame-ancestors is 'self' (no framing by other sites)", JSON.stringify(dir.get('frame-ancestors')) === `["'self'"]`, String(dir.get('frame-ancestors')))
assert("headers: CSP script-src is 'self' plus hashes (no inline, eval, blob:, data: or wildcard)", script[0] === "'self'" && script.slice(1).every(s => /^'sha256-[A-Za-z0-9+/=]+'$/.test(s)), script.join(' '))
assert("headers: CSP connect-src has no WebSocket or localhost source (only 'self' and https hosts)", connect.every(s => s === "'self'" || /^https:\/\/[a-z0-9.-]+$/.test(s)) && !connect.some(s => /localhost|127\.0\.0\.1/.test(s)), connect.join(' '))
assert("headers: CSP object-src 'none', base-uri 'self', form-action 'self'", dir.get('object-src')?.join(' ') === "'none'" && dir.get('base-uri')?.join(' ') === "'self'" && dir.get('form-action')?.join(' ') === "'self'")

// Trusted Types (#149): every sink takes only a policy's output, and a policy header names exactly the policies src/
// makes. They ship report-only first (Content-Security-Policy-Report-Only); moving them into the enforced CSP passes too
const ro = cspBlocks[0]?.headers.find(h => h.key.toLowerCase() === 'content-security-policy-report-only')?.value ?? ''
const ttDir = new Map([...dir, ...ro.split(';').map(d => d.trim().split(/\s+/)).filter(d => d[0]).map(([k, ...v]) => [k, v] as [string, string[]])])
const made = walk('src').filter(f => /\.tsx?$/.test(f)).flatMap(f => [...readFileSync(f, 'utf8').matchAll(/createPolicy\(\s*'([^']+)'/g)].map(m => m[1])).sort()
assert(`headers: require-trusted-types-for 'script' (${dir.has('require-trusted-types-for') ? 'enforced' : 'report-only'}), and trusted-types names exactly the policies src/ creates (src/lib/trusted.ts), no 'allow-duplicates'`,
  ttDir.get('require-trusted-types-for')?.join(' ') === "'script'" && JSON.stringify([...(ttDir.get('trusted-types') ?? [])].sort()) === JSON.stringify(made) && made.length > 0, `${ttDir.get('trusted-types')?.join(' ')} vs ${made.join(' ')}`)
const { checkSvg, sameOriginScript } = await import('../../src/lib/trusted')
const { renderSVG } = await import('../../src/engine/renderer/svgRenderer')
const dot = (shape: string, extra = {}) => ({ x: 4, y: 4, r: 1.5, shape, color: '#FF3B30', opacity: .5, ...extra })
const svgs = [renderSVG([dot('circle'), dot('square'), dot('squircle', { roundness: .6 })] as never, 16, 8), renderSVG([], 4, 4)]
assert('headers: the dot480-svg policy passes the SVG renderer\'s output as it is', svgs.every(s => checkSvg(s) === s))
const svg0 = svgs[0], warn = console.warn
console.warn = () => {}
const badSvg = ['<img src=x onerror=alert(1)>', svg0.replace('<defs>', '<defs><script>alert(1)</script>'), svg0.replace('<defs>', '<foreignObject><div/></foreignObject><defs>'), svg0.replace('<g ', '<g onload="alert(1)" '),
  svg0.replace(/href="#[^"]+"/, 'href="javascript:alert(1)"'), svg0.replace(/href="#[^"]+"/, 'href="https://x.example/a.svg#b"'), svg0.replace('<defs>', '<!-- x --><defs>'), '<p>' + svg0]
const passedSvg = badSvg.filter(s => checkSvg(s) !== '')
console.warn = warn
assert(`headers: the dot480-svg policy refuses anything else (${badSvg.length} cases: other elements, handlers, script, foreignObject, outside links, comments)`, !passedSvg.length, passedSvg.map(s => s.slice(0, 50)).join(' | '))
const urlOk = (u: string) => { try { sameOriginScript(u); return true } catch { return false } }
assert('headers: the default policy refuses script URLs from other origins and schemes (no window here, so every absolute URL is foreign)', ['https://x.example/a.js', 'data:text/javascript,1', 'javascript:1', 'blob:https://x.example/1'].every(u => !urlOk(u)))

// CSP drift (#158): no policy may let a page build code from strings, so `new Function` stays off in production and
// Field IR runs on its closure tree. Checked over the whole of vercel.json (any header, any directive) and every
// page's meta CSP, case-insensitive, quoted or not.
const evalGrants = (text: string): string[] => [...new Set((text.match(/(?:wasm-)?unsafe-eval/gi) ?? []).map(s => s.toLowerCase()))]
assert("headers: the eval guard catches 'unsafe-eval' and 'wasm-unsafe-eval' (test policies with each, in any directive)",
  evalGrants("script-src 'self' 'unsafe-eval'").join() === 'unsafe-eval' && evalGrants("default-src 'self'; worker-src 'self' 'WASM-UNSAFE-EVAL'").join() === 'wasm-unsafe-eval'
  && evalGrants("default-src 'self' 'unsafe-inline'").length === 0)
const metaCSP = (f: string) => [...readFileSync(f, 'utf8').matchAll(/<meta\b[^>]*http-equiv\s*=\s*["']?content-security-policy[^>]*>/gi)].map(m => m[0]).join('\n')
const evalIn = ([['vercel.json', evalGrants(readFileSync('vercel.json', 'utf8'))], ...[...sourcePages, ...distPages].map(f => [f, evalGrants(metaCSP(f))])] as [string, string[]][]).filter(([, g]) => g.length)
assert("headers: no 'unsafe-eval' or 'wasm-unsafe-eval' anywhere in vercel.json or a page's meta CSP", !evalIn.length, evalIn.map(([f, g]) => `${f}: ${g}`).join('; '))

// Permissions-Policy: unused features off, the ones the site uses kept for itself
const pp = new Map((headersFor('/').get('permissions-policy')?.[0] ?? '').split(',').map(s => s.trim().split('=') as [string, string]))
const OFF = ['geolocation', 'usb', 'serial', 'hid', 'display-capture', 'payment', 'bluetooth'], SELF = ['camera', 'microphone', 'accelerometer', 'gyroscope']
assert(`headers: Permissions-Policy turns off ${OFF.join(', ')} and keeps ${SELF.join(', ')} for self`, OFF.every(f => pp.get(f) === '()') && SELF.every(f => pp.get(f) === '(self)'), [...pp].map(([k, v]) => `${k}=${v}`).join(', '))

// inline scripts ↔ script-src hashes
const JS_TYPES = ['', 'text/javascript', 'application/javascript', 'module']
const inline = (f: string) => [...readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(([, attrs]) => !/\bsrc\s*=/i.test(attrs) && JS_TYPES.includes((/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1] ?? '').toLowerCase()))
  // the browser hashes the text after the HTML parser's newline normalisation (a CRLF checkout would differ)
  .map(([, , body]) => `'sha256-${createHash('sha256').update(body.replace(/\r\n?/g, '\n'), 'utf8').digest('base64')}'`)
const hashes = new Set(script.slice(1))
const unhashed = [...sourcePages, ...distPages].filter(f => inline(f).some(h => !hashes.has(h)))
assert(`headers: every inline script in the ${sourcePages.length} source pages${distPages.length ? ` and ${distPages.length} built pages` : ''} has its sha256 in script-src (the boot script's hash still matches)`, !unhashed.length, unhashed.join(', '))
const used = new Set(sourcePages.flatMap(inline)), stale = [...hashes].filter(h => !used.has(h))
assert('headers: every sha256 in script-src belongs to an inline script in a source page (no stale grant)', !stale.length, stale.join(' '))

done('all header checks passed')
