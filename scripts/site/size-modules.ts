/**
 * Build plugin: records which source modules went into which output chunk, so `size.ts --modules` can list the
 * first-load modules by size (the CI "Bundle budget" step prints it). Writes `node_modules/.cache/dot480-size/
 * modules.json`, outside `dist/`, so nothing ships. Each module's gzip size is measured on its own rendered code,
 * which overstates small modules a little; `size.ts` scales them to the chunk's real gzip size.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import type { Plugin } from 'vite'

export const SIZE_MODULES = 'node_modules/.cache/dot480-size/modules.json'

/** chunk file name (under assets/) → source module (repo-relative) → bytes and gzip bytes of its rendered code */
export type ModuleReport = Record<string, Record<string, { raw: number; gz: number }>>

export function sizeModules(): Plugin {
  return {
    name: 'size-modules',
    apply: 'build',
    generateBundle(_options, bundle) {
      const report: ModuleReport = {}
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue
        const mods: ModuleReport[string] = {}
        for (const [id, m] of Object.entries(out.modules)) {
          const code = m.code ?? ''
          if (!code) continue
          const name = relative(process.cwd(), id.replace(/^\0/, '')).replace(/\\/g, '/').replace(/^.*node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'npm:')
          mods[name] = { raw: code.length, gz: gzipSync(code, { level: 9 }).length }
        }
        report[out.fileName.replace(/^assets\//, '')] = mods
      }
      mkdirSync(dirname(SIZE_MODULES), { recursive: true })
      writeFileSync(SIZE_MODULES, JSON.stringify(report))
    },
  }
}
