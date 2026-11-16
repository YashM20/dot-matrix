/** E5 (share links, lineage, EXPORT · DEVICES and QUALITY) on desktop and on the phone (scripts/editor-browser.ts). */
import { join } from 'node:path'
import { addFrame, addLayer, blankCard, EDITOR_KEY, EDITOR_VERSION, encodeCells } from '../../src/components/editor/doc'
import { paintLayer } from '../../src/components/studio/doc'
import { sleep, type Page } from '../lib/cdp'
import { base, check, out, PROGRAM, type Helpers } from './shared'

// ── E5: share. Frame and document links (made, opened once, kept across a reload and Back), their lineage in
//    CODE, the remix graph, EXPORT · DEVICES (every toDevice profile, exported) and QUALITY (scorecard, bar
//    sheet, loaded with the fold), a link too big for a URL, a corrupt link.
/** A document whose one frame holds 160×160 cells of noise: its link would be far past the cap. */
function bigDoc(): string {
  const card = blankCard({ cols: 160, rows: 160, pitch: 4 }, 'noise'), pl = paintLayer(card.grid, { name: 'noise', lattice: 1 }), cells = new Uint8Array(pl.cols * pl.rows)
  let s = 11
  for (let i = 0; i < cells.length; i++) { s = (s * 1103515245 + 12345) >>> 0; cells[i] = s >>> 24 }
  const d = addFrame({ kind: 'dot480.editor', v: EDITOR_VERSION, name: 'big', frames: [] }, card, { at: { x: 0, y: 0 } }).doc
  return JSON.stringify(addLayer(d, d.frames[0].id, { ...pl, cells: encodeCells(cells) }))
}
export const linkRe = /\?make&d=[zb][A-Za-z0-9_-]+$/
/** EXPORT's fold opened by hand (its chunk loads then). */
const openFold = (p: Page, id: string) => p.js(`(() => { const d = document.querySelector('details[data-fold="${id}"]'); if (!d) throw new Error('no fold ${id}'); d.open = true })()`)
const reviewLoaded = (p: Page) => p.js<boolean>(`performance.getEntriesByType('resource').some(e => /\\/Review-[^/]*\\.js/.test(e.name))`)
async function e5Folds(p: Page, h: Helpers, who: string) {
  await openFold(p, 'editor-export-devices')
  const drawn = await p.waitFor(`(() => { const cs = [...document.querySelectorAll('.ed-insp .ed-devices canvas')]; return cs.length === 5 && cs.every(c => c.width > 0) && cs.some(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] > 120) return true; return false }) })()`, 30000)
  check(`${who}: EXPORT · DEVICES draws the frame on every device profile (toDevice)`, drawn && await reviewLoaded(p), (await p.js<string[]>(`[...document.querySelectorAll('.ed-insp .ed-devices figcaption')].map(f => f.textContent)`)).join(' | '))
  await openFold(p, 'editor-export-quality')
  const scored = await p.waitFor(`document.querySelectorAll('.ed-insp .ed-score li').length === 4 && /GATES PASS/.test(document.querySelector('.ed-insp .ed-score-sum')?.textContent ?? '')`, 30000)
  const bar = await p.waitFor(`(document.querySelector('.ed-insp .ed-bar canvas')?.width ?? 0) > 400`, 30000)
  check(`${who}: EXPORT · QUALITY shows the scorecard (4 gates, metrics) and draws the bar sheet`, scored && bar, await h.text('.ed-insp .ed-score-sum'))
}

