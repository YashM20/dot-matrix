/**
 * Keyboard and name walk (#187, #208): real key events over CDP, Tab, Enter, Space, the arrows and Escape only.
 * Desktop, 1280 × 800, in dark and light:
 *  - `landmarks`, `skip`: on `/` (ALL) the header and footer sit outside `<main>`; the first Tab shows SKIP TO CONTENT
 *    and Enter moves focus into `<main>`;
 *  - `ring:<page>` (first mode only): the first Tab stops (up to 60) on home, a board, the widget page, MAKE, ABOUT and a post. Each
 *    stop shows a focus ring (an outline or box shadow on itself or its ::before / ::after), sits on screen and has an
 *    accessible name (Chrome's accessibility tree). Controls inside a card draw their ring in dots and are skipped;
 *  - `tab`, `theme`, `contrast`, `palette`: the header's view tab has a ring; THEME opens with focus inside; Tab
 *    reaches CONTRAST: MORE, a switch named "Contrast: more" whose state Space flips (and flips back); Escape sends
 *    focus back to THEME; Ctrl-K opens the palette with focus in its field and Escape sends focus back;
 *  - `row`, `row-menu`: a card's row on ALL is three named stops (Open, Copy link, More); Enter on MORE opens its menu
 *    on the first item, ↓ moves, Escape closes it with focus back on MORE;
 *  - `wp-skip`, `wp-more`: the widget page starts with SKIP TO CONTENT; its MORE menu opens from the keyboard and
 *    Escape sends focus back to MORE.
 * Phone, 390 × 844 with touch (`sheet:<name>`): TOOLS, BOARDS and search open a modal sheet or the palette with focus
 * inside; Escape closes it and focus goes back to the button that opened it.
 *
 *   npx vite build && npx tsx scripts/site/a11y-keys.ts            → serves dist/ on port 4328 for the run
 *   npx tsx scripts/site/a11y-keys.ts http://localhost:5173/        → any running site
 *   flags: --modes dark,light (default both), --only desktop,phone, --shots <dir> (a PNG per step and mode).
 * `KNOWN` lists today's failures (scripts/lib/check.ts `knownChecker`). In CI as the `a11y-keys` probe.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, serveDist, sleep, type Page } from '../lib/cdp'
import { knownChecker } from '../lib/check'

const KNOWN: readonly string[] = []

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const MODES = (flag('--modes') ?? 'dark,light').split(',')
const ONLY = (flag('--only') ?? 'desktop,phone').split(',')
const shots = flag('--shots')
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (p: Page, name: string) => { if (shots) await p.shot(join(shots, `${name}.png`)) }

const KEYS: Record<string, [string, number, string?]> = {
  Tab: ['Tab', 9], Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], ' ': ['Space', 32, ' '], k: ['KeyK', 75, 'k'], ArrowDown: ['ArrowDown', 40],
}
async function press(p: Page, key: string, modifiers = 0, wait = 150) {
  const [code, vk, text] = KEYS[key]
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(text && !modifiers ? { text } : {}) })
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers })
  await sleep(wait)
}
const q = JSON.stringify
const is = (p: Page, sel: string) => p.js<boolean>(`!!document.activeElement?.matches(${q(sel)})`)
/** Tab until `sel` has focus (at most `max` presses); true when it got there. */
async function tabTo(p: Page, sel: string, max = 60) {
  for (let i = 0; i < max; i++) { if (await is(p, sel)) return true; await press(p, 'Tab') }
  return is(p, sel)
}
const active = (p: Page) => p.js<string>(`(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (typeof a.className === 'string' && a.className.trim() ? '.' + a.className.trim().split(/\\s+/).join('.') : '') : '' })()`)
/** The focused element shows a ring: an outline or box shadow on itself, or on its ::before / ::after, while it
 * matches :focus-visible. */
const RINGED = `(() => {
  const a = document.activeElement
  if (!a || !a.matches(':focus-visible')) return false
  const drawn = s => (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 && !/rgba\\(.*, 0\\)$/.test(s.outlineColor)) || (s.boxShadow !== 'none' && s.boxShadow !== '')
  return [null, '::before', '::after'].some(pe => drawn(getComputedStyle(a, pe)))
})()`
const ringed = (p: Page) => p.js<boolean>(RINGED)
/** The focused element's role and name in Chrome's accessibility tree. */
async function axOf(p: Page): Promise<{ role: string; name: string }> {
  const r = await p.cdp('Runtime.evaluate', { expression: 'document.activeElement' })
  const t = await p.cdp('Accessibility.getPartialAXTree', { objectId: r.result?.result?.objectId, fetchRelatives: false })
  const n = t.result?.nodes?.find((x: { ignored?: boolean }) => !x.ignored) ?? t.result?.nodes?.[0]
  return { role: n?.role?.value ?? '', name: String(n?.name?.value ?? '').trim() }
}
async function load(p: Page, url: string, ready: string) {
  await p.cdp('Page.navigate', { url })
  const ok = await p.waitFor(`document.readyState === 'complete' && (${ready})`, 30000)
  await sleep(1500)
  return ok
}

