/**
 * The timing gates of #28, run back to back to read their pass rate (Node, no browser):
 *  - voronoi: voronoi2 l2 / l1 / linf at 144² ≤ 3.5 ms × load each, best of 3 medians (scripts/noise.ts `voronoiBudget`).
 * Each gate runs plain `--runs` times (every run must pass) and slowed 2× three times (every run must fail), so a
 * green gate still catches a real 2× slowdown on the same runner.
 * The lens gate went with the MATERIALS board (#378).
 * The other gate of #28, the editor's ANIMATE scrub, waits on the drawn frame (scripts/editor-browser.ts); the
 * `editor` probe runs it.
 *
 *   npx tsx scripts/gates.ts [--runs 10]   pass rate per gate, then the 2× check; exit 1 unless both hold
 *
 * CI runs it on an idle runner as the `gates` probe (scripts/ci/probes.ts).
 */
import { freezeWallClock } from './lib/freeze'
import { voronoiBudget } from './noise'

freezeWallClock()
const argv = process.argv.slice(2)
const runs = Math.max(1, Number(argv[argv.indexOf('--runs') + 1]) || 10), slowRuns = 3
const gates: { name: string; run: (slow: boolean) => { ok: boolean; detail: string } }[] = [
  { name: 'voronoi2 144² ≤ 3.5 ms × load', run: slow => voronoiBudget(slow) },
]
let bad = false
for (const g of gates) {
  let pass = 0, caught = 0
  for (let i = 0; i < runs; i++) {
    const r = g.run(false)
    if (r.ok) pass++
    console.log(`  ${g.name} run ${i + 1}: ${r.ok ? 'pass' : 'FAIL'} (${r.detail})`)
  }
  for (let i = 0; i < slowRuns; i++) {
    const r = g.run(true)
    if (!r.ok) caught++
    console.log(`  ${g.name} 2× slower, run ${i + 1}: ${r.ok ? 'passed (should fail)' : 'failed, as it should'} (${r.detail})`)
  }
  bad ||= pass !== runs || caught !== slowRuns
  console.log(`${pass === runs ? '✓' : '✗'} gates: ${g.name}: ${pass}/${runs} passed`)
  console.log(`${caught === slowRuns ? '✓' : '✗'} gates: ${g.name} fails 2× slower: ${caught}/${slowRuns} caught`)
}
process.exit(bad ? 1 : 0)
