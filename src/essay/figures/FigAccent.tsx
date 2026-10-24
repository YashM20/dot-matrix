import { useState } from 'react'
import type { ThemeTokens } from '../../engine/types'
import { dot480 } from '../../engine/theme/tokens'
import { progressCard, sliderCard, statusDotCard } from '../../widgets/boards/components'
import { Card } from '../ui/Card'
import { Cards, Controls, Toggle } from '../ui/kit'
import { registerPresets } from '../../widgets/registry'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([progressCard, statusDotCard, sliderCard])

/**
 * Deliberately off-system: a second accent hue, so the reader can watch the board lose its plot.
 * This theme exists only in this figure (never a token, never on a board).
 */
const SECOND: ThemeTokens = { ...dot480, dotActive: '#2F7BFF', dotActiveDim: '#1D4FA8' }

export default function FigAccent() {
  const [second, setSecond] = useState(false)
  return (
    <>
      <Cards n={3}>
        <Card preset={progressCard} />
        <Card preset={statusDotCard} />
        <Card preset={sliderCard} theme={second ? SECOND : dot480} />
      </Cards>
      <Controls>
        <Toggle label="Add a second accent" on={second} onChange={setSecond} />
      </Controls>
    </>
  )
}
