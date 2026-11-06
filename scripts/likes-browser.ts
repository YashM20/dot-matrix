/**
 * Likes in headless Chrome (#169), against `vite preview` of `dist/` with the likes API mocked in the page (no
 * store, no secrets). With the `likes` flag on (its default): the button renders beside the card without moving it,
 * the first like asks "Remember this browser?" (focus on the sheet, no answer pre-selected), Remember checks in and
 * likes (BotID tags the requests), and the button shows each state: counting soon, already liked, limit reached, likes
 * paused, forgotten. With the flag off (seeded through `launch`, then turned on with `setFlags`), or with the API
 * answering 404, there is no button and no BotID. Gallery programs get buttons too.
 * BotID's challenge is stubbed the way `botid/client/core` reads it (`window.V_C` and its script tag), since its
 * Vercel edge route doesn't exist locally.
 *
 *   npx vite build && npx tsx scripts/likes-browser.ts     → exit 1 on a failure; PNGs in .snapshots/likes/
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'
import { checker } from './lib/check'

if (!findChrome()) { console.log('no Chrome found (set $CHROME)'); process.exit(0) }
const OUT = join(import.meta.dirname, '../.snapshots/likes')
mkdirSync(OUT, { recursive: true })
const uid = (JSON.parse(readFileSync('src/widgets/ids.json', 'utf8')) as Record<string, string>).timer
const { assert, done } = checker('likes browser')

const MOCK = `(() => {
  const q = new URLSearchParams(location.search), st = { mode: q.get('lkmock') || 'ok', liked: {}, calls: [] }
  window.__lk = st
  window.V_C = [{ b: 1, v: 'probe', e: '', d: 0 }]
  // the challenge script's tag, at the exact src BotID builds (URLSearchParams encodes the port's colon), so it skips the load
  document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('script'), u = new URL('/149e9513-01fa-4fb0-aad4-566afd725d1b/2d206a39-8ed7-437e-a3be-862e0f06eea3/a-4-a/c.js', location.origin); u.searchParams.set('i', '0'); u.searchParams.set('v', '3'); u.searchParams.set('h', location.host); s.type = 'text/plain'; s.src = u.pathname + u.search; document.head.appendChild(s) })
  const real = window.fetch.bind(window)
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.startsWith('/api/')) return real(input, init)
    const h = new Headers(init.headers || {}), body = init.body ? JSON.parse(init.body) : null
    st.calls.push({ path: url.pathname, method: init.method || 'GET', human: h.has('x-is-human'), body })
    if (st.mode === 'off') return reply(404, {})
    if (st.mode === 'paused') return reply(503, { error: 'paused' })
    if (url.pathname === '/api/likes/widgets') return reply(200, { w: { ${JSON.stringify(uid)}: 12 } })
    if (url.pathname.startsWith('/api/likes/p/')) return reply(200, { n: 3 })
    if (url.pathname === '/api/like') {
      if (st.mode === 'limit') return reply(429, { error: 'limit' })
      const k = body.item || JSON.stringify(body.program), was = !!st.liked[k]
      if (body.on) { st.liked[k] = true; return reply(200, st.mode === 'already' || was ? { on: true, soon: true, already: true } : { on: true, soon: true }) }
      delete st.liked[k]; return reply(200, { on: false, soon: false })
    }
    return reply(200, { ok: true })
  }
})()`

const server = await serveDist(4327)
const p: Page = await launch(1280, 900, { flags: { likes: false } })
try {
  await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: MOCK })
  const go = async (path: string, ready: string, ms = 30000) => { await p.cdp('Page.navigate', { url: server.url.replace(/\/$/, '') + path }); return p.waitFor(ready, ms) }
  const rect = (sel: string) => p.js<number[] | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round) })()`)
  const click = async (sel: string) => {
    const r = await p.js<number[] | null>(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
    if (!r) return false
    await p.mouse('mouseMoved', r[0], r[1], 0); await p.mouse('mousePressed', r[0], r[1]); await p.mouse('mouseReleased', r[0], r[1]); await sleep(250)
    return true
  }
  const note = () => p.js<string>(`document.querySelector('.lk-note')?.textContent ?? ''`)
  const pressed = () => p.js<string | null>(`document.querySelector('.lk-btn')?.getAttribute('aria-pressed') ?? null`)
  const calls = () => p.js<{ path: string; method: string; human: boolean }[]>('window.__lk.calls')
  const shot = (name: string) => p.shot(join(OUT, `${name}.png`)).then(() => console.log(`  .snapshots/likes/${name}.png`))
  const widget = '/widget/timer/', stage = '.wp-stage'

  // flag off: no button, no API call, no BotID
  await go(widget, `!!document.querySelector('${stage} canvas, ${stage} svg')`)
  await sleep(1500)
  const plain = await rect(stage)
  assert('likes-browser: flag off: no like button, no API call and no BotID script', !(await p.js('!!document.querySelector(".lk")')) && (await calls()).length === 0 && !(await p.js('!!window.KPSDK || [...document.scripts].some(s => s.src.includes("/a-4-a/c.js") && s.type !== "text/plain")')))

  // API off (404): the flag alone shows nothing
  await p.setFlags({ likes: true })
  await go(`${widget}?lkmock=off`, `window.__lk.calls.length > 0`)
  await sleep(1200)
  assert('likes-browser: flag on, API answering 404: the button stays hidden', !(await p.js('!!document.querySelector(".lk-btn")')))

  // on: the button beside the card, the card where it was
  await p.js(`localStorage.removeItem('dot480:likes'); 1`)
  const shown = await go(`${widget}?lkmock=ok`, `!!document.querySelector('.lk-btn')`)
  await sleep(600)
  const withLikes = await rect(stage), text = await p.js<string>(`document.querySelector('.lk-btn').textContent`)
  assert('likes-browser: the like button renders with the count, outside the card, and the card does not move', shown && /12/.test(text) && (await pressed()) === 'false' && JSON.stringify(withLikes) === JSON.stringify(plain)
    && await p.js<boolean>(`!document.querySelector('.wp-stage .lk') && !!document.querySelector('.lk [role="status"][aria-live="polite"]')`), `${text} ${withLikes} vs ${plain}`)
  await shot('like-rest')

  // first like: the remember sheet
  await click('.lk-btn')
  const sheet = await p.waitFor(`!!document.querySelector('.lk-sheet')`, 3000)
  const neutral = await p.js<boolean>(`document.activeElement === document.querySelector('.lk-sheet') && document.querySelectorAll('.lk-choices button').length === 2`)
  assert('likes-browser: the first like opens "Remember this browser?" with two equal buttons and focus on the sheet, none pre-selected', sheet && neutral && (await calls()).every(c => c.path !== '/api/like'))
  await shot('remember-sheet')
  await click('.lk-choices button:first-child')
  await p.waitFor(`document.querySelector('.lk-btn')?.getAttribute('aria-pressed') === 'true'`, 6000)
  const c1 = await calls(), visit = c1.findIndex(c => c.path === '/api/visit'), like = c1.findIndex(c => c.path === '/api/like')
  const live = await p.js<string>(`document.querySelector('.lk [role="status"]').textContent`)
  assert('likes-browser: Remember checks in, then likes; both carry BotID\'s header; the count and "counting soon" show at once', visit >= 0 && like > visit && c1[visit].human && c1[like].human
    && (await note()) === 'Liked. Counting soon.' && /13/.test(await p.js<string>(`document.querySelector('.lk-count').textContent`)) && /13 likes/.test(live) && await p.js<boolean>(`!!document.querySelector('.lk-forget')`), `${await note()} | ${live}`)
  await shot('like-soon')

  // unlike, then "already liked", then a limit
  await click('.lk-btn'); await p.waitFor(`document.querySelector('.lk-btn')?.getAttribute('aria-pressed') === 'false'`, 4000)
  const unliked = await pressed()
  await p.js(`window.__lk.mode = 'already'; 1`)
  await click('.lk-btn'); await p.waitFor(`document.querySelector('.lk-note')?.textContent === 'Already liked.'`, 4000)
  assert('likes-browser: a second click unlikes (aria-pressed false); a like the server already has says "Already liked."', unliked === 'false' && (await note()) === 'Already liked.' && !(await p.js('!!document.querySelector(".lk-sheet")')))
  await shot('like-already')
  await p.js(`window.__lk.mode = 'ok'; 1`); await click('.lk-btn'); await p.waitFor(`document.querySelector('.lk-btn')?.getAttribute('aria-pressed') === 'false'`, 4000)
  await p.js(`window.__lk.mode = 'limit'; 1`); await click('.lk-btn'); await p.waitFor(`document.querySelector('.lk-note')?.textContent.startsWith('Limit')`, 4000)
  assert('likes-browser: over a limit the button says "Limit reached. Try again later." and stays unliked', (await note()) === 'Limit reached. Try again later.' && (await pressed()) === 'false')
  await shot('like-limit')

  // forget this browser
  await p.js(`window.__lk.mode = 'ok'; 1`)
  await click('.lk-forget'); await p.waitFor(`document.querySelector('.lk-note')?.textContent === 'This browser is forgotten.'`, 4000)
  assert('likes-browser: "Forget this browser" calls the API, clears dot480:likes and says so', (await calls()).some(c => c.path === '/api/forget') && await p.js<boolean>(`localStorage.getItem('dot480:likes') === null && !document.querySelector('.lk-forget')`))
  await shot('like-forgotten')
  // the keyboard: Enter opens the sheet again (the choice was forgotten), Escape cancels without a like
  const before = (await calls()).filter(c => c.path === '/api/like').length
  await p.js(`document.querySelector('.lk-btn').focus(); 1`)
  const focused = await p.js<boolean>(`document.activeElement === document.querySelector('.lk-btn')`)
  // a real Enter: a keyDown without its text is a raw key, which never activates a focused button
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '' })
  await p.cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  const again = await p.waitFor(`!!document.querySelector('.lk-sheet')`, 3000)
  await p.key('Escape', 'Escape', 27)
  const left = await p.js<boolean>('!!document.querySelector(".lk-sheet")'), likes = (await calls()).filter(c => c.path === '/api/like').length
  assert('likes-browser: from the keyboard, Enter asks again and Escape cancels without a like', again && !left && likes === before, `focused ${focused}, sheet ${again}, still open ${left}, likes ${before} → ${likes}`)

  // paused: the API is down
  await go(`${widget}?lkmock=paused`, `!!document.querySelector('.lk-btn')`)
  await sleep(300)
  assert('likes-browser: with the API down the button is disabled and says "Likes paused."', await p.js<boolean>(`document.querySelector('.lk-btn').disabled`) && (await note()) === 'Likes paused.')
  await shot('like-paused')

  // gallery programs in MAKE · CODE
  const gallery = await go(`/?make=code&lkmock=ok`, `document.querySelectorAll('.lk-gallery .lk-btn').length >= 8`, 40000)
  await p.js(`document.querySelector('.lk-gallery').scrollIntoView({ block: 'center' }); 1`); await sleep(500)
  const reads = (await calls()).filter(c => c.path.startsWith('/api/likes/p/'))
  assert('likes-browser: gallery programs get like buttons (the 8 seeds), each read by its 64-hex key', gallery && reads.length >= 8 && reads.every(c => /^\/api\/likes\/p\/[0-9a-f]{64}$/.test(c.path)) && /3/.test(await p.js<string>(`document.querySelector('.lk-gallery .lk-btn').textContent`)))
  await shot('gallery-likes')

  const errors = p.logs.filter(l => !/Failed to load resource/.test(l))
  assert('likes-browser: no uncaught errors or console errors', !errors.length, errors.slice(0, 3).join(' | '))
} finally {
  await p.close(); server.stop()
}
done('all likes browser checks passed')
