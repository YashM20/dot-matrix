/**
 * First-load JS budget (docs/WEB-PLAN.md §1: ≤ 150 kB gz). Follows the entry chunk's static imports in
 * `dist/` (what the browser must fetch before the default board can paint; `import()` chunks excluded)
 * and sums their gzip sizes. `--board <id>` adds that board's lazy chunk closure (a deep link's first load).
 *
 *   npx tsx scripts/site/size.ts                 → entry + static imports
 *   npx tsx scripts/site/size.ts --board mosaic  → plus the mosaic chunk
 *   npx tsx scripts/site/size.ts --worker        → also the sample worker: its initial load (`sampleWorker-*.js` and
 *                                                  its static imports) and, per board, the chunks a card's first
 *                                                  request adds (the worker loads one board chunk at a time)
 *   npx tsx scripts/site/size.ts --check         → exit 1 over budget (the 150 kB backstop)
 *
 * Delta gates (docs/LIVING-MATTER-PLAN.md §6, the first-load ledger): a change is gated on its growth against
 * the build before it, not on the absolute number. Give the base as another build (`--against <dist dir>`) or as
 * the ledger's running totals (`--base <kB>`, `--worker-base <kB>`); `--delta <kB>` / `--worker-delta <kB>` is the
 * change's ledger row (negative for a cut). With `--check`, a Δ above its row fails. `--dist <dir>` measures
 * another build than `dist/`.
 *
 *   npx tsx scripts/site/size.ts --worker --against ../base/dist --delta 0.02 --worker-delta 0.05 --check
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const BUDGET_KB = 150
const args = process.argv.slice(2)
const opt = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const num = (name: string) => { const v = opt(name); if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n)) throw new Error(`${name} wants a number in kB, got "${v}"`); return n }

/** First-load closure (and the worker's initial load) of one build. */
function measure(dist: string, board?: string) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8'), assets = join(dist, 'assets')
  const entry = /<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/.exec(html)?.[1]
  if (!entry) throw new Error(`no entry script in ${dist}/index.html (run pnpm build first)`)
  const gz = (file: string) => gzipSync(readFileSync(join(assets, file)), { level: 9 }).length
  /** Static imports only: `from"./x.js"` and bare `import"./x.js"`, never `import("./x.js")`. */
  const staticImports = (file: string) => [...readFileSync(join(assets, file), 'utf8').matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map(m => m[1])
  /** `roots` and everything they import statically, minus `skip`. */
  const closure = (roots: string[], skip: ReadonlySet<string> = new Set()) => {
    const seen = new Set<string>(), stack = [...roots]
    while (stack.length) { const f = stack.pop()!; if (!seen.has(f) && !skip.has(f)) { seen.add(f); stack.push(...staticImports(f)) } }
    return seen
  }
  const kbOf = (set: Iterable<string>) => [...set].reduce((s, f) => s + gz(f), 0) / 1024
  const all = readdirSync(assets)
  const roots = [entry]
  if (board) {
    const chunk = all.find(f => f.startsWith(`${board}-`) && f.endsWith('.js'))
    if (chunk) roots.push(chunk); else console.log(`(no separate chunk for ${board}: it ships in the entry)`)
  }
  const files = [...closure(roots)].sort().map(f => ({ f, kb: gz(f) / 1024 }))
  // the sample worker: what loads before it answers, then per board what one card's first request adds
  const worker = all.find(f => /^sampleWorker-.*\.js$/.test(f))
  const workerInit = worker ? closure([worker]) : new Set<string>()
  const workerChunks = all.filter(f => /^(sampleWorker|wk)-.*\.js$/.test(f))
  // a board chunk is one the worker's own code `import()`s (the manifest's loaders); names alone can clash (board
  // `sim` and `engine/sim`)
  const lazy = new Set([...workerInit].flatMap(f => [...readFileSync(join(assets, f), 'utf8').matchAll(/import\(\s*[`"']\.\/([^`"']+\.js)[`"']\s*\)/g)].map(m => m[1])))
  const workerBoards = boardModules().map(({ id, name }) => {
    const chunk = all.find(f => lazy.has(f) && new RegExp(`^wk-${name}-[\\w-]{8}\\.js$`).test(f))
    return { id, chunk, kb: chunk ? kbOf(closure([chunk], workerInit)) : NaN }
  })
  const css = [...html.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map(m => m[1])
  return {
    files, total: files.reduce((s, x) => s + x.kb, 0), cssKb: css.reduce((s, f) => s + gz(f), 0) / 1024,
    worker, workerKb: worker ? kbOf(workerInit) : NaN, workerInit: [...workerInit], workerBoards,
    workerAllKb: kbOf(workerChunks), workerChunks, read: (f: string) => readFileSync(join(assets, f), 'utf8'),
  }
}
/** Each board's module basename (`manifest.ts` `load`), or its worker stub's (`vite.config.ts` `mainThreadOnly`). */
function boardModules() {
  const stubs = new Map([...readFileSync('vite.config.ts', 'utf8').matchAll(/'(\/boards\/[\w/-]+)':\s*'[^']*\/([\w-]+)\.ts'/g)].map(m => [m[1], m[2]]))
  return [...readFileSync('src/widgets/manifest.ts', 'utf8').matchAll(/\{ id: '([\w-]+)'.*?import\('\.(\/boards\/[\w/-]+)'\)/g)]
    .map(m => ({ id: m[1], name: stubs.get(m[2]) ?? m[2].split('/').pop()! }))
}

const dist = opt('--dist') ?? 'dist', board = opt('--board'), showWorker = args.includes('--worker'), check = args.includes('--check')
const m = measure(dist, board)
for (const { f, kb } of m.files) console.log(`  ${f.padEnd(40)} ${kb.toFixed(2)} kB gz`)
console.log(`first-load JS${board ? ` (${board})` : ''}: ${m.total.toFixed(2)} kB gz in ${m.files.length} file(s), budget ${BUDGET_KB}; CSS ${m.cssKb.toFixed(2)} kB gz`)
if (showWorker && !m.worker) console.log('sample worker: no sampleWorker-*.js in this build')
else if (showWorker) {
  console.log(`sample worker: initial ${m.workerKb.toFixed(2)} kB gz (${m.workerInit.join(', ')}); all ${m.workerChunks.length} worker chunks ${m.workerAllKb.toFixed(2)} kB gz`)
  const found = m.workerBoards.filter(b => b.chunk)
  if (found.length) {
    console.log('  per board, added by the first request of a card (its board chunk and the shared chunks it imports):')
    for (const b of [...found].sort((x, y) => y.kb - x.kb)) console.log(`    ${b.id.padEnd(12)} ${b.kb.toFixed(2).padStart(6)} kB gz  ${b.chunk}`)
  }
  const missing = m.workerBoards.filter(b => !b.chunk).map(b => b.id)
  if (missing.length) console.log(`  no separate worker chunk for: ${missing.join(', ')}${found.length ? '' : ' (every board ships in the worker entry)'}`)
}

let failed = false
if (check && m.total > BUDGET_KB) { console.error('over budget'); failed = true }
// the Field IR core (parser, GLSL emitter) is lazy since F0.11; its strings in first load mean a static import crept back
// (usually a value import from the `src/engine` barrel, or `passes.ts` importing `../../ir`)
const irIn = board ? [] : m.files.filter(({ f }) => /is a function; call it as|ir_sdBox/.test(readFileSync(join(dist, 'assets', f), 'utf8'))).map(x => x.f)
if (irIn.length) { console.error(`Field IR core is in first load (${irIn.join(', ')})`); if (check) failed = true }
// code that never ships in any worker chunk: the squares GL join program (Q1.7: the worker rasterizes on Canvas only)
// and the pond's glyph alphabet (L1: pond cards are main-thread only, the worker build stubs the board)
if (showWorker && m.worker) for (const [mark, what] of [['uJointO', 'the squares GL join program'], ['EDGE3', 'the pond glyph alphabet']]) {
  const hits = m.workerChunks.filter(f => m.read(f).includes(mark))
  if (hits.length) { console.error(`${what} is in the sample worker (${hits.join(', ')})`); if (check) failed = true }
  else console.log(`${mark} in worker chunks: 0 of ${m.workerChunks.length}`)
}
const against = opt('--against')
if (against && !existsSync(join(against, 'index.html'))) throw new Error(`--against ${against}: no index.html there`)
const base = against ? measure(against, board) : undefined
const gate = (what: string, now: number, was: number | undefined, row: number | undefined) => {
  if (was === undefined || !Number.isFinite(was) || !Number.isFinite(now)) { if (row !== undefined) console.log(`${what}: no base to gate Δ ≤ ${row} kB against (give --against or the base flag)`); return }
  const d = now - was
  console.log(`${what}: ${was.toFixed(2)} → ${now.toFixed(2)} kB gz, Δ ${d >= 0 ? '+' : ''}${d.toFixed(2)}${row !== undefined ? ` (ledger row ${row >= 0 ? '+' : ''}${row})` : ''}`)
  if (check && row !== undefined && d > row + 1e-9) { console.error(`${what} grew past its ledger row`); failed = true }
}
gate('first-load Δ', m.total, num('--base') ?? base?.total, num('--delta'))
if (showWorker || num('--worker-delta') !== undefined) gate('worker Δ', m.workerKb, num('--worker-base') ?? base?.workerKb, num('--worker-delta'))
if (failed) process.exit(1)
