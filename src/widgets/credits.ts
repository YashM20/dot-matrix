/**
 * The credits list (#54): every preset's `credit` grouped by source, for docs/CREDITS.md (`scripts/site/credits.ts`)
 * and later the ABOUT page. `groupCredits` is pure; `loadCredits` walks the manifest's lazy loaders, so it fetches
 * every board chunk when called and nothing at import. Import this module by path, from lazy code only.
 */
import { creditsOf, type WidgetCredit, type WidgetPreset } from './types'
import { boardManifest, loadBoard } from './manifest'

/** One credited card: where it sits and what it credits. */
export interface CreditEntry { board: string; card: string; name: string; credit: WidgetCredit }
/** One source with every card built on it. `by` is the union of the cards' authors, the most credited first. */
export interface CreditGroup {
  source: string
  title: string
  by: string[]
  cards: { board: string; card: string; name: string; by: string[]; note?: string }[]
}

/** Code-point order, so the output never depends on the machine's locale. */
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const lower = (s: string) => s.toLowerCase()

/** The credited cards of `boards`: one entry per credit, per board a card sits on. */
export function creditEntries(boards: readonly { id: string; items: readonly WidgetPreset[] }[]): CreditEntry[] {
  return boards.flatMap(b => b.items.flatMap(p => creditsOf(p).map(credit => ({ board: b.id, card: p.id, name: p.name, credit }))))
}

/**
 * Entries grouped by `source`. Sources sort by title (case-insensitive) then URL, cards by board then card id.
 * A source credited under several titles takes its most used one (ties: the first in sort order).
 */
export function groupCredits(entries: readonly CreditEntry[]): CreditGroup[] {
  const bySource = new Map<string, CreditEntry[]>()
  for (const e of entries) bySource.set(e.credit.source, [...(bySource.get(e.credit.source) ?? []), e])
  const groups: CreditGroup[] = []
  for (const [source, list] of bySource) {
    const sorted = [...list].sort((a, b) => cmp(a.board, b.board) || cmp(a.card, b.card))
    groups.push({
      source,
      title: mostUsed(sorted.map(e => e.credit.title)),
      by: rankAuthors(sorted.map(e => e.credit.by)),
      cards: sorted.map(e => ({ board: e.board, card: e.card, name: e.name, by: [...e.credit.by], ...(e.credit.note ? { note: e.credit.note } : {}) })),
    })
  }
  return groups.sort((a, b) => cmp(lower(a.title), lower(b.title)) || cmp(a.title, b.title) || cmp(a.source, b.source))
}

function mostUsed(xs: string[]): string {
  const n = new Map<string, number>()
  for (const x of xs) n.set(x, (n.get(x) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0]
}

/** Authors by how many cards name them, then by where they first appear (so a card's own order holds on ties). */
function rankAuthors(lists: string[][]): string[] {
  const n = new Map<string, { count: number; first: number }>()
  let i = 0
  for (const by of lists) for (const a of by) { const s = n.get(a); if (s) s.count++; else n.set(a, { count: 1, first: i }); i++ }
  return [...n].sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first).map(([a]) => a)
}

/**
 * What is wrong with the entries' credits: a `source` that isn't an https URL, an empty `by` or author, an empty
 * title, or one card crediting the same source twice.
 */
export function creditProblems(entries: readonly CreditEntry[]): string[] {
  const out: string[] = [], seen = new Set<string>()
  for (const e of entries) {
    const at = `${e.board}/${e.card}`
    if (seen.has(`${at} ${e.credit.source}`)) out.push(`${at}: credits ${e.credit.source} twice`)
    seen.add(`${at} ${e.credit.source}`)
    let url: URL | undefined
    try { url = new URL(e.credit.source) } catch { /* reported below */ }
    if (url?.protocol !== 'https:') out.push(`${at}: source "${e.credit.source}" is not an https URL`)
    if (!e.credit.by.length || e.credit.by.some(a => !a.trim())) out.push(`${at}: by is empty or has an empty name`)
    if (!e.credit.title.trim()) out.push(`${at}: title is empty`)
  }
  return out
}

/** The grouped list for the site, loading every board chunk through the manifest (ABOUT › CREDITS). */
export async function loadCredits(): Promise<CreditGroup[]> {
  const boards = await Promise.all(boardManifest.map(b => loadBoard(b.id)))
  return groupCredits(creditEntries(boards))
}
