/**
 * The View side of the MCP Apps postMessage bridge (spec 2026-01-26, `io.modelcontextprotocol/ui`):
 * JSON-RPC 2.0 with the host window. Hand-written on purpose: the official `App` class pulls in the
 * client SDK and zod (whose JIT probes `new Function`); this card only needs the handshake and the
 * tool notifications, and must run under a CSP with no eval and no network.
 */
export const PROTOCOL_VERSION = '2026-01-26'

type Json = Record<string, unknown>
interface Rpc { jsonrpc: '2.0'; id?: number | string; method?: string; params?: Json; result?: Json; error?: { code: number; message: string } }
export interface BridgeHandlers {
  onToolInput?(args: Json, partial: boolean): void
  onToolResult?(result: Json): void
  onHostContext?(ctx: Json): void
  onTeardown?(): void
}
export interface Bridge {
  /** Resolves with the host's `McpUiInitializeResult` once `ui/initialize` is answered. */
  ready: Promise<Json>
  sizeChanged(width: number, height: number): void
}

export function connectBridge(handlers: BridgeHandlers, host: Window = window.parent): Bridge {
  let nextId = 1
  const pending = new Map<number | string, { ok(r: Json): void; fail(e: Error): void }>()
  const send = (m: Rpc) => host.postMessage(m, '*')
  const notify = (method: string, params: Json = {}) => send({ jsonrpc: '2.0', method, params })
  const request = (method: string, params: Json) => new Promise<Json>((ok, fail) => {
    const id = nextId++
    pending.set(id, { ok, fail })
    send({ jsonrpc: '2.0', id, method, params })
  })
  window.addEventListener('message', (e: MessageEvent) => {
    if (e.source !== host) return
    const m = e.data as Rpc
    if (!m || m.jsonrpc !== '2.0') return
    if (m.method === undefined) {
      if (m.id === undefined) return
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      if (m.error) p.fail(new Error(m.error.message)); else p.ok(m.result ?? {})
      return
    }
    const params = m.params ?? {}
    switch (m.method) {
      case 'ui/notifications/tool-input': handlers.onToolInput?.((params.arguments ?? {}) as Json, false); break
      case 'ui/notifications/tool-input-partial': handlers.onToolInput?.((params.arguments ?? {}) as Json, true); break
      case 'ui/notifications/tool-result': handlers.onToolResult?.(params); break
      case 'ui/notifications/host-context-changed': handlers.onHostContext?.(params); break
      case 'ui/resource-teardown': handlers.onTeardown?.(); break
      case 'ping': break
      default:
        if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: `Method not found: ${m.method}` } })
        return
    }
    // requests (teardown, ping) get an empty result; notifications get nothing
    if (m.id !== undefined) send({ jsonrpc: '2.0', id: m.id, result: {} })
  })
  const ready = request('ui/initialize', {
    protocolVersion: PROTOCOL_VERSION,
    appInfo: { name: 'dot-card-heartbeat', version: '0.1.0' },
    appCapabilities: { availableDisplayModes: ['inline'] },
  }).then(r => {
    if (r.hostContext) handlers.onHostContext?.(r.hostContext as Json)
    notify('ui/notifications/initialized')
    return r
  })
  return { ready, sizeChanged: (width, height) => notify('ui/notifications/size-changed', { width, height }) }
}
