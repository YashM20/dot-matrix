import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

/**
 * After a production build: OG images + per-board crawler pages (scripts/site/postbuild.ts, docs/DEPLOY.md).
 * Runs in a child `node --import tsx` so the config process never loads every board. `SITE_POSTBUILD=0` skips it.
 */
function sitePostbuild(): Plugin {
  return {
    name: 'site-postbuild',
    apply: 'build',
    closeBundle() {
      if (process.env.SITE_POSTBUILD === '0' || !existsSync('dist/index.html')) return
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/site/postbuild.ts'], { stdio: 'inherit' })
    },
  }
}

/**
 * Worker build only: boards whose cards are main-thread only resolve to a stub, so their engine code never ships in
 * `sampleWorker-*.js` (the worker imports the eager registry). A card the worker doesn't know gets an error reply and
 * samples on the main thread, which is what those cards ask for anyway (docs/living-matter/L-pond.md §L1 "Worker bundle").
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

// extra HTML entries ship as their own pages when present (the launch essay, docs/WEB-PLAN.md §1)
// privacy.html + terms.html: static legal pages, no JS (vercel.json rewrites /privacy and /terms to them)
const pages = ['essay.html', 'privacy.html', 'terms.html'].filter(f => existsSync(f))

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    sitePostbuild(),
  ],
  // agent worktrees live under .claude/ — don't let their edits reload this checkout's dev server
  server: { watch: { ignored: ['**/.claude/**'] } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: { plugins: () => [mainThreadOnly({ '/boards/pond/index': './src/widgets/boards/pond/worker-stub.ts' })] },
  build: pages.length ? { rolldownOptions: { input: { main: 'index.html', ...Object.fromEntries(pages.map(f => [f.replace(/\.html$/, ''), f])) } } } : {},
})
