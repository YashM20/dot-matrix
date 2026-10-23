/**
 * Tiny Bradley–Terry fit over the user's like/kill history (docs/MASTER-PLAN.md §2.5 preference model).
 * Pure TS, deterministic: same verdicts (in any order) → same strengths and ranks.
 *
 * Unary verdicts become comparisons: every liked card beats every killed card, and each verdict is
 * also a game against a fixed "neutral" anchor of strength 1 (like = win, kill = loss). One virtual
 * win and one virtual loss against the anchor per card is the prior, so perfect separation still
 * converges. Fitted with Hunter's MM iteration (P(i beats j) = pᵢ / (pᵢ + pⱼ)).
 */
export type Verdict = 'like' | 'kill'
export interface VerdictRecord { key: string; verdict: Verdict; note?: string; ts?: string }
export interface Ranked { key: string; strength: number; rank: number; likes: number; kills: number }
export interface BTFit { items: Ranked[]; comparisons: number; iterations: number }

export function fitBT(records: readonly VerdictRecord[], opts: { iterations?: number; tolerance?: number } = {}): BTFit {
  const maxIt = opts.iterations ?? 500, tol = opts.tolerance ?? 1e-12
  const tally = new Map<string, { likes: number; kills: number }>()
  for (const r of records) { const t = tally.get(r.key) ?? { likes: 0, kills: 0 }; if (r.verdict === 'like') t.likes++; else t.kills++; tally.set(r.key, t) }
  const keys = [...tally.keys()].sort(), n = keys.length
  const likes = keys.map(k => tally.get(k)!.likes), kills = keys.map(k => tally.get(k)!.kills)
  // wins[i][j] = times i beat j (pairwise like × kill counts); anchor games: like → win, kill → loss, +1/+1 prior
  const wins = keys.map((_, i) => keys.map((_, j) => likes[i] * kills[j]))
  const anchorWins = likes.map(l => l + 1), anchorLosses = kills.map(k => k + 1)
  let p = new Array<number>(n).fill(1), it = 0, comparisons = 0
  for (let i = 0; i < n; i++) { comparisons += anchorWins[i] + anchorLosses[i] - 2; for (let j = 0; j < n; j++) if (j !== i) comparisons += wins[i][j] }
  for (; it < maxIt; it++) {
    const next = p.map((pi, i) => {
      let W = anchorWins[i], denom = (anchorWins[i] + anchorLosses[i]) / (pi + 1)
      for (let j = 0; j < n; j++) if (j !== i) { W += wins[i][j]; const g = wins[i][j] + wins[j][i]; if (g) denom += g / (pi + p[j]) }
      return W / denom
    })
    const delta = Math.max(0, ...next.map((x, i) => Math.abs(Math.log(x) - Math.log(p[i]))))
    p = next
    if (delta < tol) { it++; break }
  }
  const items = keys.map((key, i) => ({ key, strength: +p[i].toPrecision(12), rank: 0, likes: likes[i], kills: kills[i] }))
    .sort((a, b) => b.strength - a.strength || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  items.forEach((x, i) => { x.rank = i + 1 })
  return { items, comparisons, iterations: it }
}

/** Few-shot exemplars for the critic: the top liked and bottom killed cards. */
export function exemplars(fit: BTFit, k = 3): { like: string[]; kill: string[] } {
  return {
    like: fit.items.filter(x => x.likes > x.kills).slice(0, k).map(x => x.key),
    kill: fit.items.filter(x => x.kills > x.likes).slice(-k).reverse().map(x => x.key),
  }
}
