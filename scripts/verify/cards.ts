/**
 * Card dot checks for `pnpm verify` (CP6 wave 3, #226 to #245): cards whose dot-level defects were fixed keep every
 * visible dot clear of its neighbours, across all their layers (scripts/touching.ts checks one site layer at a time).
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import type { DotInstance } from '../../src/engine/types'
import { widgetById, withChrome, type WidgetPreset } from '../../src/widgets'
import { touchingPairs } from '../touching'
import { theme, visible } from '../lib/stats'
import type { Assert } from '../lib/check'

/** Cards with no touching dots anywhere, at three times (moving parts included). */
const CLEAR = ['cinema-exit-14', 'cinema-sundown', 'cinema-keeper', 'heal-mirror', 'mat-knob']
const CINEMA = ['cinema-last-call', 'cinema-signal', 'cinema-sundown', 'cinema-upstairs', 'cinema-closer', 'cinema-witness', 'cinema-exit-14', 'cinema-keeper', 'cinema-encore']
const dotsAt = (p: WidgetPreset, t: number): DotInstance[] => sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, theme)

export function cardChecks(assert: Assert) {
  for (const id of CLEAR) {
    const p = widgetById(id)
    if (!p) { assert(`cards: ${id} exists`, false); continue }
    const bad = [0, 1.3, 3.7].flatMap(t => touchingPairs(dotsAt(p, t)).map(() => t))
    assert(`cards: ${id} has no touching dots (t = 0, 1.3, 3.7)`, !bad.length, `${bad.length} pair(s) at t = ${[...new Set(bad)].join(', ')}`)
  }
  // cinema: the red mark keeps the title's moat, no grey dot within one lattice dot (2.5 cells; the next ring is 5 away)
  {
    const near: string[] = []
    for (const id of CINEMA) {
      const p = widgetById(id)!, pitch = p.grid.pitch ?? theme.gridPx, dots = dotsAt(p, 0).filter(visible)
      const red = dots.filter(d => d.color === theme.dotActive), rest = dots.filter(d => d.color !== theme.dotActive)
      if (red.some(r => rest.some(d => Math.hypot(d.x - r.x, d.y - r.y) < 4 * pitch))) near.push(id)
    }
    assert('cards: every cinema poster keeps a moat round its red', !near.length, near.join(', '))
  }
}
