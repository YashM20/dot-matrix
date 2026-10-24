/**
 * First-load JS budget (docs/WEB-PLAN.md §1: ≤ 150 kB gz). Follows the entry chunk's static imports in
 * `dist/` (what the browser must fetch before the default board can paint; `import()` chunks excluded)
 * and sums their gzip sizes. `--board <id>` adds that board's lazy chunk closure (a deep link's first load).
 *
 *   npx tsx scripts/site/size.ts                 → entry + static imports
 *   npx tsx scripts/site/size.ts --board mosaic  → plus the mosaic chunk
 *   npx tsx scripts/site/size.ts --check         → exit 1 over budget
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const DIST = 'dist', BUDGET_KB = 150
const html = readFileSync(join(DIST, 'index.html'), 'utf8')
const entry = /<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/.exec(html)?.[1]
if (!entry) throw new Error('no entry script in dist/index.html (run pnpm build first)')

const gz = (file: string) => gzipSync(readFileSync(join(DIST, 'assets', file)), { level: 9 }).length
/** Static imports only: `from"./x.js"` and bare `import"./x.js"`, never `import("./x.js")`. */
const staticImports = (file: string) => [...readFileSync(join(DIST, 'assets', file), 'utf8').matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)].map(m => m[1])
function closure(roots: string[]) {
  const seen = new Set<string>(), stack = [...roots]
  while (stack.length) { const f = stack.pop()!; if (!seen.has(f)) { seen.add(f); stack.push(...staticImports(f)) } }
  return seen
}
const args = process.argv.slice(2), bi = args.indexOf('--board'), board = bi >= 0 ? args[bi + 1] : undefined
const roots = [entry]
if (board) {
  const chunk = readdirSync(join(DIST, 'assets')).find(f => f.startsWith(`${board}-`) && f.endsWith('.js'))
  if (chunk) roots.push(chunk); else console.log(`(no separate chunk for ${board}: it ships in the entry)`)
}
const files = [...closure(roots)]
const css = [...html.matchAll(/href="\/assets\/([^"]+\.css)"/g)].map(m => m[1])
const total = files.reduce((s, f) => s + gz(f), 0) / 1024, cssKb = css.reduce((s, f) => s + gz(f), 0) / 1024
for (const f of files.sort()) console.log(`  ${f.padEnd(40)} ${(gz(f) / 1024).toFixed(2)} kB gz`)
console.log(`first-load JS${board ? ` (${board})` : ''}: ${total.toFixed(2)} kB gz in ${files.length} file(s), budget ${BUDGET_KB}; CSS ${cssKb.toFixed(2)} kB gz`)
if (args.includes('--check') && total > BUDGET_KB) { console.error('over budget'); process.exit(1) }
