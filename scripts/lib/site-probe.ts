/**
 * Page checks shared by the site probes (scripts/site/layout.ts, mobile.ts and nav.ts; docs/POLISH-PLAN.md §2 P0):
 * the header after a scroll, footer links under a pinned layer, footer links alone on a line, and a Tab walk that
 * records where each focus stop lands. Each runs on a `Page` from scripts/lib/cdp.ts.
 */
import { sleep, type Page } from './cdp'

/** The site's header on any page: the app's top bar, the blog's site nav, the legal pages' nav. */
export const HEADER = '.topbar, .site-nav, .legal-nav'
/** The phone tab bar. */
export const TABBAR = '.tabbar'

// helpers inlined into each page expression
const VIS = `const vis = el => { if (!el) return false; const s = getComputedStyle(el), r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0 }`
const PINNED = `const pinned = el => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e } return null }`
const LABEL = `const label = el => el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '') + (el.textContent?.trim() ? ' "' + el.textContent.trim().slice(0, 20) + '"' : '')`

/** Scrolls to the top (`0`), the middle or the bottom of the page, instantly (no smooth scroll). */
export const scrollTo = (p: Page, at: 'top' | 'mid' | 'bottom') => p.js(`(() => {
  const se = document.scrollingElement || document.documentElement, max = se.scrollHeight - innerHeight
  window.scrollTo({ top: ${at === 'top' ? 0 : at === 'mid' ? 'max / 2' : 'max'}, behavior: 'instant' })
  return 1
})()`)

/**
 * `sticky`: scroll to the middle or the bottom, then up 160 px with a real mouse wheel, the way a reader looks for
 * the bar. Returns the header's top (null: no header). A bar that is always pinned passes, and so does the owner's
 * pick (docs/POLISH-PLAN.md §3, decision 3): hidden on scroll down, shown again on scroll up.
 */
export async function headerTopAfterScroll(p: Page, at: 'mid' | 'bottom', W: number, H: number): Promise<number | null> {
  await scrollTo(p, at); await sleep(400)
  await p.cdp('Input.dispatchMouseEvent', { type: 'mouseWheel', x: Math.round(W / 2), y: Math.round(H / 2), deltaX: 0, deltaY: -160 })
  await sleep(700)
  return p.js<number | null>(`(() => { ${VIS}; const el = [...document.querySelectorAll('${HEADER}')].find(vis); return el ? Math.round(el.getBoundingClientRect().top * 10) / 10 : null })()`)
}

/**
 * `covered`: at the bottom of the page, where the footer can't move up any further, each footer link (its centre
 * and four inset corners) must not be under a fixed or sticky layer. Returns the links that are, or off screen.
 */
export async function coveredFooterLinks(p: Page): Promise<string[]> {
  await scrollTo(p, 'bottom'); await sleep(500)
  return p.js<string[]>(`(() => {
    ${VIS}; ${PINNED}; ${LABEL}
    const out = []
    for (const a of [...document.querySelectorAll('footer a[href], footer button')].filter(vis)) {
      const r = a.getBoundingClientRect(), name = a.textContent.trim().slice(0, 20)
      if (r.bottom <= 0 || r.top >= innerHeight) { out.push(name + ' off screen at the bottom of the page'); continue }
      const pts = [[(r.left + r.right) / 2, (r.top + r.bottom) / 2], [r.left + 2, r.top + 2], [r.right - 2, r.top + 2], [r.left + 2, r.bottom - 2], [r.right - 2, r.bottom - 2]]
      for (const [x, y] of pts) {
        if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue
        const hit = document.elementFromPoint(x, y)
        if (!hit || a.contains(hit)) continue
        const layer = pinned(hit)
        if (layer && !layer.contains(a)) { out.push(name + ' under ' + label(layer)); break }
      }
    }
    return out
  })()`)
}

/** `footer-wrap`: within each footer, a link alone on its line (when the links take more than one line), or split over two. */
export const FOOTER_WRAP = `(() => {
  ${VIS}
  const out = []
  for (const f of document.querySelectorAll('footer')) {
    const links = [...f.querySelectorAll('a[href]')].filter(vis)
    if (links.length < 2) continue
    const lines = []
    for (const a of links) {
      const rs = a.getClientRects(), name = a.textContent.trim().slice(0, 20)
      if (rs.length > 1) out.push(name + ' split over ' + rs.length + ' lines')
      const y = rs[0].top + rs[0].height / 2, line = lines.find(l => Math.abs(l.y - y) < 6)
      if (line) line.names.push(name); else lines.push({ y, names: [name] })
    }
    if (lines.length > 1) for (const l of lines) if (l.names.length === 1) out.push(l.names[0] + ' alone on a line')
  }
  return out
})()`

/** One focus stop of a Tab walk. `y` is in page coordinates; `pinned`: inside a fixed or sticky layer. */
export interface Stop { n: number; label: string; y: number; top: number; h: number; pinned: boolean; footer: boolean; under: string }

/**
 * Presses Tab (real key events) up to `max` times and records each focus stop: where it lands, and whether it is
 * under the pinned top bar or the tab bar (`under`). Stops when focus wraps, leaves the page or enters a dialog,
 * or (with `untilFooter`) at the first stop in the footer.
 */
export async function tabWalk(p: Page, max: number, untilFooter = false): Promise<Stop[]> {
  await p.js(`(() => { document.activeElement?.blur?.(); window.__probeSeen = new WeakSet(); return 1 })()`)
  const stops: Stop[] = []
  for (let n = 1; n <= max; n++) {
    await p.key('Tab', 'Tab', 9)
    const s = await p.js<Omit<Stop, 'n'> | 'wrap' | null>(`(() => {
      ${VIS}; ${PINNED}; ${LABEL}
      const a = document.activeElement
      if (!a || a === document.body || a.closest('dialog')) return null
      if (window.__probeSeen.has(a)) return 'wrap'
      window.__probeSeen.add(a)
      const r = a.getBoundingClientRect()
      const top = [...document.querySelectorAll('${HEADER}')].find(e => vis(e) && pinned(e) && Math.abs(e.getBoundingClientRect().top) <= 1)
      const tab = [...document.querySelectorAll('${TABBAR}')].find(e => vis(e) && pinned(e))
      let under = ''
      if (r.height >= 2 && !(top && top.contains(a)) && !(tab && tab.contains(a))) {
        if (top && r.top < top.getBoundingClientRect().bottom - 1 && r.bottom > 0) under = 'top bar'
        else if (tab && r.bottom > tab.getBoundingClientRect().top + 1 && r.top < innerHeight) under = 'tab bar'
      }
      return { label: label(a), y: Math.round(r.top + scrollY), top: Math.round(r.top), h: Math.round(r.height), pinned: !!pinned(a), footer: !!a.closest('footer'), under }
    })()`)
    if (!s || s === 'wrap') break
    stops.push({ n, ...s })
    if (untilFooter && s.footer) break
  }
  return stops
}
