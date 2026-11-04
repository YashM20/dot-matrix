/**
 * Analytics browser probe (#151), headless Chrome over CDP (scripts/lib/cdp.ts). Builds the site with a fake project
 * token into `.snapshots/analytics-dist/` (no postbuild), serves it with the production CSP and a mocked `/ingest`
 * that records every request and answers it, so nothing ever reaches PostHog. Checks:
 *  - desktop, fresh profile: the banner shows once the page is idle, with two equal buttons and neither focused;
 *    nothing is requested from `/ingest`, the posthog chunk isn't fetched and nothing is stored; no CSP violation;
 *  - Allow (by keyboard): a page view for `/`, then one for an in-app navigation (⌘K, "levels"), URLs without
 *    payloads; `palette_command` and `board_changed` events; a reload shows no banner;
 *  - GPC, then DNT, in fresh profiles: no banner, no request, no chunk;
 *  - phone: No thanks, then TOOLS shows ANALYTICS off; tapping it turns it on (a page view arrives), tapping again
 *    turns it off (PostHog's keys are deleted, a navigation sends nothing);
 *  - every request the pages make stays on this origin.
 * Screenshots (the banner on desktop and phone, the TOOLS tile) go to `.snapshots/analytics/`.
 *
 *   npx tsx scripts/site/analytics-browser.ts [--no-build]   (Chrome: $CHROME or the usual paths)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { findChrome, launch, sleep, type Page } from '../lib/cdp'
import { checker } from '../lib/check'

const DIR = '.snapshots/analytics-dist', SHOTS = '.snapshots/analytics', PORT = Number(process.env.PORT) || 4386
if (!findChrome()) { console.log('no Chrome found: skipped'); process.exit(0) }
if (!process.argv.includes('--no-build') || !existsSync(join(DIR, 'index.html'))) {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', DIR, '--emptyOutDir', '--logLevel', 'warn'], { stdio: 'inherit', env: { ...process.env, VITE_POSTHOG_PROJECT_TOKEN: 'phc_probe_not_a_real_token', SITE_POSTBUILD: '0' } })
}
mkdirSync(SHOTS, { recursive: true })
const { assert, done } = checker('analytics browser')

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { headers: { key: string; value: string }[] }[] }
const CSP = vercel.headers.flatMap(h => h.headers).find(h => h.key === 'Content-Security-Policy')!.value
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' }
const PAGES: Record<string, string> = { '/blog': 'blog.html', '/lab': 'lab/index.html', '/privacy': 'privacy.html', '/terms': 'terms.html' }
interface Hit { path: string; events: { event: string; properties: Record<string, unknown> }[] }
let hits: Hit[] = []
const server = createServer((req, res) => {
  const url = req.url ?? '/', path = url.split('?')[0]
  if (path.startsWith('/ingest')) {
    const chunks: Buffer[] = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      let body = Buffer.concat(chunks)
      if (body[0] === 0x1f && body[1] === 0x8b) body = gunzipSync(body)
      let text = body.toString()
      if (text.startsWith('data=')) text = Buffer.from(decodeURIComponent(text.slice(5)), 'base64').toString()
      let events: Hit['events'] = []
      try { const j = JSON.parse(text); events = Array.isArray(j) ? j : j.batch ?? [j] } catch { /* not JSON */ }
      hits.push({ path: url, events })
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":1}')
    })
    return
  }
  const page = Object.entries(PAGES).find(([p]) => path === p || path === p + '/')?.[1]
  let file = join(DIR, normalize(decodeURIComponent(page ?? path)).replace(/^([\\/])+/, ''))
  if (!existsSync(file) || statSync(file).isDirectory()) file = existsSync(join(file, 'index.html')) ? join(file, 'index.html') : join(DIR, 'index.html')
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': CSP, 'Cache-Control': 'no-store' })
  res.end(readFileSync(file))
})
await new Promise<void>(r => server.listen(PORT, r))
const BASE = `http://localhost:${PORT}`

