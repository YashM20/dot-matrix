/**
 * Post-build site step (runs after `vite build`, from the `site-postbuild` plugin in vite.config.ts):
 *
 * 1. OG images: `dist/og/<board>.png` (+ `default.png`), 1200×630, one hero card per board through
 *    `scripts/og.ts` (headless raster, same dots as the app), and `dist/og/widget/<uid>.png` per widget
 *    (keyed by uid, so a rename never breaks a cached preview).
 * 2. Crawler pages: `dist/<board>/index.html`, copies of `dist/index.html` with that board's `<title>`,
 *    description, canonical and OG/Twitter tags (`src/site/meta.ts`), so a shared `/light/` link previews
 *    the Light board without running JS. `dist/index.html` gets the default tags the same way.
 * 3. Widget pages (docs/SHARE-PLAN.md §3): `dist/widget/<slug>/index.html` plus two copies for the uid forms
 *    (`dist/widget/<uid>/`, `dist/<uid>/`), all with `rel=canonical` → `/widget/<slug>/`, the widget's OG tags,
 *    `<meta name="dot480:widget">` (uid, slug, board: the app loads only that board's chunk) and schema.org
 *    JSON-LD. `dist/widgets.json` is the full derived index (`scripts/widgets/meta.ts`).
 * 4. Blog pages (`src/blog/posts.ts`): `dist/blog/index.html` and `dist/blog/<slug>/index.html`, copies of
 *    `dist/blog.html` with the post's title, description, canonical, OG/Twitter tags (`og:type` article) and
 *    schema.org JSON-LD (BlogPosting; CollectionPage for the index). The social image is
 *    `public/og/blog/<slug>-social.png` (`pnpm og:blog`) once it exists, else `/og/default.png`; its alt text
 *    (`og:image:alt`, `twitter:image:alt`) comes from `public/og/blog/alt.json`.
 * 5. The lab page (`src/lab/experiments.ts`): `dist/lab/index.html` from `dist/lab.html`, with its meta and JSON-LD.
 * 6. BROWSE (#182): `dist/browse/index.html`, a copy of `dist/index.html` with its own title, description and canonical;
 *    ABOUT the same at `dist/about/index.html`.
 *
 * Widget OG images are cached in `node_modules/.cache/dot480-og` (or `OG_CACHE`), keyed by the OG renderer's source and
 * the card's golden hashes: a cold run renders all of them (~2 min), a warm one copies.
 *
 * `SITE_URL` (or, on Vercel, `VERCEL_PROJECT_PRODUCTION_URL`) makes og:url / og:image absolute, which most link
 * unfurlers require; without it they stay root-relative.
 *
 *   npx tsx scripts/site/postbuild.ts            → every step on ./dist
 *   npx tsx scripts/site/postbuild.ts --no-og    → pages only (fast)
 */
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ogImage } from '../og'
import { boards } from '../../src/widgets'
import { BLOG, heroImage, POSTS, postPath, socialImage } from '../../src/blog/posts'
import { EXPERIMENTS, LAB, experimentPath } from '../../src/lab/experiments'
import { ABOUT_META, metaTags, pageMeta, widgetPageMeta, widgetTitle, type PageMeta } from '../../src/site/meta'
import { boardBlurbs } from '../../src/widgets/blurbs'
import { boardLabel } from '../../src/widgets/manifest'
import { BROWSE_META } from '../../src/site/browse'
import type { WidgetMeta } from '../../src/widgets/meta'
import { widgetIndex } from '../widgets/meta'

