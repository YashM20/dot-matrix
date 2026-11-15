/**
 * Start headless Chrome with a DevTools port, for the browser probes (scripts/lib/cdp.ts `launch` and the probes that
 * drive CDP themselves). Chrome writes `DevToolsActivePort` into its profile once the port is open; this waits for
 * that file, and fails an attempt early when Chrome exits first.
 *
 * A cold first launch on a fresh CI runner sometimes never opens the port in time (issue #224: `nav`, `mobile`,
 * `layout`, `editor` and the screenshots each failed this way as the first launch of their job). An attempt that has
 * no port after `ATTEMPT_MS` is killed and started once more with a fresh profile; the second start finds Chrome's
 * files in the disk cache. When both fail, the error carries the end of Chrome's own stderr, so the log says why.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ATTEMPT_MS = 30_000
const ATTEMPTS = 2
const TAIL = 2000

export interface Chrome { proc: ChildProcess; port: string; profile: string }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/** One start: resolves with the port, or rejects when Chrome exits or `ATTEMPT_MS` pass without a port. */
async function attempt(chrome: string, args: string[], prefix: string): Promise<Chrome> {
  const profile = mkdtempSync(join(tmpdir(), prefix))
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, ...args], { stdio: ['ignore', 'ignore', 'pipe'] })
  let tail = '', exited: string | null = null
  // keep reading stderr for Chrome's whole life (a full pipe would block it); keep only the end
  proc.stderr!.on('data', (b: Buffer) => { tail = (tail + b.toString()).slice(-TAIL) })
  proc.on('exit', (code, signal) => { exited ??= `exit ${code ?? signal}` })
  proc.on('error', e => { exited ??= e.message })
  const t0 = performance.now()
  while (performance.now() - t0 < ATTEMPT_MS && !exited) {
    try {
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim()
      if (port) return { proc, port, profile }
    } catch { /* not written yet */ }
    await sleep(100)
  }
  proc.kill('SIGKILL')
  await sleep(200)
  try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still hold files */ }
  const why = exited ? `Chrome quit before opening its DevTools port (${exited})` : `no DevTools port in ${ATTEMPT_MS / 1000} s`
  throw new Error(`${why}${tail.trim() ? `; Chrome's stderr ends:\n${tail.trim()}` : ''}`)
}

/**
 * Start Chrome with `--headless=new`, a DevTools port and a fresh profile (`prefix` names its temp folder), plus `args`
 * (window size, switches, the first URL). Retries once; the caller owns `proc` and removes `profile` when done.
 */
export async function startChrome(chrome: string, args: string[], prefix = 'dot-probe-'): Promise<Chrome> {
  let last: unknown
  for (let i = 1; i <= ATTEMPTS; i++) {
    const t0 = performance.now()
    try {
      const c = await attempt(chrome, args, prefix)
      if (i > 1 || performance.now() - t0 > 10_000) console.log(`  chrome: DevTools port open after ${((performance.now() - t0) / 1000).toFixed(1)} s (attempt ${i})`)
      return c
    } catch (e) {
      last = e
      console.log(`  chrome: start ${i} of ${ATTEMPTS} failed: ${(e as Error).message}`)
    }
  }
  throw new Error(`Chrome did not open a DevTools port in ${ATTEMPTS} starts: ${(last as Error).message}`)
}

/** The first page target's WebSocket URL; waits up to 10 s for Chrome to list it. */
export async function pageSocket(port: string): Promise<string> {
  for (let i = 0; ; i++) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
      const page = targets.find(t => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch (e) { if (i >= 100) throw e }
    if (i >= 100) throw new Error(`Chrome on port ${port} lists no page target`)
    await sleep(100)
  }
}