const pageviews = () => hits.flatMap(h => h.events).filter(e => e.event === '$pageview').map(e => String(e.properties.$current_url).replace(BASE, ''))
const eventNames = () => hits.flatMap(h => h.events).map(e => e.event)
/** A fresh Chrome profile; `requested()` lists every URL its pages fetched (resource timing, read before each navigation). */
async function open(w: number, h: number, opts: { phone?: boolean; init?: string } = {}) {
  const p = await launch(w, h), urls: string[] = []
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'performance.setResourceTimingBufferSize(5000)' })
  // PostHog drops events from bots, headless Chrome included (its user agent, client hints and navigator.webdriver):
  // the probe passes as a desktop or phone Chrome
  await p.cdp('Emulation.setUserAgentOverride', { userAgent: opts.phone ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' })
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); Object.defineProperty(Navigator.prototype, "userAgentData", { get: () => undefined })' })
  if (opts.phone) {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: true })
    await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  }
  if (opts.init) await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: opts.init })
  // the requests: polled from the page's resource timing (the probe's CDP helper keeps events to itself)
  const requested = async () => { urls.push(...await p.js<string[]>('performance.getEntriesByType("resource").map(e => e.name)').catch(() => [])); return [...new Set(urls)] }
  return { p, requested }
}
const go = async (p: Page, path: string) => { await p.cdp('Page.navigate', { url: BASE + path }); await p.waitFor('document.readyState === "complete"', 15000) }
const banner = (p: Page) => p.js<{ shown: boolean; eq: boolean; focused: boolean; texts: string[] }>(`(() => {
  const b = document.querySelector('.consent'), bs = [...document.querySelectorAll('.consent-actions button')]
  const r = bs.map(x => x.getBoundingClientRect())
  return { shown: !!b && b.getBoundingClientRect().height > 0, eq: r.length === 2 && Math.abs(r[0].width - r[1].width) < 1 && Math.abs(r[0].height - r[1].height) < 1 && getComputedStyle(bs[0]).backgroundColor === getComputedStyle(bs[1]).backgroundColor, focused: bs.includes(document.activeElement), texts: bs.map(x => x.textContent) }
})()`)
const phKeys = (p: Page) => p.js<string[]>('[...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(k => /^(_{0,2}ph_|posthog)/i.test(k))')
const stored = (p: Page) => p.js<string | null>('localStorage.getItem("dot480:analytics")')
const chunkFetched = (urls: string[]) => urls.some(u => /\/assets\/posthog-/.test(u))
const offOrigin = (urls: string[]) => urls.filter(u => !u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:'))
const csp = (p: Page) => p.logs.filter(l => /Content Security Policy|Refused to/i.test(l))
const settle = async (n: number) => { const end = Date.now() + 8000; while (Date.now() < end && pageviews().length < n) await sleep(150) }
/** Enter as a keyboard press that activates a focused button (CDP needs the key's text for that). */
const enter = async (p: Page) => { for (const type of ['keyDown', 'keyUp']) await p.cdp('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' && { text: '\r' }) }); await sleep(150) }
const tapEl = async (p: Page, sel: string) => { const r = await p.js<{ x: number; y: number } | null>(`(() => { const e = [...document.querySelectorAll(${JSON.stringify(sel.split('|')[0])})].find(e => e.textContent.includes(${JSON.stringify(sel.split('|')[1] ?? '')})); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`); if (r) await p.tap(r.x, r.y); return !!r }

