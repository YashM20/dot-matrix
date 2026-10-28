import { useMemo, useState } from 'react'
import type { ThemeTokens } from '../../engine/types'
import { progressCard, sliderCard, statusDotCard } from '../../widgets/boards/components'
import { Card } from '../ui/Card'
import { Cards, Controls, Toggle } from '../ui/kit'
import { registerPresets } from '../../widgets/registry'
import { themeTokens } from '../../site/theme/theme'
import { useTheme, useThemeTokens } from '../../site/theme/useTheme'
import type { AccentId } from '../../site/theme/names'

// registry cards: the sample worker can rebuild them by id, static ones share the sample cache
registerPresets([progressCard, statusDotCard, sliderCard])

/** Accents that are blue already: their off-system second hue is the signal red instead. */
const BLUEISH: readonly AccentId[] = ['cyan', 'cobalt', 'vite']

/**
 * Deliberately off-system: a second accent hue, so the reader can watch the board lose its plot.
 * This theme exists only in this figure (never a token, never on a board). On dark it is today's blue;
 * on paper the light cobalt; when the page's accent is blue itself, the signal red.
 */
function secondOf(base: ThemeTokens, scheme: 'dark' | 'light', accent: AccentId): ThemeTokens {
  const other = BLUEISH.includes(accent) ? themeTokens(scheme, 'signal') : scheme === 'light' ? themeTokens('light', 'cobalt') : undefined
  return { ...base, dotActive: other?.dotActive ?? '#2F7BFF', dotActiveDim: other?.dotActiveDim ?? '#1D4FA8' }
}

export default function FigAccent() {
  const [second, setSecond] = useState(false)
  const { resolved, accent } = useTheme(), theme = useThemeTokens()
  const off = useMemo(() => secondOf(theme, resolved, accent), [theme, resolved, accent])
  return (
    <>
      <Cards n={3}>
        <Card preset={progressCard} />
        <Card preset={statusDotCard} />
        <Card preset={sliderCard} theme={second ? off : undefined} />
      </Cards>
      <Controls>
        <Toggle label="Add a second accent" on={second} onChange={setSecond} />
      </Controls>
    </>
  )
}
