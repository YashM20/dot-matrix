/**
 * Screenshots of every page and UI state in every theme, for looking at the site (not a test: nothing is
 * asserted beyond "the page got ready"). Builds `dist/`, serves it with its own `vite preview` on a free port,
 * drives headless Chrome over CDP (scripts/lib/cdp.ts), and writes PNGs plus an `index.html` contact sheet.
 * Needs no server running; the preview server and Chrome are always stopped on exit, error or Ctrl-C.
 *
 *   npx tsx scripts/site/shots.ts [--out <dir>] [--themes a,b|all] [--pages a,b] [--sizes 1440,390] [--no-build]
 *   pnpm shots -- --themes all
 *
 *  --out     output dir (default `.snapshots/shots/`, git-ignored)
 *  --themes  `<scheme>_<accent>` names (src/site/theme/names.ts); default dark_signal,light_signal,dark_vite,light_cobalt;
 *            `all` = every scheme × accent (14)
 *  --pages   shot names to keep (pages and states alike, see SHOTS below), e.g. `--pages home,palette,tools`
 *  --sizes   1440 (1440×900 desktop) and/or 390 (390×844 phone, touch); every desktop shot is taken before any
 *            phone one (touch emulation leaves `pointer: coarse` behind)
 *  --no-build  reuse the current dist/ (else `vite build` runs first, OG postbuild skipped)
 *
 * Pages are full-page captures (capped at 4000 px); states (palette, menus, sheets, editor selection, the hero
 * with a test image) are viewport captures. Reduced motion is emulated so nothing is caught mid-animation, and
 * `prefers-color-scheme` follows the theme's scheme. Files: `<theme>-<shot>-<size>.png`. A shot whose page never
 * got ready is marked NOT READY, a near-uniform capture BLANK (log and contact sheet); either makes the exit code 1.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { launch, serveDist, sleep, type Page } from '../lib/cdp'
import { ACCENTS, SCHEMES, themeName } from '../../src/site/theme/names'

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const list = (f: string) => opt(f)?.split(',').map(s => s.trim()).filter(Boolean)
const out = resolve(opt('--out') ?? join('.snapshots', 'shots'))
const ALL = SCHEMES.flatMap(s => ACCENTS.map(a => themeName(s, a)))
const themesArg = opt('--themes')
const themes = themesArg === 'all' ? ALL : (list('--themes') ?? ['dark_signal', 'light_signal', 'dark_vite', 'light_cobalt'])
const bad = themes.filter(t => !(ALL as string[]).includes(t))
if (bad.length) { console.error(`unknown theme(s): ${bad.join(', ')} (known: ${ALL.join(', ')})`); process.exit(2) }
const only = list('--pages'), sizeOnly = list('--sizes')

type Size = { id: string; W: number; H: number; phone: boolean }
const SIZES: Size[] = [{ id: '1440', W: 1440, H: 900, phone: false }, { id: '390', W: 390, H: 844, phone: true }].filter(s => !sizeOnly || sizeOnly.includes(s.id))

// ── readiness ─────────────────────────────────────────────────────────────────────────────────────────
const BOARD = `!!document.querySelector('.board-grid [data-card-id] canvas, .board-grid [data-card-id] svg') && !document.querySelector('.view-loading')`
const HOME = `${BOARD} && !!document.querySelector('.home-hero canvas, .home-hero svg')`
const EDITOR = `!document.querySelector('.view-loading') && document.querySelectorAll('.ed-frame').length >= 3`
const STATIC = (sel: string) => `document.readyState === 'complete' && !!document.querySelector(${JSON.stringify(sel)})`

interface Shot {
  name: string
  path: string
  ready: string
  /** full-page capture (pages) vs viewport (apps and states) */
  full?: boolean
  sizes?: ('1440' | '390')[]
  /** a fresh editor (autosave cleared) */
  editor?: boolean
  /** drive the page into the state; returns false when the state could not be reached */
  act?: (p: Page, s: Size) => Promise<boolean>
}

