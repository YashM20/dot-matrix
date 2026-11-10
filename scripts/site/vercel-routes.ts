/**
 * `vercel.json` played against a built `dist/`, without Vercel: redirects, then files, then rewrites, else the 404 page;
 * and the headers each path gets. `scripts/site/seo-check.ts` checks every route shape with it, and
 * `scripts/site/serve.ts` serves `dist/` with it for the SEO audit (.github/workflows/seo-audit.yml).
 *
 * A `source` reads two ways: `exact` is Vercel's own reading (case-sensitive, no optional trailing slash); the loose
 * reading (any case, optional slash) catches a rule that only works by accident.
 */
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** A rule's condition; only `query` is read here (a rule with any other kind never matches). */
export interface Has { type: string; key: string; value?: string }
export interface Rule { source: string; destination: string; permanent?: boolean; has?: Has[] }
const hasMatch = (has: Has[] | undefined, q: URLSearchParams) =>
  !has || has.every(h => h.type === 'query' && q.has(h.key) && (h.value === undefined || new RegExp(`^(?:${h.value})$`).test(q.get(h.key) ?? '')))
export interface HeaderRule { source: string; headers: { key: string; value: string }[] }
export interface VercelConfig { redirects: Rule[]; rewrites: Rule[]; headers: HeaderRule[] }
export const readVercel = (file = 'vercel.json'): VercelConfig => JSON.parse(readFileSync(file, 'utf8'))

/** A `source` as a RegExp and its param names. */
export function compile(source: string, exact: boolean): { re: RegExp; keys: string[] } {
  const keys: string[] = []
  let re = '', i = 0
  const group = () => { let depth = 0, s = ''; for (; i < source.length; i++) { const c = source[i]; if (c === '(') depth++; if (c === ')') depth--; s += c; if (!depth) { i++; return s } } throw new Error(`unbalanced ${source}`) }
  while (i < source.length) {
    const c = source[i]
    if (c === ':') {
      const name = /^:(\w+)/.exec(source.slice(i))![1]; i += name.length + 1
      const pat = source[i] === '(' ? group().slice(1, -1) : '[^/]+?', mod = /[*+?]/.test(source[i] ?? '') ? source[i++] : ''
      keys.push(name)
      if (mod && re.endsWith('\\/')) { re = re.slice(0, -2) + `(?:\\/(${pat}(?:\\/${pat})*))${mod === '+' ? '' : '?'}`; continue }
      re += `(${pat})`; continue
    }
    if (c === '(') { keys.push(String(keys.length)); re += group(); continue }
    re += c.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'); i++
  }
  return { re: new RegExp(`^${re}${exact ? '' : '\\/?'}$`, exact ? '' : 'i'), keys }
}

/** A built file at `path` (a directory path means its index.html), relative to `dist`, or undefined; exact case only. */
export const fileAt = (dist: string, path: string): string | undefined => {
  const f = join(dist, path.endsWith('/') ? path + 'index.html' : path)
  if (!existsSync(f) || !statSync(f).isFile()) return undefined
  // Vercel's file system is case-sensitive: `/About/` is not `about/index.html`, even on a disk that ignores case
  const rel = relative(dist, f).replace(/\\/g, '/'), real = relative(realpathSync.native(dist), realpathSync.native(f)).replace(/\\/g, '/')
  return real === rel ? rel : undefined
}

export type Outcome = { file: string; rewritten: boolean } | { redirect: string; permanent: boolean } | { status: 404 }
/** What Vercel does with a request (path and query): redirect, serve a file (maybe through a rewrite), or 404. */
export function route(v: VercelConfig, dist: string, url: string, exact = true): Outcome {
  const [path, search = ''] = url.split('?'), q = new URLSearchParams(search)
  const match = (r: Rule) => { const { re, keys } = compile(r.source, exact), m = re.exec(path); return m && hasMatch(r.has, q) && r.destination.replace(/:(\w+)/g, (_, k: string) => m[keys.indexOf(k) + 1] ?? '') }
  for (const r of v.redirects ?? []) { const to = match(r); if (to) return { redirect: to, permanent: r.permanent !== false } }
  const direct = fileAt(dist, path)
  if (direct) return { file: direct, rewritten: false }
  for (const r of v.rewrites ?? []) {
    if (/^https?:/.test(r.destination)) continue // a proxy (analytics): not a page
    const to = match(r); if (to) { const f = fileAt(dist, to); return f ? { file: f, rewritten: true } : { status: 404 } }
  }
  return { status: 404 }
}
export const show = (o: Outcome) => ('file' in o ? o.file : 'redirect' in o ? `→ ${o.redirect}` : '404')

/** The response headers `vercel.json` gives a request path (later rules override earlier keys, as on Vercel). */
export function headersFor(v: VercelConfig, path: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of v.headers ?? []) if (compile(h.source, true).re.test(path)) for (const { key, value } of h.headers) out[key] = value
  return out
}
