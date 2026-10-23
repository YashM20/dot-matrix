/** Entry point: the Dot/480 MCP server over stdio (`pnpm start` builds the card first). */
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio'
import { createServer } from './server'

await createServer().connect(new StdioServerTransport())
console.error('dot-matrix MCP server on stdio (tools: set_agent_state, describe_board; ui://dot-card/heartbeat)')
