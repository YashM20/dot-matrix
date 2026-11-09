/**
 * Headless Chrome over CDP with Node's built-in WebSocket (no deps), for the browser probes: launch a
 * page, evaluate, wait, screenshot, mouse / touch / key input, and collect uncaught errors. `serveDist`
 * runs `vite preview` on `dist/` for the length of a probe, so no server outlives it. Every CDP call has a
 * timeout (`CDP_TIMEOUT_MS`, default 120 s) and fails when the socket closes, so a hung or dead Chrome makes
 * a probe fail instead of waiting forever. Every page sets `__DOT_PROBE__` before it loads, so a production build
 * (`serveDist`) exposes the test hooks the probes read (src/lib/testHooks.ts). Chrome comes from `$CHROME` or the
 * usual Windows, Linux and macOS paths; `$CHROME_FLAGS` (space-separated) adds switches, e.g.
 * `--enable-unsafe-swiftshader` for WebGL on a CI runner without a GPU (.github/workflows/probes.yml).
 *
 * Release flags (src/site/flags.ts) come from localStorage only; the URL never sets one. `launch(w, h, { flags })`
 * seeds `localStorage['dot480:flags']` before any page script runs, on every page: `make` and `lab` are on unless
 * `flags` says otherwise, e.g. `launch(1440, 900, { flags: { xray: true, likes: false } })`. A seed only fills a flag
 * the page hasn't saved yet, so a probe's own `setFlag`, or `page.setFlags`, wins. To change flags mid-probe, call
 * `await page.setFlags({ likes: true })` on a page of the site's origin, then navigate. `null` drops an override,
 * but a flag in the launch seed comes back on the next page: turn a seeded flag off with `false`.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const findChrome = () => [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))

/** `vite preview` of `dist/` on `port` (build first); resolves once it answers. */
export async function serveDist(port: number): Promise<{ url: string; stop: () => void }> {
  if (!existsSync('dist/index.html')) throw new Error('no dist/: run `npx vite build` first')
  const proc: ChildProcess = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
  const url = `http://localhost:${port}/`
  for (let i = 0; i < 150; i++) {
    try { if ((await fetch(url)).ok) return { url, stop: () => proc.kill() } } catch { /* not up yet */ }
    await sleep(200)
  }
  proc.kill()
  throw new Error(`vite preview did not answer on ${url}`)
}

/** Default ms a CDP call may take before it rejects (`$CDP_TIMEOUT_MS` overrides). */
export const CDP_TIMEOUT_MS = Number(process.env.CDP_TIMEOUT_MS) || 120_000

