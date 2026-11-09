/**
 * The IR sandbox worker in headless Chrome (#158), on MAKE · CODE with programs opened from `?p=` links:
 *  - a typical program (plasma) draws through the worker: batches go out, nothing is terminated, the frame lights up;
 *    its main-thread frame time is measured with the worker and with the `worker` flag off (printed, and kept sane);
 *  - a hostile slow program: the worker's guard pauses it, the editor says so, and the page keeps its timers on time;
 *  - the same program with the watchdog shortened (`__dotIrWatchdogMs`, test builds only): the page terminates the
 *    worker, pauses the program with the same note, and stays responsive; the next program gets a fresh worker.
 *
 * `npx vite build && npx tsx scripts/ir-worker-browser.ts [baseUrl]`: with no URL it serves `dist/` itself (port 4327).
 * Screenshots go to `.snapshots/ir-worker/`.
 */
import { mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { encodeShare } from '../src/lib/share'
import { EXAMPLES } from '../src/components/dwitter/examples'
import { findChrome, launch, serveDist, sleep, type Page } from './lib/cdp'

const out = resolve('.snapshots', 'ir-worker')
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true })
if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const urlArg = process.argv.slice(2).find(a => /^https?:/.test(a))
const server = urlArg ? undefined : await serveDist(4327)
const base = (urlArg ?? server!.url).replace(/\/?$/, '/')

let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
type Stats = { batches: number; kills: number; crashes: number; lastMs: number; failed: boolean }
const stats = (p: Page) => p.js<Stats | null>('window.__irSandbox ? { ...window.__irSandbox } : null')
/** Every note the editor showed (a note clears itself after a few seconds), recorded from the page's start. */
const NOTES = `window.__notes = []; new MutationObserver(() => { const n = document.querySelector('.ed-note')?.textContent; if (n && window.__notes.at(-1) !== n) window.__notes.push(n) }).observe(document, { subtree: true, childList: true, characterData: true })`
const note = (p: Page) => p.js<string>(`(window.__notes ?? []).join(' | ')`)
/** The CODE tab's compile error, if any: a program the static limits refuse never runs, so it can't be paused. */
const codeError = (p: Page) => p.js<string>(`document.querySelector('.dw-error')?.textContent ?? ''`)
const compiles = async (p: Page) => !(await codeError(p))
const start = async (p: Page) => { await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: NOTES }); return p }
/** Lit pixels on the selected frame's canvas. */
const lit = (p: Page) => p.js<number>(`(() => { const c = document.querySelector('.ed-frame[data-frame="' + window.__editor?.sel + '"]'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) n++; return n })()`)
/** The longest gap between 10 ms timer ticks over `ms`: how long the page's main thread was blocked. */
const maxGap = (p: Page, ms = 2000) => p.js<number>(`new Promise(r => { let last = performance.now(), max = 0; const id = setInterval(() => { const n = performance.now(); max = Math.max(max, n - last); last = n }, 10); setTimeout(() => { clearInterval(id); r(Math.round(max)) }, ${ms}) })`)
/** Main-thread draw time of the animated frame: the mean of `__editor.lastMs` over `ms`, read every 50 ms. */
const frameMs = (p: Page, ms = 3000) => p.js<number>(`new Promise(r => { const xs = []; const id = setInterval(() => { const e = window.__editor; if (e && e.drawn) xs.push(e.lastMs) }, 50); setTimeout(() => { clearInterval(id); r(xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : -1) }, ${ms}) })`)
/**
 * Open a program link; `asks` = it is new to this document, so the editor asks first (a re-open only re-selects, unless
 * the document never saved it: a program paused on this device is held out of the autosave, #142, so it asks again).
 */
async function open(p: Page, src: string, asks = true) {
  const link = await encodeShare({ src, grid: 'square', lattice: 1, tone: 'auto' })
  // the old page must not answer for the new one: its editor is ready already
  await p.js('window.__leaving = true')
  await p.cdp('Page.navigate', { url: `${base}?make=code&p=${link}` })
  await p.waitFor('!window.__leaving', 30000)
  // a link that adds a program asks first (#143): press KEEP. One this document already holds just re-selects it.
  const ready = `!!document.querySelector('.ed-insp .dw-code textarea') && !!window.__editor?.drawn`, keep = `document.querySelector('.ed-confirm .ed-confirm-keep')`
  // the editor itself is ready before the link decodes, so a new link waits for its prompt (the full 30 s)
  if (asks && await p.waitFor(`!!${keep}`, 30000)) await p.js(`${keep}.click()`)
  else if (!asks && await p.waitFor(`!!${keep}`, 5000)) await p.js(`${keep}.click()`)
  return p.waitFor(`!${keep} && (${ready})`, 30000)
}
/** Legal (1,024 sines a dot, the nested-loop cap: IR_LIMITS.work) and far past the 50 ms frame budget on a 144² grid. */
const HOSTILE = '// slow: 32 × 32 sines a dot\nfor i in 0..32 with a = 0 { a + (for j in 0..32 with b = 0 { b + sin(u * i + v * j + t) }) } / 1024'

