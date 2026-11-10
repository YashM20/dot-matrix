/**
 * Serves a built `dist/` the way Vercel would (`./vercel-routes.ts`): redirects with their status (the query kept),
 * files, rewrites, `dist/404.html` with a 404, the `vercel.json` headers, and brotli or gzip for text, as Vercel
 * compresses. `vite preview` answers every unknown path with index.html and a 200, which hides broken links and soft
 * 404s. Lighthouse (`scripts/ci/lighthouse.ts`, in the probes and seo-audit workflows) and lychee run against this.
 * No dependencies.
 *
 *   npx tsx scripts/site/serve.ts [port=4321]
 */
import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { headersFor, readVercel, route } from './vercel-routes'

const DIST = 'dist'
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.md': 'text/markdown; charset=utf-8',
}
const TEXT = /^(text\/|application\/(json|manifest\+json|xml|wasm)|image\/svg)/

/** Start the server on `port`; `stop` closes it. */
export function serveVercel(port: number): Promise<{ url: string; stop: () => void }> {
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('no dist/: run `npx vite build` first')
  const vercel = readVercel(), packed = new Map<string, Buffer>()
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost'), path = decodeURIComponent(url.pathname)
    const o = route(vercel, DIST, path + url.search), headers = headersFor(vercel, path)
    // Vercel keeps the request's query on a redirect, merged into the destination's
    if ('redirect' in o) { res.writeHead(o.permanent ? 308 : 307, { ...headers, Location: o.redirect + (url.search ? (o.redirect.includes('?') ? '&' : '?') + url.search.slice(1) : '') }); res.end(); return }
    const file = 'file' in o ? o.file : '404.html', status = 'file' in o ? 200 : 404, type = TYPES[extname(file)] ?? 'application/octet-stream'
    let body: Buffer
    try { body = readFileSync(join(DIST, file)) } catch { res.writeHead(404); res.end(); return }
    const accept = String(req.headers['accept-encoding'] ?? ''), enc = !TEXT.test(type) ? '' : /\bbr\b/.test(accept) ? 'br' : /\bgzip\b/.test(accept) ? 'gzip' : ''
    if (enc) {
      const key = `${enc}:${file}`
      body = packed.get(key) ?? packed.set(key, enc === 'br' ? brotliCompressSync(body) : gzipSync(body)).get(key)!
    }
    res.writeHead(status, { ...headers, 'Content-Type': type, ...(enc ? { 'Content-Encoding': enc, Vary: 'Accept-Encoding' } : {}) })
    res.end(req.method === 'HEAD' ? undefined : body)
  })
  return new Promise(ok => server.listen(port, () => ok({ url: `http://localhost:${port}/`, stop: () => { server.closeAllConnections(); server.close() } })))
}

if (/[\\/]scripts[\\/]site[\\/]serve\.ts$/.test(process.argv[1] ?? '')) {
  const s = await serveVercel(Number(process.argv[2] ?? 4321))
  console.log(`serve: dist/ with vercel.json routing on ${s.url}`)
}
