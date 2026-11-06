/**
 * MATRIX registry install test (docs/REGISTRY.md). Slow (a pnpm install and two builds): run it locally under the
 * machine lock, not in CI. In a temp folder it:
 *  1. builds the registry with `registryDependencies` pointing at a local server, and serves the JSON;
 *  2. makes a plain Vite + React + TS app (no Tailwind) whose `components.json` lists both registries,
 *     `@reactopia` and `@matrix`, and runs `shadcn add @matrix/<item>` for every card and `matrix-dot-text`;
 *  3. checks every installed file sits under `src/lib/matrix/` or `src/components/matrix/`, nothing else in the
 *     app changed apart from `components.json` itself, and no `utils`/`cn` file appeared;
 *  4. renders every component in `App.tsx`, then typechecks (`tsc -b`, the Vite template's strict flags) and builds.
 * `--shot <png>` also screenshots the built app in headless Chrome. `--keep` leaves the temp folder.
 *
 *   pnpm exec tsx scripts/registry/install-test.ts [--shot out.png] [--keep]
 */
import { execFile } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checker } from '../lib/check'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const args = process.argv.slice(2)
const shot = args.includes('--shot') ? resolve(args[args.indexOf('--shot') + 1]) : undefined
const keep = args.includes('--keep')
const { assert, done } = checker('install')
const SHADCN = join(ROOT, 'node_modules/shadcn/dist/index.js')
/** Async on purpose: the registry server below runs in this process, so a sync child would block it. */
const exec = (cmd: string, argv: string[], cwd: string, shell = false) => new Promise<string>((ok, fail) => {
  const child = execFile(cmd, argv, { cwd, encoding: 'utf8', shell, maxBuffer: 64 << 20 }, (e, stdout, stderr) => (e ? fail(Object.assign(e, { stdout, stderr })) : ok(stdout)))
  child.stdin?.end() // no prompt can wait on us
})
const node = (argv: string[], cwd = ROOT) => exec(process.execPath, argv, cwd)
const pnpm = (argv: string[], cwd: string) => exec('pnpm', argv, cwd, process.platform === 'win32')
const errText = (e: unknown) => { const x = e as { stdout?: string; stderr?: string }; return `${x.stdout ?? ''}${x.stderr ?? ''}`.trim() || String(e) }

