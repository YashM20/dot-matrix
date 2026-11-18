/**
 * Card names read as words (#413): `describe()` builds each card's accessible name from the strings drawn on it, so a
 * symbol typed into card text gets read out ("black right-pointing triangle"). Every preset at its defaults must give a
 * label of letters, digits, spaces and plain punctuation only. Icons belong in dots (`transportGlyph`, `T.dotTri`,
 * `T.fillOn`); a symbol the dot font keeps is worded by `describe()` (→ "to", ▶ "play").
 * On its own: `pnpm exec tsx scripts/verify/card-labels.ts`.
 */
import { describe } from '../../src/engine/describe'
import { widgetPresets } from '../../src/widgets'
import { checker, type Assert } from '../lib/check'

/** Letters (any script), digits, spaces and the plain punctuation a reader says well. */
const PLAIN = /^[\p{L}\p{M}\p{N}\s.,:;'!?()%\-/+&#°·]*$/u

export function cardLabelChecks(assert: Assert) {
  const bad: string[] = [], seen = new Set<string>()
  for (const p of widgetPresets) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const label = describe(p).label
    if (!PLAIN.test(label)) bad.push(`${p.id} [${[...new Set([...label].filter(ch => !PLAIN.test(ch)))].join('')}]`)
  }
  assert('card labels: every card name reads as words, no symbols (#413)', seen.size > 200 && !bad.length, `${seen.size} cards, symbols in: ${bad.join(', ')}`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/card-labels.ts')) {
  const { assert, done } = checker('card labels')
  cardLabelChecks(assert)
  done('card labels: all checks passed')
}