if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const given = args.find(a => /^https?:/.test(a))
const server = given ? undefined : await serveDist(4328)
const base = (given ?? server!.url).replace(/\/?$/, '/')
const { check, done } = knownChecker(KNOWN, 'a11y-keys')

const ALL_READY = `!document.querySelector('.view-loading') && !!document.querySelector('.browse-grid .dot-card canvas, .browse-grid .dot-card svg')`
const PAGES: [name: string, path: string, ready: string][] = [
  ['home', '', ALL_READY],
  ['mosaic', 'mosaic/', `!document.querySelector('.view-loading') && !!document.querySelector('.board-grid .dot-card')`],
  ['widget', 'widget/timer/', `!!document.querySelector('.wp-stage canvas, .wp-stage svg')`],
  ['make', '?make', `!!document.querySelector('.ed-frame')`],
  ['about', 'about/', `!document.querySelector('.view-loading') && !!document.querySelector('.about-view')`],
  ['post', 'blog/build-your-own-dot-engine/', `!!document.querySelector('.essay.post > main .hero') && !document.querySelector('.post-wait')`],
]
/** Up to `max` Tab stops from the top: each needs a ring, a place on screen and a name. Stops inside a card (its
 * controls draw their ring in dots) are counted but not judged. */
async function ringWalk(p: Page, page: string, mode: string, max = 60) {
  await p.js(`(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); window.__seen = new WeakSet(); return 1 })()`)
  const bad: string[] = []
  let n = 0
  for (; n < max; n++) {
    await press(p, 'Tab', 0, 60)
    const s = await p.js<{ label: string; card: boolean; ring: boolean; on: boolean } | 'wrap' | null>(`(() => {
      const a = document.activeElement
      if (!a || a === document.body) return null
      if (window.__seen.has(a)) return 'wrap'
      window.__seen.add(a)
      const r = a.getBoundingClientRect()
      const label = a.tagName.toLowerCase() + (typeof a.className === 'string' && a.className.trim() ? '.' + a.className.trim().split(/\\s+/)[0] : '') + (a.textContent?.trim() ? ' "' + a.textContent.trim().slice(0, 18) + '"' : '')
      return { label, card: !!a.closest('.dot-card, .dot-a11y-group'), ring: ${RINGED},
        on: r.width >= 4 && r.height >= 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth }
    })()`)
    if (!s || s === 'wrap') break
    if (s.card) continue
    const ax = await axOf(p)
    const why = [!s.ring && 'no ring', !s.on && 'off screen', !ax.name && `no name (${ax.role})`].filter(Boolean).join(', ')
    if (why) bad.push(`#${n + 1} ${s.label}: ${why}`)
  }
  check(`ring:${page}:${mode}`, n > 0 && !bad.length, `${n} stops${bad.length ? `; ${bad.slice(0, 6).join(' | ')}` : ''}`)
}