try {
  // ── a typical program through the worker, and its frame time both ways
  {
    const p = await start(await launch(1440, 900))
    const plasma = EXAMPLES.find(e => e.name === 'plasma')!.src
    check('CODE opens a ?p= program', await open(p, plasma))
    check('the program samples in the worker: batches go out, nothing is terminated, the frame lights up', await p.waitFor(`(window.__irSandbox?.batches ?? 0) > 5`, 15000) && (await stats(p))!.kills === 0 && (await lit(p)) > 500, JSON.stringify(await stats(p)))
    await sleep(500)
    const withWorker = await frameMs(p)
    await p.shot(join(out, 'code-worker.png'))
    check('a typical program is never paused (each program in a worker batch has its own frame budget)', !/A program is paused/.test(await note(p)), await note(p))
    await p.setFlags({ worker: false })
    await open(p, plasma, false)
    const b0 = (await stats(p))?.batches ?? 0
    await sleep(500)
    const mainOnly = await frameMs(p)
    const off = (await stats(p))?.batches ?? 0, offLit = await lit(p)
    check('the worker flag off samples on the main thread (no batches)', off === b0 && offLit > 500, `batches ${b0} → ${off}, ${offLit} lit px`)
    console.log(`  plasma frame time on the main thread: ${withWorker.toFixed(2)} ms with the worker, ${mainOnly.toFixed(2)} ms without`)
    check('the worker does not make the common case slower (main-thread frame time with the worker ≤ without)', withWorker > 0 && withWorker <= mainOnly * 1.1 + .5, `${withWorker.toFixed(2)} vs ${mainOnly.toFixed(2)} ms`)
    check('no page errors', !p.logs.length, p.logs.slice(0, 3).join(' | '))
    await p.close()
  }
  // ── a hostile slow program: the worker's guard pauses it
  {
    const p = await start(await launch(1440, 900))
    check('a hostile slow program opens (it compiles: no error under the code)', await open(p, HOSTILE) && await compiles(p), await codeError(p))
    const gap = await maxGap(p)
    check('the worker\'s guard pauses it and the editor says so', await p.waitFor(`(window.__notes ?? []).some(n => /A program is paused/.test(n))`, 15000), await note(p))
    check('the page stays responsive while it runs (timer gaps ≤ 120 ms)', gap <= 120, `${gap} ms`)
    check('no page errors', !p.logs.length, p.logs.slice(0, 3).join(' | '))
    await p.close()
  }
  // ── the same with the watchdog shortened below the guard: the page terminates the worker
  {
    const p = await start(await launch(1440, 900))
    await p.cdp('Page.addScriptToEvaluateOnNewDocument', { source: 'globalThis.__dotIrWatchdogMs = 15' })
    check('a hostile slow program opens (watchdog 15 ms)', await open(p, HOSTILE) && await compiles(p), await codeError(p))
    const gap = await maxGap(p)
    check('the watchdog terminates the worker and pauses the program with the same note', await p.waitFor(`(window.__irSandbox?.kills ?? 0) >= 1 && (window.__notes ?? []).some(n => /A program is paused/.test(n))`, 15000), `${JSON.stringify(await stats(p))}; ${await note(p)}`)
    check('the page stays responsive while the worker is stopped (timer gaps ≤ 120 ms)', gap <= 120, `${gap} ms`)
    await sleep(800)
    await p.shot(join(out, 'code-paused.png'))
    // an edit makes a new program (a new guard key): it samples in a fresh worker and draws
    const before = (await stats(p))!
    await p.js(`(() => { const a = document.querySelector('.ed-insp .dw-code textarea'); a.focus(); a.select() })()`)
    await p.cdp('Input.insertText', { text: 'u * v' }); await p.js('document.activeElement?.blur()')
    const fresh = await p.waitFor(`(window.__irSandbox?.batches ?? 0) > ${before.batches} && window.__irSandbox.kills === ${before.kills}`, 15000) && await p.waitFor(`(() => { const c = document.querySelector('.ed-frame[data-frame="' + window.__editor?.sel + '"]'); if (!c) return false; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] + d[i+1] + d[i+2] > 90) n++; return n > 500 })()`, 15000)
    check('after an edit the next program gets a fresh worker and draws', fresh, `${JSON.stringify(before)} → ${JSON.stringify(await stats(p))}`)
    check('no page errors', !p.logs.length, p.logs.slice(0, 3).join(' | '))
    await p.close()
  }
} finally {
  server?.stop()
}
console.log(failures ? `\n${failures} IR worker browser check(s) failed` : '\nAll IR worker browser checks passed')
process.exit(failures ? 1 : 0)
