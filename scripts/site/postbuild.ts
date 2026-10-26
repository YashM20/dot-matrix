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
 *
 * `SITE_URL` (or, on Vercel, `VERCEL_PROJECT_PRODUCTION_URL`) makes og:url / og:image absolute, which most link
 * unfurlers require; without it they stay root-relative.
 *
 *   npx tsx scripts/site/postbuild.ts            → every step on ./dist
 *   npx tsx scripts/site/postbuild.ts --no-og    → pages only (fast)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ogImage } from '../og'
import { boards } from '../../src/widgets'
import { metaTags, pageMeta, widgetPageMeta, widgetTitle, type PageMeta } from '../../src/site/meta'
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
  const m = typeof page === 'object' ? page : pageMeta(page)
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
    url: origin + m.path, image: origin + m.image, keywords: w.tags.join(', '), isPartOf: { '@type': 'Collection', name: `${w.board} board`, url: `${origin}/${w.board}/` },
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

export function postbuild({ og = true } = {}) {
  const index = readFileSync(join(DIST, 'index.html'), 'utf8')
  writeFileSync(join(DIST, 'index.html'), withMeta(index))
  for (const b of boards) page(b.id, withMeta(index, b.id))
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
  for (const w of widgets) writeFileSync(join(DIST, 'og', 'widget', `${w.uid}.png`), ogImage(w.slug).png())
  console.log(`site: ${jobs.length} board + ${widgets.length} widget OG images in dist/og/ (${((t2 - t1) / 1000).toFixed(1)} s + ${((performance.now() - t2) / 1000).toFixed(1)} s)`)
}

if (/[\\/]scripts[\\/]site[\\/]postbuild\.ts$/.test(process.argv[1] ?? '')) postbuild({ og: !process.argv.includes('--no-og') })
