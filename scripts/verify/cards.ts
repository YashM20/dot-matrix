/**
 * Card dot checks for `pnpm verify` (CP6 wave 3, #226 to #245): cards whose dot-level defects were fixed keep every
 * visible dot clear of its neighbours, across all their layers (scripts/touching.ts checks one site layer at a time).
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { widgetById, withChrome } from '../../src/widgets'
import { touchingPairs } from '../touching'
import { theme } from '../lib/stats'
import type { Assert } from '../lib/check'

/** Cards with no touching dots anywhere, at three times (moving parts included). */
const CLEAR = ['line-map', 'service', 'departures', 'ir-ripple', 'chart-bar', 'chart-line', 'chart-area', 'chart-candle', 'hb-done', 'sim-sand', 'live-contribs']

export function cardChecks(assert: Assert) {
  for (const id of CLEAR) {
    const p = widgetById(id)
    if (!p) { assert(`cards: ${id} exists`, false); continue }
    const bad = [0, 1.3, 3.7].flatMap(t => touchingPairs(sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, theme)).map(() => t))
    assert(`cards: ${id} has no touching dots (t = 0, 1.3, 3.7)`, !bad.length, `${bad.length} pair(s) at t = ${[...new Set(bad)].join(', ')}`)
  }
  // sim-sand: the falling stream is grains (red only on the leading grain of each run), not a red bar
  {
    const p = widgetById('sim-sand')!, red = sampleLayers(withChrome(p)({ t: 1.3, data: {} }), p.grid, p.style, theme).filter(d => d.color === theme.dotActive && d.opacity > 0)
    assert('cards: sim-sand draws at most 3 red grains (one per falling column)', red.length > 0 && red.length <= 3, `${red.length} red dots`)
  }
}
