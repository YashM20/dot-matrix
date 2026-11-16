/**
 * The timing gates of #28, run back to back to read their pass rate (Node, no browser):
 *  - voronoi: voronoi2 l2 / l1 / linf at 144² ≤ 3.5 ms × load each (scripts/noise.ts `voronoiBudget`).
 * The lens gate went with the MATERIALS board (#378).
 * The other gate of #28, the editor's ANIMATE scrub, waits on the drawn frame (scripts/editor-browser.ts); the
 * `editor` probe runs it.
 *
 *   npx tsx scripts/gates.ts [--runs 10]   pass rate per gate; exit 1 unless every run passed
 *   npx tsx scripts/gates.ts --slow        the same with a load-scaled slowdown inside each timed loop: every run must fail
 *
 * CI runs it on an idle runner as the `gates` probe (scripts/ci/probes.ts).
 */
import { freezeWallClock } from './lib/freeze'
import { voronoiBudget } from './noise'

freezeWallClock()
const argv = process.argv.slice(2), slow = argv.includes('--slow')
const runs = Math.max(1, Number(argv[argv.indexOf('--runs') + 1]) || 10)
const gates: { name: string; run: () => { ok: boolean; detail: string } }[] = [
  { name: 'voronoi2 144² ≤ 3.5 ms × load', run: () => voronoiBudget(slow) },
]
let bad = false
for (const g of gates) {
  let pass = 0
  for (let i = 0; i < runs; i++) {
    const r = g.run()
    if (r.ok) pass++
    console.log(`  ${g.name} run ${i + 1}: ${r.ok ? 'pass' : 'FAIL'} (${r.detail})`)
  }
  // a plain run must pass every time; a slowed one must fail every time
  const ok = slow ? pass === 0 : pass === runs
  bad ||= !ok
  console.log(`${ok ? '✓' : '✗'} gates: ${g.name}: ${pass}/${runs} passed${slow ? ' with the slowdown (want 0)' : ''}`)
}
process.exit(bad ? 1 : 0)
