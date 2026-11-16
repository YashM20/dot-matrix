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
 *  - `row`, `row-stop`, `row-menu`: a card's row on ALL is a toolbar with one Tab stop whose → walks three named
 *    actions (Open, Copy link, More); Tab leaves it and Shift+Tab returns to the last one; Enter on MORE opens its menu
 *    on the first item, ↓ moves, Escape closes it with focus back on MORE;
 *  - `wp-skip`, `wp-more`: the widget page starts with SKIP TO CONTENT; its MORE menu opens from the keyboard and
 *    Escape sends focus back to MORE.
 *  - #352, one check per behaviour: the palette and the shell are modal dialogs (the page behind is inert) that give
 *    focus back; DISPLAY ▾ opens on the current skin with ↓; a card row's MORE opens on its last item with ↑, points
 *    at its menu (`aria-controls`), moves by first letter and closes on a press outside; the widget page's MORE opens
 *    with ↓; the pill bar and the accent swatches jump with Home and End; the board groups are tabs whose arrows
 *    open a group and whose boards row is the labelled panel.
 *  - `press` (#341, first mode only, in a second Chrome with a mouse): on the widget page a mouse press sinks MORE's
 *    one-button group to `--press-sink-fine`, a button among several (SVG) takes the press fill and doesn't sink, a held
 *    Space sinks nothing, and under reduced motion nothing sinks (`--press-sink` is 1 too).
 * Phone, 390 × 844 with touch: `tap44:<page>`, every control outside the cards has a 44 × 44 touch area (WCAG 2.5.5;
 *  targets in a sentence and MAKE's frame names, which LAYERS repeats as 44 px rows, are exempt). `sheet:<name>`: TOOLS, BOARDS and search open a modal sheet or the palette with focus
 * inside, as a modal dialog (`:modal`); Escape closes it and focus goes back to the button that opened it.
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
  ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], ArrowRight: ['ArrowRight', 39], Home: ['Home', 36], End: ['End', 35], '`': ['Backquote', 192, '`'],
}
/** A letter key (type-ahead), with its text. */
async function letter(p: Page, ch: string) {
  const up = ch.toUpperCase(), code = /[A-Z]/.test(up) ? `Key${up}` : /[0-9]/.test(up) ? `Digit${up}` : ''
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, code, windowsVirtualKeyCode: up.charCodeAt(0), text: ch })
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, code, windowsVirtualKeyCode: up.charCodeAt(0) })
  await sleep(150)
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
    const s = await p.js<{ label: string; card: boolean; ring: boolean; on: boolean } | 'wrap' | null>(`(async () => {
      const a = document.activeElement
      if (!a || a === document.body) return null
      if (window.__seen.has(a)) return 'wrap'
      window.__seen.add(a)
      // a page with smooth scrolling (the blog) brings focus into view over a few frames: wait until it settles
      for (let i = 0, y = -1, still = 0; i < 60 && still < 3; i++) { await new Promise(r => requestAnimationFrame(r)); still = scrollY === y ? still + 1 : 0; y = scrollY }
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

/** A toolbar button's state right now: its own scale, its group's (`.pill`) scale (1 for no transform), how many
 * buttons the group holds, and its background. */
type PillState = { btn: number; group: number; n: number; bg: string }
const pillState = (sel: string) => `(() => { const b = document.querySelector(${JSON.stringify(sel)}), g = b.closest('.pill')
  const sc = e => { const t = getComputedStyle(e).transform; return t === 'none' ? 1 : new DOMMatrix(t).a }
  return { btn: sc(b), group: sc(g), n: g.querySelectorAll(':scope > .pill-btn').length, bg: getComputedStyle(b).backgroundColor } })()`
const MORE = '.wp-more-btn', MULTI = '.pill > .pill-btn + .pill-btn'
/** Desktop press (#341), on the widget page in a Chrome with a mouse (`launch(…, { mouse: true })`: the runner's
 * headless Chrome has no fine pointer otherwise). MORE sits alone in its group, so a held mouse press sinks the group
 * to `--press-sink-fine` and the button keeps its own scale; a button in a group of several (SVG) only takes the press
 * fill, nothing sinks (a lone sinking button opens a band inside the group's frame); a held Space sinks nothing (a key
 * must not leave it small), nor does anything under reduced motion. Each mouse press is let go off the button. */
async function pressSink(mode: string) {
  const p = await launch(1280, 800, { mouse: true })
  try {
    await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
    await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] })
    if (!(await load(p, base + PAGES[2][1], PAGES[2][2]))) { check(`press: ready:${mode}`, false, 'not ready in 30 s'); return }
    const fine = await p.js<boolean>(`matchMedia('(hover: hover) and (pointer: fine)').matches`)
    const token = await p.js<number>(`parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--press-sink-fine'))`)

    const reached = await tabTo(p, MORE)
    const visible = await p.js<boolean>(`document.activeElement?.matches('.wp-more-btn:focus-visible') ?? false`)
    const [code, vk, text] = KEYS[' ']
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code, windowsVirtualKeyCode: vk, text }); await sleep(120)
    const held = await p.js<PillState>(pillState(MORE))
    await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code, windowsVirtualKeyCode: vk }); await sleep(150)
    await press(p, 'Escape')
    check(`press: a held Space sinks nothing:${mode}`, reached && visible && held.btn === 1 && held.group === 1, `focus-visible ${visible}, ${JSON.stringify(held)}`)

    const mouse = async (sel: string) => {
      await p.js(`document.activeElement?.blur?.(); 1`)
      const [x, y] = await p.js<[number, number]>(`(r => [r.x + r.width / 2, r.y + r.height / 2])(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`)
      await p.mouse('mouseMoved', x, y, 0); await p.mouse('mousePressed', x, y); await sleep(120)
      const st = await p.js<PillState>(pillState(sel))
      await p.mouse('mouseMoved', x, y + 200); await p.mouse('mouseReleased', x, y + 200); await sleep(150)
      return st
    }
    const one = await mouse(MORE)
    check(`press: a one-button group sinks whole to --press-sink-fine:${mode}`, fine && token > .9 && token < 1 && one.n === 1 && Math.abs(one.group - token) < 1e-3 && one.btn === 1,
      `fine pointer ${fine}, token ${token}, ${JSON.stringify(one)}`)
    const rest = await p.js<PillState>(pillState(MULTI)), many = await mouse(MULTI)
    check(`press: a button among several takes the fill and doesn't sink:${mode}`, many.n > 1 && many.btn === 1 && many.group === 1 && many.bg !== rest.bg,
      `rest ${rest.bg}, pressed ${JSON.stringify(many)}`)

    await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
    const reduced = await p.waitFor(`document.documentElement.dataset.motion === 'reduce'`, 5000)
    const still = await mouse(MORE)
    const touchToken = await p.js<string>(`getComputedStyle(document.documentElement).getPropertyValue('--press-sink').trim()`)
    check(`press: no sink under reduced motion:${mode}`, reduced && still.btn === 1 && still.group === 1 && touchToken === '1', `data-motion reduce ${reduced}, ${JSON.stringify(still)}, --press-sink ${touchToken}`)
  } finally {
    await p.close()
  }
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
      const swatch = await tabTo(p, '.theme-swatches [role=option]', 6)
      await press(p, 'End'); const swEnd = await is(p, '.theme-swatches [role=option]:last-child')
      await press(p, 'Home'); const swHome = await is(p, '.theme-swatches [role=option]:first-child')
      check(`theme: swatches Home / End:${mode}`, swatch && swEnd && swHome, `${await active(p)}, End ${swEnd}, Home ${swHome}`)
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
      check(`palette: Ctrl-K, focus in the field of a modal dialog:${mode}`, (await is(p, '.pal-input')) && (await p.js<boolean>(`!!document.querySelector('dialog.pal-backdrop:modal')`)), await active(p))
      await press(p, 'Escape')
      await sleep(200)
      check(`palette: Escape back:${mode}`, !(await p.js<boolean>(`!!document.querySelector('.pal')`)) && (await is(p, '.theme-menu-btn')), await active(p))

      // the shell: a modal dialog with focus in its line; Escape gives focus back
      await press(p, '`')
      const shell = await p.waitFor(`!!document.querySelector('dialog.pal-shell:modal') && !!document.activeElement?.matches('.pal-shell-input')`, 10000)
      await press(p, 'Escape')
      await sleep(200)
      check(`shell: modal, Escape back:${mode}`, shell && !(await p.js<boolean>(`!!document.querySelector('.pal-shell')`)) && (await is(p, '.theme-menu-btn')), await active(p))

      // DISPLAY ▾: ↓ opens it on the current skin, Escape closes it with focus back on the button
      await p.js(`document.querySelector('.skin-switch .skin-menu-btn')?.focus(); 1`)
      await press(p, 'ArrowDown')
      const skin = await p.js<boolean>(`!!document.querySelector('.skin-menu')?.contains(document.activeElement) && document.activeElement.getAttribute('aria-checked') === 'true' && document.querySelector('.skin-switch .skin-menu-btn').getAttribute('aria-controls') === document.querySelector('.skin-menu').id`)
      await press(p, 'Escape')
      check(`display: ↓ opens on the current skin:${mode}`, skin && !(await p.js<boolean>(`!!document.querySelector('.skin-menu')`)) && (await is(p, '.skin-switch .skin-menu-btn')), await active(p))

      // the board groups are tabs: → opens the next group (it takes focus and the one tab stop) and names the boards panel
      const g0 = await p.js<string>(`document.querySelector('.board-group-tabs [role=tab][aria-selected=true]')?.id ?? ''`)
      await p.js(`document.querySelector('.board-group-tabs [role=tab][aria-selected=true]')?.focus(); 1`)
      await press(p, 'ArrowRight')
      const groups = await p.js<{ tab: boolean; stop: boolean; panel: boolean }>(`(() => { const a = document.activeElement, panel = document.querySelector('.board-tabs[role=tabpanel]')
        return { tab: a?.getAttribute('role') === 'tab' && a.getAttribute('aria-selected') === 'true' && a.id !== ${q(g0)}, stop: a?.tabIndex === 0 && document.querySelectorAll('.board-group-tabs [tabindex="0"]').length === 1, panel: !!panel && panel.getAttribute('aria-labelledby') === a?.id } })()`)
      await press(p, 'ArrowLeft')
      check(`board groups: tabs and a panel:${mode}`, !!g0 && groups.tab && groups.stop && groups.panel && (await p.js<string>('document.activeElement?.id')) === g0, JSON.stringify(groups))

      // the first card's row on ALL: a toolbar with one Tab stop (#43); → walks three named actions, then MORE's menu
      const names: string[] = []
      if (await tabTo(p, '.browse-item .dot-card-row-open', 80)) {
        for (let i = 0; i < 3; i++) { const a = await axOf(p); names.push(`${a.name}${(await ringed(p)) ? '' : ' (no ring)'}`); if (i < 2) await press(p, 'ArrowRight') }
      }
      check(`row:${mode}`, names.length === 3 && /^Open /.test(names[0]) && /^Copy link to /.test(names[1]) && /^More for /.test(names[2]) && !names.some(n => n.includes('no ring')), names.join(' | '))
      // one stop: Tab from MORE leaves the row, and Shift+Tab comes back to MORE, the action focused last
      await press(p, 'Tab')
      const left = await p.js<boolean>(`!document.activeElement?.closest('.browse-item')?.matches('.browse-item:first-child')`)
      await press(p, 'Tab', 8)
      const rowBack = await is(p, '.browse-item:first-child .dot-card-row-more')
      check(`row-stop:${mode}`, left && rowBack && (await p.js<number>(`document.querySelectorAll('.browse-item:first-child .dot-card-row [tabindex="0"]').length`)) === 1, `Tab leaves the row ${left}, Shift+Tab back on MORE ${rowBack}`)
      await press(p, 'Enter')
      const first = await p.waitFor(`document.activeElement?.matches('.dot-card-menu [role^=menuitem]') && document.activeElement === document.querySelector('.dot-card-menu [role^=menuitem]')`, 5000)
      await press(p, 'ArrowDown')
      const moved = await p.js<boolean>(`document.activeElement?.matches('.dot-card-menu [role^=menuitem]') && document.activeElement !== document.querySelector('.dot-card-menu [role^=menuitem]')`)
      await shot(p, `row-menu-${mode}`)
      await press(p, 'Escape')
      check(`row-menu:${mode}`, first && moved && !(await p.js<boolean>(`!!document.querySelector('.dot-card-menu')`)) && (await is(p, '.dot-card-row-more')), `first item ${first}, ↓ moves ${moved}, back on ${await active(p)}`)
      // ↑ opens on the last item; the button points at the menu; a letter moves to the item it starts; a press outside closes
      await press(p, 'ArrowUp')
      const rm = await p.js<{ last: boolean; controls: boolean; ch: string }>(`(() => { const m = document.querySelector('.dot-card-menu'), it = [...(m?.querySelectorAll('[role^=menuitem]') ?? [])]
        return { last: it.length > 1 && document.activeElement === it[it.length - 1], controls: !!m && document.activeElement?.closest('.dot-card-row')?.querySelector('.dot-card-row-more')?.getAttribute('aria-controls') === m.id, ch: (it[0]?.textContent ?? '').trim().charAt(0).toLowerCase() } })()`)
      if (rm.ch) await letter(p, rm.ch)
      const typed = await p.js<boolean>(`document.activeElement === document.querySelector('.dot-card-menu [role^=menuitem]')`)
      // a press on plain page (no control, no card) outside the menu
      const [ox, oy] = await p.js<[number, number]>(`(() => { for (const [x, y] of [[2, 400], [1276, 400], [2, 796], [640, 796], [2, 2]]) { const e = document.elementFromPoint(x, y); if (e && !e.closest('a, button, input, [tabindex="0"], .dot-card, .dot-card-menu')) return [x, y] } return [2, 400] })()`)
      await p.mouse('mousePressed', ox, oy); await p.mouse('mouseReleased', ox, oy); await sleep(200)
      check(`row-menu: ↑, aria-controls, a letter, a press outside:${mode}`, rm.last && rm.controls && typed && !(await p.js<boolean>(`!!document.querySelector('.dot-card-menu')`)), JSON.stringify({ ...rm, typed }))

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
      // ↓ opens it too, and the button points at the menu
      await press(p, 'ArrowDown')
      const down = await p.js<boolean>(`(() => { const m = document.querySelector('.wp-more'); return !!m && m.contains(document.activeElement) && document.querySelector('.wp-more-btn').getAttribute('aria-controls') === m.id })()`)
      await press(p, 'Escape')
      check(`wp-more: ↓ opens, aria-controls:${mode}`, down && (await is(p, '.wp-more-btn')), await active(p))
      // the pill bar: Home and End jump to its ends
      const ends = `[...(document.activeElement?.closest('.pill-bar')?.querySelectorAll('.pill-btn') ?? [])].filter(b => b.offsetParent)`
      await press(p, 'Home'); const barHome = await p.js<boolean>(`(${ends})[0] === document.activeElement`)
      await press(p, 'End'); const barEnd = await p.js<boolean>(`(a => a.length > 1 && a[a.length - 1] === document.activeElement)(${ends})`)
      check(`pill bar: Home / End:${mode}`, barHome && barEnd, `Home ${barHome}, End ${barEnd}, on ${await active(p)}`)
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
      ['tools', '.tabbar button[aria-haspopup=dialog]', 'dialog.tools-sheet:modal'],
      ['boards', '.topbar-place', 'dialog.board-sheet:modal'],
      ['search', '.topbar-search', 'dialog.pal-backdrop:modal'],
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
    // every control outside the cards has a 44 × 44 touch area (its box, or a larger ::before / ::after hit area)
    for (const [name, path, ready] of PAGES.filter(([n]) => n !== 'post')) {
      if (!(await load(p, base + path, ready))) { check(`tap44:${name}`, false, 'not ready in 30 s'); continue }
      const small = await p.js<string[]>(`(() => {
        const out = []
        for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, summary, [role=tab], [role=switch], [tabindex="0"]')) {
          const s = getComputedStyle(el), r = el.getBoundingClientRect()
          if (s.display === 'none' || s.visibility === 'hidden' || r.width < 2 || r.height < 2 || el.closest('.dot-card, .sr-only, [inert], [aria-hidden="true"], .skip-link')) continue
          // in a sentence (its paragraph flows as text and says more than the target) or MAKE's frame names on the canvas
          // (each frame is also a 44 px row in LAYERS): the WCAG 2.5.5 inline and equivalent exceptions
          const para = el.closest('p, li')
          if (para && !/flex|grid/.test(getComputedStyle(para).display) && para.innerText.trim().length > el.innerText.trim().length + 12) continue
          if (el.matches('.ed-flabel')) continue
          let w = r.width, h = r.height
          for (const pe of ['::before', '::after']) { const ps = getComputedStyle(el, pe); if (ps.content !== 'none' && ps.position === 'absolute' && ps.pointerEvents !== 'none') { w = Math.max(w, parseFloat(ps.width) || 0); h = Math.max(h, parseFloat(ps.height) || 0) } }
          if (Math.min(w, h) < 43.5) out.push(el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\\s+/)[0] : '') + (el.textContent.trim() ? ' "' + el.textContent.trim().slice(0, 14) + '"' : '') + ' ' + Math.round(w) + '×' + Math.round(h))
        }
        return [...new Set(out)]
      })()`)
      check(`tap44:${name}`, !small.length, small.length ? `${small.length} under 44 px: ${small.slice(0, 8).join(' | ')}` : 'every control')
    }
  } finally {
    await p.close()
  }
}

try {
  if (ONLY.includes('desktop')) { await desktop(); await pressSink(MODES[0]) }
  if (ONLY.includes('phone')) await phone()
} finally {
  server?.stop()
}
done()
process.exit(0)
