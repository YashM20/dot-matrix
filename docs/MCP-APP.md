# MCP App: Agent Heartbeat (`ui://dot-card/heartbeat`)

The P4 "Agent Heartbeat" card shipped as an MCP App: an agent calls `set_agent_state` and the host renders the living card inline. The code is in `mcp/` (its own `package.json`; nothing added to the root). Engine side: `src/engine/describe.ts`.

## Spec status (researched 2026-10-23)

| Topic | Current state | Source |
|---|---|---|
| Status | MCP Apps (SEP-1865) is an official, optional MCP **extension**. Spec `2026-01-26` is marked **Stable**; a `draft` folder is in progress. Extension id: `io.modelcontextprotocol/ui`, declared by clients under `capabilities.extensions` with `mimeTypes`. | [SEP-1865](https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp), [ext-apps repo](https://github.com/modelcontextprotocol/ext-apps), [spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) |
| Resource | URI scheme `ui://…`; MIME type `text/html;profile=mcp-app` (`RESOURCE_MIME_TYPE`). | spec |
| Tool → UI link | `_meta.ui.resourceUri` (+ optional `_meta.ui.visibility: ["model","app"]`). The flat `_meta["ui/resourceUri"]` is deprecated; `registerAppTool` still emits both. | spec, `@modelcontextprotocol/ext-apps/server` |
| Bridge | JSON-RPC 2.0 over `postMessage`. View → host: `ui/initialize` (`protocolVersion`, `appInfo`, `appCapabilities`) then `ui/notifications/initialized`, `ui/notifications/size-changed`, `ui/open-link`, `ui/message`, `ui/update-model-context`, `ui/request-display-mode`, and standard `tools/call` / `resources/read`. Host → view: `ui/notifications/tool-input` (once, before the result), `…/tool-input-partial`, `…/tool-result` (a `CallToolResult`), `…/tool-cancelled`, `…/host-context-changed`, request `ui/resource-teardown`. | spec |
| CSP | Hosts sandbox the view in an iframe. If `_meta.ui.csp` is omitted the default is `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'`. Origins are allow-listed with `connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`; `permissions` covers camera/mic/geolocation/clipboard. | spec |
| SDK | The TypeScript SDK is now split into v2 packages. The task asked for `@modelcontextprotocol/sdk` (still 1.x on npm), but `@modelcontextprotocol/ext-apps` 2.x peers on **`@modelcontextprotocol/server` ^2** (plus `client`/`core`), so `mcp/` uses `server` 2.3.1 + `ext-apps` 2.0.3 + `zod` 4. | [npm](https://www.npmjs.com/package/@modelcontextprotocol/ext-apps), [basic-server-vanillajs example](https://github.com/modelcontextprotocol/ext-apps/tree/main/examples/basic-server-vanillajs) |
| Hosts | modelcontextprotocol.io lists Claude (web + Desktop), VS Code GitHub Copilot, Microsoft 365 Copilot, Goose, Postman, MCPJam and Archestra. The ext-apps README also lists ChatGPT. Third-party write-ups say Claude, VS Code Insiders and Goose shipped support on 2026-01-26 and ChatGPT followed that week, with gaps: VS Code has no fullscreen/PiP, ChatGPT has no tool calls from the UI, Claude needs domain signing. I could not confirm those gaps from official docs. | [MCP Apps overview](https://modelcontextprotocol.io/extensions/apps/overview), [alpic.ai](https://alpic.ai/blog/mcp-apps-goes-official-claude-chatgpt-support), [getdrio comparison](https://www.getdrio.com/blog/mcp-client-comparison) |

**Changes from the plan's assumptions:** none to the shape (`ui://` resource + inline render). The plan named `ui://dot-card`; the URI is now `ui://dot-card/heartbeat`, so more cards can live under `ui://dot-card/…`. The SDK changed as described in the SDK row above.

## What `mcp/` contains

- `src/server.ts`: `createServer()` registers three things.
  - `set_agent_state({ state, label? })`. `state` is a zod enum of the closed `HEARTBEAT_STATES` vocabulary. The tool links `ui://dot-card/heartbeat` and returns the `describe()` summary as text, plus `structuredContent { state, label, stateIndex, summary }`.
  - `describe_board({ id })`. `id` is a board id, a card id, or `hb-live` (the last state that was set). It returns the `describeBoard` / `describe` text plus structured JSON. A read-only tool.
  - The `ui://dot-card/heartbeat` resource, `text/html;profile=mcp-app`. Its `csp` lists no external origins.
- `src/main.ts`: stdio transport.
- `src/view/`: the card itself. `main.ts` builds `heartbeatCard(label)` from `src/widgets/boards/heartbeat.ts` and runs the usual pipeline: `sampleLayers` → `renderCanvas` on a canvas. `data.state` glides between states on a `DataSprings` (half-life 0.12 s), and red is used only while awaiting approval. The canvas `aria-label` and a polite live region carry the `describe()` summary, and `prefers-reduced-motion` cuts straight to the new state. `bridge.ts` is a hand-written view-side bridge. The official `App` class would pull in the client SDK and zod, and zod's JIT probes `new Function`.
- `scripts/build-view.ts` uses esbuild to build one self-contained `dist/heartbeat.html` (~53 KB). It adds a meta CSP with **hashes**: `default-src 'none'; script-src 'sha256-…'; style-src 'sha256-…'; connect-src 'none'; …`, with no `unsafe-inline` and no `unsafe-eval`. The build fails if the bundle contains `eval(`, `new Function(`, `fetch(`, XHR, WebSocket or EventSource. The view never imports the Field IR, so the `new Function` backend cannot get in.
- `test/server.ts`: raw JSON-RPC over stdio. It runs initialize, then `tools/list` (checks `_meta.ui.resourceUri` and the enum), then `resources/read` (checks the MIME type and the hash CSP), then `tools/call` for all 5 states, a rejected bad state, and three `describe_board` cases.
- `test/host.ts` + `test/headless.ts`: a stand-in host built on the **official `AppBridge` + `PostMessageTransport`**. The card runs in a sandboxed `allow-scripts` iframe, driven by headless Chrome over CDP with Node's WebSocket. The host replays the recorded tool results, and each state is screenshotted to `.snapshots/mcp/heartbeat-<state>.png`.

```sh
cd mcp && pnpm i && pnpm start   # build the card, then serve MCP on stdio
pnpm test                        # build + stdio protocol test + headless Chrome host test
pnpm typecheck
```

Client config, for example Claude Desktop or VS Code `mcp.json`: `{ "command": "<repo>/mcp/node_modules/.bin/tsx", "args": ["<repo>/mcp/src/main.ts"] }`. On Windows use `tsx.cmd`. Run `pnpm build` once first. Do not launch it through `pnpm run`, because pnpm's script banner on stdout would corrupt the stdio JSON-RPC stream.

## Not verified

- Rendering inside a real host: Claude, ChatGPT, VS Code Copilot or M365 Copilot. Nothing was registered or published.
- Host-specific requirements: Claude's domain signing, ChatGPT's Apps SDK review and `_meta` extras.
- Whether a host that injects its own inline script into the view would conflict with the hash-only meta CSP. The spec does not require hosts to inject anything.
- Streamable HTTP transport, which remote-only hosts such as ChatGPT need. Only stdio is implemented. Adding HTTP means adding `@modelcontextprotocol/node` + `express`, as in the ext-apps examples.
