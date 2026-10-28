/**
 * Headless Chrome over CDP with Node's built-in WebSocket (no deps), for the browser probes: launch a
 * page, evaluate, wait, screenshot, mouse / touch / key input, and collect uncaught errors. `serveDist`
 * runs `vite preview` on `dist/` for the length of a probe, so no server outlives it.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
export const findChrome = () => [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))

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

export interface Page {
  cdp: (method: string, params?: Record<string, unknown>) => Promise<any>
  js: <T = unknown>(expression: string) => Promise<T>
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
  close: () => Promise<void>
}

export async function launch(width: number, height: number): Promise<Page> {
  const chrome = findChrome()
  if (!chrome) throw new Error('no Chrome found (set $CHROME)')
  const profile = mkdtempSync(join(tmpdir(), 'dot-probe-'))
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' })
  let port = ''
  for (let i = 0; i < 150 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
  if (!port) { proc.kill(); throw new Error('Chrome did not open a DevTools port') }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
  const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r, { once: true }))
  let seq = 0
  const calls = new Map<number, (m: any) => void>(), logs: string[] = []
  const downloads: { name: string; bytes: number }[] = [], names = new Map<string, string>()
  ws.addEventListener('message', e => {
    const m = JSON.parse(String(e.data))
    if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
    if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
    if (/^(Browser|Page)\.downloadWillBegin$/.test(m.method)) names.set(m.params.guid, m.params.suggestedFilename)
    if (/^(Browser|Page)\.downloadProgress$/.test(m.method) && m.params.state === 'completed' && names.has(m.params.guid)) { downloads.push({ name: names.get(m.params.guid)!, bytes: m.params.receivedBytes }); names.delete(m.params.guid) }
  })
  const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) })
  const js = async <T = unknown>(expression: string): Promise<T> => {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
    return r.result?.result?.value as T
  }
  const waitFor = async (expr: string, ms = 8000) => { for (let i = 0; i < ms / 100; i++) { if (await js(expr).catch(() => false)) return true; await sleep(100) } return false }
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
  const close = async () => { ws.close(); proc.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ } }
  await cdp('Page.enable'); await cdp('Runtime.enable')
  const allowDownloads = async (dir: string) => {
    const r = await cdp('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: dir, eventsEnabled: true })
    if (r.error) await cdp('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: dir })
  }
  return { cdp, js, waitFor, logs, downloads, allowDownloads, shot, mouse, drag, touch, tap, key, close } as Page
}
