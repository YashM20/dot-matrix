/**
 * Credit checks for `pnpm verify`: credits live on each card's own page (`/widget/<id>/`), never under a board. Every
 * card on a board that rebuilds Henry Li's ESP-Mosaico sheets resolves to a credit (the concept credit by default, or
 * its own `credit` when it overrides `concept`), so moving the credit off the board view loses none.
 */
import { readFileSync } from 'node:fs'
import { boards, creditsOf } from '../../src/widgets'
import { conceptCredit, hasConcept } from '../../src/widgets/blurbs'
import type { Assert } from '../lib/check'

export function creditChecks(assert: Assert) {
  const credited = conceptCredit.boards as readonly string[]
  const missing = credited.filter(id => !boards.some(b => b.id === id))
  assert('credits: every concept-credited board exists', !missing.length, missing.join(', '))
  const bare = boards.filter(b => credited.includes(b.id)).flatMap(b => b.items.filter(p => !hasConcept(b.id, p) && !creditsOf(p).length).map(p => `${b.id}/${p.id}`))
  assert('credits: every card on a concept-credited board resolves to a credit on its own page', !bare.length, bare.join(', '))
  // a card off those boards carries the concept credit only when it says so itself
  const stray = boards.filter(b => !credited.includes(b.id)).flatMap(b => b.items.filter(p => hasConcept(b.id, p) && p.concept !== true).map(p => `${b.id}/${p.id}`))
  assert('credits: no card off the credited boards takes the concept credit by default', !stray.length, stray.join(', '))
  // owner decision: the board view shows no credit block (each card can credit something else)
  const board = readFileSync('src/components/Board.tsx', 'utf8')
  assert('credits: the board view renders no board-level credit', !/ConceptCredit|conceptCredit/.test(board))
}
