/**
 * SEO step (issue #146, docs/DEPLOY.md "SEO"). Runs on `dist/` after `scripts/site/postbuild.ts` (the
 * `site-postbuild` plugin in vite.config.ts runs both) and reads only what postbuild wrote plus the pure board, blog
 * and lab data:
 *
 * 1. Crawlable roots: every board page, widget page, the home page, the blog and the lab get a static block inside
 *    their root `<div>` (`./seo-html.ts`): headings, blurbs and links. The app's `createRoot` replaces it on mount.
 *    Markdown posts carry their whole text; the essay (a TSX page) carries its title and line.
 * 2. JSON-LD: `WebSite` on the home page, a `CollectionPage` per board with its cards as `hasPart`. Widget, blog and
 *    lab pages already have theirs from postbuild.
 * 3. `dist/sitemap.xml` (home, boards, BROWSE, canonical widget slugs, blog, the lab while its flag is on, privacy, terms) and `dist/robots.txt`.
 * 4. A `rel=canonical` on the legal pages, which have none in their source.
 * 5. `dist/404.html` (`./notfound.ts`): what Vercel serves for a path no file or rewrite matches.
 *
 * Every insert sits between `<!-- seo -->` markers, so a rerun replaces it. `SITE_URL` (or, on Vercel,
 * `VERCEL_PROJECT_PRODUCTION_URL`) makes the URLs absolute, as in postbuild; without it the sitemap stays root-relative
 * and robots.txt names no sitemap (a sitemap needs absolute URLs). `scripts/site/seo-check.ts` checks the result.
 *
 *   npx tsx scripts/site/seo.ts   → rewrite ./dist (needs a build with postbuild's pages)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { boardIds, boardManifest } from '../../src/widgets/manifest'
import { boardBlurbs } from '../../src/widgets/blurbs'
import { SITE_DESCRIPTION, SITE_NAME, widgetTitle } from '../../src/site/meta'
import { POSTS, postPath } from '../../src/blog/posts'
import { LAB } from '../../src/lab/experiments'
import { flag } from '../../src/site/flags'
import { BROWSE_PATH } from '../../src/site/browse'
import { blogIndexBody, boardBody, browseBody, esc, homeBody, jsonLd, labBody, postBody, staticStyles, widgetBody, type WidgetRow } from './seo-html'
import { notFoundPage } from './notfound'

const DIST = 'dist'
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
export const origin = (process.env.SITE_URL || (vercel ? `https://${vercel}` : '')).replace(/\/+$/, '')

/** The built widget index (postbuild's `dist/widgets.json`). */
export const readWidgets = (dist = DIST): WidgetRow[] => JSON.parse(readFileSync(join(dist, 'widgets.json'), 'utf8')).widgets
/** A board's cards, in index order (a card shown on several boards is listed on each). */
export const cardsOf = (id: string, widgets: readonly WidgetRow[]) => widgets.filter(w => (w.boards.length ? w.boards : [w.board]).includes(id))

export interface SitemapEntry { path: string; lastmod?: string }
/** Every page the sitemap lists, by path: one per canonical URL. */
export function sitemapEntries(widgets: readonly WidgetRow[]): SitemapEntry[] {
  return [
    { path: '/' }, ...boardIds.map(id => ({ path: `/${id}/` })), { path: BROWSE_PATH }, ...widgets.map(w => ({ path: w.url })),
    { path: postPath(), lastmod: POSTS.map(p => p.date).sort().at(-1) }, ...POSTS.map(p => ({ path: postPath(p.slug), lastmod: p.date })),
    ...(flag('lab') ? [{ path: LAB.path }] : []), { path: '/privacy' }, { path: '/terms' },
  ]
}

export function sitemapXml(entries: readonly SitemapEntry[]): string {
  const url = (e: SitemapEntry) => `  <url><loc>${esc(origin + e.path)}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map(url).join('\n')}\n</urlset>\n`
}

export const robotsTxt = (): string => `User-agent: *\nAllow: /\n${origin ? `\nSitemap: ${origin}/sitemap.xml\n` : ''}`

