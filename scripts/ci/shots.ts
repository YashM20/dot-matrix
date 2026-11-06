/**
 * Screenshots of given routes for CI (.github/workflows/probes.yml): serves `dist/` with `vite preview`, opens each
 * route in headless Chrome (scripts/lib/cdp.ts) and saves a full-page PNG (capped at 4000 px).
 *
 *   npx tsx scripts/ci/shots.ts --list "/browse/@1280,/@390@light,/widget/timer/@1280@light_cobalt" [--out <dir>]
 *
 * Each item is `route@width[@theme]`; the route's leading slash is optional (`browse/@1280`, `@390` for home). Widths up to 600 are a phone (844 px tall, touch), wider ones a desktop
 * (900 px tall). Theme is `dark`, `light` or a full `<scheme>_<accent>` name (src/site/theme/names.ts); default
 * `dark_signal`. Reduced motion is emulated so nothing is caught mid-animation. Files: `<route>-<width>-<theme>.png`
 * in `--out` (default `.snapshots/ci-shots/`). Exit 1 when a page never got ready, 2 on a bad item.
 */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch, serveDist, sleep } from '../lib/cdp'
import { ACCENTS, SCHEMES } from '../../src/site/theme/names'

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const out = resolve(opt('--out') ?? join('.snapshots', 'ci-shots'))
const items = (opt('--list') ?? '').split(',').map(s => s.trim()).filter(Boolean)

type Item = { route: string; width: number; scheme: string; accent: string; file: string }
const parse = (s: string): Item | string => {
  // the leading slash is optional: Git Bash on Windows rewrites a leading `/` into a Windows path
  const [r, w, theme = 'dark'] = s.split('@'), route = r.startsWith('/') ? r : `/${r}`
  if (!/^\/[\w\-./?=&%]*$/.test(route) || route.includes('..')) return `bad route in "${s}"`
  const width = Number(w)
  if (!Number.isInteger(width) || width < 240 || width > 3840) return `bad width in "${s}" (240 to 3840)`
  const [scheme, accent = 'signal'] = theme.split('_')
  if (!(SCHEMES as readonly string[]).includes(scheme) || !(ACCENTS as readonly string[]).includes(accent)) return `bad theme in "${s}" (dark, light or <scheme>_<accent>)`
  const slug = route.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'
  return { route, width, scheme, accent, file: `${slug}-${width}-${scheme}_${accent}.png` }
}
const parsed = items.map(parse)
const bad = parsed.filter((p): p is string => typeof p === 'string')
if (bad.length || !items.length) { console.error(bad.length ? bad.join('\n') : 'no --list given'); process.exit(2) }

mkdirSync(out, { recursive: true })
const server = await serveDist(4318)
const page = await launch(1280, 900)
let failed = 0
try {
  for (const it of parsed as Item[]) {
    const phone = it.width <= 600, H = phone ? 844 : 900, t = Date.now()
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: it.width, height: H, deviceScaleFactor: 1, mobile: phone })
    await page.cdp('Emulation.setTouchEmulationEnabled', phone ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
    await page.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: it.scheme }] })
    // the stored theme, set on the site's origin before the page loads
    await page.cdp('Page.navigate', { url: `${server.url}favicon.svg` }); await sleep(150)
    await page.js(`localStorage.setItem('dot480:theme', ${JSON.stringify(JSON.stringify({ scheme: it.scheme, accent: it.accent }))})`).catch(() => {})
    await page.js('window.__shotOld = 1').catch(() => {})
    await page.cdp('Page.navigate', { url: new URL(it.route.slice(1), server.url).href })
    const ok = await page.waitFor(`!window.__shotOld && document.readyState === 'complete' && !document.querySelector('.view-loading, [aria-busy="true"]')`, 30000)
    await page.js(`document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`).catch(() => {})
    await sleep(1500)
    const h = Math.min(4000, Math.max(H, Math.ceil(await page.js<number>('document.documentElement.scrollHeight').catch(() => H))))
    await page.cdp('Emulation.setDeviceMetricsOverride', { width: it.width, height: h, deviceScaleFactor: 1, mobile: phone })
    await sleep(800)
    await page.shot(join(out, it.file))
    if (!ok) failed++
    console.log(`${ok ? 'OK       ' : 'NOT READY'} ${it.file} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
  }
} finally {
  await page.close()
  server.stop()
}
process.exit(failed ? 1 : 0)
