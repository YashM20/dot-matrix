/**
 * No-flash theme boot probe (docs/LAYOUT-THEME-PLAN.md §6) in headless Chrome over CDP (Node's built-in
 * WebSocket, no deps). Serves `dist/` itself (an in-process static server that lives only for the run) with the
 * production CSP header and page rewrites from `vercel.json`, then for each case (stored choice × OS scheme × URL ×
 * page: the app, the essay, /privacy and /terms, in light and dark) asserts:
 *  - when `<body>` is first inserted (before anything can paint) `<html>` already has the expected
 *    `data-scheme` / `data-accent`, and the `color-scheme` / `theme-color` metas already name that scheme;
 *  - once loaded, the theme CSS is applied (`<html>`'s `--bg` and `--red` are the theme's, from the generated table,
 *    and the page paints that `--bg`), `theme-color` is the theme's exact `--bg` (the legal pages, which run no
 *    bundle, keep the boot script's scheme bg), and on the first case the runtime `themeTokens()` (read from the
 *    CSS) equals `tokensOf()` (the generated table) for all 14 themes;
 *  - the CSP header was served and no `securitypolicyviolation` fired (the inline script's sha256 matched:
 *    a wrong hash blocks the script and leaves the attributes unset).
 * Needs a build: `npx vite build` (or `pnpm build`), then `npx tsx scripts/site/theme-boot.ts`. Chrome: $CHROME or the usual paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { THEME_TABLE } from '../../src/site/theme/table'
import { tokensOf } from '../../src/site/theme/tokens'
import { ACCENTS, SCHEMES, themeName } from '../../src/site/theme/names'
import { NEUTRALS } from '../../src/site/theme/accents'

const DIST = 'dist'
if (!existsSync(join(DIST, 'index.html'))) { console.log('no dist/index.html (run npx vite build first): skipped'); process.exit(0) }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
const CSP = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')!.value
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
// vercel.json's page rewrites (/privacy → /privacy.html, ...), the catch-all aside (the fallback below is index.html)
const vercelRewrites = (JSON.parse(readFileSync('vercel.json', 'utf8')) as { rewrites?: { source: string; destination: string }[] }).rewrites ?? []
const REWRITES = new Map(vercelRewrites.filter(r => !r.source.includes('(')).map(r => [r.source, r.destination]))
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  const path = normalize(decodeURIComponent(REWRITES.get(url) ?? url)).replace(/^([\\/])+/, '')
  let file = join(DIST, path)
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); server.close(); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-theme-boot-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 150 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>()
ws.addEventListener('message', e => { const m = JSON.parse(String(e.data)); if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) } })
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => (await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value

let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

/** Runs before any page script: seeds storage for this origin and records <html>'s attributes when <body> appears. */
const probe = (stored: string | null) => `(() => {
  if (location.origin !== ${JSON.stringify(base)}) return
  try { ${stored === null ? `localStorage.removeItem('dot480:theme')` : `localStorage.setItem('dot480:theme', ${JSON.stringify(stored)})`} } catch (e) {}
  window.__violations = []
  document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective + ' ' + (e.blockedURI || 'inline')))
  // <html> may not exist yet when this runs: observe the document itself
  const meta = n => document.querySelector('meta[name=' + n + ']')?.content
  new MutationObserver((_, o) => { const d = document.documentElement; if (document.body && !window.__atBody) { window.__atBody = { scheme: d.getAttribute('data-scheme'), accent: d.getAttribute('data-accent'), cs: meta('color-scheme'), tc: meta('theme-color') }; o.disconnect() } }).observe(document, { childList: true, subtree: true })
})()`

