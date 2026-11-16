/**
 * The timing gates of #28, run back to back to read their pass rate (Node, no browser):
 *  - voronoi: voronoi2 144², l2 ≤ 3.0 ms and l1 / linf ≤ 3.5 ms × load, best of 3 medians (scripts/noise.ts `voronoiBudget`).
 * Each gate runs plain `--runs` times (every run must pass) and slowed 2× three times. A slowed run counts as caught
 * only when every metric reads at least `MARGIN` over its own budget, so a green gate catches a real 2× slowdown of
 * any one metric on the same runner, with room to spare.
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

/** How far over its budget each metric must read when slowed 2× (on a runner: l2 +22%, l1 +20%, linf +32%). */
const MARGIN = 1.1
freezeWallClock()
const argv = process.argv.slice(2)
const runs = Math.max(1, Number(argv[argv.indexOf('--runs') + 1]) || 10), slowRuns = 3
let pass = 0, caught = 0
for (let i = 0; i < runs; i++) {
  const r = voronoiBudget()
  if (r.ok) pass++
  console.log(`  voronoi run ${i + 1}: ${r.ok ? 'pass' : 'FAIL'} (${r.detail})`)
}
for (let i = 0; i < slowRuns; i++) {
  const r = voronoiBudget(true)
  const over = r.metrics.map(m => ({ metric: m.metric, x: m.ms / m.load / m.budget }))
  const all = over.every(o => o.x >= MARGIN)
  if (all) caught++
  console.log(`  voronoi 2× slower, run ${i + 1}: ${all ? 'every metric caught' : 'NOT every metric caught'} (${over.map(o => `${o.metric} ${((o.x - 1) * 100).toFixed(0)}% over`).join(', ')}; ${r.detail})`)
}
console.log(`${pass === runs ? '✓' : '✗'} gates: voronoi2 144² l2 ≤ 3.0 ms, l1 / linf ≤ 3.5 ms × load: ${pass}/${runs} passed`)
console.log(`${caught === slowRuns ? '✓' : '✗'} gates: voronoi2 2× slower reads ≥ ${Math.round((MARGIN - 1) * 100)}% over budget on every metric: ${caught}/${slowRuns} caught`)
process.exit(pass === runs && caught === slowRuns ? 0 : 1)
