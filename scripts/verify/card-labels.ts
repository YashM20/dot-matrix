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

/** Symbols that are the content, said well as they are: a price, the keypad's star, a scene's formula. */
const CONTENT: Record<string, string> = { 'retail-analytics': '$', 'ui-keypad': '*', 'sc-twist': '=*', 'sc-posts': '=*' }

export function cardLabelChecks(assert: Assert) {
  const bad: string[] = [], seen = new Set<string>()
  for (const p of widgetPresets) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    const odd = [...new Set([...describe(p).label].filter(ch => !PLAIN.test(ch) && !CONTENT[p.id]?.includes(ch)))]
    if (odd.length) bad.push(`${p.id} [${odd.join('')}]`)
  }
  assert('card labels: every card name reads as words, no symbols (#413)', seen.size > 200 && !bad.length, `${seen.size} cards, symbols in: ${bad.join(', ')}`)
  // a symbol the dot font keeps is said as a word, and a status dot says nothing
  const said = describe({ id: 'x', name: 'X', grid: { cols: 1, rows: 1 } as never, layers: () => ['DOTS → 480', '▶ ON', '■', '● LIVE', '✓ SENT']
    .map(text => ({ field: Object.assign(() => 1, { text }), tone: 'value' as const })) }).label
  assert('card labels: describe() words the font symbols (→ to, ▶ play, ■ stop, ✓ done, ● dropped)', said === 'X: DOTS to 480, play ON, stop, LIVE, done SENT', said)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/card-labels.ts')) {
  const { assert, done } = checker('card labels')
  cardLabelChecks(assert)
  done('card labels: all checks passed')
}
