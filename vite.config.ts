import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    babel({ presets: [reactCompilerPreset()] })
  ],
  // agent worktrees live under .claude/ — don't let their edits reload this checkout's dev server
  server: { watch: { ignored: ['**/.claude/**'] } },
  // two pages: the app, and the launch essay as its own entry (deployable alone, its own JS budget)
  build: { rollupOptions: { input: { main: fileURLToPath(new URL('./index.html', import.meta.url)), essay: fileURLToPath(new URL('./essay.html', import.meta.url)) } } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
