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
 *  - JSON-LD: every block in every built page parses, no page repeats a type, home has `WebSite`, a board `CollectionPage`;
 *  - heads: every sitemap page has its own title and description, one h1, and OG / Twitter images that are built
 *    1200×630 PNGs; redirects take one hop; no HTML comment holds `--` (the W3C checker flags it).
 *
 *   npx tsx scripts/site/seo-check.ts   → exit 1 on a failure
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checker } from '../lib/check'
import { boardAliases, boardIds, boardManifest } from '../../src/widgets/manifest'
import { ABOUT_PATH, titleCase } from '../../src/site/meta'
import { boardBlurbs } from '../../src/widgets/blurbs'
import { viewFromUrl } from '../../src/site/views'
import { POSTS, postPath } from '../../src/blog/posts'
import { parse } from '../../src/blog/markdown'
import { cardsOf, origin, readWidgets } from './seo'
import { esc, STATIC_CLASS } from './seo-html'
import { flag } from '../../src/site/flags'
import { readVercel, route as routeIn, show } from './vercel-routes'

const DIST = 'dist'
const { assert, done } = checker('seo')
if (!existsSync(join(DIST, 'sitemap.xml'))) { assert('seo: dist/sitemap.xml exists (run the build first)', false); done() }

// ── routing: vercel.json against dist/ (./vercel-routes.ts) ──
const vercel = readVercel()
const route = (path: string, exact: boolean) => routeIn(vercel, DIST, path, exact)

const widgets = readWidgets(), sample = widgets[0], lock = widgets.find(w => w.slug.startsWith('lock-'))
/** [path, what it must serve: a file, `→ <to>` for a redirect, or 404]; `view` checks the app opens it. */
const CASES: [path: string, want: string, view?: (v: ReturnType<typeof viewFromUrl>) => boolean][] = [
  ['/', 'index.html'], ['/index.html', 'index.html'], ['/browse', 'browse/index.html', v => v.view === 'BROWSE'], ['/browse/', 'browse/index.html', v => v.view === 'BROWSE'], ['/about', 'about/index.html', v => v.view === 'ABOUT'], ['/about/', 'about/index.html', v => v.view === 'ABOUT'], ['/About/', 'about/index.html', v => v.view === 'ABOUT'], ['/ABOUT', 'about/index.html', v => v.view === 'ABOUT'], ['/?about', '→ /about/'], ['/index.html?about', '→ /about/'], ['/?skin=crt', 'index.html'],
  ...boardIds.flatMap(id => [[`/${id}/`, `${id}/index.html`], [`/${id}`, `${id}/index.html`]] as [string, string][]),
  ...Object.entries(boardAliases).flatMap(([a, to]) => [[`/${a}`, `→ /${to}/`], [`/${a}/`, `→ /${to}/`]] as [string, string][]),
  ...widgets.flatMap(w => [[w.url, `widget/${w.slug}/index.html`], [`/widget/${w.uid}/`, `widget/${w.uid}/index.html`], [`/${w.uid}/`, `${w.uid}/index.html`]] as [string, string][]),
  [`/widget/${sample.slug}`, 'index.html', v => v.widget?.key === sample.slug], [`/${sample.uid}`, 'index.html', v => v.widget?.key === sample.uid],
  // the glyph board became lock: its old card links redirect in one hop to the card's canonical page
  ...(lock ? [`/widget/glyph-${lock.slug.slice(5)}/`, `/widget/glyph-${lock.slug.slice(5)}`].map(p => [p, `→ /widget/${lock.slug}/`]) as typeof CASES : []),
  ['/ab12cd34', 'index.html', v => v.widget?.key === 'ab12cd34'], ['/@acme/widget/timer/', 'index.html', v => v.widget?.scope === 'acme'],
  ['/blog', 'blog/index.html'], ['/blog/', 'blog/index.html'], ...POSTS.map(p => [postPath(p.slug), `blog/${p.slug}/index.html`] as [string, string]),
  ['/essay', '→ /blog/dot-matrix-essay/'], ['/essay/', '→ /blog/dot-matrix-essay/'], ['/essay.html', '→ /blog/dot-matrix-essay/'],
  ['/lab', 'lab/index.html'], ['/lab/', 'lab/index.html'], ['/lab/motion-lab.html', 'lab/motion-lab.html'],
  ['/privacy', 'privacy.html'], ['/privacy/', 'privacy.html'], ['/terms', 'terms.html'], ['/terms/', 'terms.html'],
  ['/sitemap.xml', 'sitemap.xml'], ['/robots.txt', 'robots.txt'], ['/404.html', '404.html'], ['/widgets.json', 'widgets.json'], ['/og/default.png', 'og/default.png'], ['/favicon.svg', 'favicon.svg'], ['/favicon.ico', 'favicon.ico'],
  // the shadcn registry, when the build wrote it (`pnpm registry:build`): static JSON, no SPA fallback
  ...(existsSync(join(DIST, 'r/matrix-core.json')) ? [['/r/registry.json', 'r/registry.json'], ['/r/matrix-core.json', 'r/matrix-core.json'], ['/r/matrix-nope.json', '404']] as [string, string][] : []),
  ...['/nope', '/nope/', '/no/such/page', '/light/extra', '/widget/', '/widget/a/b', '/assets/missing.js', '/og/missing.png', '/sketches', '/lab/motion-lab/x', '/embed/x'].map(p => [p, '404'] as [string, string]),
]
for (const exact of [true, false]) {
  const bad = CASES.flatMap(([path, want, view]) => {
    const o = route(path, exact), got = show(o)
    if (got !== want) return [`${path}: ${got}, want ${want}`]
    if (view && 'file' in o && !view(viewFromUrl(path.includes('?') ? path.slice(path.indexOf('?')) : '', path.split('?')[0]))) return [`${path}: the app does not open the expected view`]
    // one hop: a redirect lands on a page, never on another redirect
    if ('redirect' in o && !('file' in route(o.redirect, true))) return [`${path}: redirect chain via ${o.redirect} (${show(route(o.redirect, true))})`]
    return []
  })
  assert(`seo: vercel.json routes all ${CASES.length} cases as expected, reading sources ${exact ? 'exactly (as Vercel does)' : 'loosely (any case, optional trailing slash)'}`, !bad.length, bad.slice(0, 6).join('; '))
}
const boardRule = vercel.rewrites.find(r => r.source.startsWith('/:board('))?.source ?? ''
assert('seo: the board rewrite in vercel.json lists every board id (add a new board there)', boardRule === `/:board(${boardIds.join('|')})`, boardRule)