const cases: { page: string; stored: string | null; os: 'light' | 'dark'; want: [string, string] }[] = [
  { page: '/', stored: null, os: 'dark', want: ['dark', 'signal'] },
  { page: '/', stored: null, os: 'light', want: ['light', 'signal'] },
  { page: '/', stored: '{"scheme":"light","accent":"vite"}', os: 'dark', want: ['light', 'vite'] },
  { page: '/', stored: '{"scheme":"dark","accent":"cobalt"}', os: 'light', want: ['dark', 'cobalt'] },
  { page: '/', stored: '{"scheme":"system","accent":"amber"}', os: 'light', want: ['light', 'amber'] },
  { page: '/?theme=light_magenta', stored: '{"scheme":"dark","accent":"vite"}', os: 'dark', want: ['light', 'magenta'] },
  { page: '/light/', stored: '{"scheme":"light","accent":"vite"}', os: 'dark', want: ['light', 'vite'] },
  // the essay and the legal pages carry the same boot script and load themes.css (src/essay/essay.css)
  { page: '/essay.html', stored: null, os: 'light', want: ['light', 'signal'] },
  { page: '/essay.html', stored: '{"scheme":"dark","accent":"vite"}', os: 'light', want: ['dark', 'vite'] },
  { page: '/essay.html?theme=light_cobalt', stored: null, os: 'dark', want: ['light', 'cobalt'] },
  { page: '/privacy', stored: null, os: 'dark', want: ['dark', 'signal'] },
  { page: '/privacy', stored: '{"scheme":"light","accent":"amber"}', os: 'dark', want: ['light', 'amber'] },
  { page: '/terms', stored: '{"scheme":"system","accent":"magenta"}', os: 'light', want: ['light', 'magenta'] },
]
/** Pages without a bundle (the legal pages: only the boot script runs): theme-color stays the scheme's untinted bg. */
const STATIC = (page: string) => /^\/(privacy|terms)\b/.test(page)
const SCHEME_BG: Record<string, string> = { dark: NEUTRALS.dark.bg.toUpperCase(), light: NEUTRALS.light.bg.toUpperCase() }
try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable'); await cdp('Network.setCacheDisabled', { cacheDisabled: true })
  for (const c of cases) {
    await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: c.os }] })
    const { result } = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: probe(c.stored) })
    await cdp('Page.navigate', { url: base + c.page })
    for (let i = 0; i < 100 && !(await js('document.readyState === "complete" && !!window.__atBody')); i++) await sleep(100)
    const at = await js('window.__atBody') as { scheme: string; accent: string; cs?: string; tc?: string } | undefined, v = await js('window.__violations') as string[] | undefined
    const csp = await js(`fetch(location.href).then(r => r.headers.get('content-security-policy'))`) as string | null
    const label = `${c.page} · stored ${c.stored ?? 'nothing'} · OS ${c.os}`
    check(`${label}: <html> is ${c.want.join('_')} when <body> starts`, at?.scheme === c.want[0] && at?.accent === c.want[1], JSON.stringify(at))
    check(`${label}: color-scheme and theme-color metas name the scheme when <body> starts`, at?.cs === c.want[0] && !!at?.tc && (c.want[0] === 'light' ? at.tc !== '#070809' : at.tc === '#070809'), JSON.stringify(at))
    const roles = THEME_TABLE[`${c.want[0]}_${c.want[1]}` as keyof typeof THEME_TABLE]
    const tc = STATIC(c.page) ? SCHEME_BG[c.want[0]] : roles.bg
    for (let i = 0; i < 30 && !(await js(`document.querySelector('meta[name=theme-color]').content.toUpperCase() === ${JSON.stringify(tc)}`)); i++) await sleep(100)
    // the body's colours too: a page whose own CSS pins a colour would show the theme's --bg on <html> but not paint it
    const live = await js(`(() => { const s = getComputedStyle(document.documentElement), b = getComputedStyle(document.body), x = document.createElement('canvas').getContext('2d'), n = v => { x.fillStyle = '#000'; x.fillStyle = v; return x.fillStyle.toUpperCase() }
      return { bg: s.getPropertyValue('--bg').trim(), red: s.getPropertyValue('--red').trim(), cs: s.colorScheme, tc: document.querySelector('meta[name=theme-color]').content, paint: n(b.backgroundColor) === n(s.getPropertyValue('--bg').trim()) || n(s.backgroundColor) === n(s.getPropertyValue('--bg').trim()) } })()`) as { bg: string; red: string; cs: string; tc: string; paint: boolean }
    check(`${label}: the theme CSS applies (--bg ${roles.bg}, --red ${roles.red}, color-scheme ${c.want[0]}, the page paints --bg) and theme-color is ${STATIC(c.page) ? "the scheme's bg (no bundle)" : 'the exact --bg'}`, live?.bg.toUpperCase() === roles.bg && live?.red.toUpperCase() === roles.red && live?.cs === c.want[0] && live?.tc.toUpperCase() === tc && live.paint, JSON.stringify(live))
    if (c === cases[0]) {
      const KEYS = ['bg', 'surface', 'surfaceRaised', 'hairline', 'dotIdle', 'dotMid', 'dotFaint', 'value', 'dotActive', 'dotActiveDim'] as const
      const names = SCHEMES.flatMap(s => ACCENTS.map(a => [s, a] as const))
      // both sides through a canvas fillStyle (the browser's own colour serialization: Chrome hands custom properties
      // back normalised, e.g. rgba(249, 244, 238, 0.08) as #f9f4ee14)
      const expRaw = names.map(([s, a]) => { const t = tokensOf(s, a); return KEYS.map(k => String(t[k])) })
      const pair = await js(`(() => { const x = document.createElement('canvas').getContext('2d'), n = v => { x.fillStyle = '#000'; x.fillStyle = v; return x.fillStyle }
        return JSON.stringify([${JSON.stringify(names)}.map(([s, a]) => { const t = window.dot480.themeTokens(s, a); return ${JSON.stringify(KEYS)}.map(k => n(String(t[k]))) }), ${JSON.stringify(expRaw)}.map(r => r.map(n))]) })()`) as string | undefined
      const [g, e] = pair ? JSON.parse(pair) as [string[][], string[][]] : [undefined, []]
      const got = g && JSON.stringify(g), exp = JSON.stringify(e)
      const off = got ? names.filter((_, i) => JSON.stringify(JSON.parse(got)[i]) !== JSON.stringify(JSON.parse(exp)[i])).map(([s, a]) => themeName(s, a)) : ['(no window.dot480.themeTokens)']
      const first = got && off.length ? names.findIndex(([s, a]) => themeName(s, a) === off[0]) : -1
      const why = first >= 0 ? KEYS.map((k, j) => [k, JSON.parse(got!)[first][j], JSON.parse(exp)[first][j]]).filter(([, g, e]) => g !== e).map(([k, g, e]) => `${k} ${g} ≠ ${e}`).join('; ') : ''
      check('runtime themeTokens() (read from the theme CSS) ≡ tokensOf() (generated table) in all 14 themes', !off.length, `${off.join(', ')}${why ? ` (${off[0]}: ${why})` : ''}`)
    }
    check(`${label}: CSP served, no violation (inline boot allowed by its hash)`, !!csp?.includes("script-src 'self' 'sha256-") && Array.isArray(v) && v.length === 0, (v ?? []).join(', '))
    await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: result.identifier })
  }
} finally {
  ws.close(); proc.kill(); server.close()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
}
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
