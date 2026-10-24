/**
 * Build the publishable packages (P6 distribution): ESM via Vite library mode, `.d.ts` via
 * `tsc --emitDeclarationOnly`, then a min+gz size report per entry. No new dependencies.
 *   npx tsx packages/scripts/build.ts            # core, react, element (in dependency order)
 *   npx tsx packages/scripts/build.ts core       # one package
 * Packages re-export from `src/` (nothing is moved); `@dot480/core` is external to react/element.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build, type Rolldown } from 'vite'

const PKGS = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(PKGS, '..')
const TSC = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
const coreSrc = (name: string) => join(PKGS, 'core', 'src', `${name}.ts`)
/** `@dot480/core[/sub]` → the core sources (for the self-contained element bundle). */
const coreAlias = [
  { find: /^@dot480\/core$/, replacement: coreSrc('index') },
  { find: /^@dot480\/core\/(.+)$/, replacement: join(PKGS, 'core', 'src', '$1.ts') },
]
const isCore = (id: string) => id === '@dot480/core' || id.startsWith('@dot480/core/')

interface Target { entry: Record<string, string>; outDir: string; external?: (id: string) => boolean; alias?: typeof coreAlias; report: string }
interface PackageDef { dir: string; targets: Target[] }
const defs: Record<string, PackageDef> = {
  core: {
    dir: 'core',
    targets: [{
      entry: { index: coreSrc('index'), ir: coreSrc('ir'), presets: coreSrc('presets'), card: coreSrc('card'), spec: coreSrc('spec') },
      outDir: 'dist', report: '@dot480/core',
    }],
  },
  react: {
    dir: 'react',
    targets: [{
      entry: { index: join(PKGS, 'react', 'src', 'index.tsx') }, outDir: 'dist', report: '@dot480/react',
      external: id => id === 'react' || id.startsWith('react/') || isCore(id),
    }],
  },
  element: {
    dir: 'element',
    targets: [
      { entry: { index: join(PKGS, 'element', 'src', 'index.ts') }, outDir: 'dist', external: isCore, report: '@dot480/element' },
      // one-file drop-in for `<script type="module" src>`: core inlined, no import map needed
      { entry: { 'dot-card': join(PKGS, 'element', 'src', 'index.ts') }, outDir: 'dist/standalone', alias: coreAlias, report: '@dot480/element (standalone)' },
    ],
  },
}

const sizes: string[] = []
async function buildTarget(pkgDir: string, t: Target, clean: boolean) {
  const out = await build({
    configFile: false, root: pkgDir, logLevel: 'warn', publicDir: false,
    resolve: { alias: t.alias ?? [] },
    oxc: { jsx: { runtime: 'automatic' } },
    build: {
      outDir: join(pkgDir, t.outDir), emptyOutDir: clean, minify: true, sourcemap: true, target: 'es2022', copyPublicDir: false,
      lib: { entry: t.entry, formats: ['es'], fileName: (_f, name) => `${name}.js` },
      rolldownOptions: { external: t.external, output: { chunkFileNames: 'chunks/[name]-[hash].js' } },
    },
  }) as Rolldown.RolldownOutput | Rolldown.RolldownOutput[]
  const chunks = (Array.isArray(out) ? out : [out]).flatMap(o => o.output).filter((c): c is Rolldown.OutputChunk => c.type === 'chunk')
  const byName = new Map(chunks.map(c => [c.fileName, c]))
  for (const c of chunks.filter(c => c.isEntry)) {
    // an entry costs its own file plus every chunk it statically imports
    const seen = new Set<string>(), stack = [c.fileName]
    while (stack.length) { const f = stack.pop()!; if (seen.has(f)) continue; seen.add(f); stack.push(...(byName.get(f)?.imports ?? [])) }
    const code = [...seen].map(f => byName.get(f)?.code ?? '').join('\n')
    sizes.push(`${t.report.padEnd(30)} ${c.name.padEnd(9)} ${kb(Buffer.byteLength(code))} min  ${kb(gzipSync(code, { level: 9 }).length)} min+gz`)
  }
}
const kb = (n: number) => `${(n / 1024).toFixed(1).padStart(6)} KB`

/** Add `.js` / `/index.js` to relative specifiers in emitted `.d.ts`, so Node16/NodeNext resolution works too. */
function fixDeclarationSpecifiers(dir: string) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { fixDeclarationSpecifiers(p); continue }
    if (!p.endsWith('.d.ts')) continue
    const src = readFileSync(p, 'utf8')
    const fixed = src.replace(/(from\s+|import\()(['"])(\.\.?\/[^'"]+)\2/g, (m, pre: string, q: string, spec: string) => {
      if (/\.(js|mjs|cjs|json)$/.test(spec)) return m
      const base = resolve(dirname(p), spec)
      if (existsSync(`${base}.d.ts`)) return `${pre}${q}${spec}.js${q}`
      if (existsSync(join(base, 'index.d.ts'))) return `${pre}${q}${spec}/index.js${q}`
      return m
    })
    if (fixed !== src) writeFileSync(p, fixed)
  }
}

async function buildPackage(key: string) {
  const def = defs[key], pkgDir = join(PKGS, def.dir)
  for (const [i, t] of def.targets.entries()) await buildTarget(pkgDir, t, i === 0)
  const types = join(pkgDir, 'dist', 'types')
  rmSync(types, { recursive: true, force: true })
  execFileSync(process.execPath, [TSC, '-p', join(pkgDir, 'tsconfig.build.json')], { stdio: 'inherit', cwd: pkgDir })
  fixDeclarationSpecifiers(types)
  console.log(`built ${relative(ROOT, pkgDir)}`)
}

const wanted = process.argv.slice(2)
for (const key of wanted.length ? wanted : Object.keys(defs)) await buildPackage(key)
console.log(`\nsize per entry (entry + its chunks)\n${sizes.join('\n')}`)
