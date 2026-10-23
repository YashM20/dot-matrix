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

// extra HTML entries ship as their own pages when present (the launch essay, docs/WEB-PLAN.md §1)
const pages = ['essay.html'].filter(f => existsSync(f))

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
  build: pages.length ? { rolldownOptions: { input: { main: 'index.html', ...Object.fromEntries(pages.map(f => [f.replace(/\.html$/, ''), f])) } } } : {},
})
