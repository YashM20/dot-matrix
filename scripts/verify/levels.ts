/**
 * LEVELS (#233) refine checks for `pnpm verify`: one per fix, so it can't come back.
 * Run alone: `pnpm exec tsx scripts/verify/levels.ts`.
 */
import { boardBlurbs } from '../../src/widgets/blurbs'
import { levelsBoard, lvScores } from '../../src/widgets/boards/levels'
import type { WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'

const at = (p: WidgetPreset, t = 0) => p.layers({ t, data: { ...p.defaults } })
const said = (p: WidgetPreset, t = 0) => at(p, t).filter(l => l.field.text?.trim())

export function levelsChecks(assert: Assert) {
  // lv-scores: the table fades, but no row drops to `faint` (about 1.3:1 on the dark card, gone on paper)
  {
    const faint = said(lvScores).filter(l => l.tone === 'faint').map(l => l.field.text)
    assert('levels: lv-scores draws no text in faint', !faint.length, faint.join(', '))
  }
  // lv-scores: the leader's row leads the table: `value`, at the table rows' size, in their columns
  {
    const ls = said(lvScores), lead = ls.filter(l => l.field.text === '1ST' || l.field.text === 'ACE'), row = ls.find(l => l.field.text === '2ND')
    const ok = lead.length === 2 && !!row && lead.every(l => l.tone === 'value' && l.lattice === row.lattice)
    assert('levels: lv-scores 1ST ACE is value and as big as the other rows', ok, lead.map(l => `${l.field.text} ${l.tone} ${l.lattice}`).join(', '))
  }
  // the board skips LEVEL 03 (it is `level-03` on the AUDIO board): the blurb says where it went
  {
    const levels = levelsBoard.map(p => /^Level (\d+)$/.exec(p.name)?.[1]).filter(Boolean).map(Number)
    const gaps = levels.flatMap((n, i) => (i && n !== levels[i - 1] + 1 ? Array.from({ length: n - levels[i - 1] - 1 }, (_, k) => levels[i - 1] + 1 + k) : []))
    const blurb = boardBlurbs.levels
    const told = gaps.every(n => blurb.includes(`Level ${String(n).padStart(2, '0')}`)) && (!gaps.length || blurb.includes('AUDIO'))
    assert('levels: every level number the board skips is explained in its blurb', told, `skips ${gaps.join(', ') || 'none'}; blurb: ${blurb}`)
  }
}

if (/verify[\\/]levels\.ts$/.test(process.argv[1] ?? '')) {
  const { assert, done } = checker('levels')
  levelsChecks(assert)
  done('levels checks passed')
}