try {
  // ── desktop: the banner, then Allow ──
  {
    hits = []
    const { p, requested } = await open(1280, 800)
    await go(p, '/')
    const up = await p.waitFor('!!document.querySelector(".consent")', 12000)
    await sleep(600)
    const b = await banner(p)
    await p.shot(join(SHOTS, 'banner-desktop.png'))
    let urls = await requested()
    assert('analytics browser: desktop: the banner shows once idle, two equal buttons (ALLOW, NO THANKS), neither focused', up && b.shown && b.eq && !b.focused && b.texts.join() === 'ALLOW,NO THANKS', JSON.stringify(b))
    assert('analytics browser: before Allow nothing is requested from /ingest, the posthog chunk is not fetched, nothing is stored', !hits.length && !chunkFetched(urls) && !(await phKeys(p)).length && (await stored(p)) === null, `${hits.length} hits, chunk ${chunkFetched(urls)}, keys ${await phKeys(p)}`)
    // Allow, by keyboard
    // Allow is the first button: Tab order and focus() agree
    await p.js('document.querySelector(".consent-actions button").focus(), 1')
    await enter(p)
    await settle(1)
    assert('analytics browser: Allow (Enter) closes the banner, loads the chunk and sends a page view for /', !(await banner(p)).shown && chunkFetched(await requested()) && pageviews()[0] === '/' && (await stored(p)) === 'on', `stored ${await stored(p)}, banner ${(await banner(p)).shown}, chunk ${chunkFetched(await requested())}, hits ${hits.map(h => h.path).join(' ')}, views ${pageviews().join(' ')}`)
    // an in-app navigation through the palette
    await p.key('k', 'KeyK', 75, 2)
    await p.waitFor('!!document.querySelector(".pal-backdrop input")', 8000)
    await p.cdp('Input.insertText', { text: 'levels' }); await sleep(400)
    await p.key('Enter', 'Enter', 13)
    await p.waitFor('location.pathname.startsWith("/levels")', 8000)
    await settle(2); await sleep(3500)
    const pv = pageviews()
    assert('analytics browser: one page view per navigation (/, then /levels/), no query payloads', pv.length === 2 && pv[1].startsWith('/levels') && pv.every(u => !/[?&](p|d|flags)=|#/.test(u)), pv.join(' '))
    assert('analytics browser: palette_command and board_changed events arrive', eventNames().includes('palette_command') && eventNames().includes('board_changed'), [...new Set(eventNames())].join(' '))
    urls = await requested()
    assert('analytics browser: every request stays on this origin (the proxy), and the CSP blocked nothing', !offOrigin(urls).length && !csp(p).length, [...offOrigin(urls), ...csp(p)].slice(0, 4).join(' · '))
    await go(p, '/'); await sleep(2500)
    assert('analytics browser: after a choice a reload shows no banner', !(await banner(p)).shown)
    await p.close()
  }

  // ── GPC, DNT: off, no banner ──
  for (const [name, init] of [['GPC', 'Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true })'], ['DNT', 'Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" })']]) {
    hits = []
    const { p, requested } = await open(1280, 800, { init })
    await go(p, '/'); await sleep(4500)
    const urls = await requested()
    assert(`analytics browser: ${name}: no banner, no /ingest request, no chunk, nothing stored`, !(await banner(p)).shown && !hits.length && !chunkFetched(urls) && !(await phKeys(p)).length && (await stored(p)) === null, `${hits.length} hits`)
    await p.close()
  }

  // ── phone: No thanks, then the TOOLS switch ──
  {
    hits = []
    const { p, requested } = await open(390, 844, { phone: true })
    await go(p, '/')
    await p.waitFor('!!document.querySelector(".consent")', 12000); await sleep(600)
    await p.shot(join(SHOTS, 'banner-phone.png'))
    const covered = await p.js<boolean>('(() => { const b = document.querySelector(".consent").getBoundingClientRect(), t = document.querySelector(".tabbar")?.getBoundingClientRect(); return !!t && b.bottom <= t.top })()')
    assert('analytics browser: phone: the banner sits above the tab bar', covered)
    await tapEl(p, '.consent-actions button|NO THANKS'); await sleep(500)
    assert('analytics browser: No thanks: the banner goes, the choice is off, nothing sent or loaded', !(await banner(p)).shown && (await stored(p)) === 'off' && !hits.length && !chunkFetched(await requested()))
    await tapEl(p, '.tabbar button|TOOLS')
    await p.waitFor('!!document.querySelector(".tool-analytics")', 8000)
    await p.js('document.querySelector(".tool-analytics").scrollIntoView({ block: "center" }), 1'); await sleep(400)
    await p.shot(join(SHOTS, 'tools-analytics.png'))
    const off = await p.js<string>('document.querySelector(".tool-analytics").getAttribute("aria-pressed")')
    await tapEl(p, '.tool-analytics|ANALYTICS')
    await settle(1)
    assert('analytics browser: TOOLS › ANALYTICS shows off, a tap turns it on and a page view arrives', off === 'false' && (await stored(p)) === 'on' && pageviews().length === 1, `pressed ${off}, stored ${await stored(p)}, hits ${hits.length}, views ${pageviews()}`)
    await sleep(3500)
    const reopened = await tapEl(p, '.tabbar button|TOOLS') && await p.waitFor('!!document.querySelector(".tool-analytics")', 8000)
    const pressed = await p.js<string>('document.querySelector(".tool-analytics")?.getAttribute("aria-pressed")')
    await tapEl(p, '.tool-analytics|ANALYTICS'); await sleep(800)
    const n = hits.length
    await p.js('history.pushState(null, "", "/lock/"), dispatchEvent(new PopStateEvent("popstate")), 1'); await sleep(4000)
    assert('analytics browser: tapping it again turns it off: PostHog\'s keys are deleted and a navigation sends nothing', (await stored(p)) === 'off' && !(await phKeys(p)).length && hits.length === n, `reopened ${reopened}, pressed ${pressed}, stored ${await stored(p)}, ${hits.length - n} new, keys ${await phKeys(p)}`)
    assert('analytics browser: phone: no CSP violation, no request off this origin', !csp(p).length && !offOrigin(await requested()).length, csp(p).slice(0, 2).join(' · '))
    await p.close()
  }
} finally {
  server.close()
}
done(`all analytics browser checks passed (shots in ${SHOTS}/)`)