// ── sitemap + robots ──
const xml = readFileSync(join(DIST, 'sitemap.xml'), 'utf8'), locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
const expected = 1 + boardIds.length + 2 + widgets.length + 1 + POSTS.length + (flag('lab') ? 3 : 2)
assert(`seo: sitemap.xml lists ${expected} URLs (home, boards, browse, about, widgets, blog, posts, lab, privacy, terms), none twice`, locs.length === expected && new Set(locs).size === locs.length, `${locs.length} URLs`)
const strayWidget = locs.filter(l => l.includes('/widget/') && !widgets.some(w => l === origin + w.url))
assert('seo: the sitemap lists widgets by their canonical slug URL only (no uid or alias forms)', !strayWidget.length, strayWidget.slice(0, 3).join(', '))
if (origin) assert(`seo: every sitemap URL is absolute on ${origin}`, locs.every(l => l.startsWith(`${origin}/`)))
const canonicalOf = (f: string) => /<link rel="canonical" href="([^"]+)"/.exec(readFileSync(join(DIST, f), 'utf8'))?.[1]?.replace(/&amp;/g, '&')
const badLoc = locs.flatMap(l => { const o = route(l.slice(origin.length), true); return !('file' in o) ? [`${l}: ${show(o)}`] : canonicalOf(o.file) !== l ? [`${l}: canonical ${canonicalOf(o.file)}`] : [] })
assert('seo: every sitemap URL is served by a built page whose canonical is that URL', !badLoc.length, badLoc.slice(0, 6).join('; '))
const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8')
assert('seo: robots.txt allows crawling' + (origin ? ' and names the absolute sitemap URL' : ''), /^User-agent: \*$/m.test(robots) && !/^Disallow: \/$/m.test(robots) && (!origin || robots.includes(`Sitemap: ${origin}/sitemap.xml`)), robots.replace(/\n/g, ' | '))

