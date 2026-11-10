/**
 * BROWSE's data (#182): one row per widget from the generated catalog (`[slug, uid, board]`) and names
 * (`src/widgets/names.ts`: name and tags). No board chunk is needed to list, filter or search;
 * a card's chunk loads only when its slot comes near the screen. The filters live in the URL query
 * (`?in=<board>&tag=<tag>&q=<words>`, `BROWSE_PARAMS`), and the query is hostile input: a board must be a real
 * id (aliases resolve), a tag must be one the cards carry, the words are stripped of control characters and capped.
 * Pure and DOM-free.
 */
import { catalog } from '../../widgets/catalog'
import { cardNames } from '../../widgets/names'
import { boardGroups, boardIds, boardLabel, resolveBoardId } from '../../widgets/manifest'

export interface Row { slug: string; board: string; name: string; tags: readonly string[]; /** Lowercase search text: name, slug words, tags, board. */ hay: string }
/** `''` means any. */
export interface Filters { board: string; tag: string; q: string }

/** Longest search kept from the URL or the box. */
export const MAX_QUERY = 60
/** A tag shows in the TAG menu when at least this many cards carry it (rarer ones are still found by search). */
const TAG_MIN = 3

const fold = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '')

export const ROWS: readonly Row[] = catalog.map(([slug, , board]) => {
  const [name, tagText] = cardNames[slug] ?? [slug, ''], tags = tagText.split(/\s+/).filter(Boolean)
  return { slug, board, name, tags, hay: fold(`${name} ${slug.replace(/-/g, ' ')} ${tags.join(' ')} ${board} ${boardLabel(board)}`) }
})

/**
 * ALL's opening order (#315): the quality-bar cards first (LEVEL 03, AFTERLIGHT), then the START HERE boards in picker
 * order, then the components board, then every other card in catalog (board) order. Stable: ties keep catalog order.
 */
export const FEATURED: readonly string[] = ['level-03', 'afterlight']
const LEAD_BOARDS: readonly string[] = [...(boardGroups.find(g => g.id === 'start')?.boards ?? []), 'components']
const rank = (r: Row) => { const f = FEATURED.indexOf(r.slug), b = LEAD_BOARDS.indexOf(r.board); return f >= 0 ? f : b >= 0 ? FEATURED.length + b : FEATURED.length + LEAD_BOARDS.length }
export const ORDERED: readonly Row[] = ROWS.map((r, i) => [r, i] as const).sort(([a, i], [b, j]) => rank(a) - rank(b) || i - j).map(([r]) => r)

const tagCount = new Map<string, number>()
for (const r of ROWS) for (const t of r.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
/** The TAG menu: common tags, A to Z, with their counts. */
export const TAG_OPTIONS: readonly (readonly [tag: string, count: number])[] = [...tagCount].filter(([, n]) => n >= TAG_MIN).sort(([a], [b]) => a.localeCompare(b))
export const tagCountOf = (t: string) => tagCount.get(t) ?? 0

/** Search text as typed: control characters become spaces, runs of space collapse, capped at `MAX_QUERY`. */
export const cleanQuery = (s: string) => [...s].map(c => { const n = c.charCodeAt(0); return n < 32 || (n >= 127 && n < 160) ? ' ' : c }).join('').replace(/\s+/g, ' ').trimStart().slice(0, MAX_QUERY)

/** The filters a query string names; anything unknown or malformed is dropped. */
export function readFilters(search: string): Filters {
  let p: URLSearchParams
  try { p = new URLSearchParams(search) } catch { return { board: '', tag: '', q: '' } }
  const board = resolveBoardId((p.get('in') ?? '').trim().toLowerCase()), tag = (p.get('tag') ?? '').trim().toLowerCase()
  return { board: boardIds.includes(board) ? board : '', tag: tagCount.has(tag) ? tag : '', q: cleanQuery(p.get('q') ?? '').trim() }
}

/** `search` with the filters written in (empty ones removed) and every other param kept: `?…`, or '' when none is left. */
export function writeFilters(f: Filters, search: string): string {
  const p = new URLSearchParams(search)
  for (const [k, v] of [['in', f.board], ['tag', f.tag], ['q', f.q.trim()]] as const) if (v) p.set(k, v); else p.delete(k)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** True when the row passes every filter; every search word must appear somewhere in its search text. */
export function matches(r: Row, f: Filters): boolean {
  if (f.board && r.board !== f.board) return false
  if (f.tag && !r.tags.includes(f.tag)) return false
  return fold(f.q).split(' ').every(w => !w || r.hay.includes(w))
}
