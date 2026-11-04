/**
 * Checks the SEO step's output in a built `dist/` (issue #146; `scripts/site/seo.ts`). Run after the build, in CI too:
 *  - routing: `vercel.json` played against `dist/` (redirects, then files, then rewrites, else 404.html), under both
 *    readings of a `source` (exact, and case-insensitive with an optional trailing slash). Every route shape the app
 *    supports (`src/site/routes.ts`, `src/site/views.ts`) still serves a page, and the app's own resolver opens the
 *    right view on the ones that fall back to index.html; board aliases redirect; unknown paths get the 404 page;
 *  - the sitemap: one URL per canonical page, each served by a built file whose canonical is that URL (absolute when
 *    `SITE_URL` / `VERCEL_PROJECT_PRODUCTION_URL` is set), and robots.txt names it;
 *  - the crawlable roots: a board page has its h1, blurb and a link to every card; widget pages link their board; the
 *    home page links every board; markdown posts carry their headings; nothing is hidden with `display:none`;
 *  - JSON-LD: every block in every built page parses, no page repeats a type, home has `WebSite`, a board `CollectionPage`.
 *
 *   npx tsx scripts/site/seo-check.ts   → exit 1 on a failure
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { checker } from '../lib/check'
import { boardAliases, boardIds, boardManifest } from '../../src/widgets/manifest'
import { boardBlurbs } from '../../src/widgets/blurbs'
import { viewFromUrl } from '../../src/site/views'
import { POSTS, postPath } from '../../src/blog/posts'
import { parse } from '../../src/blog/markdown'
import { cardsOf, origin, readWidgets } from './seo'
import { esc, STATIC_CLASS } from './seo-html'
import { flag } from '../../src/site/flags'

const DIST = 'dist'
const { assert, done } = checker('seo')
if (!existsSync(join(DIST, 'sitemap.xml'))) { assert('seo: dist/sitemap.xml exists (run the build first)', false); done() }

// ── routing: vercel.json against dist/ ──
interface Rule { source: string; destination: string }
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as { redirects: Rule[]; rewrites: Rule[] }
/** A `source` as a RegExp and its param names. `exact`: Vercel's own reading (case-sensitive, no optional slash). */
function compile(source: string, exact: boolean): { re: RegExp; keys: string[] } {
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
const isFile = (p: string) => { const f = join(DIST, p.endsWith('/') ? p + 'index.html' : p); return existsSync(f) && statSync(f).isFile() ? relative(DIST, f).replace(/\\/g, '/') : undefined }
type Outcome = { file: string; rewritten: boolean } | { redirect: string } | { status: 404 }
function route(path: string, exact: boolean): Outcome {
  const match = (r: Rule) => { const { re, keys } = compile(r.source, exact), m = re.exec(path); return m && r.destination.replace(/:(\w+)/g, (_, k: string) => m[keys.indexOf(k) + 1] ?? '') }
  for (const r of vercel.redirects ?? []) { const to = match(r); if (to) return { redirect: to } }
  const direct = isFile(path)
  if (direct) return { file: direct, rewritten: false }
  for (const r of vercel.rewrites ?? []) { const to = match(r); if (to) { const f = isFile(to); return f ? { file: f, rewritten: true } : { status: 404 } } }
  return { status: 404 }
}
const show = (o: Outcome) => ('file' in o ? o.file : 'redirect' in o ? `→ ${o.redirect}` : '404')

const widgets = readWidgets(), sample = widgets[0], lock = widgets.find(w => w.slug.startsWith('lock-'))
/** [path, what it must serve: a file, `→ <to>` for a redirect, or 404]; `view` checks the app opens it. */
const CASES: [path: string, want: string, view?: (v: ReturnType<typeof viewFromUrl>) => boolean][] = [
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/about', 'index.html', v => v.view === 'ABOUT'], ['/about/', 'index.html', v => v.view === 'ABOUT'],
  ...boardIds.flatMap(id => [[`/${id}/`, `${id}/index.html`], [`/${id}`, `${id}/index.html`]] as [string, string][]),
  ...Object.entries(boardAliases).flatMap(([a, to]) => [[`/${a}`, `→ /${to}/`], [`/${a}/`, `→ /${to}/`]] as [string, string][]),
  ...widgets.flatMap(w => [[w.url, `widget/${w.slug}/index.html`], [`/widget/${w.uid}/`, `widget/${w.uid}/index.html`], [`/${w.uid}/`, `${w.uid}/index.html`]] as [string, string][]),
  [`/widget/${sample.slug}`, 'index.html', v => v.widget?.key === sample.slug], [`/${sample.uid}`, 'index.html', v => v.widget?.key === sample.uid],
  ...(lock ? [[`/widget/glyph-${lock.slug.slice(5)}/`, 'index.html', v => v.widget?.key === `glyph-${lock.slug.slice(5)}`]] as typeof CASES : []),
  ['/ab12cd34', 'index.html', v => v.widget?.key === 'ab12cd34'], ['/@acme/widget/timer/', 'index.html', v => v.widget?.scope === 'acme'],
  ['/blog', 'blog/index.html'], ['/blog/', 'blog/index.html'], ...POSTS.map(p => [postPath(p.slug), `blog/${p.slug}/index.html`] as [string, string]),
  ['/essay', '→ /blog/dot-matrix-essay/'], ['/essay/', '→ /blog/dot-matrix-essay/'], ['/essay.html', '→ /blog/dot-matrix-essay/'],
  ['/lab', 'lab/index.html'], ['/lab/', 'lab/index.html'], ['/lab/motion-lab.html', 'lab/motion-lab.html'],
  ['/privacy', 'privacy.html'], ['/privacy/', 'privacy.html'], ['/terms', 'terms.html'], ['/terms/', 'terms.html'],
  ['/sitemap.xml', 'sitemap.xml'], ['/robots.txt', 'robots.txt'], ['/404.html', '404.html'], ['/widgets.json', 'widgets.json'], ['/og/default.png', 'og/default.png'], ['/favicon.svg', 'favicon.svg'],
  ...['/nope', '/nope/', '/no/such/page', '/light/extra', '/widget/', '/widget/a/b', '/assets/missing.js', '/og/missing.png', '/sketches', '/lab/motion-lab/x', '/embed/x'].map(p => [p, '404'] as [string, string]),
]
for (const exact of [true, false]) {
  const bad = CASES.flatMap(([path, want, view]) => {
    const o = route(path, exact), got = show(o)
    if (got !== want) return [`${path}: ${got}, want ${want}`]
    if (view && 'file' in o && !view(viewFromUrl('', path))) return [`${path}: the app does not open the expected view`]
    return []
  })
  assert(`seo: vercel.json routes all ${CASES.length} cases as expected, reading sources ${exact ? 'exactly (as Vercel does)' : 'loosely (any case, optional trailing slash)'}`, !bad.length, bad.slice(0, 6).join('; '))
}
const boardRule = vercel.rewrites.find(r => r.source.startsWith('/:board('))?.source ?? ''
assert('seo: the board rewrite in vercel.json lists every board id (add a new board there)', boardRule === `/:board(${boardIds.join('|')})`, boardRule)

// ── sitemap + robots ──
const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8'), locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
const expected = 1 + boardIds.length + widgets.length + 1 + POSTS.length + (flag('lab') ? 3 : 2)
assert(`seo: sitemap.xml lists ${expected} URLs (home, boards, widgets, blog, posts, lab, privacy, terms), none twice`, locs.length === expected && new Set(locs).size === locs.length, `${locs.length} URLs`)
const strayWidget = locs.filter(l => l.includes('/widget/') && !widgets.some(w => l === origin + w.url))
assert('seo: the sitemap lists widgets by their canonical slug URL only (no uid or alias forms)', !strayWidget.length, strayWidget.slice(0, 3).join(', '))
if (origin) assert(`seo: every sitemap URL is absolute on ${origin}`, locs.every(l => l.startsWith(`${origin}/`)))
const canonicalOf = (f: string) => /<link rel="canonical" href="([^"]+)"/.exec(readFileSync(join(DIST, f), 'utf8'))?.[1]?.replace(/&amp;/g, '&')
const badLoc = locs.flatMap(l => { const o = route(l.slice(origin.length), true); return !('file' in o) ? [`${l}: ${show(o)}`] : canonicalOf(o.file) !== l ? [`${l}: canonical ${canonicalOf(o.file)}`] : [] })
assert('seo: every sitemap URL is served by a built page whose canonical is that URL', !badLoc.length, badLoc.slice(0, 6).join('; '))
const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8')
assert('seo: robots.txt allows crawling' + (origin ? ' and names the absolute sitemap URL' : ''), /^User-agent: \*$/m.test(robots) && !/^Disallow: \/$/m.test(robots) && (!origin || robots.includes(`Sitemap: ${origin}/sitemap.xml`)), robots.replace(/\n/g, ' | '))

