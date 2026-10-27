/**
 * First-load JS budget (docs/WEB-PLAN.md §1: ≤ 150 kB gz). Follows the entry chunk's static imports in
 * `dist/` (what the browser must fetch before the default board can paint; `import()` chunks excluded)
 * and sums their gzip sizes. `--board <id>` adds that board's lazy chunk closure (a deep link's first load).
 *
 *   npx tsx scripts/site/size.ts                 → entry + static imports
 *   npx tsx scripts/site/size.ts --board mosaic  → plus the mosaic chunk
 *   npx tsx scripts/site/size.ts --worker        → also the sample worker chunk (`sampleWorker-*.js`)
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

/** First-load closure (and the worker chunk) of one build. */
function measure(dist: string, board?: string) {
  const html = readFileSync(join(dist, 'index.html'), 'utf8'), assets = join(dist, 'assets')
  const entry = /<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/.exec(html)?.[1]
  if (!entry) throw new Error(`no entry script in ${dist}/index.html (run pnpm build first)`)
  const gz = (file: string) => gzipSync(readFileSync(join(assets, file)), { level: 9 }).length
  /** Static imports only: `from"./x.js"` and bare `import"./x.js"`, never `import("./x.js")`. */
  const staticImports = (file: string) => [...readFileSync(join(assets, file), 'utf8').matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map(m => m[1])
  const seen = new Set<string>(), stack = [entry]
  if (board) {
    const chunk = readdirSync(assets).find(f => f.startsWith(`${board}-`) && f.endsWith('.js'))
    if (chunk) stack.push(chunk); else console.log(`(no separate chunk for ${board}: it ships in the entry)`)
  }
  while (stack.length) { const f = stack.pop()!; if (!seen.has(f)) { seen.add(f); stack.push(...staticImports(f)) } }
  const files = [...seen].sort().map(f => ({ f, kb: gz(f) / 1024 }))
  const worker = readdirSync(assets).find(f => /^sampleWorker-.*\.js$/.test(f))
  const css = [...html.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map(m => m[1])
  return { files, total: files.reduce((s, x) => s + x.kb, 0), worker, workerKb: worker ? gz(worker) / 1024 : NaN, cssKb: css.reduce((s, f) => s + gz(f), 0) / 1024 }
}

const dist = opt('--dist') ?? 'dist', board = opt('--board'), showWorker = args.includes('--worker'), check = args.includes('--check')
const m = measure(dist, board)
for (const { f, kb } of m.files) console.log(`  ${f.padEnd(40)} ${kb.toFixed(2)} kB gz`)
console.log(`first-load JS${board ? ` (${board})` : ''}: ${m.total.toFixed(2)} kB gz in ${m.files.length} file(s), budget ${BUDGET_KB}; CSS ${m.cssKb.toFixed(2)} kB gz`)
if (showWorker) console.log(m.worker ? `sample worker: ${m.worker} ${m.workerKb.toFixed(2)} kB gz` : 'sample worker: no sampleWorker-*.js in this build')

let failed = false
if (check && m.total > BUDGET_KB) { console.error('over budget'); failed = true }
// the Field IR core (parser, GLSL emitter) is lazy since F0.11; its strings in first load mean a static import crept back
// (usually a value import from the `src/engine` barrel, or `passes.ts` importing `../../ir`)
const irIn = board ? [] : m.files.filter(({ f }) => /is a function; call it as|ir_sdBox/.test(readFileSync(join(dist, 'assets', f), 'utf8'))).map(x => x.f)
if (irIn.length) { console.error(`Field IR core is in first load (${irIn.join(', ')})`); if (check) failed = true }
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
