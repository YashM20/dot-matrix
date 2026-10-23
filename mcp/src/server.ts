/**
 * Dot/480 MCP server (MCP Apps, spec 2026-01-26). Two tools:
 *   set_agent_state({ state, label? }) — the agent's presence; hosts render `ui://dot-card/heartbeat` inline
 *   describe_board({ id })             — any board or card as text (engine `describe` / `describeBoard`)
 * The agent never draws: it sends a state from the closed `HEARTBEAT` vocabulary, the card does the rest.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerAppResource, registerAppTool, RESOURCE_MIME_TYPE } from '@modelcontextprotocol/ext-apps/server'
import { McpServer, type CallToolResult, type ReadResourceResult } from '@modelcontextprotocol/server'
import { z } from 'zod'
import { describe, describeBoard } from '../../src/engine/describe'
import { boards, widgetById } from '../../src/widgets'
import { heartbeatCard, HEARTBEAT_STATES, type HeartbeatState } from '../../src/widgets/boards/heartbeat'

export const HEARTBEAT_URI = 'ui://dot-card/heartbeat'
const VIEW_HTML = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'heartbeat.html')

/** The bundled card (build it with `pnpm build`); read per request so a rebuild needs no restart. */
export function viewHtml(): string {
  try { return readFileSync(VIEW_HTML, 'utf8') } catch { throw new Error(`${VIEW_HTML} missing: run \`pnpm build\` in mcp/ first`) }
}

const text = (s: string, structuredContent?: Record<string, unknown>): CallToolResult => ({ content: [{ type: 'text', text: s }], ...(structuredContent && { structuredContent }) })

export function createServer(): McpServer {
  const server = new McpServer({ name: 'dot-matrix', version: '0.1.0' })
  // the latest state, so `describe_board({ id: 'hb-live' })` reads what the inline card shows
  let current: { state: HeartbeatState; label?: string } = { state: 'thinking' }

  registerAppTool(server, 'set_agent_state', {
    title: 'Set agent state',
    description: 'Show the agent\'s presence as a living dot-matrix card. Call when your state changes: thinking, tool-running, awaiting-approval (pulses red: you need the user), error, done. Optional short label, e.g. the running command.',
    inputSchema: z.object({
      state: z.enum(HEARTBEAT_STATES as [HeartbeatState, ...HeartbeatState[]]),
      label: z.string().max(64).optional().describe('Status line text, e.g. "pnpm test" (uppercased, truncated to fit)'),
    }),
    outputSchema: z.object({ state: z.string(), label: z.string().optional(), stateIndex: z.number(), summary: z.string() }),
    _meta: { ui: { resourceUri: HEARTBEAT_URI } },
  }, async ({ state, label }): Promise<CallToolResult> => {
    current = { state, label }
    const stateIndex = HEARTBEAT_STATES.indexOf(state)
    const d = describe(heartbeatCard(label), { state, data: { state: stateIndex } })
    return text(d.summary, { state, ...(label !== undefined && { label }), stateIndex, summary: d.summary })
  })

  registerAppResource(server, 'Agent heartbeat card', HEARTBEAT_URI, {
    description: 'Dot/480 Agent Heartbeat: one living organism per agent state, drawn by the field engine on a canvas.',
    mimeType: RESOURCE_MIME_TYPE,
    // no external origins at all: the default (empty) connect/resource domains are what we want
    _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } },
  }, async (): Promise<ReadResourceResult> => ({
    contents: [{ uri: HEARTBEAT_URI, mimeType: RESOURCE_MIME_TYPE, text: viewHtml() }],
  }))

  server.registerTool('describe_board', {
    title: 'Describe board',
    description: `Read a Dot/480 board or card as text: state, data, controls and the strings it shows. Board ids: ${boards.map(b => b.id).join(', ')}; any card id (e.g. hb-agent) or "hb-live" (the agent heartbeat card).`,
    inputSchema: z.object({ id: z.string().describe('Board id, card id, or "hb-live"') }),
    annotations: { readOnlyHint: true },
  }, async ({ id }): Promise<CallToolResult> => {
    const board = boards.find(b => b.id === id)
    if (board) { const d = describeBoard(board); return text(`${d.summary}\n${d.cards.map(c => `- ${c.summary}`).join('\n')}`, { ...d }) }
    if (id === 'hb-live') {
      const d = describe(heartbeatCard(current.label), { state: current.state, data: { state: HEARTBEAT_STATES.indexOf(current.state) } })
      return text(d.summary, { ...d })
    }
    const card = widgetById(id)
    if (card) { const d = describe(card); return text(d.summary, { ...d }) }
    return { isError: true, content: [{ type: 'text', text: `Unknown board or card "${id}". Boards: ${boards.map(b => b.id).join(', ')}` }] }
  })

  return server
}
