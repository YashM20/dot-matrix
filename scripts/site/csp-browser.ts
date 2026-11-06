/**
 * The production CSP in a real browser, as a visitor gets it (#149). Serves `dist/` in-process with the CSP header
 * and page rewrites from `vercel.json`, opens Chrome WITHOUT the probe flag (`launch(..., { testHooks: false })`, so
 * src/lib/testHooks.ts is off as on a normal visit), and walks the app, boards (workers, Field IR, GPU, live data),
 * a widget page, the editor, the blog and an essay with SVG figures, the Lab and the legal pages, plus every board and
 * the about view. Checks:
 *  - no `securitypolicyviolation` on any page, Trusted Types included. Field IR never tries `new Function` in a
 *    browser (#198), so an eval refusal is a failure like any other;
 *  - Trusted Types catch (refuse when enforced, report while report-only) a plain string into `innerHTML` and a foreign
 *    worker URL, and a
 *    same-origin blob worker (the audio clock's) is allowed;
 *  - the sample worker started through the `default` policy, and the essay's SVG figures drew through `dot480-svg`;
 *  - no test-only global (`dot480Live`, `__hive`, `__editorShared`, `__editorLink`, …) exists after any page, and the
 *    public `window.dot480` (setTheme, themeTokens) does.
 *
 *   npx vite build && npx tsx scripts/site/csp-browser.ts   → exit 1 on a failure. Chrome: $CHROME or the usual paths.
 *   ... csp-browser.ts --strict-style   → the same walk with `'unsafe-inline'` dropped from style-src: lists what
 *                                          that would block (a finding for #149, never a failure)
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { customCss } from '../../src/site/theme/accents'
import { boardIds } from '../../src/widgets/manifest'
import { launch, sleep } from '../lib/cdp'

const DIST = 'dist'
if (!existsSync(join(DIST, 'index.html'))) { console.log('no dist/index.html (run npx vite build first): skipped'); process.exit(0) }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[]; rewrites?: { source: string; destination: string }[] }
const STRICT_STYLE = process.argv.includes('--strict-style')
const CSP0 = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')!.value
const CSP = STRICT_STYLE ? CSP0.replace(/(style-src[^;]*?) 'unsafe-inline'/, '$1') : CSP0
/** Trusted Types ship report-only first (#149); the walk checks the same either way. */
const CSP_RO = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy-Report-Only')?.value
const ENFORCED = CSP.includes('require-trusted-types-for')
const REWRITES = new Map((vercel.rewrites ?? []).filter(r => !r.source.includes('(')).map(r => [r.source, r.destination]))
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.wasm': 'application/wasm' }
const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0]
  let file = join(DIST, normalize(decodeURIComponent(REWRITES.get(url) ?? url)).replace(/^([\\/])+/, ''))
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(DIST, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': CSP, ...(CSP_RO ? { 'Content-Security-Policy-Report-Only': CSP_RO } : {}), 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`

let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

const PAGES = ['/', '/about', ...boardIds.map(b => `/${b}/`), '/widget/clock/', '/?make=compose',
  '/blog/', '/blog/dot-matrix-essay/', '/lab/', '/lab/motion-lab.html', '/privacy', '/terms']
/** Test-only globals a visitor must never get (src/lib/testHooks.ts and the boards' `?probe=1` hooks). */
const TEST_GLOBALS = ['dot480Live', 'dot480Audio', '__hive', '__editor', '__editorShared', '__editorLink', '__editorClip', '__editorDevices', '__skinPerf', '__dotLatency', '__dotTestCamera', '__dotHandLog',
  '__pond', '__pondBoard', '__workshop', '__kintsugi', '__plate', '__frost', '__mud', '__stone']
// before any page script: record violations, and every worker the page starts (the real constructor still runs, so
// Trusted Types still checks its URL)
const RECORD = `(() => {
  if (location.origin !== ${JSON.stringify(base)}) return
  window.__violations = []; window.__workers = []
  ${STRICT_STYLE ? `try { localStorage.setItem('dot480:theme', ${JSON.stringify(JSON.stringify({ scheme: 'dark', accent: 'custom', hue: 212, css: customCss(212) }))}) } catch (e) {}` : ''}
  document.addEventListener('securitypolicyviolation', e => window.__violations.push([e.violatedDirective, e.blockedURI || 'inline', (e.sample || '').slice(0, 40)].join(' ')))
  const W = window.Worker
  window.Worker = function (u, o) { const w = new W(u, o); window.__workers.push(String(u)); return w }
  window.Worker.prototype = W.prototype
})()`

const p = await launch(1280, 900, { testHooks: false })
const styleSeen = new Set<string>()
let sampleWorker = false
try {
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: RECORD })
  for (const page of PAGES) {
    p.logs.length = 0
    await p.cdp('Page.navigate', { url: base + page })
    await p.waitFor('document.readyState === "complete" && !!window.__violations', 20000)
    // scroll through the page (lazy figures and cards mount on screen), then let it run
    await p.js(`(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 600) { scrollTo(0, y); await new Promise(r => setTimeout(r, 120)) } scrollTo(0, 0) })()`, 30000)
    await sleep(1500)
    const got = await p.js<{ v: string[]; w: string[]; globals: string[]; api: boolean; svg: number }>(`({ v: window.__violations, w: window.__workers,
      globals: ${JSON.stringify(TEST_GLOBALS)}.filter(k => k in window), api: typeof window.dot480?.setTheme === 'function' && typeof window.dot480?.themeTokens === 'function',
      svg: [...document.querySelectorAll('.dot-svg svg')].filter(s => s.querySelector('use')).length })`)
    const styled = (v: string) => STRICT_STYLE && /^style-src/.test(v)
    for (const v of got.v.filter(styled)) styleSeen.add(`${page}: ${v}`)
    const bad = got.v.filter(v => !styled(v)), tt = p.logs.filter(l => /trusted ?types|TrustedHTML|TrustedScript/i.test(l))
    if (got.w.some(u => /sampleWorker/.test(u))) sampleWorker = true
    const legal = /^\/(privacy|terms)$|motion-lab/.test(page)
    check(`${page}: no CSP or Trusted Types violation, no Trusted Types error`, !bad.length && !tt.length, [...bad, ...tt].slice(0, 3).join(' | '))
    check(`${page}: no test-only global on a normal visit${legal ? '' : '; window.dot480 is there'}`, !got.globals.length && (legal || got.api), got.globals.join(', '))
    if (page === '/blog/dot-matrix-essay/') check(`${page}: the essay's SVG figures drew through the dot480-svg policy (${got.svg})`, got.svg > 0)
  }
  check(`the sample worker started through the default policy (${sampleWorker ? 'yes' : 'no'})`, sampleWorker)
  // enforcement itself, on the app: a plain string is refused at the HTML and script-URL sinks; our own blob is fine
  await p.cdp('Page.navigate', { url: base + '/' })
  await p.waitFor('document.readyState === "complete"', 20000)
  // each sink: 'refused' (threw), 'reported' (ran, but a Trusted Types violation fired: the report-only header) or 'allowed'
  const tt = await p.js<{ on: boolean; html: string; foreign: string; blob: string }>(`(async () => {
    const tt = () => window.__violations.filter(v => v.startsWith('require-trusted-types-for') || v.startsWith('trusted-types')).length
    const t = async f => { const n = tt(); let r = 'allowed'; try { f() } catch (e) { r = 'refused' } await new Promise(r => setTimeout(r, 100)); return r === 'allowed' && tt() > n ? 'reported' : r }
    return { on: typeof trustedTypes !== 'undefined', html: await t(() => { document.createElement('div').innerHTML = '<b>x</b>' }),
      foreign: await t(() => new Worker('https://x.example/a.js')),
      blob: await t(() => new Worker(URL.createObjectURL(new Blob(['close()'], { type: 'text/javascript' })))) } })()`)
  const caught = (r: string) => r === (ENFORCED ? 'refused' : 'reported') || r === 'refused'
  check(`Trusted Types ${ENFORCED ? 'enforced' : 'report-only'}: innerHTML with a plain string and a foreign worker URL are ${ENFORCED ? 'refused' : 'reported'}, a same-origin blob worker is allowed with no report`, tt.on && caught(tt.html) && caught(tt.foreign) && tt.blob === 'allowed', JSON.stringify(tt))
} finally {
  await p.close(); server.close()
}
if (STRICT_STYLE) console.log(`  style-src without 'unsafe-inline' would block ${styleSeen.size} thing(s):${[...styleSeen].map(s => `
    ${s}`).join('')}`)
console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
