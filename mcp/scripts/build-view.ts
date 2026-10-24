/**
 * Build the `ui://dot-card/heartbeat` resource: bundle `src/view/main.ts` (and the engine code it
 * imports from the repo) into one IIFE with esbuild, inline it into a single HTML file, and pin it
 * with a hash-based CSP (no 'unsafe-inline', no 'unsafe-eval', no network). Fails if the bundle
 * contains an eval path. Output: `mcp/dist/heartbeat.html`.
 */
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const VIEW_HTML = join(root, 'dist', 'heartbeat.html')

const out = await build({
  entryPoints: [join(root, 'src', 'view', 'main.ts')],
  bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
  minify: true, legalComments: 'none', charset: 'utf8',
})
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')
const banned = [/\beval\s*\(/, /new\s+Function\s*\(/, /\bimportScripts\s*\(/, /\bfetch\s*\(/, /XMLHttpRequest|WebSocket|EventSource/]
const hit = banned.find(re => re.test(js))
if (hit) throw new Error(`view bundle contains a banned API (${hit}); the card must stay eval- and network-free`)

const css = `html,body{margin:0;background:#070809}body{display:flex;justify-content:center}canvas{display:block}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`
const sha = (s: string) => `'sha256-${createHash('sha256').update(s, 'utf8').digest('base64')}'`
const csp = [
  "default-src 'none'", `script-src ${sha(js)}`, `style-src ${sha(css)}`,
  "img-src 'none'", "connect-src 'none'", "font-src 'none'", "media-src 'none'",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'",
].join('; ')
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>Dot/480 — Agent Heartbeat</title>
<style>${css}</style></head>
<body><canvas id="card" role="img" aria-label="Agent heartbeat"></canvas><div id="live" class="sr" aria-live="polite"></div>
<script>${js}</script></body></html>
`
mkdirSync(dirname(VIEW_HTML), { recursive: true })
writeFileSync(VIEW_HTML, html)
console.log(`built ${VIEW_HTML} (${(html.length / 1024).toFixed(1)} KB, script ${(js.length / 1024).toFixed(1)} KB)`)