async function desktop() {
  const p = await launch(1280, 800)
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    await p.cdp('Accessibility.enable')
    for (const mode of MODES) {
      console.log(`\ndesktop, ${mode}`)
      await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] })
      // the walk once (the ring is the accent in every theme; axe checks its contrast per mode)
      if (mode === MODES[0]) for (const [name, path, ready] of PAGES) {
        if (!(await load(p, base + path, ready))) { check(`ready:${name}:${mode}`, false, 'not ready in 30 s'); continue }
        await ringWalk(p, name, mode)
      }

      await load(p, base, ALL_READY)
      const marks = await p.js<string[]>(`[...document.querySelectorAll('header, main, footer')].filter(e => !e.closest('main') || e.tagName === 'MAIN').map(e => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''))`)
      check(`landmarks:${mode}`, ['header.topbar', 'main', 'footer.bottom'].every(m => marks.includes(m)), marks.join(' '))
      await p.js(`document.activeElement?.blur?.()`)
      await press(p, 'Tab')
      const skip = await p.js<number>(`(() => { const a = document.activeElement; return a?.matches('.skip-link') ? a.getBoundingClientRect().width : 0 })()`)
      check(`skip:${mode}`, skip > 40, `${await active(p)}, ${Math.round(skip)} px wide`)
      await shot(p, `skip-${mode}`)
      await press(p, 'Enter')
      check(`skip lands in main:${mode}`, await p.js<boolean>(`document.activeElement?.id === 'main'`), await active(p))

      await p.js(`document.querySelector('.skip-link').focus()`)
      check(`tab:${mode}`, (await tabTo(p, '.view-tabs [role=tab]')) && (await ringed(p)), await active(p))
      const theme = await tabTo(p, '.theme-menu-btn')
      await press(p, 'Enter')
      const inside = await p.waitFor(`!!document.querySelector('dialog.theme-pop[open]')?.contains(document.activeElement)`, 5000)
      check(`theme: focus inside:${mode}`, theme && inside && (await ringed(p)), await active(p))
      const sw = await tabTo(p, '.theme-contrast', 20)
      const before = await p.js<string>(`document.activeElement?.getAttribute('aria-checked') ?? ''`), ax = await axOf(p)
      await press(p, ' ')
      const after = await p.js<string>(`document.activeElement?.getAttribute('aria-checked') ?? ''`)
      await shot(p, `contrast-${mode}`)
      await press(p, ' ')
      const back = await p.js<string>(`document.activeElement?.getAttribute('aria-checked') ?? ''`)
      check(`contrast: switch by Space:${mode}`, sw && ax.role === 'switch' && /^contrast: more$/i.test(ax.name) && before !== after && back === before && (await ringed(p)),
        `${ax.role} "${ax.name}", ${before} → ${after} → ${back}`)
      await press(p, 'Escape')
      check(`theme: Escape back to THEME:${mode}`, !(await p.js<boolean>(`!!document.querySelector('.theme-pop')`)) && (await is(p, '.theme-menu-btn')), await active(p))

      await press(p, 'k', 2) // Ctrl
      await p.waitFor(`!!document.querySelector('.pal [role=combobox]') && document.activeElement?.matches('.pal-input')`, 20000) // the first Ctrl-K loads the command layer
      check(`palette: Ctrl-K, focus in the field:${mode}`, await is(p, '.pal-input'), await active(p))
      await press(p, 'Escape')
      await sleep(200)
      check(`palette: Escape back:${mode}`, !(await p.js<boolean>(`!!document.querySelector('.pal')`)) && (await is(p, '.theme-menu-btn')), await active(p))

      // the first card's row on ALL: three named stops, then MORE's menu
      const names: string[] = []
      if (await tabTo(p, '.browse-item .dot-card-row-open', 80)) {
        for (let i = 0; i < 3; i++) { const a = await axOf(p); names.push(`${a.name}${(await ringed(p)) ? '' : ' (no ring)'}`); if (i < 2) await press(p, 'Tab') }
      }
      check(`row:${mode}`, names.length === 3 && /^Open /.test(names[0]) && /^Copy link to /.test(names[1]) && /^More for /.test(names[2]) && !names.some(n => n.includes('no ring')), names.join(' | '))
      await press(p, 'Enter')
      const first = await p.waitFor(`document.activeElement?.matches('.dot-card-menu [role^=menuitem]') && document.activeElement === document.querySelector('.dot-card-menu [role^=menuitem]')`, 5000)
      await press(p, 'ArrowDown')
      const moved = await p.js<boolean>(`document.activeElement?.matches('.dot-card-menu [role^=menuitem]') && document.activeElement !== document.querySelector('.dot-card-menu [role^=menuitem]')`)
      await shot(p, `row-menu-${mode}`)
      await press(p, 'Escape')
      check(`row-menu:${mode}`, first && moved && !(await p.js<boolean>(`!!document.querySelector('.dot-card-menu')`)) && (await is(p, '.dot-card-row-more')), `first item ${first}, ↓ moves ${moved}, back on ${await active(p)}`)

      // the widget page: skip link first, MORE by keyboard
      await load(p, base + 'widget/timer/', PAGES[2][2])
      await p.js(`document.activeElement?.blur?.()`)
      await press(p, 'Tab')
      check(`wp-skip:${mode}`, await is(p, '.skip-link'), await active(p))
      const more = await tabTo(p, '.wp-more-btn')
      await press(p, 'Enter')
      const open = await p.waitFor(`!!document.querySelector('.wp-more')?.contains(document.activeElement)`, 5000)
      await press(p, 'Escape')
      check(`wp-more:${mode}`, more && open && !(await p.js<boolean>(`!!document.querySelector('.wp-more')`)) && (await is(p, '.wp-more-btn')), await active(p))
    }
  } finally {
    await p.close()
  }
}

/** Phones: each sheet opens with focus inside, and Escape gives focus back to its opener. */
async function phone() {
  const W = 390, H = 844
  const p = await launch(W, H)
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: true })
    await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    console.log('\nphone')
    const SHEETS: [name: string, opener: string, open: string][] = [
      ['tools', '.tabbar button[aria-haspopup=dialog]', 'dialog.tools-sheet[open]'],
      ['boards', '.topbar-place', 'dialog.board-sheet[open]'],
      ['search', '.topbar-search', '.pal'],
    ]
    for (const [name, opener, open] of SHEETS) {
      await load(p, base, ALL_READY)
      const at = await p.js<[number, number] | null>(`(() => { const e = document.querySelector(${q(opener)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
      if (!at) { check(`sheet:${name}`, false, `no ${opener}`); continue }
      await p.tap(at[0], at[1])
      const inside = await p.waitFor(`!!document.querySelector(${q(open)})?.contains(document.activeElement)`, 20000)
      await sleep(400)
      await shot(p, `sheet-${name}`)
      await press(p, 'Escape')
      await p.waitFor(`!document.querySelector(${q(open)})`, 3000)
      const back = await is(p, opener)
      check(`sheet:${name}`, inside && back, `focus inside ${inside}, back on the opener ${back} (${await active(p)})`)
    }
  } finally {
    await p.close()
  }
}

try {
  if (ONLY.includes('desktop')) await desktop()
  if (ONLY.includes('phone')) await phone()
} finally {
  server?.stop()
}
done()
process.exit(0)
