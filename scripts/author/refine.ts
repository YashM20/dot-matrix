/**
 * Deterministic local refinement loop (docs/MASTER-PLAN.md §2.7, automated part):
 *   render → score (`scoreAuthored`) → rule-based revisions for the failing gates → re-score → …
 * Stops when every gate passes, after `rounds` rounds, or when no revision improves the score.
 *
 * There is no LLM call in here. The *taste* half of §2.7 (the critic: "screenshot-worthy?", ranked
 * defects, kill veto, Bradley–Terry exemplars) is the MCP host model: it reads `render_card` /
 * `score_card`, writes `feedback`, and calls `refine_card` again. `feedback` keywords map to the same
 * revision rules, so the host can steer the loop without editing IR by hand.
 */
import { resolveCard, normalize, type IRCard } from './card'
import { LADDER } from '../lib/fidelity'
import { compareScores, deficit, scoreAuthored, THRESHOLDS, type AuthorScore } from './score'

type Card = ReturnType<typeof normalize>
export interface Revision { rule: string; why: string; card: Card }
export interface RoundSummary { passed: number; total: number; deficit: number; failing: string[] }
export interface Round { round: number; card: Card; score: RoundSummary; tried: string[]; accepted: string[] }
export interface RefineResult { rounds: Round[]; card: Card; score: AuthorScore; stopped: 'gate' | 'rounds' | 'no-improvement' | 'no-rule' }

const up = (k: number) => LADDER.find(s => s > k + 1e-9) ?? k
const down = (k: number) => [...LADDER].reverse().find(s => s < k - 1e-9) ?? k
const nearest = (k: number) => LADDER.reduce((b, s) => (Math.abs(s - k) < Math.abs(b - k) || (Math.abs(s - k) === Math.abs(b - k) && s > b) ? s : b), LADDER[0])
const round3 = (x: number) => +x.toFixed(3)

/** Median of the lit-dot opacity histogram (10 bins over 0…1), as a bin centre. */
const histMedian = (h: number[]) => { const n = h.reduce((a, b) => a + b, 0); let acc = 0; for (let i = 0; i < h.length; i++) { acc += h[i]; if (acc * 2 >= n) return (i + .5) / h.length } return .5 }

/** The rule book: gate id (or feedback keyword) → one revision. Rules see the current score. */
const RULES: Record<string, (c: Card, s: AuthorScore) => Omit<Revision, 'rule'> | null> = {
  ladder: c => (nearest(c.lattice) !== c.lattice ? { why: `snap lattice ${c.lattice} → ${nearest(c.lattice)} (G3)`, card: { ...c, lattice: nearest(c.lattice) } } : null),
  coarser: c => (up(c.lattice) !== c.lattice ? { why: `raise lattice ${c.lattice} → ${up(c.lattice)} (bigger, fewer dots)`, card: { ...c, lattice: up(c.lattice) } } : null),
  // dot diameter scales with the lattice: jump straight to the first ladder step that should clear G4
  dotsize: (c, s) => {
    const want = s.metrics.p90Diameter > 0 ? (c.lattice * THRESHOLDS.diameterPx) / s.metrics.p90Diameter : up(c.lattice)
    const k = LADDER.find(x => x >= want - 1e-9 && x > c.lattice) ?? up(c.lattice)
    return k !== c.lattice ? { why: `raise lattice ${c.lattice} → ${k} for ≥ ${THRESHOLDS.diameterPx} px dots (G4)`, card: { ...c, lattice: k } } : null
  },
  // stretch about the lit dots' median tone, so contrast grows without pushing everything to black
  stretch: (c, s) => {
    if (c.gain >= 8) return null
    const m = histMedian(s.metrics.histogram), g = round3(Math.min(8, c.gain * 1.6)), L = round3(Math.max(-1, Math.min(1, 1.6 * (.5 + c.level - m))))
    return { why: `stretch tone about ${m.toFixed(2)}: gain ${c.gain} → ${g}, level ${c.level} → ${L} (V2)`, card: { ...c, gain: g, level: L } }
  },
  finer: c => (down(c.lattice) !== c.lattice ? { why: `lower lattice ${c.lattice} → ${down(c.lattice)}`, card: { ...c, lattice: down(c.lattice) } } : null),
  accent: c => {
    if (c.tone === 'active' || c.tone === 'activeDim') return { why: `demote the main layer to grey; red only on its core (accent = main program ≥ ${c.accent ? c.accentCut : .85})`, card: { ...c, tone: 'auto', accent: c.accent ?? c.ir, accentCut: c.accent ? c.accentCut : .85 } }
    if (c.accent && c.accentCut < .99) { const cut = round3(Math.min(.99, c.accentCut + (1 - c.accentCut) / 2)); return { why: `shrink the accent area: accentCut ${c.accentCut} → ${cut}`, card: { ...c, accentCut: cut } } }
    return null
  },
  contrast: c => (c.gain < 8 ? { why: `raise contrast: gain ${c.gain} → ${round3(Math.min(8, c.gain * 1.6))}`, card: { ...c, gain: round3(Math.min(8, c.gain * 1.6)) } } : null),
  brighter: c => (c.level < .6 ? { why: `lift level ${c.level} → ${round3(c.level + .15)} (more ink)`, card: { ...c, level: round3(c.level + .15) } } : null),
  darker: c => (c.level > -.6 ? { why: `drop level ${c.level} → ${round3(c.level - .15)} (less ink)`, card: { ...c, level: round3(c.level - .15) } } : null),
  // changed-per-frame saturates near 1 for strobing motion, so slow hard there and proportionally below
  slower: (c, s) => {
    if (c.speed <= 1 / 64) return null
    const ch = s.metrics.changedFraction ?? 1, f = ch > .9 ? 4 : Math.max(1.5, Math.min(4, (ch / THRESHOLDS.changedFraction) * 1.25)), sp = round3(Math.max(1 / 64, c.speed / f))
    return { why: `slow time: speed ${c.speed} → ${sp} (${(ch * 100).toFixed(0)}% dots changed/frame)`, card: { ...c, speed: sp } }
  },
}
const FEEDBACK: [RegExp, keyof typeof RULES][] = [
  [/contrast|flat|muddy|washed/i, 'contrast'], [/\bred\b|accent/i, 'accent'], [/bigger|coarse|chunk|legib/i, 'coarser'], [/finer|smaller|detail/i, 'finer'],
  [/busy|dense|heavy|cluttered/i, 'darker'], [/sparse|empty|\bdim\b|faint|too dark/i, 'brighter'], [/slow|too fast|flicker|jitter/i, 'slower'],
]

