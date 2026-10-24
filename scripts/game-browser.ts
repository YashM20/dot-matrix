/**
 * C4 in headless Chrome over CDP (Node's built-in WebSocket, no deps): open `?board=levels`, press the
 * PRESS START button, play with real key events, then let the autopilot (`window.__hive`) carry the
 * run through every stage, screenshotting each one, and read the frame-time stats.
 * Needs the dev server: `pnpm dev --port 5203`, then `npx tsx scripts/game-browser.ts [baseUrl]`.
 * Screenshots go to `.snapshots/c4/`. Chrome path: $CHROME, else the usual install paths.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const base = process.argv[2] ?? 'http://localhost:5203/'
const out = join('.snapshots', 'c4')
mkdirSync(out, { recursive: true })
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-c4-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--window-size=1280,900', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>(), logs: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
const js = async (expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const shot = async (name: string) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(join(out, `${name}.png`), Buffer.from(r.result.data, 'base64')) }
const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
const KEYS: Record<string, [string, number]> = { ArrowRight: ['ArrowRight', 39], ArrowUp: ['ArrowUp', 38], ArrowLeft: ['ArrowLeft', 37], Space: [' ', 32], Enter: ['Enter', 13] }
const key = async (code: string, type: 'keyDown' | 'keyUp') => { const [k, vk] = KEYS[code]; await cdp('Input.dispatchKeyEvent', { type, code, key: k, windowsVirtualKeyCode: vk }) }
const hold = async (code: string, ms: number) => { await key(code, 'keyDown'); await sleep(ms); await key(code, 'keyUp') }
/** Lit pixels in the game canvas. */
const lit = () => js(`(() => { const c = document.querySelector('.hive-screen'); if (!c) return -1; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] + d[i+1] + d[i+2] > 60) n++; return n })()`) as Promise<number>
const red = () => js(`(() => { const c = document.querySelector('.hive-screen'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i] > 150 && d[i+1] < 90 && d[i+2] < 90) n++; return n })()`) as Promise<number>
const stage = () => js('window.__hive?.game?.stage') as Promise<string>

