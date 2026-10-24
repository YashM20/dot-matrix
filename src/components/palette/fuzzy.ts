/**
 * Tiny fuzzy matcher for the palette: the query's characters must appear in order (case-insensitive).
 * Score favours consecutive runs, word starts and an early first hit; returns the matched indexes
 * so the list can highlight them.
 */
export interface Match { score: number; hits: number[] }

const isStart = (s: string, i: number) => i === 0 || /[\s\-_/·(—.]/.test(s[i - 1]) || (s[i - 1] === s[i - 1].toLowerCase() && s[i] !== s[i].toLowerCase())

export function fuzzy(query: string, text: string): Match | null {
  const q = query.trim().toLowerCase()
  if (!q) return { score: 0, hits: [] }
  const t = text.toLowerCase()
  // a plain substring always wins over a scattered match
  const at = t.indexOf(q)
  if (at >= 0) return { score: 1000 - at + (isStart(text, at) ? 200 : 0) - text.length * .1, hits: Array.from({ length: q.length }, (_, i) => at + i) }
  const hits: number[] = []
  let score = 0, prev = -2, j = 0
  for (let i = 0; i < t.length && j < q.length; i++) {
    if (q[j] === ' ') { j++; i--; continue }
    if (t[i] !== q[j]) continue
    score += 10 + (i === prev + 1 ? 15 : 0) + (isStart(text, i) ? 12 : 0) - Math.min(8, i * .2)
    hits.push(i); prev = i; j++
  }
  while (j < q.length && q[j] === ' ') j++
  return j === q.length ? { score: score - text.length * .1, hits } : null
}

/** Rank `items` by the best match over their `text` (and optional `keywords`, matched but not highlighted). */
export function rank<T extends { text: string; keywords?: string; boost?: number }>(items: T[], query: string, limit = 50): { item: T; hits: number[] }[] {
  if (!query.trim()) return items.slice(0, limit).map(item => ({ item, hits: [] }))
  const out: { item: T; hits: number[]; score: number }[] = []
  for (const item of items) {
    const m = fuzzy(query, item.text), k = item.keywords ? fuzzy(query, item.keywords) : null
    const best = m && (!k || m.score >= k.score - 50) ? m : k ? { score: k.score - 50, hits: [] } : null
    if (best) out.push({ item, hits: best.hits, score: best.score + (item.boost ?? 0) })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}
