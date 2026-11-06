/**
 * Live-bug probe in headless Chrome over CDP (scripts/lib/cdp.ts), on a visitor-like page (no test hooks):
 *  - a missing board chunk (the motion board's, answered 404 as after a new deploy) costs a handful of requests at
 *    most on BROWSE, the board and a card page: the page reloads once (src/site/stale-deploy.ts), the loader tries
 *    each chunk three times, then the card or board shows its error state (src/components/LoadBoundary.tsx);
 *  - the SURFACES and LOCK boards draw dots on every card and keep the main thread free (no long frame gaps).
 * `--shots <dir>` saves the PR screenshots there.
 *
 * Needs a build: `npx vite build`, then `npx tsx scripts/site/chunks-browser.ts [--shots <dir>]` (it serves dist/).
 */
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, serveDist, sleep, type Page } from '../lib/cdp'
import { checker } from '../lib/check'
import { catalog } from '../../src/widgets/catalog'

const { assert, done } = checker('chunks')
const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : undefined
if (shots) mkdirSync(shots, { recursive: true })
const shot = async (p: Page, name: string) => { if (shots) await p.shot(join(shots, `${name}.png`)) }
/** More fetches than this for one missing chunk is a retry loop (3 tries before the reload, 3 after, some slack). */
const MAX_TRIES = 8

const chunk = readdirSync('dist/assets').find(f => /^motion-[\w-]+\.js$/.test(f))
if (!chunk) throw new Error('no motion board chunk in dist/assets: run `npx vite build` first')
const motionCard = catalog.find(r => r[2] === 'motion')![0]

/** Count of requests for the motion chunk, each answered 404. */
async function breakChunk(p: Page): Promise<{ n: number }> {
  const hits = { n: 0 }
  p.on('Fetch.requestPaused', e => {
    hits.n++
    void p.cdp('Fetch.fulfillRequest', { requestId: e.requestId, responseCode: 404, body: Buffer.from('gone').toString('base64') }).catch(() => {})
  })
  await p.cdp('Fetch.enable', { patterns: [{ urlPattern: `*/assets/${chunk}*` }] })
  return hits
}
const quiet = async (p: Page, base: string) => {
  await p.cdp('Page.navigate', { url: `${base}robots.txt` }); await sleep(300)
  await p.js(`(localStorage.setItem('dot480:intro', 'off'), sessionStorage.clear(), 1)`)
}

const { url: base, stop } = await serveDist(4331)
try {
  // ── a chunk gone with an old deploy ──
  for (const [where, path, failed] of [
    ['browse', 'browse/?in=motion', `document.querySelectorAll('.browse-item > .load-failed').length > 0`],
    ['board', 'motion/', `!!document.querySelector('.board-view .load-failed')`],
    ['card page', `widget/${motionCard}/`, `!!document.querySelector('.wp--missing, .load-failed, .root-crash')`],
  ] as const) {
    const p = await launch(1280, 900, { flags: { make: false, lab: false }, testHooks: false })
    try {
      await quiet(p, base)
      const hits = await breakChunk(p)
      await p.cdp('Page.navigate', { url: base + path })
      const shown = await p.waitFor(failed, 20000)
      await sleep(6000) // a loop would keep fetching here
      const reloaded = await p.js<boolean>(`!!sessionStorage.getItem('dot480:stale-reload')`)
      assert(`missing chunk, ${where}: the error state shows`, shown)
      assert(`missing chunk, ${where}: at most ${MAX_TRIES} requests for it`, hits.n > 0 && hits.n <= MAX_TRIES, `${hits.n} requests`)
      assert(`missing chunk, ${where}: the page reloaded once for the new deploy`, reloaded)
      if (where === 'browse') {
        await p.js(`document.querySelector('.browse-item')?.scrollIntoView({ block: 'center' }), 1`); await sleep(400)
        await shot(p, 'browse-missing-chunk')
      }
    } finally { await p.close() }
  }

  // ── SURFACES and LOCK draw dots and keep the page responsive ──
  for (const board of ['surfaces', 'lock']) {
    const p = await launch(1280, 900, { flags: { make: false, lab: false }, testHooks: false })
    try {
      await quiet(p, base)
      await p.cdp('Page.navigate', { url: `${base}${board}/` })
      assert(`${board}: the cards mount`, await p.waitFor(`document.querySelectorAll('.board-grid canvas').length > 0`, 20000))
      await sleep(3000)
      // the longest gap between animation frames over 4 s: a blocked main thread shows as one long gap
      const gap = await p.js<number>(`new Promise(r => { let last = performance.now(), max = 0; const end = last + 4000
        const f = now => { max = Math.max(max, now - last); last = now; now < end ? requestAnimationFrame(f) : r(Math.round(max)) }; requestAnimationFrame(f) })`, 30000)
      assert(`${board}: the main thread stays free (longest frame gap under 500 ms)`, gap < 500, `${gap} ms`)
      // lit pixels per card canvas, read through a 2D copy (cards draw with 2D, a worker bitmap or WebGL)
      const lit = await p.js<number[]>(`[...document.querySelectorAll('.board-grid .dot-card')].map(card => {
        const c = card.querySelector('canvas'); if (!c || !c.width) return 0
        const o = document.createElement('canvas'); o.width = c.width; o.height = c.height
        const g = o.getContext('2d'); g.drawImage(c, 0, 0); const d = g.getImageData(0, 0, o.width, o.height).data
        let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n })`)
      assert(`${board}: every card draws dots`, lit.length > 0 && lit.every(n => n > 200), lit.join(' '))
      assert(`${board}: no page errors`, !p.logs.length, p.logs.slice(0, 3).join(' | '))
      await shot(p, `${board}-1280`)
    } finally { await p.close() }
  }
} finally { stop() }
done()
