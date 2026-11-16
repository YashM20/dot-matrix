/**
 * Card number checks for `pnpm verify` (#383): a card's number is its place among the numbered cards on its board
 * (`numberBoard`, src/widgets/numbered.ts), so removing a card leaves no gap. Every board runs 01..N in order, the
 * chrome row and CINEMA's poster draw that number, and no source file types a card number by hand.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boards, withChrome, type WidgetPreset } from '../../src/widgets'
import { pad2 } from '../../src/widgets/numbered'
import type { Assert } from '../lib/check'

/** A chrome label that starts with a two-digit number: `04  FLIP-DISC`, `02 MUSIC`. */
const NUMBERED_TEXT = /^\d{2}\s/
/**
 * Hand-typed numbers in source: a label literal that opens with one, a template that joins one with two spaces,
 * a poster number drawn from a seed, or a literal number drawn over the label row (MOSAIC's red `num()`).
 */
const HAND_TYPED = [
  { what: 'label literal', re: /\blabel:\s*(['"`])\d{2}\s/ },
  { what: 'label template', re: /\blabel:\s*`[^`\n]*\$\{[^}\n]*\}\s{2}/ },
  { what: 'drawn number from a seed or index', re: /String\(\w+\.(?:n|index)\)\.padStart\(2/ },
  { what: 'drawn number literal at the label row', re: /\bnum\(\s*['"`]\d{2}|\.text\(\s*['"`]\d{2}['"`]\s*,\s*0\s*,\s*0\b/ },
]

const texts = (p: WidgetPreset) => {
  try { return withChrome(p)({ t: 0, frame: 0, data: { ...p.defaults } }).map(l => l.field.text ?? '') } catch { return [] }
}
const sourceFiles = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
  .flatMap(e => e.isDirectory() ? sourceFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [])

export function numberChecks(assert: Assert) {
  const gaps: string[] = [], drawn: string[] = [], stray: string[] = [], shared: string[] = []
  const home = new Map<WidgetPreset, string>()
  for (const b of boards) {
    const nums = b.items.filter(p => p.numbered)
    const run = nums.map(p => p.number)
    if (run.some((n, i) => n !== i + 1)) gaps.push(`${b.id}: ${run.map(n => n === undefined ? '--' : pad2(n)).join(' ')}`)
    for (const p of nums) {
      if (home.has(p)) shared.push(`${p.id} on ${home.get(p)} and ${b.id}`)
      home.set(p, b.id)
      const want = pad2(p.number ?? 0), seen = texts(p)
      // the chrome row opens with the number; a card with no label row draws the number itself (CINEMA)
      const ok = p.label ? seen.some(s => s.startsWith(`${want} `)) : seen.includes(want)
      if (!ok) drawn.push(`${b.id}/${p.id} wants ${want}`)
    }
    for (const p of b.items) if (!p.numbered && p.chrome === 'dots' && NUMBERED_TEXT.test(p.label ?? p.name)) stray.push(`${b.id}/${p.id}: ${p.label ?? p.name}`)
  }
  assert('numbers: every board numbers its cards 01..N in board order, no gaps', !gaps.length, gaps.join('; '))
  assert('numbers: each numbered card draws its board number (chrome row, or its own text when it has no label)', !drawn.length, drawn.join('; '))
  assert('numbers: no unnumbered card shows a typed number in its chrome label', !stray.length, stray.join('; '))
  assert('numbers: a numbered card sits on one board', !shared.length, shared.join('; '))

  const typed: string[] = []
  for (const f of sourceFiles('src/widgets')) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const { what, re } of HAND_TYPED) if (re.test(line)) typed.push(`${f.replace(/\\/g, '/')}:${i + 1} (${what})`)
    })
  }
  assert('numbers: no card label or drawn card number is typed by hand in src/widgets', !typed.length, typed.join('; '))
}
