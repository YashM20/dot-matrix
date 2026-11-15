/**
 * Screenshots of given routes for CI (.github/workflows/probes.yml): serves `dist/` with `vite preview`, opens each
 * route in headless Chrome (scripts/lib/cdp.ts) and saves a full-page PNG (capped at 4000 px).
 *
 *   npx tsx scripts/ci/shots.ts --list "/browse/@1280,/@390@light,/widget/timer/@1280@light_cobalt" [--out <dir>]
 *
 * Each item is `route@width[@theme][@option...]`; the route's leading slash is optional (`browse/@1280`, `@390` for home). Widths up to 600 are a phone (844 px tall, touch), wider ones a desktop
 * (900 px tall). Theme is `dark`, `light` or a full `<scheme>_<accent>` name (src/site/theme/names.ts); default
 * `dark_signal`. Options, from a fixed list (no script comes from the input): `2x` (device scale 2), `xray` (the
 * xray flag on), `more` (click the widget page's MORE), `other-tab` (another tab saves the editor's document, so the
 * two-tab note shows). Reduced motion is emulated so nothing is caught mid-animation. Files:
 * `<route>-<width>-<theme>[-<option>...].png` in `--out` (default `.snapshots/ci-shots/`). Exit 1 when a page never
 * got ready (or an option's state never showed), 2 on a bad item.
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch, serveDist, sleep } from '../lib/cdp'
import { ACCENTS, SCHEMES } from '../../src/site/theme/names'

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const out = resolve(opt('--out') ?? join('.snapshots', 'ci-shots'))
const items = (opt('--list') ?? '').split(',').map(s => s.trim()).filter(Boolean)

const OPTIONS = ['2x', 'xray', 'more', 'other-tab'] as const
type Option = typeof OPTIONS[number]
type Item = { route: string; width: number; scheme: string; accent: string; opts: Option[]; file: string }
const parse = (s: string): Item | string => {
  // the leading slash is optional: Git Bash on Windows rewrites a leading `/` into a Windows path
  const [r, w, theme = 'dark', ...rest] = s.split('@'), route = r.startsWith('/') ? r : `/${r}`
  if (!/^\/[\w\-./?=&%]*$/.test(route) || route.includes('..')) return `bad route in "${s}"`
  const width = Number(w)
  if (!Number.isInteger(width) || width < 240 || width > 3840) return `bad width in "${s}" (240 to 3840)`
  const [scheme, accent = 'signal'] = theme.split('_')
  if (!(SCHEMES as readonly string[]).includes(scheme) || !(ACCENTS as readonly string[]).includes(accent)) return `bad theme in "${s}" (dark, light or <scheme>_<accent>)`
  const opts = rest.filter((o): o is Option => (OPTIONS as readonly string[]).includes(o))
  if (opts.length !== rest.length) return `bad option in "${s}" (${OPTIONS.join(', ')})`
  const slug = route.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'
  return { route, width, scheme, accent, opts, file: `${slug}-${width}-${scheme}_${accent}${opts.map(o => `-${o}`).join('')}.png` }
}
const parsed = items.map(parse)
const bad = parsed.filter((p): p is string => typeof p === 'string')
if (bad.length || !items.length) { console.error(bad.length ? bad.join('\n') : 'no --list given'); process.exit(2) }

/** Puts the page in an option's state (a real click or tap on MORE, so no keyboard focus ring shows); false if it never showed. */
async function act(opts: Option[], phone: boolean): Promise<boolean> {
  if (opts.includes('more')) {
    const c = await page.js<{ x: number; y: number } | null>(`(() => { const b = document.querySelector('.wp-more-btn'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`).catch(() => null)
    if (!c) return false
    if (phone) await page.tap(c.x, c.y)
    else { await page.mouse('mouseMoved', c.x, c.y, 0); await page.mouse('mousePressed', c.x, c.y); await page.mouse('mouseReleased', c.x, c.y) }
    if (!(await page.waitFor(`!!document.querySelector('.wp-more [role="menuitem"]')`, 5000))) return false
  }
  if (opts.includes('other-tab')) {
    if (!(await page.waitFor(`!!document.querySelector('.ed-other')`, 15000))) return false
    await page.js(`window.dispatchEvent(new StorageEvent('storage', { key: 'dot480.editor.v1', newValue: '{"kind":"other tab"}' })), 1`)
    if (!(await page.waitFor(`document.querySelectorAll('.ed-other button').length === 2`, 5000))) return false
  }
  await sleep(400)
  return true
}

mkdirSync(out, { recursive: true })
const server = await serveDist(4318)
const page = await launch(1280, 900)
let failed = 0
try {
  for (const it of parsed as Item[]) {
    const phone = it.width <= 600, H = phone ? 844 : 900, t = Date.now(), dpr = it.opts.includes('2x') ? 2 : 1
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: it.width, height: H, deviceScaleFactor: dpr, mobile: phone })
    await page.cdp('Emulation.setTouchEmulationEnabled', phone ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
    await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: it.scheme }] })
    // the stored theme, set on the site's origin before the page loads
    await page.cdp('Page.navigate', { url: `${server.url}favicon.svg` }); await sleep(150)
    await page.js(`localStorage.setItem('dot480:theme', ${JSON.stringify(JSON.stringify({ scheme: it.scheme, accent: it.accent }))})`).catch(() => {})
    await page.setFlags({ xray: it.opts.includes('xray') ? true : null }).catch(() => {})
    await page.js('window.__shotOld = 1').catch(() => {})
    await page.cdp('Page.navigate', { url: new URL(it.route.slice(1), server.url).href })
    const ok = await page.waitFor(`!window.__shotOld && document.readyState === 'complete' && !document.querySelector('.view-loading, [aria-busy="true"]')`, 30000)
    await page.js(`document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`).catch(() => {})
    await sleep(1500)
    const state = await act(it.opts, phone)
    const h = Math.min(4000, Math.max(H, Math.ceil(await page.js<number>('document.documentElement.scrollHeight').catch(() => H))))
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: it.width, height: h, deviceScaleFactor: dpr, mobile: phone })
    await sleep(800)
    await page.shot(join(out, it.file))
    if (!ok || !state) failed++
    console.log(`${ok && state ? 'OK       ' : 'NOT READY'} ${it.file} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
  }
} finally {
  await page.close()
  server.stop()
}
process.exit(failed ? 1 : 0)