try {
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await cdp('Page.navigate', { url: `${base}?board=levels` })
  const button = await waitFor(`!!document.querySelector('.hive-start')`, 30000)
  check('the levels board shows the PRESS START button', button, logs.join(' | '))
  await sleep(1500)
  await shot('00-board')
  await js(`document.querySelector('.hive-start').click()`)
  const opened = await waitFor(`!!window.__hive && !!document.querySelector('.hive-screen')`, 15000)
  check('PRESS START opens play mode and the URL gets play=1', opened && /play=1/.test(await js('location.search')), await js('location.search'))
  await sleep(600)
  check('title screen draws in dots, with its one red cursor', (await lit()) > 500 && (await red()) > 0, `${await lit()} lit px, ${await red()} red px`)
  await shot('01-title')
  // real keys: Enter starts, the arrows walk the corridor, space fires
  await hold('Enter', 80)
  await waitFor(`window.__hive.game.stage === 'corridor'`, 3000)
  await sleep(700)
  const x0 = await js('window.__hive.game.c.x') as number
  await hold('ArrowUp', 900)
  await hold('Space', 120)
  const x1 = await js('window.__hive.game.c.x') as number
  check('keyboard: Enter starts, ArrowUp walks the first-person corridor', (await stage()) === 'corridor' && x1 > x0 + .5, `x ${x0.toFixed(2)} → ${x1.toFixed(2)}`)
  await sleep(300)
  await shot('02-corridor')
  // the deep link path, then the autopilot through every stage
  for (const [s, name, extra] of [['maze', '03-maze', 400], ['surface', '04-surface', 500], ['void', '05-void', 60], ['queen', '06-queen', 200]] as const) {
    const got = await js(`window.__hive.run('${s}', 30000)`)
    await js(`window.__hive.steps(${extra})`)
    await sleep(900) // let the stage dissolve / migration finish
    check(`autopilot reaches ${s} and it draws`, got === s && (await lit()) > 200, `${await lit()} lit px`)
    await shot(name)
  }
  // juice: a hit flash and shake on the boss
  await js(`(() => { const g = window.__hive.game; g.flashes.push({ x: 96, y: 60, r: 26, age: 2, life: 16 }); g.shake = 12; g.shakeAmp = 2 })()`)
  await sleep(60)
  await shot('07-hit-flash')
  // blur pauses
  await js(`window.dispatchEvent(new Event('blur'))`)
  await sleep(200)
  const f0 = await js('window.__hive.game.frame'); await sleep(400); const f1 = await js('window.__hive.game.frame')
  check('blur pauses the sim', (await js('window.__hive.paused')) === true && f0 === f1, `frame ${f0} → ${f1}`)
  await shot('08-paused')
  await hold('Enter', 80)
  await sleep(300)
  check('Enter resumes', (await js('window.__hive.paused')) === false)
  // game over, initials, the table in localStorage
  await js(`(() => { const h = window.__hive; h.game.score = 23450; h.enter('over') })()`)
  await sleep(900)
  await shot('09-game-over')
  await js(`(() => { const h = window.__hive; h.game.count = 1 })()`)
  await waitFor(`window.__hive.game.stage === 'entry'`, 3000)
  await sleep(800)
  await hold('ArrowUp', 60); await sleep(80); await hold('ArrowUp', 60); await sleep(80)
  await shot('10-entry')
  for (let i = 0; i < 3; i++) { await hold('Space', 60); await sleep(100) }
  await waitFor(`window.__hive.game.stage === 'scores'`, 3000)
  await sleep(800)
  const saved = await js(`JSON.parse(localStorage.getItem('dot480.hive.scores.v1') || '[]')`) as { name: string; score: number }[]
  check('initials entry saves the table to localStorage', saved[0]?.score === 23450 && saved[0]?.name === 'CAA', JSON.stringify(saved[0]))
  await shot('11-scores')
  // frame cost, measured in the page over the whole session
  const stats = await js('window.__hive.stats()') as { n: number; p50: number; p95: number; pitch: number }
  check('frame (layers + sample + draw) p50 under 16 ms in Chrome', stats.p50 < 16, JSON.stringify(stats))
  // Escape quits and drops the param
  await key('Enter', 'keyUp')
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(300)
  check('Escape closes play mode', !(await js(`!!document.querySelector('.hive-play')`)) && !/play=1/.test(await js('location.search')))
  // deep link straight into play mode + touch pad on a phone-sized screen
  await cdp('Emulation.setDeviceMetricsOverride', { width: 420, height: 860, deviceScaleFactor: 2, mobile: true })
  await cdp('Emulation.setTouchEmulationEnabled', { enabled: true })
  await cdp('Page.navigate', { url: `${base}?board=levels&play=1` })
  const deep = await waitFor(`!!window.__hive && !!document.querySelector('.hive-pad')`, 30000)
  check('?board=levels&play=1 opens play mode; a coarse pointer gets the dot touch pad', deep, logs.join(' | '))
  if (deep) {
    const r = await js(`(() => { const b = document.querySelector('.hive-pad').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })()`) as { x: number; y: number; w: number; h: number }
    const tap = async (cx: number, cy: number) => {
      const p = { x: r.x + (cx / 120) * r.w, y: r.y + (cy / 38) * r.h }
      await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await sleep(120)
      await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120)
    }
    await tap(60, 15) // START
    await waitFor(`window.__hive.game.stage === 'corridor'`, 3000)
    check('touch: the START pad starts the game', (await stage()) === 'corridor', await stage())
    await sleep(700)
    await shot('12-touch')
  }
  check('no console errors or exceptions', logs.length === 0, logs.slice(0, 3).join(' | '))
} finally {
  ws.close(); proc.kill()
  await sleep(300)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold it */ }
}
console.log(failures ? `\n${failures} browser check(s) failed` : '\nAll C4 browser checks passed')
process.exit(failures ? 1 : 0)