// ── crawlable roots ──
const read = (f: string) => readFileSync(join(DIST, f), 'utf8')
const rootBlock = (html: string, id: string) => new RegExp(`<div id="${id}"><!-- seo -->([\\s\\S]*?)<!-- /seo --></div>`).exec(html)?.[1] ?? ''
const boardGaps = boardIds.flatMap(id => {
  const b = rootBlock(read(`${id}/index.html`), 'root'), title = boardManifest.find(x => x.id === id)!.title
  const miss = cardsOf(id, widgets).filter(w => !b.includes(`href="${w.url}"`)).map(w => w.slug)
  return !b.includes(`<h1>${esc(title)}</h1>`) || !b.includes(esc(boardBlurbs[id as keyof typeof boardBlurbs])) || miss.length ? [`${id}${miss.length ? ` (no link to ${miss.slice(0, 3).join(', ')})` : ''}`] : []
})
assert(`seo: all ${boardIds.length} board pages carry their h1, blurb and a link to every card in the root`, !boardGaps.length, boardGaps.slice(0, 6).join('; '))
const widgetGaps = widgets.filter(w => [`widget/${w.slug}`, `widget/${w.uid}`, w.uid].some(d => { const b = rootBlock(read(`${d}/index.html`), 'root'); return !b.includes('<h1>') || !b.includes(`href="/${w.board}/"`) })).map(w => w.slug)
assert(`seo: all ${widgets.length * 3} widget pages carry the card's h1 and a link to its board`, !widgetGaps.length, widgetGaps.slice(0, 6).join(', '))
const home = rootBlock(read('index.html'), 'root'), homeMiss = boardIds.filter(id => !home.includes(`href="/${id}/"`))
assert('seo: the home page links every board', home.includes('<h1>') && !homeMiss.length, homeMiss.join(', '))
const postGaps = POSTS.filter(p => {
  const b = rootBlock(read(`blog/${p.slug}/index.html`), 'blog'), md = join('docs', 'blog', `${p.slug}.md`)
  const heads = p.kind === 'md' && existsSync(md) ? parse(readFileSync(md, 'utf8')).flatMap(x => (x.t === 'h' && x.level > 1 ? [x.id] : [])) : []
  return !b.includes(`<h1>${esc(p.title)}</h1>`) || heads.some(h => !b.includes(`id="${h}"`))
}).map(p => p.slug)
assert('seo: every blog post page carries its title, and a markdown post its whole text (every heading)', !postGaps.length, postGaps.join(', '))
assert('seo: the blog and lab indexes carry their static block', ['blog.html', 'blog/index.html'].every(f => rootBlock(read(f), 'blog').includes('<h1>')) && ['lab.html', 'lab/index.html'].every(f => rootBlock(read(f), 'lab').includes('<h1>')))