export async function desktopE5(p: Page, h: Helpers) {
  console.log('  · E5')
  const sel = () => p.js<string | undefined>(`window.__editor?.sel`)
  const count = async () => (await h.frameIds()).length
  // fold choices are remembered: start with both folded, so the review chunk loads only when one opens
  await p.cdp('Page.navigate', { url: `${base}?make` }); await p.waitFor(`!!document.querySelector('.ed-frame')`, 60000)
  await p.js(`localStorage.removeItem('dot480.editor.v1'); localStorage.removeItem('dot480.editor.links'); for (const k of ['editor-export-devices', 'editor-export-quality']) localStorage.removeItem('dot480:fold:' + k)`)
  await p.cdp('Page.reload'); await p.waitFor(`document.querySelectorAll('.ed-frame').length === 3`, 60000); await sleep(900)
  const [f0] = await h.frameIds(), n0 = await count()
  await p.js(`document.querySelector('[data-frame-label="${f0}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await sleep(300)
  check('E5: EXPORT has a LINK section, and the review folds are folded and not loaded', await p.js(`!!document.querySelector('.ed-insp section[aria-label="LINK"]')`) && !(await reviewLoaded(p)))
  await p.js(`window.__editorLink = ''`)
  await h.clickText('.ed-insp button', 'FRAME LINK')
  await p.waitFor(`/\\?make&d=/.test(window.__editorLink ?? '')`, 15000)
  const link = await p.js<string>(`window.__editorLink`), info = await h.text('.ed-insp .ed-url'), id = /#([0-9a-f]{8})/.exec(info)?.[1] ?? ''
  check('E5: FRAME LINK makes a deflated ?make&d=… link under the cap, shown with its length and id', linkRe.test(link) && link.length < 12000 && /FRAME LINK \d+ CHARS · DEFLATE · #[0-9a-f]{8}/.test(info) && await p.js(`document.querySelector('.ed-insp .ed-link-url').value`) === link, `${link.length} chars; ${info}`)

  // #143: the link asks first. Nothing is added while it waits, KEEP has the focus, Esc dismisses (nothing added)
  await sleep(700); await p.cdp('Page.navigate', { url: link })
  const asked = await p.waitFor(`!!document.querySelector('.ed-confirm')`, 30000); await sleep(600)
  const prompt = await h.text('.ed-confirm'), waiting = await count(), focused = await p.js<boolean>(`document.activeElement?.classList.contains('ed-confirm-keep') ?? false`)
  await p.key('Escape', 'Escape', 27); await sleep(400)
  check('#143: a frame link asks first (what it holds, KEEP focused); nothing is added while it waits, and Esc dismisses it', asked && /OPEN THIS LINK\?/.test(prompt) && /Open frame ".+" from a link/.test(prompt) && focused && waiting === n0 && !(await p.js(`!!document.querySelector('.ed-confirm')`)) && await count() === n0, `${prompt}; ${waiting} frames; focus ${focused}`)
  // open it: one new frame, selected, drawn; a reload and Back keep it to one
  const opened = await h.keep(link, `document.querySelectorAll('.ed-frame').length === ${n0 + 1} && !!window.__editor?.sel`, join(out, 'desktop-e5-confirm.png'))
  const ids1 = await h.frameIds(), got = ids1.find(x => x !== f0 && x === (ids1[ids1.length - 1]))!
  check('E5: opening the frame link adds the frame once, selects it and draws it', opened && await sel() === got && (await h.lit(got)).n > 500, `${n0} → ${ids1.length}; sel ${await sel()}`)
  await sleep(700); await p.cdp('Page.reload')
  await p.waitFor(`document.querySelectorAll('.ed-frame').length >= ${n0 + 1} && window.__editor?.sel === ${JSON.stringify(got)}`, 30000); await sleep(800)
  check('E5: a reload of the link re-selects its frame instead of adding a copy', await count() === n0 + 1 && await sel() === got, `${await count()} frames, sel ${await sel()}`)
  await p.js(`document.querySelector('#tab-EXPLORE').click()`); await sleep(900)
  const away = await p.js<string>('location.search')
  await p.js(`history.back()`)
  await p.waitFor(`!!document.querySelector('.ed-frame') && document.querySelectorAll('.ed-frame').length >= ${n0 + 1}`, 30000); await sleep(1000)
  check('E5: leaving MAKE drops the link from the URL; Back brings it and the editor back, still one copy', !/d=/.test(away) && /[?&]d=/.test(await p.js<string>('location.search')) && await count() === n0 + 1, `away ${away}; back ${await p.js<string>('location.search')}; ${await count()} frames`)

  // lineage: CODE names the link it came from; changed, its new link is a remix of it
  await p.js(`document.querySelector('[data-frame-label="${got}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'CODE'); await sleep(300)
  const lin = await h.text('.ed-insp .ed-lineage--list')
  check('E5: CODE shows the frame\'s link lineage (opened from #id)', !!id && lin.includes(`OPENED FROM #${id}`), lin)
  await h.clickText('.ed-right [role=tab]', 'DESIGN'); await h.setLabeled('NAME', 'level 03 remix'); await sleep(300)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await h.clickText('.ed-insp button', 'FRAME LINK'); await sleep(800)
  const remix = await h.text('.ed-insp .ed-url')
  check('E5: a changed frame\'s link records the link it came from (REMIX OF #id)', remix.includes(`REMIX OF #${id}`) && !remix.includes(`#${id} ·`), remix)

  // the whole document from the top bar, opened in a fresh browser profile's canvas
  await p.key('Escape', 'Escape', 27); await p.key('Escape', 'Escape', 27); await sleep(200)
  const nDoc = await count()
  await p.js(`window.__editorLink = ''`)
  await h.clickText('.ed-top button', 'SHARE'); await p.waitFor(`/\\?make&d=/.test(window.__editorLink ?? '')`, 15000)
  const docLink = await p.js<string>(`window.__editorLink`), note = await h.text('.ed-note')
  check('E5: SHARE with nothing selected copies a link of the whole document', !(await sel()) && linkRe.test(docLink) && /whole document/.test(note), `${docLink.length} chars; ${note}`)
  await sleep(700); await p.js(`localStorage.removeItem('dot480.editor.v1')`)
  const docOpened = await h.keep(docLink, `document.querySelectorAll('.ed-frame').length >= ${3 + nDoc}`)
  check('E5: the document link opens every frame (beside the starter canvas of a fresh visit)', docOpened, `${await count()} frames, want ${3 + nDoc}`)

  // the review folds: every device, exported; the scorecard and the bar sheet
  await p.js(`document.querySelector('[data-frame-label="${(await h.frameIds())[0]}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await sleep(300)
  await e5Folds(p, h, 'E5')
  const before = p.downloads.length
  await h.clickText('.ed-insp button', 'EXPORT ALL DEVICES')
  const all = await h.downloaded(() => p.downloads.slice(before).filter(d => d.name.endsWith('.png')).length >= 5 && p.downloads.slice(before).some(d => d.name.endsWith('-plotter-device.svg')), 30000)
  check('E5: EXPORT ALL DEVICES writes a PNG per device (TRMNL at 800×480) and the plotter\'s pen plan', all && p.downloads.slice(before).some(d => d.name.endsWith('-trmnl-800x480.png')), p.downloads.slice(before).map(d => d.name).join(', '))
  await p.shot(join(out, 'desktop-e5-export.png'))

  // a link past the cap: refused with the reason; a corrupt link: a banner
  await p.js(`localStorage.setItem(${JSON.stringify(EDITOR_KEY)}, ${JSON.stringify(bigDoc())})`); await p.cdp('Page.navigate', { url: `${base}?make` })
  await p.waitFor(`document.querySelectorAll('.ed-frame').length === 1`, 60000); await sleep(800)
  await p.js(`document.querySelector('[data-frame-label="${(await h.frameIds())[0]}"]').click()`); await sleep(200)
  await h.clickText('.ed-right [role=tab]', 'EXPORT'); await h.clickText('.ed-insp button', 'FRAME LINK'); await sleep(1500)
  check('E5: a frame too big for a link is refused with its length (DOWNLOAD JSON offered)', /more than 12000/.test(await h.text('.ed-insp .ed-bad')) && /DOWNLOAD JSON/.test(await h.text('.ed-insp .ed-bad')), await h.text('.ed-insp .ed-bad'))
  await p.cdp('Page.navigate', { url: `${base}?make&d=zNotARealLink` })
  check('E5: a corrupt frame link shows an error banner and adds nothing', await p.waitFor(`/Could not open/.test(document.querySelector('.ed-banner')?.textContent ?? '')`, 30000) && await count() === 1, await h.text('.ed-banner'))

  // remix graph: a changed program's link goes under the program it came from; a node opens a program
  check('E5: ?make=code opens a code layer', await h.fresh(`${base}?make=code`) && await p.waitFor(`!!document.querySelector('.ed-insp .dw-code textarea')`))
  await p.waitFor(`Number(document.querySelector('.ed-insp .ed-graph canvas')?.dataset.nodes) >= 8`, 15000)
  const nodes0 = Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.nodes`))
  await h.typeIR(PROGRAM.replace('blobs:', 'blobs e5:')); await h.blur()
  // the link is encoded (debounced) after the typing: COPY LINK is enabled once it is ready
  await p.waitFor(`(() => { const b = [...document.querySelectorAll('.ed-insp button')].find(b => b.textContent.trim() === 'COPY LINK'); return !!b && !b.disabled })()`, 30000)
  await h.clickText('.ed-insp button', 'COPY LINK')
  await p.waitFor(`Number(document.querySelector('.ed-insp .ed-graph canvas')?.dataset.nodes) === ${nodes0 + 1}`, 30000)
  const remixes = await p.js<string[]>(`[...document.querySelectorAll('.ed-insp .ed-remixes button')].map(b => b.textContent)`)
  check('E5: COPY LINK puts the program in the remix graph, under the example it came from', remixes.length >= 1 && remixes.some(r => /^blobs e5.*← #[0-9a-f]{8}/.test(r)) && Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.nodes`)) === nodes0 + 1, `nodes ${nodes0}; ${remixes.join(' | ')}`)
  await p.js(`document.querySelector('.ed-insp .ed-graph canvas').scrollIntoView({ block: 'center' })`); await sleep(300) // REMIX sits below the code editor
  const n1 = await count(), g = (await h.rect('.ed-insp .ed-graph canvas'))!, cols = Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.cols`)), rows = Number(await p.js(`document.querySelector('.ed-insp .ed-graph canvas').dataset.rows`))
  // the second example's thumbnail: slot 1 of row 0 (centre at lattice cell 32, 11 on a 2× lattice)
  await p.mouse('mouseMoved', g.x + g.w * (64 / cols), g.y + g.h * (22 / rows), 0); await p.mouse('mousePressed', g.x + g.w * (64 / cols), g.y + g.h * (22 / rows)); await p.mouse('mouseReleased', g.x + g.w * (64 / cols), g.y + g.h * (22 / rows)); await p.waitFor(`document.querySelectorAll('.ed-frame').length === ${n1 + 1}`, 15000)
  check('E5: a click on a node in the remix graph opens that program as a frame', await count() === n1 + 1, `${n1} → ${await count()}`)
  await p.shot(join(out, 'desktop-e5-remix.png'))

  // #143: a render crash anywhere in the editor shows the recovery screen; RESET EDITOR DOCUMENT reloads a fresh document
  await p.js(`window.__editorCrash = true`); await p.key('?', 'Slash', 191)
  const crashed = await p.waitFor(`!!document.querySelector('.ed-crash[data-area="editor"]')`, 10000)
  const screen = await h.text('.ed-crash[data-area="editor"]')
  await p.shot(join(out, 'desktop-e5-recovery.png'))
  await p.js(`[...document.querySelectorAll('.ed-crash[data-area="editor"] button')].find(b => b.textContent === 'RESET EDITOR DOCUMENT')?.click()`)
  const back = await p.waitFor(`document.querySelectorAll('.ed-frame').length === 3 && !document.querySelector('.ed-crash')`, 60000)
  // the crash was asked for: React and the boundary log it, which the "no console errors" check must not count
  const askedCrash = (l: string) => /the editor was asked to crash/.test(l)
  p.logs.splice(0, p.logs.length, ...p.logs.filter(l => !askedCrash(l)))
  check('#143: a crash in the editor shows the recovery screen (not a blank page); RESET EDITOR DOCUMENT brings back the starter canvas', crashed && /THE EDITOR STOPPED · EDITOR/.test(screen) && /probe: the editor was asked to crash/.test(screen) && back, screen.slice(0, 160))
}

export async function phoneE5(p: Page, h: Helpers, tapEl: (s: string) => Promise<void>) {
  console.log('  · E5')
  const count = async () => (await h.frameIds()).length
  const ok = await h.fresh(`${base}?make`)
  const [, f1] = await h.frameIds(), n0 = await count()
  await p.js(`document.querySelector('[data-frame-label="${f1}"]').click()`); await sleep(300)
  await p.js(`window.__editorLink = ''`)
  await tapEl('.ed-top [aria-label="Share or export"]'); await sleep(900)
  const link = await p.js<string>(`window.__editorLink ?? ''`)
  check('phone E5: SHARE on the selected frame makes a frame link', ok && linkRe.test(link), `${link.length} chars`)
  if (await p.js(`!!document.querySelector('.ed-sheet')`)) await tapEl('.ed-sheet-head [aria-label="Close"]')
  const opened = await h.keep(link, `document.querySelectorAll('.ed-frame').length === ${n0 + 1} && !!window.__editor?.sel`, join(out, 'phone-e5-confirm.png'))
  const got = (await h.frameIds())[n0]
  check('phone E5: the link opens on the phone: one new frame, selected and drawn, no horizontal overflow', opened && await p.js(`window.__editor?.sel`) === got && (await h.lit(got)).n > 100 && await p.js(`document.documentElement.scrollWidth <= 390`))
  await sleep(700); await p.cdp('Page.reload')
  await p.waitFor(`document.querySelectorAll('.ed-frame').length >= ${n0 + 1} && window.__editor?.sel === ${JSON.stringify(got)}`, 30000); await sleep(800)
  check('phone E5: a reload of the link keeps one copy, selected', await count() === n0 + 1 && await p.js(`window.__editor?.sel`) === got)
  await tapEl('.ed-top [aria-label="Leave the editor"]'); await sleep(900)
  const away = await p.js<string>('location.search')
  await p.js(`history.back()`)
  await p.waitFor(`!!document.querySelector('.ed-root.is-phone .ed-frame') && document.querySelectorAll('.ed-frame').length >= ${n0 + 1}`, 30000); await sleep(1000)
  check('phone E5: leaving drops the link from the URL; Back opens the editor on it again, still one copy', !/d=/.test(away) && /[?&]d=/.test(await p.js<string>('location.search')) && await count() === n0 + 1, `away ${away}; ${await count()} frames`)

  // EXPORT · LINK, DEVICES and QUALITY in the sheet
  await p.js(`document.querySelector('[data-frame-label="${got}"]').click()`); await sleep(300)
  await tapEl('.ed-dock [aria-label^="Inspector"]'); await tapEl('.ed-sheet #ed-tab-export')
  await p.js(`document.querySelector('.ed-sheet section[aria-label="LINK"]').scrollIntoView()`); await sleep(200)
  await tapEl('.ed-sheet section[aria-label="LINK"] .ed-row-btns button')
  await p.waitFor(`!!document.querySelector('.ed-sheet .ed-link-url')`, 15000)
  const small = await p.js<string[]>(`[...document.querySelectorAll('.ed-sheet section[aria-label="LINK"] button, .ed-sheet .ed-link-url')].filter(b => b.getBoundingClientRect().height < 44).map(b => b.textContent || b.className)`)
  check('phone E5: EXPORT · LINK in the sheet: the link is shown to copy by hand; its targets are ≥ 44 px', linkRe.test(await p.js<string>(`document.querySelector('.ed-sheet .ed-link-url').value`)) && !small.length, small.join(', '))
  await e5Folds(p, h, 'phone E5')
  check('phone E5: the sheet does not overflow sideways with the review folds open', await p.js(`(() => { const b = document.querySelector('.ed-sheet-body'); return b.scrollWidth <= b.clientWidth + 1 })()`))
  await p.shot(join(out, 'phone-e5-export.png'))
  await tapEl('.ed-sheet-head [aria-label="Close"]')
}