const HEAD = /\n?\s*<!-- seo-head -->[\s\S]*?<!-- \/seo-head -->/, BODY = /<!-- seo -->[\s\S]*?<!-- \/seo -->/
/** `html` with the static block in the root `<div id="…">` and the head extras before `</head>`; replaces an earlier run's. */
export function inject(html: string, rootId: string, body: string, head: string[] = []): string {
  const out = html.replace(HEAD, '').replace(BODY, '')
  const root = `<div id="${rootId}"></div>`
  if (!out.includes(root)) throw new Error(`no empty <div id="${rootId}"> to fill`)
  const tags = [staticStyles(), ...head].join('\n    ')
  return out.replace('</head>', `    <!-- seo-head -->\n    ${tags}\n    <!-- /seo-head -->\n  </head>`)
    .replace(root, `<div id="${rootId}"><!-- seo -->${body}<!-- /seo --></div>`)
}

const site = { '@type': 'WebSite', name: SITE_NAME, url: `${origin}/` }
export function boardLd(id: string, cards: readonly WidgetRow[]): object {
  const b = boardManifest.find(x => x.id === id)!
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: b.title, description: boardBlurbs[b.id], url: `${origin}/${id}/`,
    image: `${origin}/og/${id}.png`, isPartOf: site,
    hasPart: cards.map(w => ({ '@type': 'CreativeWork', name: widgetTitle(w.name), description: w.blurb, url: origin + w.url, image: `${origin}/og/widget/${w.uid}.png` })),
  }
}
export const homeLd = (): object => ({ '@context': 'https://schema.org', ...site, description: SITE_DESCRIPTION, inLanguage: 'en' })

/** Read, change and write one built file; false when the build has no such file. */
function edit(file: string, change: (html: string) => string): boolean {
  const f = join(DIST, file)
  if (!existsSync(f)) return false
  writeFileSync(f, change(readFileSync(f, 'utf8')))
  return true
}

export function seo() {
  if (!existsSync(join(DIST, 'widgets.json'))) throw new Error('no dist/widgets.json: run the build (postbuild writes it) first')
  const widgets = readWidgets(), slugs = new Set(widgets.map(w => w.slug))
  let pages = 0
  const fill = (file: string, rootId: string, body: string, head?: string[]) => { if (edit(file, h => inject(h, rootId, body, head))) pages++ }

  fill('index.html', 'root', homeBody(), [jsonLd(homeLd())])
  for (const id of boardIds) { const cards = cardsOf(id, widgets); fill(join(id, 'index.html'), 'root', boardBody(id, cards), [jsonLd(boardLd(id, cards))]) }
  fill(join('browse', 'index.html'), 'root', browseBody(widgets))
  for (const w of widgets) for (const dir of [join('widget', w.slug), join('widget', w.uid), w.uid]) fill(join(dir, 'index.html'), 'root', widgetBody(w))
  // blog.html is what `/blog/<anything>` falls back to: it carries the index, like postbuild's copy
  for (const file of ['blog.html', join('blog', 'index.html')]) fill(file, 'blog', blogIndexBody())
  for (const p of POSTS) {
    const md = join('docs', 'blog', `${p.slug}.md`)
    fill(join('blog', p.slug, 'index.html'), 'blog', postBody(p, p.kind === 'md' && existsSync(md) ? readFileSync(md, 'utf8') : undefined, slugs))
  }
  for (const file of ['lab.html', join('lab', 'index.html')]) fill(file, 'lab', labBody())

  // the legal pages are plain HTML without a canonical
  for (const name of ['privacy', 'terms']) {
    edit(`${name}.html`, h => h.replace(/\s*<link rel="canonical"[^>]*>/, '').replace('</title>', `</title>\n    <link rel="canonical" href="${esc(`${origin}/${name}`)}" />`))
  }

  const entries = sitemapEntries(widgets)
  writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml(entries))
  writeFileSync(join(DIST, 'robots.txt'), robotsTxt())
  writeFileSync(join(DIST, '404.html'), notFoundPage())
  console.log(`seo: ${pages} pages with crawlable roots, sitemap.xml (${entries.length} URLs), robots.txt, 404.html${origin ? ` (${origin})` : ' (relative URLs: set SITE_URL for an absolute sitemap)'}`)
}

if (/[\\/]scripts[\\/]site[\\/]seo\.ts$/.test(process.argv[1] ?? '')) seo()
