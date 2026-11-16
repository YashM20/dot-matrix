/** The editor fits the window at desktop sizes (scripts/editor-browser.ts, desktop pass). */
import { type Page } from '../lib/cdp'
import { base, check } from './shared'

// ── the editor fits the window: at desktop sizes its bottom edge is inside the window once the page above has
//    settled. The tool dock (CommandLayer's .pal-dock, a lazy chunk portaled into the site bar) can land after the
//    editor's first measure and make the bar 11 px taller; a height measured once then ran the editor past the
//    window (PR #11). Whether the dock lands before or after that measure depends on load order, so after a fresh
//    load settles, the probe also grows the site bar by 11 px itself (what the late dock did) and the editor must
//    still fit. A build without PR #11 fit on the natural load (the dock landed first), hence the grown bar.
//    Leaves the page at 1440×900.
const FIT_SETTLE = `document.fonts.ready.then(() => new Promise(res => {
  const ed = document.querySelector('.ed-root'), bar = document.querySelector('.topbar')
  let last = '', same = 0, n = 0
  const tick = () => {
    const b = ed.getBoundingClientRect().bottom, t = bar?.getBoundingClientRect().bottom ?? 0, k = b.toFixed(1) + '/' + t.toFixed(1)
    same = k === last ? same + 1 : 0; last = k
    if (same >= 10 || ++n > 300) res({ b, bar: t, H: innerHeight, sy: scrollY }); else requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}))`
export async function desktopFit(p: Page) {
  type Fit = { b: number; bar: number; H: number; sy: number }
  const bad: string[] = [], seen: string[] = []
  const fits = (m?: Fit) => !!m && m.b <= m.H + .5 && m.sy === 0
  const say = (m?: Fit) => m ? `bottom ${m.b.toFixed(1)}, bar ${m.bar.toFixed(1)}, scrollY ${m.sy}` : 'editor or dock never loaded'
  for (const [W, H] of [[1440, 900], [1280, 720], [1920, 1080]] as const) {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
    await p.cdp('Page.navigate', { url: `${base}?make&pro=1` })
    const ok = await p.waitFor(`!!document.querySelector('.ed-root .ed-frame') && !!document.querySelector('.topbar-dock .pal-dock:not(.dock-ghost)')`, 60000)
    const m = ok ? await p.js<Fit>(FIT_SETTLE) : undefined
    // the late dock, made deterministic: the bar grows 11 px after the editor has measured
    const g = m ? await p.js<Fit>(`(() => { const bar = document.querySelector('.topbar'); bar.style.minHeight = (bar.getBoundingClientRect().height + 11) + 'px' })(), ${FIT_SETTLE}`) : undefined
    await p.js(`document.querySelector('.topbar')?.style.removeProperty('min-height')`).catch(() => {})
    seen.push(`${W}×${H}: ${say(m)}; bar +11 px: ${say(g)}`)
    if (!fits(m) || !fits(g)) bad.push(`${W}×${H}`)
  }
  check('the editor fits the window at desktop sizes once the tool dock has landed, also when the site bar grows after it measured (bottom edge ≤ window height, no page scroll)', !bad.length, (bad.length ? `over: ${bad.join(', ')}; ` : '') + seen.join(' | '))
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
}