function walk(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap(n => {
    if (n === 'node_modules' || n === 'dist') return []
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p).split('\\').join('/')]
  })
}
function serve(dir: string): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? '').replace(/^\/r\//, '').split('?')[0])
    const file = join(dir, name)
    if (!/^[\w.-]+\.json$/.test(name) || !existsSync(file)) { res.writeHead(404).end(); return }
    res.writeHead(200, { 'content-type': 'application/json' }); createReadStream(file).pipe(res)
  })
  return new Promise(ok => server.listen(0, '127.0.0.1', () => {
    const a = server.address()
    ok({ server, base: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/r` })
  }))
}

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const v = (name: string) => pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]
const APP_FILES: Record<string, string> = {
  'package.json': JSON.stringify({
    name: 'matrix-install-test', private: true, type: 'module',
    dependencies: { react: v('react'), 'react-dom': v('react-dom') },
    devDependencies: { vite: v('vite'), '@vitejs/plugin-react': v('@vitejs/plugin-react'), typescript: v('typescript'), '@types/react': v('@types/react'), '@types/react-dom': v('@types/react-dom') },
  }, null, 2),
  'tsconfig.json': JSON.stringify({ files: [], references: [{ path: './tsconfig.app.json' }] }),
  // The Vite react-ts template's flags, plus the `@/*` alias shadcn needs.
  'tsconfig.app.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022', lib: ['ES2022', 'DOM', 'DOM.Iterable'], module: 'ESNext', types: ['vite/client'], skipLibCheck: true,
      moduleResolution: 'bundler', allowImportingTsExtensions: true, verbatimModuleSyntax: true, moduleDetection: 'force', noEmit: true, jsx: 'react-jsx',
      strict: true, noUnusedLocals: true, noUnusedParameters: true, erasableSyntaxOnly: true, noFallthroughCasesInSwitch: true, noUncheckedSideEffectImports: true,
      baseUrl: '.', paths: { '@/*': ['./src/*'] },
    },
    include: ['src'],
  }, null, 2),
  'vite.config.ts': `import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
export default defineConfig({ plugins: [react()], resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } } })
`,
  'index.html': '<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>MATRIX install test</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n',
  'src/index.css': 'body { margin: 0; background: #000; color: #f2f3f5; font: 14px system-ui, sans-serif; }\n',
  'src/main.tsx': `import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
`,
  'src/App.tsx': 'export default function App() { return null }\n',
}

const tmp = mkdtempSync(join(tmpdir(), 'matrix-install-'))
const app = join(tmp, 'app'), out = join(tmp, 'r')
let server: Server | undefined
try {
  const s = await serve(out)
  server = s.server
  await node(['--import', 'tsx', 'scripts/registry/generate.ts', '--base', s.base, '--out', join(tmp, 'registry.json')])
  await node([SHADCN, 'build', join(tmp, 'registry.json'), '-o', out])
  const index = JSON.parse(readFileSync(join(tmp, 'registry.json'), 'utf8')) as { items: { name: string; type: string }[] }
  const wanted = index.items.filter(i => i.type === 'registry:component').map(i => i.name)
  assert('local registry built and served', wanted.length >= 17, `${wanted.length} components at ${s.base}`)

  for (const [f, text] of Object.entries(APP_FILES)) { mkdirSync(dirname(join(app, f)), { recursive: true }); writeFileSync(join(app, f), text) }
  writeFileSync(join(app, 'components.json'), JSON.stringify({
    $schema: 'https://ui.shadcn.com/schema.json', style: 'new-york', rsc: false, tsx: true,
    tailwind: { config: '', css: 'src/index.css', baseColor: 'neutral', cssVariables: true, prefix: '' },
    aliases: { components: '@/components', utils: '@/lib/utils', ui: '@/components/ui', lib: '@/lib', hooks: '@/hooks' },
    registries: { '@reactopia': 'https://yash.reactopia.me/r/{name}.json', '@matrix': `${s.base}/{name}.json` },
  }, null, 2))
  await pnpm(['install', '--prefer-offline', '--ignore-workspace'], app)
  const before = new Map(walk(app).map(f => [f, readFileSync(join(app, f), 'utf8')]))

  try { await node([SHADCN, 'add', ...wanted.map(n => `@matrix/${n}`), '--yes', '--overwrite', '--cwd', app]); assert('shadcn add @matrix/* (every component, core and boards through registryDependencies)', true) }
  catch (e) { assert('shadcn add @matrix/*', false, errText(e)) }

  const after = walk(app)
  const added = after.filter(f => !before.has(f)), changed = after.filter(f => before.has(f) && before.get(f) !== readFileSync(join(app, f), 'utf8'))
  const stray = added.filter(f => !/^src\/(lib|components)\/matrix\//.test(f))
  assert('every installed file is under src/lib/matrix/ or src/components/matrix/', added.length > 0 && stray.length === 0, `${added.length} files${stray.length ? `; stray: ${stray.join(', ')}` : ''}`)
  assert('nothing else in the app changed (no css, no utils, no package.json edits)', changed.length === 0, changed.join(', '))
  assert('core runtime, boards and every card installed', ['src/lib/matrix/widgets/mount.ts', 'src/components/matrix/dot-card.tsx', 'src/lib/matrix/widgets/boards/henry.ts', 'src/lib/matrix/widgets/boards/heartbeat.ts', ...wanted.map(n => `src/components/matrix/${n}.tsx`)].every(f => after.includes(f)))

  const comps = wanted.filter(n => n !== 'matrix-dot-text' && n !== 'matrix-home-clock')
  const pascal = (n: string) => 'Matrix' + n.replace(/^matrix-(ui-)?/, '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('')
  writeFileSync(join(app, 'src/App.tsx'), `import { MatrixDotText } from '@/components/matrix/matrix-dot-text'
import { MatrixHomeClock } from '@/components/matrix/matrix-home-clock'
${comps.map(n => `import { ${pascal(n)} } from '@/components/matrix/${n}'`).join('\n')}

const cell = { width: 216 }
export default function App() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 24 }}>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <MatrixHomeClock style={{ width: 360 }} />
        <MatrixDotText text="MATRIX" weight="bold" pitch={6} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        ${comps.map(n => `<${pascal(n)} style={cell} />`).join('\n        ')}
      </div>
    </main>
  )
}
`)
  try { await pnpm(['exec', 'tsc', '-b'], app); assert('the app typechecks with the Vite template strict flags', true) }
  catch (e) { assert('the app typechecks', false, errText(e).split('\n').slice(0, 20).join('\n')) }
  try { await pnpm(['exec', 'vite', 'build'], app); assert('the app builds', existsSync(join(app, 'dist/index.html'))) }
  catch (e) { assert('the app builds', false, errText(e).split('\n').slice(0, 20).join('\n')) }

  if (shot && existsSync(join(app, 'dist/index.html'))) {
    const { launch, sleep } = await import('../lib/cdp')
    const dist = join(app, 'dist')
    const web = createServer((req, res) => {
      const p = (req.url ?? '/').split('?')[0], file = join(dist, p === '/' ? 'index.html' : p)
      if (!file.startsWith(dist) || !existsSync(file)) { res.writeHead(404).end(); return }
      res.writeHead(200, { 'content-type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); createReadStream(file).pipe(res)
    })
    await new Promise<void>(ok => web.listen(0, '127.0.0.1', ok))
    const a = web.address(), page = await launch(1280, 1100, { testHooks: false })
    try {
      await page.cdp('Page.navigate', { url: `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}/` })
      await page.waitFor(`document.querySelectorAll('.matrix-card svg, .matrix-card canvas').length >= ${wanted.length}`, 15000)
      await sleep(1500)
      const cards = await page.js<number>(`document.querySelectorAll('.matrix-card').length`)
      assert('every component mounts in the browser with no page error', cards === wanted.length && page.logs.length === 0, `${cards} cards; ${page.logs.slice(0, 3).join(' | ')}`)
      await page.shot(shot)
      console.log(`shot: ${shot}`)
    } finally { await page.close(); web.close() }
  }
} catch (e) {
  assert('install test ran', false, errText(e))
} finally {
  server?.close()
  if (keep) console.log(`kept ${tmp}`); else rmSync(tmp, { recursive: true, force: true })
}
done('registry install test ok')
