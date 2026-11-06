import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

/**
 * After a production build: OG images + per-board crawler pages (scripts/site/postbuild.ts), then the SEO step
 * (scripts/site/seo.ts: crawlable roots, sitemap, robots, 404; docs/DEPLOY.md).
 * Runs in a child `node --import tsx` so the config process never loads every board. `SITE_POSTBUILD=0` skips it.
 */
function sitePostbuild(): Plugin {
  return {
    name: 'site-postbuild',
    apply: 'build',
    closeBundle() {
      if (process.env.SITE_POSTBUILD === '0' || !existsSync('dist/index.html')) return
      // postbuild keys its OG cache on goldens/hashes.json: a gitignored index of goldens/<board>.json (#76)
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/lib/goldenFiles.ts', '--index'], { stdio: 'inherit' })
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/site/postbuild.ts'], { stdio: 'inherit' })
      // then the SEO step over postbuild's pages: crawlable roots, JSON-LD, sitemap.xml, robots.txt, 404.html (issue #146)
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/site/seo.ts'], { stdio: 'inherit' })
    },
  }
}

/**
 * Worker build only: boards whose cards are all main-thread only (pond, physics), the materials board's two live
 * cards (`materials-live.ts`) and the workshop board's eight (`workshop-live.ts`, `workshop-physics.ts`, `workshop-plate.ts`, `workshop-kintsugi.ts`), resolve to a stub, so their code never
 * ships in the worker's chunks and the worker never fetches it. A card the worker doesn't know gets an error reply and
 * samples on the main thread, which is what those cards ask for anyway (docs/living-matter/L-pond.md §L1 "Worker bundle",
 * F0-foundation.md §7 R13).
 */
function mainThreadOnly(stubs: Record<string, string>): Plugin {
  return {
    name: 'main-thread-only',
    enforce: 'pre',
    resolveId(source, importer) {
      for (const [from, to] of Object.entries(stubs)) if (source.endsWith(from) && importer) return fileURLToPath(new URL(to, import.meta.url))
      return null
    },
  }
}

/**
 * The blog's build-time facts as `virtual:blog-meta` (src/blog/virtual.d.ts): prose words per post (reading time)
 * and which hero images exist in public/og/blog/ with their alt text. The posts' text stays out of the index chunk.
 */