export interface Page {
  /** One CDP call; rejects after `timeoutMs` (default `CDP_TIMEOUT_MS`) or when the socket closes. */
  cdp: (method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<any>
  /** Evaluate (awaiting promises); rejects on an exception, after `timeoutMs`, or when the socket closes. */
  js: <T = unknown>(expression: string, timeoutMs?: number) => Promise<T>
  waitFor: (expr: string, ms?: number) => Promise<boolean>
  /** Uncaught exceptions and console.error lines since the last `logs.length = 0`. */
  logs: string[]
  /** Finished downloads (after `allowDownloads`): the name the page gave and the bytes written. */
  downloads: { name: string; bytes: number }[]
  /** Save downloads into `dir` (under generated names) and record them in `downloads`. */
  allowDownloads: (dir: string) => Promise<void>
  shot: (file: string) => Promise<void>
  mouse: (type: 'mouseMoved' | 'mousePressed' | 'mouseReleased', x: number, y: number, buttons?: number) => Promise<void>
  drag: (x0: number, y0: number, x1: number, y1: number, steps?: number) => Promise<void>
  /** One or more fingers: `points` per step, each `[x, y]`; a touchStart, moves, then a touchEnd. */
  touch: (path: [number, number][][]) => Promise<void>
  tap: (x: number, y: number) => Promise<void>
  key: (key: string, code: string, vk: number, modifiers?: number) => Promise<void>
  /** Calls `fn` with the params of every CDP event named `method` (enable its domain first, e.g. `Fetch.enable`). */
  on: (method: string, fn: (params: any) => void) => void
  /** Saves flag overrides in this origin's localStorage (`null` drops one); they apply from the next page load. */
  setFlags: (flags: Flags) => Promise<void>
  close: () => Promise<void>
}

/** Release flag overrides by id (src/site/flags.ts): `true` on, `false` off, `null` drops a saved one. */
export type Flags = Record<string, boolean | null>

export interface LaunchOptions {
  /** Show real scrollbars (Chrome runs with `--hide-scrollbars` otherwise), so a `100vw` width that ignores the
   * scrollbar's width overflows here as it does on Windows desktops. */
  scrollbars?: boolean
  /** Set `__DOT_PROBE__` on every page, so a production build exposes its test hooks (default on). Off: the page runs
   * as a visitor's would (scripts/site/csp-browser.ts checks no test global is left then). */
  testHooks?: boolean
  /** Flags to seed on every page, over the probe defaults `{ make: true, lab: true }` (see the header). */
  flags?: Flags
}

export async function launch(width: number, height: number, opts: LaunchOptions = {}): Promise<Page> {
  const chrome = findChrome()
  if (!chrome) throw new Error('no Chrome found (set $CHROME)')
  const profile = mkdtempSync(join(tmpdir(), 'dot-probe-'))
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', ...(opts.scrollbars ? [] : ['--hide-scrollbars']), `--window-size=${width},${height}`, ...(process.env.CHROME_FLAGS?.split(' ').filter(Boolean) ?? []), 'about:blank'], { stdio: 'ignore' })
  let port = ''
  // a cold Chrome on a shared CI runner can take well over 10 s to open its DevTools port
  for (let i = 0; i < 300 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
  if (!port) { proc.kill(); throw new Error('Chrome did not open a DevTools port') }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
  const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
  let openTimer: ReturnType<typeof setTimeout> | undefined
  const opened = await new Promise<boolean>(r => { openTimer = setTimeout(() => r(false), 20000); ws.addEventListener('open', () => r(true), { once: true }) })
  clearTimeout(openTimer)
  if (!opened) { ws.close(); proc.kill(); throw new Error('the CDP socket did not open in 20 s') }
  let seq = 0
  const calls = new Map<number, { done: (m: any) => void; fail: (e: Error) => void }>(), logs: string[] = []
  let closed: Error | null = null
  const drop = (why: string) => { closed ??= new Error(why); for (const c of calls.values()) c.fail(closed); calls.clear() }
  ws.addEventListener('close', () => drop('CDP socket closed (Chrome exited or crashed)'))
  ws.addEventListener('error', () => drop('CDP socket error'))
  proc.on('exit', () => drop('Chrome exited'))
  const downloads: { name: string; bytes: number }[] = [], names = new Map<string, string>()
  const listeners = new Map<string, ((params: any) => void)[]>()
  const on = (method: string, fn: (params: any) => void) => { listeners.set(method, [...listeners.get(method) ?? [], fn]) }
  ws.addEventListener('message', e => {
    const m = JSON.parse(String(e.data))
    if (m.method) for (const fn of listeners.get(m.method) ?? []) fn(m.params)
    if (m.id && calls.has(m.id)) { calls.get(m.id)!.done(m); calls.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
    if (/^(Browser|Page)\.downloadWillBegin$/.test(m.method)) names.set(m.params.guid, m.params.suggestedFilename)
    if (/^(Browser|Page)\.downloadProgress$/.test(m.method) && m.params.state === 'completed' && names.has(m.params.guid)) { downloads.push({ name: names.get(m.params.guid)!, bytes: m.params.receivedBytes }); names.delete(m.params.guid) }
  })
  const cdp = (method: string, params: Record<string, unknown> = {}, timeoutMs = CDP_TIMEOUT_MS) => new Promise<any>((resolve, reject) => {
    if (closed) { reject(closed); return }
    const id = ++seq
    const timer = setTimeout(() => { calls.delete(id); reject(new Error(`CDP ${method} timed out after ${timeoutMs} ms`)) }, timeoutMs)
    calls.set(id, { done: m => { clearTimeout(timer); resolve(m) }, fail: e => { clearTimeout(timer); reject(e) } })
    ws.send(JSON.stringify({ id, method, params }))
  })
  const js = async <T = unknown>(expression: string, timeoutMs = CDP_TIMEOUT_MS): Promise<T> => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs)
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
    return r.result?.result?.value as T
  }
  // wall-clock bound: each poll may take at most what is left (≥ 1 s), so a busy page can't stretch the wait. On
  // performance.now(): a probe that froze `Date` for its Node-side checks (freezeWallClock) would otherwise wait forever
  const waitFor = async (expr: string, ms = 8000) => {
    const end = performance.now() + ms
    for (;;) {
      if (await js(expr, Math.max(1000, end - performance.now())).catch(() => false)) return true
      if (closed || performance.now() >= end) return false
      await sleep(100)
    }
  }
  const mouse = async (type: string, x: number, y: number, buttons = 1) => { await cdp('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : buttons, clickCount: 1 }) }
  const drag = async (x0: number, y0: number, x1: number, y1: number, steps = 12) => {
    await mouse('mouseMoved', x0, y0, 0); await mouse('mousePressed', x0, y0)
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await sleep(16) }
    await mouse('mouseReleased', x1, y1)
  }
  const pts = (step: [number, number][]) => step.map(([x, y], id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 }))
  const touch = async (path: [number, number][][]) => {
    await cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(path[0]) })
    for (const step of path.slice(1)) { await sleep(16); await cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(step) }) }
    await sleep(16); await cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const tap = (x: number, y: number) => touch([[[x, y]]])
  const key = async (k: string, code: string, vk: number, modifiers = 0) => {
    await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: vk })
    await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: vk })
    await sleep(120)
  }
  const shot = async (file: string) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')) }
  const close = async () => { drop('page closed'); ws.close(); proc.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ } }
  await cdp('Page.enable'); await cdp('Runtime.enable')
  // the app's test-only globals (src/lib/testHooks.ts) exist in a production build only when a probe asks for them
  // MAKE and the lab are behind flags that are off by default (src/site/flags.ts); the probes test them, so each page
  // starts with both on. Seeds fill only flags the page hasn't saved, so the probe's own choice (`setFlag`) wins.
  const seed = JSON.stringify(Object.fromEntries(Object.entries({ make: true, lab: true, ...opts.flags }).filter(([, v]) => v !== null)))
  const flagsOn = `try{var k='dot480:flags',o=JSON.parse(localStorage.getItem(k)||'{}'),s=${seed};for(var f in s)if(!(f in o))o[f]=s[f];localStorage.setItem(k,JSON.stringify(o))}catch(e){}`
  // `testHooks: false` opens the page as a visitor's: no probe flag (the seeded flags still apply)
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `${opts.testHooks !== false ? 'globalThis.__DOT_PROBE__ = true;' : ''}${flagsOn}` })
  const setFlags = async (flags: Flags) => {
    await js(`(() => { const k = 'dot480:flags', o = JSON.parse(localStorage.getItem(k) || '{}'), s = ${JSON.stringify(flags)}; for (const f in s) { if (s[f] === null) delete o[f]; else o[f] = s[f] } localStorage.setItem(k, JSON.stringify(o)); return 1 })()`)
  }
  const allowDownloads = async (dir: string) => {
    const r = await cdp('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: dir, eventsEnabled: true })
    if (r.error) await cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir })
  }
  return { cdp, js, waitFor, logs, downloads, allowDownloads, shot, mouse, drag, touch, tap, key, on, setFlags, close } as Page
}
