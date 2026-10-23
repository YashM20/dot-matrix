/**
 * Headless check of the built card inside a stand-in host (test/host.ts): Chrome over CDP with
 * Node's built-in WebSocket. Verifies the MCP Apps handshake, that the canvas draws, that host
 * tool-input/tool-result messages switch the state, the accent rule and the CSP; screenshots each
 * state to `.snapshots/mcp/`. Needs `dist/heartbeat.html` and `.snapshots/mcp/tool-results.json`
 * (`pnpm test` runs build → server test → this). Chrome path: $CHROME, else the usual install paths.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const snaps = join(root, '..', '.snapshots', 'mcp')
mkdirSync(snaps, { recursive: true })
const html = readFileSync(join(root, 'dist', 'heartbeat.html'), 'utf8')
const results = JSON.parse(readFileSync(join(snaps, 'tool-results.json'), 'utf8')) as Record<string, unknown>
const STATES = ['thinking', 'tool-running', 'awaiting-approval', 'error', 'done']

// host page: the bundled AppBridge host + the card as data
const host = await build({ entryPoints: [join(root, 'test', 'host.ts')], bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022', define: { VIEW_HTML: JSON.stringify(html), RESULTS: JSON.stringify(results) } })
const hostFile = join(snaps, 'host.html')
writeFileSync(hostFile, `<!doctype html><html><head><meta charset="utf-8"><title>dot test host</title><style>body{margin:0;background:#000}</style></head><body><script>${host.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')}</script></body></html>`)

const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-mcp-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=2', '--window-size=400,400', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0
const calls = new Map<number, (m: any) => void>(), sessions: { sessionId: string; type: string }[] = [], contexts: { id: number; frameId: string; isDefault: boolean; origin: string }[] = [], logs: string[] = []
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Target.attachedToTarget') sessions.push({ sessionId: m.params.sessionId, type: m.params.targetInfo.type })
  if (m.method === 'Runtime.executionContextCreated') { const c = m.params.context; contexts.push({ id: c.id, frameId: c.auxData?.frameId, isDefault: c.auxData?.isDefault, origin: c.origin }) }
  if (m.method === 'Runtime.exceptionThrown') logs.push(`exception: ${m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text}`)
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push(`${m.params.entry.level}: ${m.params.entry.text}`)
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push(`console.error: ${m.params.args.map((a: any) => a.value ?? a.description).join(' ')}`)
})
const cdp = (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) })) })
/** Evaluate in the page (no target), in the iframe's own session (out-of-process iframe), or in an in-process context id. */
type Where = undefined | { sessionId?: string; contextId?: number }
const evalIn = async (where: Where, expression: string) => {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...(where?.contextId && { contextId: where.contextId }) }, where?.sessionId)
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval failed')
  return r.result?.result?.value
}
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

try {
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Log.enable')
  // sandboxed iframes may run out of process: auto-attach so the card's own target is reachable
  await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
  await cdp('Emulation.setDeviceMetricsOverride', { width: 352, height: 352, deviceScaleFactor: 2, mobile: false })
  await cdp('Page.navigate', { url: pathToFileURL(hostFile).href })
  let hostState: any
  for (let i = 0; i < 100; i++) { await sleep(100); hostState = await evalIn(undefined, 'window.__host && JSON.parse(JSON.stringify(window.__host))').catch(() => null); if (hostState?.initialized && hostState?.size) break }
  check('handshake: ui/initialize answered by the official AppBridge, ui/notifications/initialized + size-changed received', !!hostState?.initialized && !!hostState?.size, JSON.stringify({ app: hostState?.app, size: hostState?.size, error: hostState?.error }))
  const tree = await cdp('Page.getFrameTree')
  const childId = tree.result.frameTree.childFrames?.[0]?.frame?.id
  const oopif = sessions.find(s => s.type === 'iframe')
  if (oopif) { await cdp('Runtime.enable', {}, oopif.sessionId); await cdp('Log.enable', {}, oopif.sessionId) }
  const ctxId = contexts.filter(c => c.frameId === childId && c.isDefault).at(-1)?.id
  const view: Where = oopif ? { sessionId: oopif.sessionId } : ctxId ? { contextId: ctxId } : undefined
  const origin = await evalIn(view, 'String(self.origin)').catch(() => '?')
  check('view runs in a sandboxed (opaque-origin) iframe', !!view && origin === 'null', `${oopif ? 'out-of-process' : 'in-process'}, origin ${origin}`)
  const probe = () => evalIn(view, 'JSON.parse(JSON.stringify(window.__dotCard))')
  const first = await probe()
  check('view initialized with the host (hostInfo from ui/initialize)', first.initialized && first.host === 'dot-test-host', first.host)

  const accent = `(() => { const c = document.getElementById('card'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let red = 0, lit = 0
    for (let i = 0; i < d.length; i += 4) { if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 100) red++; if (d[i] + d[i + 1] + d[i + 2] > 300) lit++ } return { red, lit } })()`
  const seen: Record<string, any> = {}
  for (const st of STATES) {
    await evalIn(undefined, `window.hostSet(${JSON.stringify(st)})`)
    await sleep(1500)
    const p = await probe(), px = await evalIn(view, accent)
    seen[st] = { ...p, ...px }
    check(`host postMessage → ${st}: card switched state and draws (${p.lit} dots, ${px.lit} bright px, ${px.red} red px)`, p.state === st && p.lit > 300 && px.lit > 200 && p.summary.includes(st), p.summary)
    const shot = await cdp('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: 352, height: 352, scale: 1 } })
    writeFileSync(join(snaps, `heartbeat-${st}.png`), Buffer.from(shot.result.data, 'base64'))
  }
  check('one accent: red appears only while awaiting approval', seen['awaiting-approval'].red > 50 && STATES.filter(s => s !== 'awaiting-approval').every(s => seen[s].red < 5), STATES.map(s => `${s}:${seen[s].red}`).join(' '))
  const f0 = (await probe()).frames; await sleep(500); const f1 = (await probe()).frames
  check('animates: frames advance (rAF loop running)', f1 > f0 + 5, `${f1 - f0} frames / 0.5 s`)
  const csp = await evalIn(view, `(async () => { let ev = 'allowed', net = 'allowed'
    // DevTools lifts the eval ban while it evaluates, so probe from a later task the page runs itself
    ev = await new Promise(r => setTimeout(() => { try { (0, eval)('1'); r('allowed') } catch { r('blocked') } }, 0))
    try { await fetch('https://example.com/') } catch { net = 'blocked' }
    return { ev, net } })()`)
  check('CSP: eval and network blocked inside the card', csp.ev === 'blocked' && csp.net === 'blocked', JSON.stringify(csp))
  const errs = logs.filter(l => !/Content Security Policy|example\.com|unsafe-eval|Failed to fetch|ERR_/i.test(l))
  check('no other console errors / exceptions', errs.length === 0, errs.slice(0, 3).join(' | '))
} catch (e) { console.error(e); failures++ }
ws.close(); proc.kill()
await sleep(300)
try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold the profile */ }
if (failures) { console.error(`\n${failures} headless check(s) failed`); process.exit(1) }
console.log(`\nheadless checks passed; screenshots in ${snaps}`)
