/**
 * Post-build site step (runs after `vite build`, from the `site-postbuild` plugin in vite.config.ts):
 *
 * 1. OG images: `dist/og/<board>.png` (+ `default.png`), 1200×630, one hero card per board through
 *    `scripts/og.ts` (headless raster, same dots as the app).
 * 2. Crawler pages: `dist/<board>/index.html`, copies of `dist/index.html` with that board's `<title>`,
 *    description, canonical and OG/Twitter tags (`src/site/meta.ts`), so a shared `/light/` link previews
 *    the Light board without running JS. `dist/index.html` gets the default tags the same way.
 *
 * `SITE_URL` (e.g. https://dot480.pages.dev) makes og:url / og:image absolute, which most link
 * unfurlers require; without it they stay root-relative.
 *
 *   npx tsx scripts/site/postbuild.ts            → both steps on ./dist
 *   npx tsx scripts/site/postbuild.ts --no-og    → pages only (fast)
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ogImage } from '../og'
import { boards } from '../../src/widgets'
import { metaTags, pageMeta } from '../../src/site/meta'

const DIST = 'dist'
const origin = (process.env.SITE_URL ?? '').replace(/\/+$/, '')
/** OG hero card per board, where the first card that needs no live media is not the best face. */
const HERO: Record<string, string> = {}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** `html` with its `<!-- meta -->…<!-- /meta -->` block and `<title>` set for `boardId` (default page when undefined). */
export function withMeta(html: string, boardId?: string): string {
  const m = pageMeta(boardId)
  const tags = metaTags(m, origin).map(([attr, key, content]) => `<meta ${attr}="${key}" content="${esc(content)}" />`)
  tags.push(`<link rel="canonical" href="${esc(origin + m.path)}" />`)
  const block = `<!-- meta -->\n    ${tags.join('\n    ')}\n    <!-- /meta -->`
  if (!/<!-- meta -->[\s\S]*?<!-- \/meta -->/.test(html)) throw new Error('index.html has no <!-- meta --> block')
  return html.replace(/<!-- meta -->[\s\S]*?<!-- \/meta -->/, block).replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`)
}

/** The first card that needs no live media (a camera card would render blank), unless `HERO` says otherwise. */
function heroOf(id: string): string {
  const b = boards.find(x => x.id === id)!
  return HERO[id] ?? (b.items.find(p => !p.media) ?? b.items[0]).id
}

export function postbuild({ og = true } = {}) {
  const index = readFileSync(join(DIST, 'index.html'), 'utf8')
  writeFileSync(join(DIST, 'index.html'), withMeta(index))
  for (const b of boards) {
    mkdirSync(join(DIST, b.id), { recursive: true })
    writeFileSync(join(DIST, b.id, 'index.html'), withMeta(index, b.id))
  }
  console.log(`site: ${boards.length} board pages${origin ? ` (${origin})` : ' (relative URLs: set SITE_URL for absolute og:image)'}`)
  if (!og) return
  mkdirSync(join(DIST, 'og'), { recursive: true })
  const t0 = performance.now()
  const jobs: [file: string, card: string][] = [['default', heroOf(boards[0].id)], ...boards.map(b => [b.id, heroOf(b.id)] as [string, string])]
  for (const [file, card] of jobs) writeFileSync(join(DIST, 'og', `${file}.png`), ogImage(card).png())
  console.log(`site: ${jobs.length} OG images in dist/og/ (${((performance.now() - t0) / 1000).toFixed(1)} s)`)
}

if (/[\\/]scripts[\\/]site[\\/]postbuild\.ts$/.test(process.argv[1] ?? '')) postbuild({ og: !process.argv.includes('--no-og') })
