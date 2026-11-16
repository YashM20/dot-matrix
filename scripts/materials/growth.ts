/**
 * Materials checks, growth group (scripts/materials.ts `--only growth`): the workshop's frost window
 * (docs/living-matter/X-advanced.md #13). The 1/12-wedge automaton ≡ a plain full-disc one, the vetted table, the
 * daily pick, the red tips and the slowest bake.
 */
import { reiter } from '../../src/engine/matter/reiter'
import { frostHooks as Fr } from '../../src/widgets/boards/workshop-frost'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import { withChrome, type WidgetPreset } from '../../src/widgets/types'
import { workshopBoard } from '../../src/widgets/boards/workshop'
import { fmtLoaded, onceLoaded } from '../lib/load'
import { type Assert, same, atClock } from './util'

const frame = (p: WidgetPreset, t: number) => sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, dot480)

export function growthChecks(assert: Assert): void {
  const byId = (id: string) => workshopBoard.find(p => p.id === id)!
  // ── frost ──
  {
    // the wedge run ≡ a plain run over the whole disc (Reiter's rule written out cell by cell), bit for bit
    const R = 12, beta = .4, gamma = .001, steps = 120, a = reiter({ radius: R, beta, gamma, maxSteps: steps, margin: -1 })
    const n = a.q.length, key = (q: number, r: number) => (r + 64) * 128 + q + 64, at = new Map<number, number>()
    for (let i = 0; i < n; i++) at.set(key(a.q[i], a.r[i]), i)
    const NB = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]], nb = (i: number, d: number) => at.get(key(a.q[i] + NB[d][0], a.r[i] + NB[d][1])) ?? -1
    let s = new Float64Array(n).fill(beta), froze = new Int32Array(n).fill(-1)
    const c = at.get(key(0, 0))!
    s[c] = 1; froze[c] = 0
    for (let t = 1; t <= steps; t++) {
      const u = new Float64Array(n), v = new Float64Array(n), next = new Float64Array(n)
      for (let i = 0; i < n; i++) {
        let rc = s[i] >= 1
        for (let d = 0; d < 6 && !rc; d++) { const j = nb(i, d); if (j >= 0 && s[j] >= 1) rc = true }
        if (rc) v[i] = s[i] + gamma; else u[i] = s[i]
      }
      for (let i = 0; i < n; i++) { let sum = 0; for (let d = 0; d < 6; d++) { const j = nb(i, d); sum += j < 0 ? beta : u[j] } next[i] = u[i] + 1 / 12 * (sum - 6 * u[i]) + v[i] }
      s = next
      for (let i = 0; i < n; i++) if (froze[i] < 0 && s[i] >= 1) froze[i] = t
    }
    // (the plain run adds each cell's neighbours in its own direction order, so its water is symmetric only to rounding)
    let dw = 0
    for (let i = 0; i < n; i++) dw = Math.max(dw, Math.abs(s[i] - a.s[i]))
    assert('frost: the 1/12-wedge automaton ≡ the plain one over the whole disc (froze-at steps exact, water ± 1e-9)', same(froze, a.frozeAt) && dw < 1e-9, `${n} cells, ${a.steps} steps, water off by ${dw.toExponential(1)}`)
    let table = true, detail = ''
    for (let k = 0; k < Fr.FLAKES.length; k++) {
      const f = Fr.flake(k)
      let frozen = 0
      for (const v of f.frozeAt) if (v >= 0) frozen++
      if (f.steps >= 6000 || frozen / f.frozeAt.length >= .48) { table = false; detail = `row ${k}: ${f.steps} steps, ${(100 * frozen / f.frozeAt.length).toFixed(0)}%` }
    }
    assert('frost: every vetted (β, γ) row reaches the rim with arms, not a blob (under 48% of the disc frozen)', table, detail || `${Fr.FLAKES.length} rows`)
    const days = Array.from({ length: 60 }, (_, d) => Fr.flakeOf(new Date(2026, 0, 1 + d, 9)))
    assert('frost: one flake a day (the same all day, every row of the table within two months)', Fr.flakeOf(new Date(2026, 0, 1, 0, 1)) === Fr.flakeOf(new Date(2026, 0, 1, 23, 59)) && new Set(days).size === Fr.FLAKES.length)
    const card = byId('mat-frost'), red = (t: number) => atClock(() => frame(card, t)).filter(d => d.color === dot480.dotActive).length
    assert('frost: the freezing cells are the red while it grows (t = 0); none on the held flake', red(0) > 0 && red(1.3) === 0, `red ${red(0)} / ${red(1.3)}`)
    const bake = onceLoaded(() => reiter({ radius: Fr.FROST.radius, beta: .3, gamma: .0001, maxSteps: 6000 }).steps)
    assert('frost: the slowest flake of the table (β .3, γ 10⁻⁴) bakes in ≤ 30 ms (× load)', bake.ms <= 30 * bake.load, `${fmtLoaded(bake)}, ${bake.value} steps`)
  }
}
