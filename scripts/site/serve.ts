/**
 * Serves a built `dist/` the way Vercel would (`./vercel-routes.ts`): redirects with their status, files, rewrites,
 * `dist/404.html` with a 404, and the `vercel.json` headers. `vite preview` answers every unknown path with
 * index.html and a 200, which hides broken links and soft 404s; the SEO audit (.github/workflows/seo-audit.yml)
 * points Lighthouse and lychee at this instead. No dependencies, for CI and local use.
 *
 *   npx tsx scripts/site/serve.ts [port=4321]
 */
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { headersFor, readVercel, route } from './vercel-routes'

const DIST = 'dist', port = Number(process.argv[2] ?? 4321), vercel = readVercel()
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8',
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost'), path = decodeURIComponent(url.pathname)
  const o = route(vercel, DIST, path), headers = headersFor(vercel, path)
  if ('redirect' in o) { res.writeHead(o.permanent ? 308 : 307, { ...headers, Location: o.redirect + url.search }); res.end(); return }
  const file = 'file' in o ? o.file : '404.html', status = 'file' in o ? 200 : 404
  try {
    const body = readFileSync(join(DIST, file))
    res.writeHead(status, { ...headers, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch { res.writeHead(404); res.end() }
}).listen(port, () => console.log(`serve: dist/ with vercel.json routing on http://localhost:${port}/`))