// ── every built page: JSON-LD parses, no type twice, no display:none on the static block ──
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [] })
const ldBad: string[] = [], hidden: string[] = []
for (const f of walk(DIST)) {
  const html = readFileSync(f, 'utf8'), types: string[] = []
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { types.push(JSON.parse(body)['@type']) } catch { ldBad.push(`${f}: does not parse`) }
  }
  if (new Set(types).size !== types.length) ldBad.push(`${f}: ${types.join(' + ')}`)
  if (new RegExp(`\\.${STATIC_CLASS}\\{[^}]*display:\\s*none`).test(html)) hidden.push(f)
}
assert('seo: every JSON-LD block in every built page parses, and no page repeats a type', !ldBad.length, ldBad.slice(0, 6).join('; '))
assert('seo: no page hides its static block with display:none', !hidden.length, hidden.slice(0, 3).join(', '))
const lds = (f: string) => [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
assert('seo: the home page has WebSite JSON-LD', lds('index.html').some(o => o['@type'] === 'WebSite'))
const ldGaps = boardIds.filter(id => lds(`${id}/index.html`).find(o => o['@type'] === 'CollectionPage')?.hasPart?.length !== cardsOf(id, widgets).length)
assert('seo: every board page has a CollectionPage with its cards as hasPart', !ldGaps.length, ldGaps.join(', '))

// ── 404 ──
const nf = existsSync(join(DIST, '404.html')) ? read('404.html') : ''
assert('seo: dist/404.html is a noindex page with the dot 404, links home and to the boards, and no script', nf.includes('content="noindex"') && nf.includes('<svg') && nf.includes('href="/"') && boardIds.every(id => nf.includes(`href="/${id}/"`)) && !/<script/i.test(nf))

done('all seo checks passed')
