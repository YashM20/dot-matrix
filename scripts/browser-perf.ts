/**
 * Main-thread cost of a board in headless Chrome (CDP over Node's built-in WebSocket, no deps).
 *
 *   npx tsx scripts/browser-perf.ts [--url http://localhost:5196] [--boards mosaic,cinema] [--secs 5] [--runs 3]
 *
 * Per board and mode (worker on / `?worker=0`), fresh tab each run:
 *   mount   main-thread sampling + canvas drawing in the first 2.5 s after navigation (CPU profile, inclusive
 *           time of sampleLayers* / renderCanvas*: the board's first frames incl. the staggered entrance)
 *   frame   after the entrance: main-thread busy time (everything but idle) per 12 fps tick over `--secs`,
 *           and the share of it in sampling + drawing
 *   workers worker targets the page started
 * Medians over `--runs`. Chrome path: $CHROME or the usual install paths. Needs the dev server running.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const TOP = +arg('top', '0')
const URL0 = arg('url', 'http://localhost:5196'), BOARDS = arg('boards', 'mosaic,cinema').split(','), SECS = +arg('secs', '5'), RUNS = +arg('runs', '3')
const chrome = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => p && existsSync(p))
if (!chrome) { console.log('no Chrome found (set $CHROME)'); process.exit(0) }
const profile = mkdtempSync(join(tmpdir(), 'dot-perf-'))
const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let port = ''
for (let i = 0; i < 100 && !port; i++) { await sleep(100); try { port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0] } catch { /* not yet */ } }
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
const ws = new WebSocket(targets.find(t => t.type === 'page')!.webSocketDebuggerUrl)
await new Promise(r => ws.addEventListener('open', r, { once: true }))
let seq = 0, workers = 0
const calls = new Map<number, (m: any) => void>() // eslint-disable-line @typescript-eslint/no-explicit-any
ws.addEventListener('message', e => {
  const m = JSON.parse(String(e.data))
  if (m.id && calls.has(m.id)) { calls.get(m.id)!(m); calls.delete(m.id) }
  if (m.method === 'Target.attachedToTarget' && m.params.targetInfo.type === 'worker') workers++
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'warning' || m.params.type === 'error')) logs.add(m.params.args.map((a: { value?: unknown; description?: string }) => a.value ?? a.description).join(' ').slice(0, 200))
  if (m.method === 'Runtime.exceptionThrown') logs.add(String(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text).slice(0, 200))
})
const logs = new Set<string>()
const cdp = (method: string, params: Record<string, unknown> = {}) => new Promise<any>(r => { const id = ++seq; calls.set(id, r); ws.send(JSON.stringify({ id, method, params })) }) // eslint-disable-line @typescript-eslint/no-explicit-any

interface Node { id: number; callFrame: { functionName: string }; children?: number[] }
/** Busy ms (non-idle) and inclusive ms of sampler / canvas functions in a CPU profile. */
function analyse(p: { nodes: Node[]; samples: number[]; timeDeltas: number[] }) {
  const byId = new Map(p.nodes.map(n => [n.id, n])), parent = new Map<number, number>()
  for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const kind = (name: string) => (/^sampleLayers|^sampleField/.test(name) ? 'sample' : /^renderCanvas/.test(name) ? 'draw' : '')
  let busy = 0, sample = 0, draw = 0
  const self = new Map<string, number>()
  p.samples.forEach((id, i) => {
    const dt = (p.timeDeltas[i + 1] ?? 0) / 1000, name = byId.get(id)!.callFrame.functionName
    if (name === '(idle)') return
    busy += dt
    self.set(name, (self.get(name) ?? 0) + dt)
    for (let n: number | undefined = id; n !== undefined; n = parent.get(n)) {
      const k = kind(byId.get(n)!.callFrame.functionName)
      if (k === 'sample') { sample += dt; break }
      if (k === 'draw') { draw += dt; break }
    }
  })
  return { busy, sample, draw, self }
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1]

await cdp('Profiler.enable'); await cdp('Runtime.enable'); await cdp('Page.enable')
await cdp('Profiler.setSamplingInterval', { interval: 200 })
await cdp('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true })
console.log('board       mode     mount: sample  draw ms   per 12 fps tick: busy  sample  draw ms   workers')
try {
  for (const board of BOARDS) for (const mode of ['main', 'worker']) {
    const ms: number[] = [], md: number[] = [], busy: number[] = [], fs: number[] = [], fd: number[] = [], ws0: number[] = []
    for (let r = 0; r < RUNS; r++) {
      await cdp('Page.navigate', { url: 'about:blank' }); await sleep(300)
      workers = 0
      await cdp('Profiler.start')
      await cdp('Page.navigate', { url: `${URL0}/?board=${board}${mode === 'main' ? '&worker=0' : ''}` })
      await sleep(2500)
      const m = analyse((await cdp('Profiler.stop')).result.profile)
      ms.push(m.sample); md.push(m.draw)
      await sleep(1500)
      await cdp('Profiler.start'); await sleep(SECS * 1000)
      const f = analyse((await cdp('Profiler.stop')).result.profile), ticks = SECS * 12
      const canvases = (await cdp('Runtime.evaluate', { expression: 'document.querySelectorAll("canvas").length', returnByValue: true })).result?.result?.value
      if (!canvases) console.log(`  ${board}/${mode} run ${r}: no canvas on the page`)
      if (TOP && r === 0) console.log(`  ${board}/${mode} top self ms/tick: ${[...f.self].sort((a, b) => b[1] - a[1]).slice(0, TOP).map(([n, v]) => `${n || '(anon)'} ${(v / ticks).toFixed(2)}`).join(', ')}`)
      busy.push(f.busy / ticks); fs.push(f.sample / ticks); fd.push(f.draw / ticks); ws0.push(workers)
    }
    const f1 = (a: number[]) => med(a).toFixed(1).padStart(6), f2 = (a: number[]) => med(a).toFixed(2).padStart(6)
    console.log(`${board.padEnd(11)} ${mode.padEnd(8)}       ${f1(ms)} ${f1(md)}                  ${f2(busy)} ${f2(fs)} ${f2(fd)}   ${med(ws0)}`)
  }
  for (const l of logs) console.log(`console: ${l}`)
} finally { ws.close(); proc.kill(); await sleep(300); try { rmSync(profile, { recursive: true, force: true }) } catch { /* locked */ } }
