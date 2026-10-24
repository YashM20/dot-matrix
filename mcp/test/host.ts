/**
 * A stand-in MCP Apps host page for `test/headless.ts`, built on the official host bridge
 * (`AppBridge` + `PostMessageTransport` from `@modelcontextprotocol/ext-apps/app-bridge`): it loads
 * the card into a sandboxed iframe (`allow-scripts` only, like real hosts) and replays real
 * `set_agent_state` tool results recorded from the server by `test/server.ts`.
 */
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge'

interface Recorded { arguments: Record<string, unknown>; result: Record<string, unknown> }
declare const VIEW_HTML: string, RESULTS: Record<string, Recorded>
const w = window as unknown as { __host: Record<string, unknown>; hostSet(state: string): Promise<void> }
const status: Record<string, unknown> = { initialized: false, size: null, app: null, sent: [] as string[], error: '' }
w.__host = status

const frame = document.createElement('iframe')
frame.setAttribute('sandbox', 'allow-scripts')
frame.style.cssText = 'border:0;width:352px;height:352px;display:block'
document.body.append(frame)

const bridge = new AppBridge(null, { name: 'dot-test-host', version: '0.0.0' }, { openLinks: {}, logging: {} }, {
  hostContext: { theme: 'dark', displayMode: 'inline', availableDisplayModes: ['inline'], platform: 'web' },
})
let ready: () => void
const initialized = new Promise<void>(r => { ready = r })
bridge.oninitialized = () => { status.initialized = true; status.app = bridge.getAppVersion?.() ?? null; ready() }
bridge.onsizechange = p => { status.size = p }
w.hostSet = async (state: string) => {
  await initialized
  const r = RESULTS[state]
  await bridge.sendToolInput({ arguments: r.arguments })
  await bridge.sendToolResult(r.result as Parameters<AppBridge['sendToolResult']>[0])
  ;(status.sent as string[]).push(state)
}
// the transport must listen before the view's first message, so connect before loading the document
bridge.connect(new PostMessageTransport(frame.contentWindow!, frame.contentWindow!)).then(() => { frame.srcdoc = VIEW_HTML }, e => { status.error = String(e) })