const DIST = 'dist'
const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
const origin = (process.env.SITE_URL || (vercel ? `https://${vercel}` : '')).replace(/\/+$/, '')
/** OG hero card per board, where the first card that needs no live media is not the best face. */
const HERO: Record<string, string> = {}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `html` with its `<!-- meta -->…<!-- /meta -->` block and `<title>` set for a board id (default page when undefined) or any `PageMeta`. */
export function withMeta(html: string, page?: string | PageMeta, extra: string[] = []): string {
  const m = typeof page === 'object' ? page : pageMeta(page, boardBlurbs)
  const tags = metaTags(m, origin).map(([attr, key, content]) => `<meta ${attr}="${key}" content="${esc(content)}" />`)
  tags.push(`<link rel="canonical" href="${esc(origin + m.path)}" />`, ...extra)
  const block = `<!-- meta -->\n    ${tags.join('\n    ')}\n    <!-- /meta -->`
  if (!/<!-- meta -->[\s\S]*?<!-- \/meta -->/.test(html)) throw new Error('index.html has no <!-- meta --> block')
  return html.replace(/<!-- meta -->[\s\S]*?<!-- \/meta -->/, block).replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`)
}

/** The extra head tags of a widget page: the app's board hint and schema.org JSON-LD (data, not script: CSP-safe). */
export function widgetHead(w: WidgetMeta, m: PageMeta): string[] {
  const ld = {
    '@context': 'https://schema.org', '@type': 'CreativeWork', name: widgetTitle(w.name), description: w.blurb, identifier: w.uid,
    url: origin + m.path, image: origin + m.image, keywords: w.tags.join(', '), isPartOf: { '@type': 'Collection', name: `${boardLabel(w.board)} board`, url: `${origin}/${w.board}/` },
    ...(w.version && { version: w.version }),
  }
  return [
    `<meta name="dot480:widget" content="${esc(w.uid)}" data-slug="${esc(w.slug)}" data-board="${esc(w.board)}" />`,
    // `<` is escaped so a blurb can never close the script element
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
  ]
}

/** The first card that needs no live media (a camera card would render blank), unless `HERO` says otherwise. */
function heroOf(id: string): string {
  const b = boards.find(x => x.id === id)!
  return HERO[id] ?? (b.items.find(p => !p.media) ?? b.items[0]).id
}

const page = (dir: string, html: string) => { mkdirSync(join(DIST, dir), { recursive: true }); writeFileSync(join(DIST, dir, 'index.html'), html) }

/** schema.org JSON-LD as a data block (not script: CSP-safe); `<` escaped so text can never close the element. */
const jsonLd = (o: object) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`

/** The blog's crawler pages (step 4): every post and the index, from `dist/blog.html`. */
export function blogPages() {
  const file = join(DIST, 'blog.html')
  if (!existsSync(file)) return
  const html = readFileSync(file, 'utf8'), has = (path: string) => existsSync(join('public', path))
  const social = (slug: string) => (has(socialImage(slug)) ? socialImage(slug) : '/og/default.png')
  // the social image's alt text, from the generator's alt.json (only when that image is the page's og:image; else
  // metaTags' default alt, which describes /og/default.png)
  const altFile = join('public', 'og', 'blog', 'alt.json')
  const alts: Record<string, { social?: string }> = existsSync(altFile) ? JSON.parse(readFileSync(altFile, 'utf8')) : {}
  const imageAlt = (slug: string) => (has(socialImage(slug)) ? alts[slug]?.social : undefined)
  const author = { '@type': 'Organization', name: 'Reactopia', url: 'https://reactopia.me/' }
  // the hero is the page's LCP image, but React draws it: name it in the HTML so the browser fetches it with the CSS
  // (Lighthouse "LCP request discovery"; scripts/site/perf-check.ts keeps it)
  const preload = (slug: string) => (has(heroImage(slug)) ? [`<link rel="preload" as="image" href="${heroImage(slug)}" fetchpriority="high" />`] : [])
  const index: PageMeta = { title: BLOG.title, description: BLOG.dek, path: postPath(), image: social(BLOG.slug), imageAlt: imageAlt(BLOG.slug) }
  const listLd = jsonLd({
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: BLOG.title, description: BLOG.dek, url: origin + index.path, image: origin + index.image,
    hasPart: POSTS.map(p => ({ '@type': 'BlogPosting', headline: p.title, url: origin + postPath(p.slug), datePublished: p.date })),
  })
  // blog.html is the fallback for any /blog/ path (vercel.json), so only the index's own page preloads the index's hero
  writeFileSync(file, withMeta(html, index, [listLd])); page('blog', withMeta(html, index, [...preload(BLOG.slug), listLd]))
  for (const p of POSTS) {
    const m: PageMeta = { title: `${p.title} · Matrix blog`, description: p.dek, path: postPath(p.slug), image: social(p.slug), imageAlt: imageAlt(p.slug) }
    const ld = {
      '@context': 'https://schema.org', '@type': 'BlogPosting', headline: p.title, description: p.dek, datePublished: p.date, author, publisher: author,
      image: [origin + m.image, ...(has(heroImage(p.slug)) ? [origin + heroImage(p.slug)] : [])], url: origin + m.path, mainEntityOfPage: origin + m.path,
    }
    page(join('blog', p.slug), withMeta(html, m, [`<meta property="article:published_time" content="${p.date}" />`, ...preload(p.slug), jsonLd(ld)]).replace('property="og:type" content="website"', 'property="og:type" content="article"'))
  }
  console.log(`site: blog index + ${POSTS.length} post pages`)
}

/** The lab's crawler page (step 5): `dist/lab/index.html` from `dist/lab.html`, with its meta and a CollectionPage. */
export function labPage() {
  const file = join(DIST, 'lab.html')
  if (!existsSync(file)) return
  const m: PageMeta = { title: LAB.title, description: LAB.dek, path: LAB.path, image: '/og/default.png' }
  const html = withMeta(readFileSync(file, 'utf8'), m, [jsonLd({
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: LAB.title, description: LAB.dek, url: origin + m.path,
    hasPart: EXPERIMENTS.map(x => ({ '@type': 'CreativeWork', name: x.title, description: x.dek, url: origin + experimentPath(x.slug), dateCreated: x.date })),
  })])
  writeFileSync(file, html); page('lab', html)
  console.log(`site: lab page (${EXPERIMENTS.length} piece${EXPERIMENTS.length === 1 ? '' : 's'})`)
}

export function postbuild({ og = true } = {}) {
  const index = readFileSync(join(DIST, 'index.html'), 'utf8')
  writeFileSync(join(DIST, 'index.html'), withMeta(index))
  for (const b of boards) page(b.id, withMeta(index, b.id))
  page('browse', withMeta(index, BROWSE_META))
  page('about', withMeta(index, ABOUT_META))
  blogPages()
  labPage()
  console.log(`site: ${boards.length} board pages${origin ? ` (${origin})` : ' (relative URLs: set SITE_URL for absolute og:image)'}`)
  const t0 = performance.now(), widgets = widgetIndex()
  for (const w of widgets) {
    const m = widgetPageMeta(w), html = withMeta(index, m, widgetHead(w, m))
    page(join('widget', w.slug), html); page(join('widget', w.uid), html); page(w.uid, html)
  }
  writeFileSync(join(DIST, 'widgets.json'), JSON.stringify({ version: 1, origin: origin || undefined, widgets }))
  console.log(`site: ${widgets.length * 3} widget pages + dist/widgets.json (${((performance.now() - t0) / 1000).toFixed(1)} s)`)
  if (!og) return
  mkdirSync(join(DIST, 'og', 'widget'), { recursive: true })
  const t1 = performance.now()
  const jobs: [file: string, card: string][] = [['default', heroOf(boards[0].id)], ...boards.map(b => [b.id, heroOf(b.id)] as [string, string])]
  for (const [file, card] of jobs) writeFileSync(join(DIST, 'og', `${file}.png`), ogImage(card).png())
  const t2 = performance.now()
  // ~0.7 s per image: cached by the renderer's source, the card's golden hashes and the board title the image draws
  // (as scripts/og.ts finds it), so only changed cards re-render and a renamed board never keeps its old title
  const cache = process.env.OG_CACHE || join('node_modules', '.cache', 'dot480-og'), golden = goldenOf(), salt = createHash('sha1').update(OG_SOURCES.map(f => readFileSync(f)).join('\0')).digest('hex')
  mkdirSync(cache, { recursive: true })
  let fresh = 0
  for (const w of widgets) {
    const title = boards.find(b => b.items.some(i => i.id === w.slug))?.title ?? ''
    const key = createHash('sha1').update(`${salt}|${w.slug}|${title}|${JSON.stringify(golden[w.slug] ?? null)}`).digest('hex').slice(0, 16), hit = join(cache, `${w.uid}-${key}.png`)
    if (!existsSync(hit)) { writeFileSync(hit, ogImage(w.slug).png()); fresh++ }
    copyFileSync(hit, join(DIST, 'og', 'widget', `${w.uid}.png`))
  }
  console.log(`site: ${jobs.length} board + ${widgets.length} widget OG images (${fresh} rendered, ${widgets.length - fresh} cached) in dist/og/ (${((t2 - t1) / 1000).toFixed(1)} s + ${((performance.now() - t2) / 1000).toFixed(1)} s)`)
}

/** What a widget OG image depends on besides its card: the OG layout and the raster path. */
const OG_SOURCES = ['scripts/og.ts', 'scripts/lib/raster.ts', 'scripts/lib/cards.ts', 'scripts/lib/stats.ts', 'src/engine/sampler/gridSampler.ts']
const goldenOf = (): Record<string, unknown> => JSON.parse(readFileSync('goldens/hashes.json', 'utf8')).presets

if (/[\\/]scripts[\\/]site[\\/]postbuild\.ts$/.test(process.argv[1] ?? '')) postbuild({ og: !process.argv.includes('--no-og') })
