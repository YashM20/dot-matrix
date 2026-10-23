/**
 * Offline protocol test: spawn the stdio server and speak raw JSON-RPC to it, as a host would
 * (initialize with the MCP Apps extension → tools/list → resources/read → tools/call).
 * Writes the real tool results to `.snapshots/mcp/tool-results.json` for `test/headless.ts`.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const snaps = join(root, '..', '.snapshots', 'mcp')
const child = spawn(process.execPath, ['--import', 'tsx', join(root, 'src', 'main.ts')], { cwd: root, stdio: ['pipe', 'pipe', 'inherit'] })
const waiting = new Map<number, (m: Record<string, any>) => void>()
createInterface({ input: child.stdout! }).on('line', line => {
  const m = JSON.parse(line)
  if (m.id !== undefined && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id) }
})
let id = 0
const rpc = (method: string, params: Record<string, unknown> = {}) => new Promise<Record<string, any>>((ok, fail) => {
  const n = ++id, timer = setTimeout(() => fail(new Error(`${method} timed out`)), 15000)
  waiting.set(n, m => { clearTimeout(timer); ok(m) })
  child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n')
})
let failures = 0
const check = (name: string, ok: boolean, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }

try {
  const init = await rpc('initialize', {
    protocolVersion: '2025-11-25', clientInfo: { name: 'dot-test-host', version: '0' },
    capabilities: { extensions: { 'io.modelcontextprotocol/ui': { mimeTypes: ['text/html;profile=mcp-app'] } } },
  })
  check('initialize', !!init.result?.serverInfo, `${init.result?.serverInfo?.name} protocol ${init.result?.protocolVersion}`)
  child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')

  const tools = (await rpc('tools/list')).result?.tools ?? []
  const set = tools.find((t: any) => t.name === 'set_agent_state')
  check('tools/list: set_agent_state links ui://dot-card/heartbeat via _meta.ui.resourceUri', set?._meta?.ui?.resourceUri === 'ui://dot-card/heartbeat', JSON.stringify(set?._meta))
  check('tools/list: state enum is the closed HEARTBEAT vocabulary', JSON.stringify(set?.inputSchema?.properties?.state?.enum) === JSON.stringify(['thinking', 'tool-running', 'awaiting-approval', 'error', 'done']))
  check('tools/list: describe_board present', tools.some((t: any) => t.name === 'describe_board'))

  const res = (await rpc('resources/read', { uri: 'ui://dot-card/heartbeat' })).result?.contents?.[0]
  check('resources/read: text/html;profile=mcp-app, single file with hash CSP', res?.mimeType === 'text/html;profile=mcp-app' && /script-src 'sha256-/.test(res?.text ?? '') && !/unsafe-(inline|eval)/.test(res?.text ?? ''), `${((res?.text?.length ?? 0) / 1024).toFixed(1)} KB`)

  const results: Record<string, unknown> = {}
  for (const [state, label] of [['thinking'], ['tool-running', 'pnpm test'], ['awaiting-approval', 'edit 3 files?'], ['error', 'exit code 1'], ['done', '12 files changed']] as [string, string?][]) {
    const r = await rpc('tools/call', { name: 'set_agent_state', arguments: { state, ...(label && { label }) } })
    results[state] = { arguments: { state, ...(label && { label }) }, result: r.result }
    check(`tools/call set_agent_state ${state}`, r.result?.structuredContent?.state === state && !r.result?.isError, r.result?.content?.[0]?.text)
  }
  const bad = await rpc('tools/call', { name: 'set_agent_state', arguments: { state: 'dancing' } })
  check('tools/call set_agent_state rejects a state outside the vocabulary', !!bad.error || !!bad.result?.isError)
  const board = await rpc('tools/call', { name: 'describe_board', arguments: { id: 'heartbeat' } })
  check('describe_board heartbeat', board.result?.structuredContent?.cards?.length === 6, board.result?.content?.[0]?.text?.split('\n')[0])
  const liveD = await rpc('tools/call', { name: 'describe_board', arguments: { id: 'hb-live' } })
  check('describe_board hb-live reads the last set state', liveD.result?.structuredContent?.state === 'done', liveD.result?.content?.[0]?.text)
  const unk = await rpc('tools/call', { name: 'describe_board', arguments: { id: 'nope' } })
  check('describe_board unknown id is a tool error', unk.result?.isError === true)
  mkdirSync(snaps, { recursive: true })
  writeFileSync(join(snaps, 'tool-results.json'), JSON.stringify(results, null, 2))
} catch (e) { console.error(e); failures++ }
child.kill()
if (failures) { console.error(`\n${failures} server check(s) failed`); process.exit(1) }
console.log('\nserver checks passed')
