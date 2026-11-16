/**
 * Screenshots of given routes for CI (.github/workflows/probes.yml): serves `dist/` with `vite preview`, opens each
 * route in headless Chrome (scripts/lib/cdp.ts) and saves a full-page PNG (capped at 4000 px).
 *
 *   npx tsx scripts/ci/shots.ts --list "/browse/@1280,/@390@light,/widget/timer/@1280@light_cobalt" [--out <dir>]
 *
 * Each item is `route@width[@theme][@option...]`; the route's leading slash is optional (`browse/@1280`, `@390` for home). Widths up to 600 are a phone (844 px tall, touch), wider ones a desktop
 * (900 px tall). Theme is `dark`, `light` or a full `<scheme>_<accent>` name (src/site/theme/names.ts); default
 * `dark_signal`. Options, from a fixed list (no script comes from the input): `2x` (device scale 2), `xray` (the
 * xray flag on), `more` (click the widget page's MORE), `card-more` (click the first card row's MORE; the shot is the
 * viewport, the row in its middle), `other-tab` (another tab saves the editor's document, so the two-tab note shows),
 * `display` (the header's DISPLAY ▾ menu), `theme` (the header's THEME popover), `tools` (the phone TOOLS sheet,
 * scrolled to its skin list) and `boards` (the BOARDS sheet, scrolled to its ENGINE group); `card-more`, `display`, `theme`,
 * `tools` and `boards` capture the viewport only, e.g. `/@1280@dark@display`, `/@390@light@tools`. `focus` puts the
 * keyboard focus ring on the page's first toolbar button, else the first card row action (the viewport, the control in
 * its middle); `load-failed` answers every board chunk 404, so the boards show their error state (LoadBoundary.tsx)
 * after the page's one stale-deploy reload, e.g. `/levels/@390@light@load-failed`. Reduced motion is
 * emulated so nothing is caught mid-animation. Files:
 * `<route>-<width>-<theme>[-<option>...].png` in `--out` (default `.snapshots/ci-shots/`). Exit 1 when a page never
 * got ready (or an option's state never showed), 2 on a bad item.
 */
import { mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { launch, serveDist, sleep } from '../lib/cdp'
import { ACCENTS, SCHEMES } from '../../src/site/theme/names'

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const out = resolve(opt('--out') ?? join('.snapshots', 'ci-shots'))
const items = (opt('--list') ?? '').split(',').map(s => s.trim()).filter(Boolean)

const OPTIONS = ['2x', 'xray', 'more', 'card-more', 'other-tab', 'display', 'theme', 'tools', 'boards', 'focus', 'load-failed'] as const
type Option = typeof OPTIONS[number]
/** Options that capture the viewport as it is (a resize to the full page would scroll or close what they opened). */
const VIEWPORT: readonly Option[] = ['card-more', 'display', 'theme', 'tools', 'boards', 'focus']

/** Every board chunk (the ones the manifest chunk loads with `import()`), for `load-failed`; as scripts/site/chunks-browser.ts. */
const boardChunks = (): string[] => {
  const m = readdirSync('dist/assets').find(f => /^manifest-[\w-]+\.js$/.test(f))
  return m ? [...readFileSync(join('dist/assets', m), 'utf8').matchAll(/import\([`"']\.\/([^`"']+\.js)[`"']\)/g)].map(x => x[1]) : []
}
/** UI states opened by a script click: the control to press, then what shows it is open. */
const STATES: Partial<Record<Option, { press: string; open: string; then?: string }>> = {
  display: { press: '.skin-switch .skin-menu-btn', open: `!!document.querySelector('.skin-menu [role=menuitemradio]')` },
  theme: { press: '.theme-switch .theme-menu-btn', open: `!!document.querySelector('.theme-pop .theme-seg [role=radio]')` },
  tools: { press: '.tabbar button[aria-haspopup="dialog"]', open: `!!document.querySelector('.tools-sheet .skin-list [role=radio]')`, then: `document.querySelector('.tools-sheet .skin-list')?.scrollIntoView({ block: 'center' })` },
  boards: { press: '.board-all', open: `!!document.querySelector('.board-sheet #bs-engine')`, then: `document.querySelector('.board-sheet #bs-engine')?.scrollIntoView({ block: 'start' })` },
}
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
  for (const [opt, btn, menu] of [['more', '.wp-more-btn', '.wp-more'], ['card-more', '.dot-card-row-more', '.dot-card-menu']] as const) {
    if (!opts.includes(opt)) continue
    if (opt === 'card-more' && !(await page.waitFor(`!!document.querySelector('${btn}')`, 15000))) return false
    const c = await page.js<{ x: number; y: number } | null>(`(() => { const b = document.querySelector('${btn}'); if (!b) return null; b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })()`).catch(() => null)
    if (!c) return false
    if (phone) await page.tap(c.x, c.y)
    else { await page.mouse('mouseMoved', c.x, c.y, 0); await page.mouse('mousePressed', c.x, c.y); await page.mouse('mouseReleased', c.x, c.y) }
    if (!(await page.waitFor(`!!document.querySelector('${menu} [role^="menuitem"]')`, 5000))) return false
  }
  for (const o of opts) {
    const st = STATES[o]
    if (!st) continue
    await page.js(`document.querySelector(${JSON.stringify(st.press)})?.click()`).catch(() => {})
    if (!(await page.waitFor(st.open, 8000))) return false
    if (st.then) await page.js(st.then).catch(() => {})
    await sleep(500)
  }
  if (opts.includes('focus')) {
    const sel = '.pill-btn, .dot-card-row a, .dot-card-row > button'
    if (!(await page.waitFor(`!!document.querySelector('${sel}')`, 15000))) return false
    await page.js(`(() => { const b = document.querySelector('${sel}'); b.scrollIntoView({ block: 'center' }); b.focus({ focusVisible: true }); return 1 })()`)
    if (!(await page.waitFor(`document.activeElement?.matches(':focus-visible')`, 3000))) return false
  }
  if (opts.includes('load-failed') && !(await page.waitFor(`!!document.querySelector('.load-failed')`, 20000))) return false
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
// `load-failed`: while Fetch is on, every paused request (a board chunk) is answered 404, as after a new deploy
page.on('Fetch.requestPaused', e => { void page.cdp('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 404, body: Buffer.from('gone').toString('base64') }).catch(() => {}) })
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
    if (it.opts.includes('load-failed')) await page.cdp('Fetch.enable', { patterns: boardChunks().map(f => ({ urlPattern: `*/assets/${f}*` })) })
    await page.cdp('Page.navigate', { url: new URL(it.route.slice(1), server.url).href })
    const ok = await page.waitFor(`!window.__shotOld && document.readyState === 'complete' && !document.querySelector('.view-loading, [aria-busy="true"]')`, 30000)
    await page.js(`document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`).catch(() => {})
    await sleep(1500)
    const state = await act(it.opts, phone)
    // a full page (capped), except the viewport-only options
    if (!it.opts.some(o => VIEWPORT.includes(o))) {
      const h = Math.min(4000, Math.max(H, Math.ceil(await page.js<number>('document.documentElement.scrollHeight').catch(() => H))))
      await page.cdp('Emulation.setDeviceMetricsOverride', { width: it.width, height: h, deviceScaleFactor: dpr, mobile: phone })
      await sleep(800)
    }
    await page.shot(join(out, it.file))
    if (!ok || !state) failed++
    console.log(`${ok && state ? 'OK       ' : 'NOT READY'} ${it.file} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
    if (it.opts.includes('load-failed')) await page.cdp('Fetch.disable').catch(() => {})
    if (it.opts.some(o => STATES[o])) await page.js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`).catch(() => {})
  }
} finally {
  await page.close()
  server.stop()
}
process.exit(failed ? 1 : 0)
