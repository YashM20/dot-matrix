/**
 * Page-speed checks on a built `dist/` and `vercel.json` (the SEO page-speed pass; scripts/ci/lighthouse.ts measures
 * the same pages in a browser). Each check pins one thing Lighthouse found, so it can't come back without a browser:
 *  - every built page has at most one render-blocking stylesheet and no render-blocking script (a CSS import in a
 *    module shared by two pages becomes a second stylesheet: put it in the page's own CSS with `@import`);
 *  - the first-load fonts use `font-display: swap`, are woff2, and ship from `/assets/` (cached for a year);
 *  - caching: hashed `/assets/` are immutable, the icons, OG images and blog images get a cache lifetime;
 *  - images: OG images are 1200 × 630 PNGs under 300 kB, every `<img>` in a built page has width, height and alt;
 *  - LCP and CLS: each blog page preloads its hero (the LCP image, drawn by React), and a lazy view's placeholder
 *    holds a full screen (and so does a widget page while its card loads), so the footer never paints in the first
 *    screen and then jumps;
 *  - cold load (#348): `/` and each board page preload the lazy chunks they are sure to need, and nothing more.
 *
 *   npx tsx scripts/site/perf-check.ts [--dist <dir>]   → exit 1 on a failure (CI runs it after the build)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checker } from '../lib/check'
import { sourceRegex } from '../lib/vercel-source'
import { BROWSE_MODULE, CHUNK_GRAPH, boardModules, closure, entryOf, leadBoards, modulePreloads, readGraph } from './preload'

const argv = process.argv.slice(2)
const DIST = argv.includes('--dist') ? argv[argv.indexOf('--dist') + 1] : 'dist'
const { assert, done } = checker('perf')
if (!existsSync(join(DIST, 'index.html'))) { assert(`perf: ${DIST}/index.html exists (run the build first)`, false); done() }

const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = walk(DIST)
const pages = files.filter(f => f.endsWith('.html'))
const rel = (f: string) => relative(DIST, f).replace(/\\/g, '/')

// ── render-blocking resources ──
const head = (html: string) => html.slice(0, Math.max(0, html.indexOf('</head>')))
const blockingCss = (html: string) => [...head(html).matchAll(/<link\b[^>]*\brel="stylesheet"[^>]*>/g)].map(m => m[0]).filter(l => !/\bmedia="(print|not all)"/.test(l))
const blockingJs = (html: string) => [...head(html).matchAll(/<script\b[^>]*\bsrc="[^"]+"[^>]*>/g)].map(m => m[0]).filter(t => !/\btype="module"|\basync\b|\bdefer\b/.test(t))
const twoCss = pages.filter(p => blockingCss(readFileSync(p, 'utf8')).length > 1)
assert('perf: every page has at most one render-blocking stylesheet', !twoCss.length,
  twoCss.length ? `${twoCss.length} pages, e.g. ${rel(twoCss[0])}: ${blockingCss(readFileSync(twoCss[0], 'utf8')).map(l => /href="([^"]+)"/.exec(l)?.[1]).join(', ')}` : `${pages.length} pages`)
const syncJs = pages.filter(p => blockingJs(readFileSync(p, 'utf8')).length)
assert('perf: no page loads a render-blocking script in <head>', !syncJs.length, syncJs.slice(0, 3).map(rel).join(', '))

// ── fonts ──
const index = readFileSync(join(DIST, 'index.html'), 'utf8')
const css = blockingCss(index).map(l => /href="\/([^"]+)"/.exec(l)?.[1]).filter((h): h is string => !!h).map(h => readFileSync(join(DIST, h), 'utf8')).join('\n')
const faces = [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1])
assert('perf: the home page stylesheet declares its web font', faces.length > 0, `${faces.length} @font-face`)
assert('perf: every @font-face uses font-display: swap (text shows before the font loads)', faces.every(f => /font-display:\s*swap/.test(f)))
const fontUrls = faces.flatMap(f => [...f.matchAll(/url\(([^)]+)\)/g)].map(m => m[1].replace(/["']/g, '')))
assert('perf: web fonts are woff2 from /assets/ (hashed, cached for a year)', fontUrls.length > 0 && fontUrls.every(u => /^\/assets\/[^/]+\.woff2$/.test(u)), fontUrls.filter(u => !/^\/assets\/[^/]+\.woff2$/.test(u)).join(', '))

// ── caching headers (vercel.json): the last matching block wins for a key, as on Vercel ──
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] }
const cacheOf = (path: string) => vercel.headers.filter(b => sourceRegex(b.source).test(path)).flatMap(b => b.headers).filter(h => h.key.toLowerCase() === 'cache-control').pop()?.value ?? ''
const maxAge = (v: string) => Number(/max-age=(\d+)/.exec(v)?.[1] ?? 0)
const asset = files.map(rel).find(f => /^assets\/.+\.js$/.test(f)) ?? 'assets/x.js'
assert('perf: hashed /assets/ are cached for a year, immutable', maxAge(cacheOf(`/${asset}`)) >= 31536000 && /immutable/.test(cacheOf(`/${asset}`)), cacheOf(`/${asset}`))
for (const p of ['/og/default.png', '/og/blog/blog-hero.png', '/favicon.svg', '/favicon.ico', '/icons/apple-touch-icon.png'])
  assert(`perf: ${p} has a cache lifetime of at least a day`, maxAge(cacheOf(p)) >= 86400, cacheOf(p) || 'none (Vercel revalidates every request)')

// ── images ──
const png = (f: string) => { const b = readFileSync(f); return b.toString('latin1', 1, 4) === 'PNG' ? { w: b.readUInt32BE(16), h: b.readUInt32BE(20) } : null }
const og = files.filter(f => /[\\/]og[\\/]/.test(f) && f.endsWith('.png') && !/-hero\.png$/.test(f))
const badOg = og.filter(f => { const d = png(f); return !d || d.w !== 1200 || d.h !== 630 || statSync(f).size > 300 * 1024 })
assert('perf: OG images are 1200 × 630 PNGs under 300 kB', og.length > 0 && !badOg.length, badOg.length ? badOg.slice(0, 3).map(rel).join(', ') : `${og.length} images, largest ${Math.round(Math.max(...og.map(f => statSync(f).size)) / 1024)} kB`)
const imgs = pages.flatMap(p => [...readFileSync(p, 'utf8').matchAll(/<img\b[^>]*>/g)].map(m => ({ p, tag: m[0] })))
const badImg = imgs.filter(i => !/\bwidth="\d+"/.test(i.tag) || !/\bheight="\d+"/.test(i.tag) || !/\balt="/.test(i.tag))
assert('perf: every <img> in a built page has width, height (no layout shift) and alt', !badImg.length, badImg.slice(0, 2).map(i => `${rel(i.p)}: ${i.tag.slice(0, 80)}`).join('; ') || `${imgs.length} images`)

// ── LCP and layout shift ──
// the blog's hero is its LCP image and React draws it: each page names it in a preload, so it loads with the CSS
const heroes = readdirSync(join(DIST, 'og', 'blog')).filter(f => f.endsWith('-hero.png'))
const blogPages = pages.filter(p => /^blog\/([^/]+\/)?index\.html$/.test(rel(p)))
const noPreload = blogPages.filter(p => {
  const slug = /^blog\/([^/]+)\//.exec(rel(p))?.[1] ?? 'blog', hero = `${slug}-hero.png`
  return heroes.includes(hero) && !new RegExp(`<link rel="preload" as="image" href="/og/blog/${hero}" fetchpriority="high"`).test(head(readFileSync(p, 'utf8')))
})
assert('perf: every blog page preloads its hero image (the LCP image)', blogPages.length > 0 && !noPreload.length, noPreload.map(rel).join(', ') || `${blogPages.length} pages`)
// blog.html answers any other /blog/ path (vercel.json): a hero preload there would fetch an image the page never shows
assert('perf: the blog fallback page (blog.html) preloads no image', !/<link rel="preload" as="image"/.test(readFileSync(join(DIST, 'blog.html'), 'utf8')))
// a lazy view's placeholder holds a full screen, so the footer first paints below the fold (CLS on /browse/, /about
// and the widget pages came from a 60vh placeholder)
const loading = /\.view-loading\{([^}]*)\}/.exec(css)?.[1] ?? ''
assert('perf: the lazy view placeholder is at least a screen tall (no footer jump)', /min-height:100s?vh/.test(loading), loading || 'no .view-loading rule')
// the same for a widget page while its card's board loads (its own chunk's stylesheet)
const lazyCss = files.filter(f => /^assets\/[^/]+\.css$/.test(rel(f))).map(f => readFileSync(f, 'utf8')).join('\n')
assert('perf: a loading widget page is at least a screen tall (no footer jump on phones)', /\.wp\[aria-busy=("?)true\1\]\{[^}]*min-height:100s?vh/.test(lazyCss))

// ── cold-load hints (#348, scripts/site/preload.ts) ──
// `/` and each board page preload the lazy chunks they are sure to need, and no other page preloads any. The expected
// lists come from the chunk files on disk (their static imports, as size.ts reads them); only the roots' file names
// come from the build's chunk graph.
if (!existsSync(CHUNK_GRAPH)) assert(`perf: the build left its chunk graph (${CHUNK_GRAPH})`, false)
else {
  const graph = readGraph(), mods = boardModules(), assets = join(DIST, 'assets')
  const imports = (f: string) => existsSync(join(assets, f)) ? [...readFileSync(join(assets, f), 'utf8').matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map(m => m[1]) : []
  const loadedBy = (html: string) => { const e = entryOf(html); return new Set(e ? closure(imports, [e]) : []) }
  /** A page's module preloads beyond its entry's static closure (which Vite preloads itself). */
  const extra = (html: string) => { const loaded = loadedBy(html); return modulePreloads(html).filter(f => !loaded.has(f)) }
  const want = (html: string, roots: string[]) => closure(imports, roots.map(r => graph.modules[r] ?? `(no chunk for ${r})`), loadedBy(html))
  /** Empty when `html` preloads exactly what `roots` need, each root included; else what it has against what it needs. */
  const diff = (html: string, roots: string[]) => {
    const has = extra(html), need = want(html, roots)
    const ok = has.length === need.length && need.every(f => has.includes(f)) && roots.every(r => has.includes(graph.modules[r]))
    return ok ? '' : `has ${has.join(', ') || 'none'}; needs ${need.join(', ')}`
  }
  const lead = leadBoards(), home = readFileSync(join(DIST, 'index.html'), 'utf8')
  const homeDiff = diff(home, [BROWSE_MODULE, ...lead.map(id => mods.get(id) ?? id)])
  assert(`perf: / preloads ALL's chunk and its first row's boards (${lead.join(', ')}), and nothing more`, lead.length > 0 && !homeDiff, homeDiff)
  const badBoards = [...mods].map(([id, mod]) => [id, diff(readFileSync(join(DIST, id, 'index.html'), 'utf8'), [mod])]).filter(([, d]) => d)
  assert('perf: each board page preloads its own chunk, and nothing more', mods.size > 0 && !badBoards.length, badBoards.slice(0, 3).map(([id, d]) => `${id}: ${d}`).join('; ') || `${mods.size} boards`)
  const hinted = new Set(['index.html', ...[...mods.keys()].map(id => `${id}/index.html`)])
  const others = pages.filter(p => !hinted.has(rel(p)) && extra(readFileSync(p, 'utf8')).length)
  assert('perf: no other page preloads a lazy chunk', !others.length, others.slice(0, 3).map(rel).join(', '))
  const missing = pages.flatMap(p => modulePreloads(readFileSync(p, 'utf8'))).filter(f => !existsSync(join(assets, f)))
  assert('perf: every module preload names a built file', !missing.length, [...new Set(missing)].slice(0, 3).join(', '))
}

done('perf checks passed')