function blogMeta(): Plugin {
  const ID = 'virtual:blog-meta', RID = '\0' + ID, DOCS = 'docs/blog', OG = 'public/og/blog', ESSAY = 'src/essay/Essay.tsx', ESSAY_SLUG = 'dot-matrix-essay'
  const count = (s: string) => s.match(/[A-Za-z0-9][\w'’.-]*/g)?.length ?? 0
  return {
    name: 'blog-meta',
    resolveId: id => (id === ID ? RID : null),
    load(id) {
      if (id !== RID) return null
      const words: Record<string, number> = {}, heroes: Record<string, { alt: string; w: number; h: number }> = {}
      for (const f of existsSync(DOCS) ? readdirSync(DOCS) : []) {
        if (!f.endsWith('.md') || f === 'README.md') continue
        this.addWatchFile(resolve(DOCS, f)) // absolute: a relative Windows path reached import analysis as an import
        words[f.slice(0, -3)] = count(readFileSync(join(DOCS, f), 'utf8').replace(/```[\s\S]*?```/g, '').replace(/<!--[\s\S]*?-->/g, ''))
      }
      // the essay's visible text: its JSX after the component starts, tags and `{…}` expressions removed
      const tsx = readFileSync(ESSAY, 'utf8')
      words[ESSAY_SLUG] = count(tsx.slice(tsx.indexOf('export function Essay')).replace(/<[^>]*>/g, ' ').replace(/\{[^{}]*\}/g, ' '))
      const alt: Record<string, unknown> = existsSync(join(OG, 'alt.json')) ? JSON.parse(readFileSync(join(OG, 'alt.json'), 'utf8')) : {}
      for (const f of existsSync(OG) ? readdirSync(OG) : []) {
        const slug = /^(.+)-hero\.png$/.exec(f)?.[1]
        if (!slug) continue
        // alt.json is keyed by slug, `<slug>-hero` or the file name; a value is the text or `{ hero: text }`
        const a: unknown = alt[slug] ?? alt[`${slug}-hero`] ?? alt[f]
        // width and height from the PNG header, so the page reserves the hero's box before it loads
        const png = readFileSync(join(OG, f))
        heroes[slug] = {
          alt: typeof a === 'string' ? a : typeof (a as { hero?: unknown })?.hero === 'string' ? (a as { hero: string }).hero : '',
          w: png.readUInt32BE(16), h: png.readUInt32BE(20),
        }
      }
      return `export default ${JSON.stringify({ words, heroes })}`
    },
  }
}

/**
 * Dev and preview: the blog's paths (`/blog/`, `/blog/<slug>/`) and the essay's old ones (`/essay`, `/essay/`,
 * `/essay.html`) serve blog.html, as vercel.json does in production (there the essay's old paths redirect), and
 * `/privacy/` and `/terms/` serve their pages, so the probes (scripts/site/nav.ts) see what production serves.
 */
function blogRoutes(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const [path, query] = (req.url ?? '').split(/\?(.*)/s)
    if (/^\/blog(\/[^.]*)?$/.test(path) || /^\/essay(\/|\.html)?$/.test(path)) req.url = `/blog.html${query ? `?${query}` : ''}`
    // the lab's page (`/lab`, `/lab/`); its files (`/lab/motion-lab.html`) are served as they are
    else if (/^\/lab\/?$/.test(path)) req.url = `/lab.html${query ? `?${query}` : ''}`
    // the legal pages with a trailing slash, as vercel.json rewrites them (without one, Vite finds the .html itself)
    else if (/^\/(privacy|terms)\/$/.test(path)) req.url = `${path.slice(0, -1)}.html${query ? `?${query}` : ''}`
    next()
  }
  return { name: 'blog-routes', configureServer: s => { s.middlewares.use(rewrite) }, configurePreviewServer: s => { s.middlewares.use(rewrite) } }
}

/**
 * Dev and preview have no API functions: `/api/*` answers 404, as production does with likes not set up, instead of
 * the SPA's index.html. The like button (on by default) then stays hidden in local runs and the probes.
 */
function noApi(): Plugin {
  const answer = (req: { url?: string }, res: { statusCode: number; end: () => void }, next: () => void) => {
    if (!/^\/api(\/|\?|$)/.test(req.url ?? '')) { next(); return }
    res.statusCode = 404
    res.end()
  }
  return { name: 'no-api', configureServer: s => { s.middlewares.use(answer) }, configurePreviewServer: s => { s.middlewares.use(answer) } }
}

// extra HTML entries ship as their own pages when present (the blog, with the essay as a post: docs/WEB-PLAN.md §1)
// privacy.html + terms.html: static legal pages, no JS (vercel.json rewrites /privacy and /terms to them)
const pages = ['blog.html', 'lab.html', 'privacy.html', 'terms.html'].filter(f => existsSync(f))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    blogMeta(),
    blogRoutes(),
    noApi(),
    sitePostbuild(),
  ],
  // agent worktrees live under .claude/ — don't let their edits reload this checkout's dev server
  server: { watch: { ignored: ['**/.claude/**'] } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // ES worker chunks: the sample worker loads one board chunk per card (`import()` through the manifest) instead of
  // shipping every board; its chunks are `wk-*` so they never collide with the page's chunks (`size.ts --worker`)
  worker: {
    format: 'es',
    plugins: () => [mainThreadOnly({ '/boards/pond/index': './src/widgets/boards/pond/worker-stub.ts', '/boards/physics': './src/widgets/boards/physics-worker-stub.ts', '/materials-live': './src/widgets/boards/materials-live-worker-stub.ts', '/workshop-live': './src/widgets/boards/workshop-live-worker-stub.ts', '/workshop-physics': './src/widgets/boards/workshop-physics-worker-stub.ts', '/workshop-plate': './src/widgets/boards/workshop-plate-worker-stub.ts', '/workshop-kintsugi': './src/widgets/boards/workshop-kintsugi-worker-stub.ts' })],
    rolldownOptions: { output: { chunkFileNames: 'assets/wk-[name]-[hash].js' } },
  },
  build: pages.length ? { rolldownOptions: { input: { main: 'index.html', ...Object.fromEntries(pages.map(f => [f.replace(/\.html$/, ''), f])) } } } : {},
})
