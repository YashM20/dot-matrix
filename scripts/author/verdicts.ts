/**
 * The local like/kill history: one JSON object per line in `.dot480/verdicts.jsonl` (gitignored),
 * or the file named by `DOT480_VERDICTS`. Never leaves the machine.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IRCard } from './card'
import type { Verdict, VerdictRecord } from './bt'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const verdictsPath = () => process.env.DOT480_VERDICTS || join(ROOT, '.dot480', 'verdicts.jsonl')

export interface StoredVerdict extends VerdictRecord { ts: string; card?: IRCard }

export function readVerdicts(path = verdictsPath()): StoredVerdict[] {
  if (!existsSync(path)) return []
  const out: StoredVerdict[] = []
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const r = JSON.parse(line); if (typeof r.key === 'string' && (r.verdict === 'like' || r.verdict === 'kill')) out.push(r) } catch { /* skip a torn line */ }
  }
  return out
}

export function appendVerdict(v: { key: string; verdict: Verdict; note?: string; card?: IRCard }, path = verdictsPath()): StoredVerdict {
  const rec: StoredVerdict = { ts: new Date().toISOString(), key: v.key, verdict: v.verdict, ...(v.note && { note: v.note }), ...(v.card && { card: v.card }) }
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, JSON.stringify(rec) + '\n')
  return rec
}
