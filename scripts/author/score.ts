/**
 * Author scorecard: the automated §2.2 gates from `scripts/lib/fidelity.ts` plus the measurable
 * proxies of a few §2.3/§2.4 criteria, as one pass/fail list the refinement loop can act on.
 *
 *   G1 dot integrity      fidelity G1                                   (§2.2)
 *   G2 accent             ≤ 1 active layer and red ≤ 12% of lit dots    (§2.2; area proxy until accentRole)
 *   G3 lattice ladder     fidelity G3                                   (§2.2)
 *   G4 dot size           p90 lit-dot diameter at 1× ≥ 3 px             (§2.2 G4 proxy: big elements read as big dots)
 *   G5 perf               fidelity G5                                   (§2.2)
 *   V2 tonal depth        opacity spread p90−p10 ≥ 0.3                  (§2.3.2 proxy)
 *   V7 density            ink coverage 3…45%                            (§2.3.7 proxy)
 *   L1 motion legibility  ≤ 2 cells/frame and ≤ 50% dots changed/frame (§2.4.1; animated only)
 *
 * The taste criteria (silhouette, hierarchy, story, …) are not automated: the MCP host model is the critic.
 */
import { quantile, sampleCard, theme, visible } from '../lib/cards'
import { scoreFidelity, type FidelityCard } from '../lib/fidelity'
import type { WidgetPreset } from '../../src/widgets'

export interface Gate { id: string; name: string; pass: boolean; value: number; want: string; /** 0 when passing, else a normalised distance to the threshold. */ deficit: number }
export interface AuthorScore {
  gates: Gate[]; passed: number; total: number; pass: boolean
  metrics: { dots: number; redShare: number; p90Diameter: number; spread: number; coverage: number; histogram: number[]; cellsPerFrame?: number; changedFraction?: number }
  fidelity: FidelityCard
}

export const THRESHOLDS = { redShare: .12, diameterPx: 3, spread: .3, coverage: [3, 45] as [number, number], cellsPerFrame: 2, changedFraction: .5 }

const gate = (id: string, name: string, pass: boolean, value: number, want: string, deficit: number): Gate => ({ id, name, pass, value: +value.toFixed(4), want, deficit: pass ? 0 : +Math.max(1e-3, deficit).toFixed(4) })

export function scoreAuthored(p: WidgetPreset): AuthorScore {
  const f = scoreFidelity(p), T = THRESHOLDS
  const lit = sampleCard(p, 0).filter(visible)
  const reds = new Set([theme.dotActive, theme.dotActiveDim].filter(Boolean))
  const redShare = lit.length ? lit.filter(d => reds.has(d.color)).length / lit.length : 0
  const p90Diameter = lit.length ? 2 * quantile(lit.map(d => d.r), .9) : 0
  const { spread, coverage } = f.metrics
  const gates: Gate[] = [
    gate('G1', 'dot integrity', f.g1.pass, f.g1.offGrid + f.g1.nonFinite + f.g1.zeroRadius, '0 off-grid/NaN/zero-r', 1),
    gate('G2', 'accent', f.g2.activeLayers <= 1 && redShare <= T.redShare, redShare, `≤ 1 active layer, red ≤ ${T.redShare * 100}% of lit dots`, Math.max(redShare - T.redShare, 0) / T.redShare + Math.max(0, f.g2.activeLayers - 1)),
    gate('G3', 'lattice ladder', f.g3.pass, f.g3.offLadder.length, 'lattice on {0.72,1,1.3,1.6,2,2.5,3,4}', f.g3.offLadder.length),
    gate('G4', 'dot size at 1×', p90Diameter >= T.diameterPx, p90Diameter, `p90 lit-dot diameter ≥ ${T.diameterPx} px`, (T.diameterPx - p90Diameter) / T.diameterPx),
    gate('G5', 'perf', f.g5.pass, f.g5.ms, `≤ ${f.g5.budgetMs} ms`, (f.g5.ms - f.g5.budgetMs) / f.g5.budgetMs),
    gate('V2', 'tonal depth', spread >= T.spread, spread, `opacity spread ≥ ${T.spread}`, (T.spread - spread) / T.spread),
    gate('V7', 'density', coverage >= T.coverage[0] && coverage <= T.coverage[1], coverage, `coverage ${T.coverage[0]}…${T.coverage[1]}%`, coverage < T.coverage[0] ? (T.coverage[0] - coverage) / T.coverage[0] : (coverage - T.coverage[1]) / T.coverage[1]),
  ]
  if (f.motion) {
    const { cellsPerFrame, changedFraction } = f.motion
    gates.push(gate('L1', 'motion legibility', cellsPerFrame <= T.cellsPerFrame && changedFraction <= T.changedFraction, changedFraction, `≤ ${T.cellsPerFrame} cells/frame, ≤ ${T.changedFraction * 100}% dots changed/frame`,
      Math.max(0, cellsPerFrame - T.cellsPerFrame) / T.cellsPerFrame + Math.max(0, changedFraction - T.changedFraction) / T.changedFraction))
  }
  const passed = gates.filter(g => g.pass).length
  return {
    gates, passed, total: gates.length, pass: passed === gates.length,
    metrics: { dots: lit.length, redShare, p90Diameter, spread, coverage, histogram: f.metrics.histogram, ...(f.motion && { cellsPerFrame: f.motion.cellsPerFrame, changedFraction: f.motion.changedFraction }) },
    fidelity: f,
  }
}

/** Total order on scores: more gates passed first, then less total deficit. */
export const compareScores = (a: AuthorScore, b: AuthorScore) => (a.passed - b.passed) || (deficit(b) - deficit(a))
export const deficit = (s: AuthorScore) => s.gates.reduce((t, g) => t + g.deficit, 0)
