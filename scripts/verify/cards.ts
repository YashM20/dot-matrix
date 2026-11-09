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
const CLEAR = ['lv-title', 'lv-queen', 'sq-teletext', 'phys-jelly', 'phys-splash', 'light-emissive', 'inst-crank', 'inst-xy', 'mo-wait', 'mo-send', 'scope-mic', 'scope-wave']

export function cardChecks(assert: Assert) {
  for (const id of CLEAR) {
    const p = widgetById(id)
    if (!p) { assert(`cards: ${id} exists`, false); continue }
    const bad = [0, 1.3, 3.7].flatMap(t => touchingPairs(sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, theme)).map(() => t))
    assert(`cards: ${id} has no touching dots (t = 0, 1.3, 3.7)`, !bad.length, `${bad.length} pair(s) at t = ${[...new Set(bad)].join(', ')}`)
  }
}
