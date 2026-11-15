/**
 * Zoom and motion (#187), on a desktop browser (mouse, no touch), the way a visitor zooms in:
 *  - `reflow:<page>@<w>` (WCAG 1.4.10): at 640 × 450 (1280 × 900 at 200%) and 320 × 256 (400%; WCAG's 320 CSS px)
 *    the page doesn't scroll sideways (scrollWidth ≤ the viewport), and it names what sticks out. The phone
 *    layout probes run at 390 and 320 with touch; a zoomed desktop keeps hover and a fine pointer, so its CSS differs.
 *    MAKE is a two-dimensional tool (the WCAG exception): it may pan, but its own frame must not push the page wide;
 *  - `zoom-header:<page>@<w>`: the top bar fits in a quarter of the viewport's height, so the page under a pinned
 *    bar keeps room to read (WCAG 1.4.10 and 2.4.11 at 400%);
 *  - `motion:<page>` (WCAG 2.3.3, 2.2.2): under `prefers-reduced-motion: reduce`, once the page settles, no CSS
 *    animation or transition still runs, and the page asks for animation frames at most a few times a second (a
 *    card loop that ignored the setting would ask 60 times).
 *
 *   npx vite build && npx tsx scripts/site/a11y-zoom.ts             → serves dist/ on port 4329 for the run
 *   npx tsx scripts/site/a11y-zoom.ts http://localhost:5173/         → any running site
 *   flags: --pages home,widget (by name), --shots <dir> (a PNG per page and width).
 * `KNOWN` lists today's failures (scripts/lib/check.ts `knownChecker`). In CI as the `a11y-zoom` probe.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, serveDist, sleep, type Page } from '../lib/cdp'
import { knownChecker } from '../lib/check'

const KNOWN: readonly string[] = []

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const shots = flag('--shots')
if (shots) mkdirSync(shots, { recursive: true })

const READY = `!document.querySelector('.view-loading')`
const ALL_PAGES: [name: string, path: string, ready: string][] = [
  ['home', '', `${READY} && !!document.querySelector('.browse-grid .dot-card')`],
  ['mosaic', 'mosaic/', `${READY} && !!document.querySelector('.board-grid .dot-card')`],
  ['widget', 'widget/timer/', `!!document.querySelector('.shell--widget .wp-ids, .shell--widget .wp-missing')`],
  ['make', '?make', `!!document.querySelector('.ed-frame')`],
  ['about', 'about/', `${READY} && !!document.querySelector('.about-view')`],
  ['post', 'blog/build-your-own-dot-engine/', `!!document.querySelector('.essay.post > main .hero') && !document.querySelector('.post-wait')`],
  ['privacy', 'privacy', `!!document.querySelector('.legal > main')`],
]
const pick = flag('--pages')?.split(',')
const PAGES = pick ? ALL_PAGES.filter(p => pick.includes(p[0])) : ALL_PAGES
const ZOOMS: [w: number, h: number][] = [[640, 450], [320, 256]]

/** How wide the page is, and the outermost elements that end past the viewport (outside any box that scrolls or
 * clips sideways, and outside the editor's canvas, which pans). */
const WIDE = `(() => {
  const W = document.documentElement.clientWidth, out = []
  const clipped = el => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const o = getComputedStyle(e).overflowX; if (o !== 'visible') return true } return false }
  for (const el of document.body.querySelectorAll('*')) {
    const r = el.getBoundingClientRect()
    if (r.right <= W + 1 || !r.width || el.closest('.sr-only, .ed-viewport') || clipped(el)) continue
    const s = getComputedStyle(el)
    if (s.position === 'fixed' && s.visibility === 'hidden') continue
    if (out.some(o => o.el.contains(el))) continue
    out.push({ el, why: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '') + ' to ' + Math.round(r.right) })
  }
  return { scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), W, out: out.slice(0, 5).map(o => o.why) }
})()`

async function load(p: Page, url: string, ready: string) {
  await p.cdp('Page.navigate', { url })
  const ok = await p.waitFor(`document.readyState === 'complete' && (${ready})`, 30000)
  await p.js('document.fonts.ready.then(() => 1)')
  await sleep(1500)
  return ok
}

if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const given = args.find(a => /^https?:/.test(a))
const server = given ? undefined : await serveDist(4329)
const base = (given ?? server!.url).replace(/\/?$/, '/')
const { check, done } = knownChecker(KNOWN, 'a11y-zoom')
const p = await launch(1280, 900)
try {
  for (const [w, h] of ZOOMS) {
    console.log(`\n${w} × ${h} (${Math.round(1280 / w * 100)}%)`)
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
    for (const [name, path, ready] of PAGES) {
      if (!(await load(p, base + path, ready))) { check(`ready:${name}@${w}`, false, 'not ready in 30 s'); continue }
      const m = await p.js<{ scroll: number; W: number; out: string[] }>(WIDE)
      check(`reflow:${name}@${w}`, m.scroll <= m.W + 1, `scrollWidth ${m.scroll} in ${m.W}${m.out.length ? `; ${m.out.join(' | ')}` : ''}`)
      const bar = await p.js<number>(`(() => { const t = document.querySelector('.topbar, .site-nav, .legal-nav'); return t ? Math.round(t.getBoundingClientRect().height) : 0 })()`)
      check(`zoom-header:${name}@${w}`, bar <= h / 4, `top bar ${bar} px of ${h}`)
      if (shots) await p.shot(join(shots, `${name}-${w}.png`))
    }
  }

  console.log('\nreduced motion')
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  // count the animation frames the page asks for (every rAF call, from the first script on)
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const raf = window.requestAnimationFrame.bind(window); window.__rafs = 0; window.requestAnimationFrame = cb => { window.__rafs++; return raf(cb) } })()` })
  for (const [name, path, ready] of PAGES.filter(([n]) => n !== 'make')) {
    if (!(await load(p, base + path, ready))) { check(`ready:${name}:motion`, false, 'not ready in 30 s'); continue }
    await sleep(1500)
    const m = await p.js<{ running: string[]; rafs: number }>(`(async () => {
      const running = document.getAnimations().filter(a => a.playState === 'running' && !a.effect?.target?.closest?.('.dot-card'))
        .map(a => (a.animationName || a.transitionProperty || 'animation') + ' on ' + (a.effect?.target?.className || a.effect?.target?.tagName || '?'))
      const start = window.__rafs
      await new Promise(r => setTimeout(r, 2000))
      return { running: running.slice(0, 5), rafs: (window.__rafs - start) / 2 }
    })()`)
    check(`motion:${name}`, !m.running.length && m.rafs <= 8, `${m.rafs.toFixed(1)} frames/s asked${m.running.length ? `; running: ${m.running.join(' | ')}` : ''}`)
  }
} finally {
  await p.close()
  server?.stop()
}
done()
process.exit(0)
