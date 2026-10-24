/** The high-score table in localStorage (no backend). Bad or missing data falls back to the default table. */
import { DEFAULT_TABLE, type ScoreRow } from './sim'

const KEY = 'dot480.hive.scores.v1'
export function loadScores(): ScoreRow[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown
    if (Array.isArray(raw) && raw.length === DEFAULT_TABLE.length && raw.every(r => r && typeof r.name === 'string' && /^[A-Z0-9]{3}$/.test(r.name) && Number.isFinite(r.score)))
      return (raw as ScoreRow[]).map(r => ({ name: r.name, score: Math.max(0, Math.min(99999, Math.round(r.score))) }))
  } catch { /* private mode, bad JSON */ }
  return DEFAULT_TABLE.map(r => ({ ...r }))
}
export function saveScores(table: ScoreRow[]): void {
  try { localStorage.setItem(KEY, JSON.stringify(table)) } catch { /* storage full / disabled */ }
}
