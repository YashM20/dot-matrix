/**
 * MATRIX registry check (docs/REGISTRY.md), cheap enough for CI. With no network and no install:
 *  - `registry.json` and the generated card wrappers are up to date (scripts/registry/generate.ts --check);
 *  - `shadcn build` (the pinned CLI) builds every item into a temp folder, and the index and every built item pass
 *    the shadcn schemas (`registrySchema`, `registryItemSchema`) with file `content` inlined;
 *  - no conflict with another registry in the same project: every item name starts with `matrix-`, every file
 *    installs under `lib/matrix/` or `components/matrix/`, `cssVars` / `css` keys and CSS classes in shipped
 *    components use the `matrix-` prefix, no item ships `cn`/`utils` or touches `tailwind` / the base theme, and
 *    `registryDependencies` are full URLs on this registry (or the shared `utils` of the reactopia registry);
 *  - lib files are the `src/` files themselves (byte for byte), and nothing imports a package other than React.
 *
 *   pnpm registry:check                → builds into a temp folder; exit 1 on a failure
 *   pnpm registry:check --dir dist/r   → checks a build `pnpm registry:build` already wrote (CI)
 * The full install test (throwaway Vite app, typecheck, build) is scripts/registry/install-test.ts.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { registryItemSchema, registrySchema } from 'shadcn/schema'
import { checker } from '../lib/check'

const { assert, done } = checker('registry')
/** Node itself runs the scripts and the pinned CLI (no shell, same on every OS). */
const node = (args: string[]) => execFileSync(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' })
const SHADCN = 'node_modules/shadcn/dist/index.js'
const BASE = 'https://matrix.reactopia.me/r/'
const SHARED_UTILS = 'https://yash.reactopia.me/r/utils.json'
const ALLOWED_PACKAGES = new Set(['react'])

try { node(['--import', 'tsx', 'scripts/registry/generate.ts', '--check']); assert('registry.json and card wrappers up to date', true) }
catch (e) { assert('registry.json and card wrappers up to date', false, String((e as { stderr?: string }).stderr ?? e).trim()) }

const index = JSON.parse(readFileSync('registry.json', 'utf8'))
const parsed = registrySchema.safeParse(index)
assert('registry.json passes the shadcn registry schema', parsed.success, parsed.success ? '' : parsed.error.message)
assert('registry name and homepage', index.name === 'matrix' && index.homepage === 'https://matrix.reactopia.me')

const dirArg = process.argv.indexOf('--dir'), given = dirArg > 0 ? process.argv[dirArg + 1] : undefined
const out = given ?? mkdtempSync(join(tmpdir(), 'matrix-registry-'))
try {
  if (!given) node([SHADCN, 'build', 'registry.json', '-o', out])
  const built = readdirSync(out).filter(f => f.endsWith('.json') && f !== 'registry.json')
  assert('shadcn build writes one JSON per item plus the index', built.length === index.items.length && readdirSync(out).includes('registry.json'), `${built.length} / ${index.items.length}`)
  const bad: string[] = []
  // The CLI rewrites an `@/` import to an installed file with the same name, so a component may only import a unique one.
  const names = new Map<string, number>()
  for (const it of index.items) for (const fl of it.files) { const b = String(fl.target).split('/').pop()!.replace(/\.tsx?$/, ''); names.set(b, (names.get(b) ?? 0) + 1) }
  for (const name of built) {
    const item = JSON.parse(readFileSync(join(out, name), 'utf8'))
    const r = registryItemSchema.safeParse(item)
    if (!r.success) { bad.push(`${name}: ${r.error.message}`); continue }
    const at = (msg: string) => bad.push(`${item.name}: ${msg}`)
    if (!item.name.startsWith('matrix-')) at('name lacks the matrix- prefix')
    if (`${item.name}.json` !== name) at(`built as ${name}`)
    for (const key of Object.keys({ ...item.cssVars?.theme, ...item.cssVars?.light, ...item.cssVars?.dark })) if (!key.startsWith('matrix-')) at(`cssVar ${key}`)
    if (item.css) for (const sel of Object.keys(item.css)) if (!/\.matrix-|--matrix-/.test(sel)) at(`css rule ${sel}`)
    if (item.tailwind) at('touches the tailwind config')
    for (const dep of item.registryDependencies ?? []) if (!dep.startsWith(`${BASE}matrix-`) && dep !== SHARED_UTILS) at(`registryDependency ${dep}`)
    for (const dep of item.dependencies ?? []) if (!ALLOWED_PACKAGES.has(dep.replace(/@[^@]*$/, '') || dep)) at(`npm dependency ${dep}`)
    for (const f of item.files ?? []) {
      if (!/^(lib|components)\/matrix\//.test(f.target ?? '')) at(`target ${f.target ?? '(none)'} outside lib/matrix or components/matrix`)
      if (/(^|\/)(utils|cn)\.tsx?$/.test(f.target ?? '') && !f.target.startsWith('lib/matrix/engine/')) at(`ships ${f.target}`)
      if (f.path.startsWith('src/') && f.content !== readFileSync(f.path, 'utf8')) at(`${f.path} differs from src/`)
      for (const m of String(f.content).matchAll(/from\s+['"]([^'"./][^'"]*)['"]/g)) {
        const spec = m[1]
        if (!spec.startsWith('@/lib/matrix/') && !spec.startsWith('@/components/matrix/') && !ALLOWED_PACKAGES.has(spec)) at(`${f.path} imports ${spec}`)
        if (spec.startsWith('@/') && names.get(spec.split('/').pop()!) !== 1) at(`${f.path} imports ${spec}: that file name is not unique in the registry, the CLI may point it at another file`)
      }
      for (const m of String(f.content).matchAll(/className=\{?[`'"]([^`'"]*)/g)) for (const cls of m[1].split(/\s+/)) if (cls && !cls.startsWith('$') && !cls.startsWith('matrix-')) at(`class ${cls}`)
    }
  }
  assert('every built item passes the shadcn item schema and the no-conflict rules', bad.length === 0, bad.slice(0, 12).join('\n  '))
} catch (e) {
  assert('shadcn build', false, String((e as { stderr?: string }).stderr ?? e).trim())
} finally { if (!given) rmSync(out, { recursive: true, force: true }) }

done(`registry ok: ${index.items.length} items`)
