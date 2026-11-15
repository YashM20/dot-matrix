/**
 * Cold-load hints (#348). Each prerendered page names the lazy chunks it is certain to need as
 * `<link rel="modulepreload">` (and their CSS as `<link rel="preload" as="style">`), so the browser fetches them beside
 * the main bundle instead of one round trip after it runs:
 *  - `/` (ALL) needs the grid's chunk and the chunks of the boards its first row draws (`STILL_LEAD`,
 *    src/components/browse/data.ts): those cards mount at load on every screen size;
 *  - `/<board>/` needs that board's chunk.
 * Each root brings the chunks it imports statically, minus what the entry already loads (Vite preloads those itself).
 * Nothing speculative: a board the visitor might open next is the runtime prefetch's job (#346).
 *
 * `chunkGraph()` (chunk-graph.ts, run by vite.config.ts) records the build's chunk graph outside `dist/`, so nothing
 * ships; postbuild.ts writes the tags, perf-check.ts checks them and size.ts reports their bytes.
 */
import { readFileSync } from 'node:fs'
import { STILL_LEAD } from '../../src/components/browse/data'
import { catalog } from '../../src/widgets/catalog'
import { CHUNK_GRAPH, type ChunkGraph } from './chunk-graph'

export { CHUNK_GRAPH, type ChunkGraph }
export const readGraph = (file = CHUNK_GRAPH): ChunkGraph => JSON.parse(readFileSync(file, 'utf8'))

/** The page's entry script (`/assets/main-*.js`), from its HTML. */
export const entryOf = (html: string) => /<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/.exec(html)?.[1]

/** `roots` and every chunk they import statically, roots first (breadth-first), minus `skip`. */
export function closure(imports: (file: string) => readonly string[], roots: readonly string[], skip: ReadonlySet<string> = new Set()): string[] {
  const seen = new Set<string>(), queue = [...roots]
  for (let f = queue.shift(); f !== undefined; f = queue.shift()) if (!seen.has(f) && !skip.has(f)) { seen.add(f); queue.push(...imports(f)) }
  return [...seen]
}

/** The source module each board's loader imports (`manifest.ts` `load`), e.g. `lock` → `src/widgets/boards/glyph`. */
export function boardModules(manifest = readFileSync('src/widgets/manifest.ts', 'utf8')): Map<string, string> {
  return new Map([...manifest.matchAll(/\{ id: '([\w-]+)'.*?import\('\.(\/boards\/[\w/-]+)'\)/g)].map(m => [m[1], `src/widgets${m[2]}`]))
}

/** ALL's own chunk: the root of the `/` page's hints, with the boards of its first row. */
export const BROWSE_MODULE = 'src/components/browse/Browse'
/** The boards ALL's first row draws (`STILL_LEAD`), in order. */
export const leadBoards = (): string[] => [...new Set(STILL_LEAD.map(slug => catalog.find(r => r[0] === slug)?.[2] ?? ''))].filter(Boolean)

/** The chunks (and their CSS) a page needs beyond its entry: `roots` are source modules (`BROWSE_MODULE`, a board's). */
export function pageHints(g: ChunkGraph, entry: string, roots: readonly string[]): { js: string[]; css: string[] } {
  const imports = (f: string) => g.chunks[f]?.imports ?? []
  const loaded = new Set(closure(imports, [entry]))
  const files = roots.map(r => { const f = g.modules[r]; if (!f) throw new Error(`preload: no chunk holds ${r}`); return f })
  const js = closure(imports, files, loaded)
  const linked = new Set([...loaded].flatMap(f => g.chunks[f]?.css ?? []))
  return { js, css: [...new Set(js.flatMap(f => g.chunks[f]?.css ?? []))].filter(f => !linked.has(f)) }
}

/** The tags, as Vite writes its own: `crossorigin` on module preloads (a module fetch is a CORS fetch), none on CSS
 * (Vite's loader adds the stylesheet without it, so the preloaded response is the one it uses). */
export const hintTags = ({ js, css }: { js: readonly string[]; css: readonly string[] }) => [
  ...js.map(f => `<link rel="modulepreload" crossorigin href="/assets/${f}">`),
  ...css.map(f => `<link rel="preload" as="style" href="/assets/${f}">`),
]

/** `html` with `tags` right after Vite's own module preloads (or the entry script), so they start in the same burst. */
export function withHints(html: string, tags: readonly string[]): string {
  if (!tags.length) return html
  const head = html.slice(0, html.indexOf('</head>'))
  const last = [...head.matchAll(/<link rel="modulepreload"[^>]*>|<script type="module"[^>]*><\/script>/g)].pop()
  if (!last) throw new Error('preload: no entry script in the page head')
  const at = last.index + last[0].length
  return `${html.slice(0, at)}\n    ${tags.join('\n    ')}${html.slice(at)}`
}

/** Every `<link rel="modulepreload">` file in a page's head. */
export const modulePreloads = (html: string) => [...html.slice(0, html.indexOf('</head>')).matchAll(/<link rel="modulepreload"[^>]*href="\/assets\/([^"]+)"/g)].map(m => m[1])
