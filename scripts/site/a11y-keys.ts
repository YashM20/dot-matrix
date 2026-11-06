/**
 * Keyboard walk (#187, #208): Tab, Enter and Escape only, at 1280 × 800 in dark and light. On the home page the
 * first Tab shows SKIP TO CONTENT and Enter moves focus into `<main>`; Tab reaches the header's view tabs with a
 * visible focus ring; the THEME popover opens from the keyboard with focus inside and Escape sends focus back
 * to THEME; ⌘K / Ctrl-K opens the palette with focus in its field and Escape sends focus back. The header,
 * `<main>` and the footer are landmarks of their own (the header and footer sit outside `<main>`).
 *
 *   npx vite build && npx tsx scripts/site/a11y-keys.ts            → serves dist/ on port 4328 for the run
 *   npx tsx scripts/site/a11y-keys.ts http://localhost:5173/        → any running site
 *   flags: --modes dark,light (default both), --shots <dir> (a PNG per step and mode). Not in CI yet.
 */
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, serveDist, sleep, type Page } from '../lib/cdp'
import { checker } from '../lib/check'

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const MODES = (flag('--modes') ?? 'dark,light').split(',')
const shots = flag('--shots')
if (shots) mkdirSync(shots, { recursive: true })

const KEYS: Record<string, [string, number, string?]> = { Tab: ['Tab', 9], Enter: ['Enter', 13, '\r'], Escape: ['Escape', 27], k: ['KeyK', 75, 'k'] }
async function press(p: Page, key: string, modifiers = 0) {
  const [code, vk, text] = KEYS[key]
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, modifiers, ...(text && !modifiers ? { text } : {}) })
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, modifiers })
  await sleep(150)
}
/** Tab until `sel` has focus (at most `max` presses); true when it got there. */
async function tabTo(p: Page, sel: string, max = 40) {
  for (let i = 0; i < max; i++) {
    if (await p.js<boolean>(`!!document.activeElement?.matches(${JSON.stringify(sel)})`)) return true
    await press(p, 'Tab')
  }
  return p.js<boolean>(`!!document.activeElement?.matches(${JSON.stringify(sel)})`)
}
const active = (p: Page) => p.js<string>(`(() => { const a = document.activeElement; return a ? a.tagName.toLowerCase() + (a.id ? '#' + a.id : '') + (a.className && typeof a.className === 'string' ? '.' + a.className.trim().split(/\\s+/).join('.') : '') : '' })()`)
/** The focused element shows a ring: an outline or a box shadow while it matches :focus-visible. */
const ringed = (p: Page) => p.js<boolean>(`(() => { const a = document.activeElement; if (!a || !a.matches(':focus-visible')) return false; const s = getComputedStyle(a); return (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none' })()`)

if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const given = args.find(a => /^https?:/.test(a))
const server = given ? undefined : await serveDist(4328)
const base = (given ?? server!.url).replace(/\/?$/, '/')
const { assert: check, done } = checker('a11y-keys')
const p = await launch(1280, 800)
try {
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false })
  for (const mode of MODES) {
    console.log(`\n${mode}`)
    await p.cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] })
    await p.cdp('Page.navigate', { url: base })
    await p.waitFor(`document.readyState === 'complete' && !document.querySelector('.view-loading') && !!document.querySelector('.board-grid .dot-card')`, 30000)
    await sleep(1500)
    const marks = await p.js<string[]>(`[...document.querySelectorAll('header, main, footer, nav')].filter(e => !e.closest('main') || e.tagName === 'MAIN').map(e => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''))`)
    check(`landmarks:${mode}`, ['header.topbar', 'main', 'footer.bottom'].every(m => marks.includes(m)), marks.join(' '))

    await press(p, 'Tab')
    const skip = await p.js<number>(`(() => { const a = document.activeElement; return a?.matches('.skip-link') ? a.getBoundingClientRect().width : 0 })()`)
    check(`skip link first:${mode}`, skip > 40, `${await active(p)}, ${Math.round(skip)} px wide`)
    if (shots) await p.shot(join(shots, `skip-${mode}.png`))
    await press(p, 'Enter')
    check(`skip link lands in main:${mode}`, await p.js<boolean>(`document.activeElement?.id === 'main'`), await active(p))

    await p.js(`document.querySelector('.skip-link').focus()`) // back to the top of the Tab order
    const tab = await tabTo(p, '.view-tabs [role=tab]')
    check(`header view tab by Tab:${mode}`, tab && await ringed(p), await active(p))
    await press(p, 'Tab') // on to the next header link, so the shot shows a ring away from the selected tab
    if (shots) await p.shot(join(shots, `nav-${mode}.png`))

    const theme = await tabTo(p, '.theme-menu-btn')
    await press(p, 'Enter')
    await p.waitFor(`!!document.querySelector('dialog.theme-pop[open]')?.contains(document.activeElement)`, 5000)
    const inside = await p.js<boolean>(`!!document.querySelector('dialog.theme-pop[open]')?.contains(document.activeElement)`)
    check(`theme popover: focus inside:${mode}`, theme && inside && await ringed(p), await active(p))
    await press(p, 'Tab')
    if (shots) await p.shot(join(shots, `theme-${mode}.png`))
    await press(p, 'Escape')
    check(`theme popover: Escape closes, focus back on THEME:${mode}`, !(await p.js<boolean>(`!!document.querySelector('.theme-pop')`)) && await p.js<boolean>(`!!document.activeElement?.matches('.theme-menu-btn')`), await active(p))

    await press(p, 'k', 2) // Ctrl
    await p.waitFor(`!!document.querySelector('.pal [role=combobox]') && document.activeElement?.matches('.pal-input')`, 8000)
    check(`palette: Ctrl-K opens with focus in the field:${mode}`, await p.js<boolean>(`!!document.activeElement?.matches('.pal-input')`), await active(p))
    await press(p, 'Escape')
    await sleep(200)
    check(`palette: Escape closes, focus back:${mode}`, !(await p.js<boolean>(`!!document.querySelector('.pal')`)) && await p.js<boolean>(`!!document.activeElement?.matches('.theme-menu-btn')`), await active(p))
  }
} finally {
  await p.close()
  server?.stop()
}
done()
process.exit(0)