/** Rules for the failing gates of `s` (in gate order, deduplicated). */
export function rulesFor(s: AuthorScore): (keyof typeof RULES)[] {
  const out: (keyof typeof RULES)[] = []
  for (const g of s.gates) if (!g.pass) {
    if (g.id === 'G3') out.push('ladder')
    if (g.id === 'G4') out.push('dotsize')
    if (g.id === 'G5') out.push('coarser')
    if (g.id === 'G2') out.push('accent')
    if (g.id === 'V2') out.push('stretch', 'contrast')
    if (g.id === 'V7') out.push(s.metrics.coverage < 3 ? 'brighter' : 'darker')
    if (g.id === 'L1') out.push('slower')
  }
  return [...new Set(out)]
}
export const feedbackRules = (feedback = '') => [...new Set(FEEDBACK.filter(([re]) => re.test(feedback)).map(([, r]) => r))]

const summary = (s: AuthorScore): RoundSummary => ({ passed: s.passed, total: s.total, deficit: +deficit(s).toFixed(4), failing: s.gates.filter(g => !g.pass).map(g => g.id) })
const scoreOf = (c: Card) => scoreAuthored(resolveCard(c).preset)

/** Run the loop. Round 0 is the input as given; every later round is accepted only if it scores better. */
export function refine(input: IRCard, opts: { feedback?: string; rounds?: number } = {}): RefineResult {
  const maxRounds = Math.max(0, Math.min(12, Math.floor(opts.rounds ?? 4)))
  let card = normalize(input), score = scoreOf(card)
  const rounds: Round[] = [{ round: 0, card, score: summary(score), tried: [], accepted: [] }]
  let stopped: RefineResult['stopped'] = 'rounds'
  for (let r = 1; r <= maxRounds; r++) {
    const fb = r === 1 ? feedbackRules(opts.feedback) : []
    const names = [...new Set([...fb, ...rulesFor(score)])]
    if (score.pass && !fb.length) { stopped = 'gate'; break }
    // singles plus every rule chained, so one round can fix independent gates at once
    const singles = names.flatMap(n => { const v = RULES[n](card, score); return v ? [{ rule: n, ...v }] : [] })
    if (!singles.length) { stopped = 'no-rule'; break }
    let chained: Card = card; const chainedWhy: string[] = [], chainedRules: string[] = []
    for (const s of singles) { const v = RULES[s.rule](chained, score); if (v) { chained = v.card; chainedWhy.push(v.why); chainedRules.push(s.rule) } }
    type Candidate = { rules: string[]; why: string[]; card: Card }
    const candidates: Candidate[] = [...(chainedRules.length > 1 ? [{ rules: chainedRules, why: chainedWhy, card: chained }] : []), ...singles.map(s => ({ rules: [s.rule], why: [s.why], card: s.card }))]
    let best: (Candidate & { score: AuthorScore }) | null = null
    for (const c of candidates) { const s = scoreOf(c.card); if (!best || compareScores(s, best.score) > 0) best = { ...c, score: s } }
    const tried = singles.map(s => s.why)
    // the host's feedback may be taken at equal score (it is the critic); gate-driven rules must improve
    const cmp = best ? compareScores(best.score, score) : -1
    if (!best || cmp < 0 || (cmp === 0 && !best.rules.some(x => (fb as string[]).includes(x)))) { rounds.push({ round: r, card, score: summary(score), tried, accepted: [] }); stopped = 'no-improvement'; break }
    card = best.card; score = best.score
    rounds.push({ round: r, card, score: summary(score), tried, accepted: best.why })
    if (score.pass && r < maxRounds) { stopped = 'gate'; break }
  }
  if (score.pass) stopped = 'gate'
  return { rounds, card, score, stopped }
}