// ── every sitemap page's head: a title and description no other page has, one h1, OG and Twitter image tags
// naming a built 1200×630 PNG ──
const titles = new Map<string, string[]>(), descs = new Map<string, string[]>(), headBad: string[] = [], caps: string[] = [], pngs = new Map<string, string>()
const pngSize = (f: string) => { const b = readFileSync(f); return b.toString('latin1', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : 'not a PNG' }
for (const l of locs) {
  const o = route(l.slice(origin.length), true)
  if (!('file' in o)) continue
  const html = readFileSync(join(DIST, o.file), 'utf8'), attr = (re: RegExp) => re.exec(html)?.[1]?.replace(/&amp;/g, '&')
  const title = attr(/<title>([^<]*)<\/title>/) ?? '', desc = attr(/<meta name="description" content="([^"]*)"/) ?? ''
  // search titles: title case through `searchTitle` (src/site/meta.ts), the same in <title>, og:title and twitter:title
  const og = attr(/<meta property="og:title" content="([^"]*)"/), twt = attr(/<meta name="twitter:title" content="([^"]*)"/)
  if (titleCase(title) !== title || og !== title || twt !== title) caps.push(`${l}: "${title}" (og "${og}", twitter "${twt}")`)
  titles.set(title, [...(titles.get(title) ?? []), l]); descs.set(desc, [...(descs.get(desc) ?? []), l])
  const h1 = (html.match(/<h1[\s>]/g) ?? []).length
  if (!title || !desc || h1 !== 1) headBad.push(`${l}: ${!title ? 'no title ' : ''}${!desc ? 'no description ' : ''}${h1} h1`)
  const img = attr(/<meta property="og:image" content="([^"]+)"/), tw = attr(/<meta name="twitter:image" content="([^"]+)"/)
  if (!img || img !== tw || !/<meta name="twitter:card" content="summary_large_image"/.test(html)) { headBad.push(`${l}: og:image ${img}, twitter:image ${tw}`); continue }
  const file = join(DIST, img.slice(origin.length)), size = pngs.get(file) ?? (existsSync(file) ? pngSize(file) : 'missing')
  pngs.set(file, size)
  if (!img.startsWith(`${origin}/`) || size !== '1200x630') headBad.push(`${l}: og:image ${img} is ${size}`)
}
const twice = (m: Map<string, string[]>) => [...m].filter(([, v]) => v.length > 1).map(([k, v]) => `"${k.slice(0, 60)}" on ${v.slice(0, 3).join(', ')}`)
assert(`seo: all ${locs.length} sitemap pages have a title, a description and one h1, and OG and Twitter images that are built 1200×630 PNGs`, !headBad.length, headBad.slice(0, 6).join('; '))
assert('seo: no two sitemap pages share a title', !twice(titles).length, twice(titles).slice(0, 4).join('; '))
assert('seo: every sitemap page title is in title case (no all-caps words but acronyms) and og:title and twitter:title match it', !caps.length, caps.slice(0, 4).join('; '))
assert('seo: no two sitemap pages share a description', !twice(descs).length, twice(descs).slice(0, 4).join('; '))

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
const browse = rootBlock(read('browse/index.html'), 'root'), browseMiss = widgets.filter(w => !browse.includes(`href="${w.url}"`)).map(w => w.slug)
assert(`seo: the browse page carries its h1 and a link to all ${widgets.length} cards`, browse.includes('<h1>') && !browseMiss.length, browseMiss.slice(0, 3).join(', '))
assert('seo: the blog and lab indexes carry their static block', ['blog.html', 'blog/index.html'].every(f => rootBlock(read(f), 'blog').includes('<h1>')) && ['lab.html', 'lab/index.html'].every(f => rootBlock(read(f), 'lab').includes('<h1>')))

// ── every built page: JSON-LD parses, no type twice, no display:none on the static block ──
const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') ? [p] : [] })
const ldBad: string[] = [], hidden: string[] = [], dashes: string[] = []
for (const f of walk(DIST)) {
  const html = readFileSync(f, 'utf8'), types: string[] = []
  for (const [, body] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { types.push(JSON.parse(body)['@type']) } catch { ldBad.push(`${f}: does not parse`) }
  }
  if (new Set(types).size !== types.length) ldBad.push(`${f}: ${types.join(' + ')}`)
  if (new RegExp(`\\.${STATIC_CLASS}\\{[^}]*display:\\s*none`).test(html)) hidden.push(f)
  // `--` inside a comment is valid HTML, but the W3C checker flags it (the page no longer maps to XML)
  if ([...html.matchAll(/<!--([\s\S]*?)-->/g)].some(m => m[1].includes('--'))) dashes.push(f)
}
assert('seo: every JSON-LD block in every built page parses, and no page repeats a type', !ldBad.length, ldBad.slice(0, 6).join('; '))
assert('seo: no page hides its static block with display:none', !hidden.length, hidden.slice(0, 3).join(', '))
assert('seo: no HTML comment in a built page holds a double hyphen', !dashes.length, dashes.slice(0, 3).join(', '))
const lds = (f: string) => [...read(f).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]))
assert('seo: the about page has AboutPage JSON-LD and its static block (h1 and the log)', lds('about/index.html').some(o => o['@type'] === 'AboutPage' && o.url === origin + ABOUT_PATH) && /<h1>About<\/h1>[\s\S]*<time datetime=/.test(rootBlock(read('about/index.html'), 'root')))
assert('seo: the home page has WebSite JSON-LD', lds('index.html').some(o => o['@type'] === 'WebSite'))
const ldGaps = boardIds.filter(id => lds(`${id}/index.html`).find(o => o['@type'] === 'CollectionPage')?.hasPart?.length !== cardsOf(id, widgets).length)
assert('seo: every board page has a CollectionPage with its cards as hasPart', !ldGaps.length, ldGaps.join(', '))

// ── 404 ──
const nf = existsSync(join(DIST, '404.html')) ? read('404.html') : ''
// the h1 holds text, not only the drawing (the W3C checker calls an svg-only heading empty)
const nfH1 = /<h1>([\s\S]*?)<\/h1>/.exec(nf)?.[1] ?? '', nfH1Text = nfH1.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim()
assert('seo: dist/404.html is a noindex page with the dot 404 and a text h1, links home and to the boards, and no script', nf.includes('content="noindex"') && nfH1.startsWith('<svg') && !!nfH1Text && nf.includes('href="/"') && boardIds.every(id => nf.includes(`href="/${id}/"`)) && !/<script/i.test(nf))

done('all seo checks passed')