const click = (p: Page, sel: string) => p.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true })()`)
/** Click `sel` until `opened` holds (lazy layers may not be mounted on the first click). */
const openWith = async (p: Page, sel: string, opened: string, tries = 4) => {
  for (let i = 0; i < tries; i++) {
    await click(p, sel)
    if (await p.waitFor(opened, 4000)) return true
  }
  return false
}
const CTRL = 2

const SHOTS: Shot[] = [
  { name: 'home', path: '', ready: HOME, full: true },
  { name: 'components', path: 'components/', ready: BOARD, full: true },
  { name: 'lock', path: 'lock/', ready: BOARD, full: true },
  { name: 'pond', path: 'pond/', ready: BOARD, full: true },
  { name: 'squares', path: 'squares/', ready: BOARD, full: true },
  { name: 'materials', path: 'materials/', ready: BOARD, full: true },
  { name: 'about', path: '?about', ready: STATIC('.about-intro'), full: true },
  { name: 'make', path: '?make=tune', ready: EDITOR, editor: true },
  { name: 'widget-timer', path: 'widget/timer/', ready: `!document.querySelector('.wp[aria-busy], .view-loading') && !!document.querySelector('.wp canvas, .wp svg, [data-card-id] canvas, [data-card-id] svg')`, full: true },
  { name: 'essay', path: 'essay.html', ready: `${STATIC('.hero .dot-title')} && !!document.querySelector('.hero canvas, .hero .dot-svg')`, full: true },
  // the SPA's /privacy and /terms redirect to these without the query; Vercel rewrites to the same files
  { name: 'privacy', path: 'privacy.html', ready: STATIC('main.legal'), full: true },
  { name: 'terms', path: 'terms.html', ready: STATIC('main.legal'), full: true },
  // ── states
  {
    name: 'palette', path: '', ready: HOME,
    act: async (p, s) => {
      if (s.phone) {
        // touch: the topbar search opens the palette as a sheet that takes focus itself, so the list shows and
        // the keyboard stays down until the field is tapped (Palette.tsx). Ready = that sheet, focused, with rows.
        const sheet = `(() => { const pal = document.querySelector('.pal'); return !!pal && document.activeElement === pal && !!pal.querySelector('[role=option]:not([aria-disabled])') })()`
        const ok = await openWith(p, '.topbar-search', sheet)
        await sleep(800) // the sheet slides up
        return ok
      }
      // ⌘K toggles, so press it only while the palette is closed; desktop focus goes to the search field
      const open = `!!document.querySelector('.pal') && document.activeElement?.getAttribute('role') === 'combobox'`
      for (let i = 0; i < 5 && !await p.js(open); i++) {
        if (!await p.js(`!!document.querySelector('.pal')`)) { await p.js(`document.activeElement?.blur()`); await p.key('k', 'KeyK', 75, CTRL) }
        await p.waitFor(open, 3000)
      }
      return p.js(open) as Promise<boolean>
    },
  },
  {
    name: 'display', path: '', ready: HOME, sizes: ['1440'],
    act: p => openWith(p, '.skin-menu-btn', `!!document.querySelector('.skin-menu [role=menuitemradio]')`),
  },
  {
    name: 'tools', path: '', ready: HOME, sizes: ['390'],
    act: async p => {
      const ok = await openWith(p, '.tabbar button[aria-haspopup="dialog"]', `!!document.querySelector('.tools-sheet .tools-grid .tool-tilt')`)
      await sleep(800) // the sheet slides up
      return ok
    },
  },
  {
    name: 'boards', path: '', ready: HOME, sizes: ['390'],
    act: async p => { const ok = await openWith(p, '.topbar-place', `!!document.querySelector('.board-sheet section button')`); await sleep(800); return ok },
  },
  {
    name: 'select-all', path: '?make', ready: EDITOR, editor: true, sizes: ['1440'],
    act: async p => {
      await p.js(`document.activeElement?.blur()`)
      await p.key('a', 'KeyA', 65, CTRL)
      return p.waitFor(`(window.__editor?.picks?.length ?? 0) >= document.querySelectorAll('.ed-frame').length`, 3000)
    },
  },
  {
    name: 'selbar', path: '?make', ready: `${EDITOR} && !!document.querySelector('.ed-selbar')`, editor: true, sizes: ['390'],
    act: async p => {
      const btn = `.ed-selbar button[aria-label^="Select mode"]`
      await click(p, btn)
      const on = await p.waitFor(`document.querySelector('${btn}')?.getAttribute('aria-pressed') === 'true'`, 3000)
      await p.js(`document.activeElement?.blur()`)
      await p.key('a', 'KeyA', 65, CTRL)
      await p.waitFor(`(window.__editor?.picks?.length ?? 0) > 0`, 2000)
      return on
    },
  },
  {
    name: 'hero-image', path: '', ready: HOME,
    act: async p => {
      const r = await p.cdp('Runtime.evaluate', { expression: `document.querySelector('.hero-fig input[type=file]')` })
      const objectId = r.result?.result?.objectId
      if (!objectId) return false
      await p.cdp('DOM.enable')
      const set = await p.cdp('DOM.setFileInputFiles', { files: [testImage], objectId })
      if (set.error) { console.log(`  setFileInputFiles: ${set.error.message}`); return false }
      const ok = await p.waitFor(`!/YOUR IMAGE/.test(document.querySelector('.hero-fig .fig-cap')?.textContent ?? 'YOUR IMAGE')`, 8000)
      await p.js(`document.querySelector('.hero-fig').scrollIntoView({ block: 'center' })`)
      await sleep(600)
      return ok
    },
  },
]
const shots = SHOTS.filter(s => !only || only.includes(s.name))
if (only) { const unknown = only.filter(n => !SHOTS.some(s => s.name === n)); if (unknown.length) { console.error(`unknown shot(s): ${unknown.join(', ')} (known: ${SHOTS.map(s => s.name).join(', ')})`); process.exit(2) } }

// ── a test image: a 256×256 gradient PNG (no deps: zlib deflate + crc32) ──────────────────────────────
function gradientPng(w = 256, h = 256): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0 // filter: none
    for (let x = 0; x < w; x++) {
      const dx = x / w - .35, dy = y / h - .4, d = Math.sqrt(dx * dx + dy * dy)
      const v = Math.max(0, Math.min(1, .15 + .6 * (x + y) / (w + h) + .5 * Math.max(0, .3 - d) / .3))
      const o = y * (w * 3 + 1) + 1 + x * 3
      raw[o] = Math.round(255 * v); raw[o + 1] = Math.round(255 * v * (.6 + .4 * y / h)); raw[o + 2] = Math.round(255 * (1 - v) * .8)
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0)
    return Buffer.concat([len, td, crc])
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2 // 8-bit RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const tmp = mkdtempSync(join(tmpdir(), 'dot-shots-'))
const testImage = join(tmp, 'gradient.png')
writeFileSync(testImage, gradientPng())

const freePort = () => new Promise<number>((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, () => { const a = s.address(); s.close(() => res(typeof a === 'object' && a ? a.port : 4392)) }) })

// ── run ───────────────────────────────────────────────────────────────────────────────────────────────
const t0 = Date.now()
mkdirSync(out, { recursive: true })
if (!argv.includes('--no-build')) {
  console.log('$ vite build')
  const r = spawnSync('npx vite build', { shell: true, encoding: 'utf8', env: { ...process.env, SITE_POSTBUILD: '0' }, maxBuffer: 1 << 26 })
  if (r.status !== 0) { console.error(((r.stdout ?? '') + (r.stderr ?? '')).split('\n').slice(-30).join('\n')); rmSync(tmp, { recursive: true, force: true }); process.exit(1) }
}

let server: { url: string; stop: () => void } | undefined
let page: Page | undefined
let chromePid: number | undefined
let cleaned = false
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch { return false } }
const cleanup = async () => {
  if (cleaned) return
  cleaned = true
  // Chrome can outlive a plain kill of the process `launch` spawned: ask it to quit, then make sure by pid
  if (page) await Promise.race([page.cdp('Browser.close'), sleep(2000)]).catch(() => {})
  try { await page?.close() } catch { /* already gone */ }
  for (let i = 0; chromePid && alive(chromePid) && i < 20; i++) await sleep(100)
  if (chromePid && alive(chromePid)) {
    if (process.platform === 'win32') spawnSync(`taskkill /pid ${chromePid} /t /f`, { shell: true, stdio: 'ignore' })
    else try { process.kill(chromePid, 'SIGKILL') } catch { /* gone */ }
  }
  server?.stop()
  try { rmSync(tmp, { recursive: true, force: true }) } catch { /* */ }
}
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { void cleanup().then(() => process.exit(130)) })

type Row = { file: string; theme: string; shot: string; size: string; status: 'ok' | 'not ready' | 'blank' }
const rows: Row[] = []
let failed = 0
try {
  server = await serveDist(await freePort())
  const base = server.url
  page = await launch(1440, 900)
  const p = page
  chromePid = (await p.cdp('SystemInfo.getProcessInfo')).result?.processInfo?.find((x: { type: string }) => x.type === 'browser')?.id
  /** Wait until the number of drawn cards in the viewport stops changing (lazy mounts), max `ms`. */
  const settle = async (ms = 6000) => {
    await p.js(`document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`).catch(() => {})
    const drawn = `[...document.querySelectorAll('[data-card-id], [data-fig]')].filter(e => { const r = e.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && e.querySelector('canvas, svg') }).length`
    let last = -1, stable = 0
    for (let i = 0; i < ms / 200 && stable < 3; i++) { const n = await p.js<number>(drawn).catch(() => 0); stable = n === last ? stable + 1 : 0; last = n; await sleep(200) }
    await sleep(500)
  }
  const capture = async (file: string, s: Size, full: boolean) => {
    if (full) {
      const h = Math.min(4000, Math.max(s.H, Math.ceil(await p.js<number>('document.documentElement.scrollHeight'))))
      await p.cdp('Emulation.setDeviceMetricsOverride', { width: s.W, height: h, deviceScaleFactor: 1, mobile: s.phone })
      await settle(4000)
      await p.shot(file)
      await p.cdp('Emulation.setDeviceMetricsOverride', { width: s.W, height: s.H, deviceScaleFactor: 1, mobile: s.phone })
    } else await p.shot(file)
  }

  let stubbed = false
  for (const s of SIZES) {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: s.W, height: s.H, deviceScaleFactor: 1, mobile: s.phone })
    await p.cdp('Emulation.setTouchEmulationEnabled', s.phone ? { enabled: true, maxTouchPoints: 5 } : { enabled: false })
    if (s.phone && !stubbed) {
      // iOS-style motion permission, so TOOLS offers TILT (as scripts/light-browser.ts does)
      await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `DeviceOrientationEvent.requestPermission = () => Promise.resolve('granted')` })
      stubbed = true
    }
    for (const theme of themes) {
      const [scheme, accent] = theme.split('_')
      await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }, { name: 'prefers-color-scheme', value: scheme }] })
      // the stored choice too, for pages that read only localStorage
      await p.cdp('Page.navigate', { url: `${base}favicon.svg` }); await sleep(150)
      await p.js(`localStorage.setItem('dot480:theme', ${JSON.stringify(JSON.stringify({ scheme, accent }))})`).catch(() => {})
      for (const sh of shots) {
        if (sh.sizes && !sh.sizes.includes(s.id as '1440' | '390')) continue
        const t = Date.now()
        const url = `${base}${sh.path}${sh.path.includes('?') ? '&' : '?'}theme=${theme}`
        // the old document is marked before each navigation: until the new one replaces it, nothing is "ready"
        const mark = () => p.js(`window.__shotsOld = 1`).catch(() => {})
        const fresh = `!window.__shotsOld && (${sh.ready})`
        if (sh.editor) {
          await mark(); await p.cdp('Page.navigate', { url }); await p.waitFor(`!window.__shotsOld && (${EDITOR})`, 60000)
          await p.js(`localStorage.removeItem('dot480.editor.v1')`)
          await mark(); await p.cdp('Page.reload')
        } else { await mark(); await p.cdp('Page.navigate', { url }) }
        let ok = await p.waitFor(fresh, 45000)
        await settle()
        if (ok && sh.act) ok = await sh.act(p, s)
        const file = `${theme}-${sh.name}-${s.id}.png`
        await capture(join(out, file), s, !!sh.full && !sh.act)
        // a near-uniform frame compresses to almost nothing (blank: ~0.01 B/px; real content: > 0.15 B/px)
        const status: Row['status'] = !ok ? 'not ready' : statSync(join(out, file)).size < s.W * s.H / 40 ? 'blank' : 'ok'
        rows.push({ file, theme, shot: sh.name, size: s.id, status })
        if (status !== 'ok') failed++
        console.log(`${status.toUpperCase().padEnd(9)} ${file} (${((Date.now() - t) / 1000).toFixed(1)} s)`)
      }
    }
  }
} finally {
  await cleanup()
}

// ── contact sheet ─────────────────────────────────────────────────────────────────────────────────────
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
const sections = SIZES.flatMap(s => themes.map(theme => {
  const items = rows.filter(r => r.size === s.id && r.theme === theme)
  if (!items.length) return ''
  return `<section><h2>${esc(theme)} · ${s.W}×${s.H}${s.phone ? ' touch' : ''}</h2><div class="grid${s.phone ? ' phone' : ''}">${items.map(r =>
    `<figure${r.status === 'ok' ? '' : ' class="bad"'}><a href="${r.file}"><img loading="lazy" src="${r.file}" alt="${esc(r.shot)}"></a><figcaption>${esc(r.shot)}${r.status === 'ok' ? '' : ` · ${r.status.toUpperCase()}`}</figcaption></figure>`).join('')}</div></section>`
}))
writeFileSync(join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Dot/480 shots</title>
<style>body{margin:24px;background:#111;color:#ccc;font:13px/1.4 ui-monospace,monospace}h1{font-size:16px}h2{font-size:13px;margin:28px 0 10px;color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;align-items:start}.grid.phone{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
figure{margin:0}img{display:block;width:100%;max-height:520px;object-fit:cover;object-position:top;border:1px solid #333;background:#000}figcaption{padding:4px 0}.bad figcaption{color:#f55}</style>
<h1>Dot/480 · ${rows.length} shots · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}${failed ? ` · ${failed} not ready or blank` : ''}</h1>
${sections.join('\n')}
`)
console.log(`\n${rows.length} shots (${failed} not ready or blank) in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${join(out, 'index.html')}`)
process.exit(failed ? 1 : 0)
