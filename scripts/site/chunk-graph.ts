/**
 * Build plugin: records the chunk graph (each chunk's static imports and CSS, and which chunk holds each source module)
 * in `node_modules/.cache/dot480-size/chunks.json`, outside `dist/`, so nothing ships. scripts/site/preload.ts reads it
 * to write each page's cold-load hints (#348). Kept apart from preload.ts so vite.config.ts never loads app modules.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative } from 'node:path'
import type { Plugin } from 'vite'

export const CHUNK_GRAPH = 'node_modules/.cache/dot480-size/chunks.json'

/** `chunks`: file under assets/ → its static imports and CSS (both under assets/). `modules`: repo source path without
 * its extension (`src/widgets/boards/mosaic`) → the chunk that holds it. */
export interface ChunkGraph { chunks: Record<string, { imports: string[]; css: string[] }>; modules: Record<string, string> }

const asset = (f: string) => f.replace(/^assets\//, '')

export function chunkGraph(): Plugin {
  return {
    name: 'chunk-graph',
    apply: 'build',
    generateBundle(_options, bundle) {
      const graph: ChunkGraph = { chunks: {}, modules: {} }
      for (const out of Object.values(bundle)) {
        if (out.type !== 'chunk') continue
        const css = (out as { viteMetadata?: { importedCss?: Set<string> } }).viteMetadata?.importedCss ?? new Set<string>()
        graph.chunks[asset(out.fileName)] = { imports: out.imports.map(asset), css: [...css].map(asset) }
        for (const id of out.moduleIds) {
          const src = relative(process.cwd(), id.replace(/^\0/, '')).replace(/\\/g, '/')
          if (src.startsWith('src/')) graph.modules[src.replace(/\.[cm]?[jt]sx?$/, '')] = asset(out.fileName)
        }
      }
      mkdirSync(dirname(CHUNK_GRAPH), { recursive: true })
      writeFileSync(CHUNK_GRAPH, JSON.stringify(graph))
    },
  }
}
