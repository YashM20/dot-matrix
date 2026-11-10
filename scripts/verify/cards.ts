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
import { STILL_LEAD } from '../../src/components/browse/data'

/** Cards with no touching dots anywhere, at three times (moving parts included). */
const CLEAR = ['line-map', 'service', 'departures', 'ir-ripple', 'chart-bar', 'chart-line', 'chart-area', 'chart-candle', 'hb-done', 'sim-sand', 'live-contribs',
  'lv-title', 'lv-queen', 'sq-teletext', 'phys-jelly', 'phys-splash', 'light-emissive', 'inst-crank', 'inst-xy', 'mo-wait', 'mo-send', 'scope-mic', 'scope-wave',
  'cinema-exit-14', 'cinema-sundown', 'cinema-keeper', 'heal-mirror', 'mat-knob', 'mirror-conduct']
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
  // sim-sand: the falling stream is grains (red only on the leading grain of each run), not a red bar
  {
    const p = widgetById('sim-sand')!, red = dotsAt(p, 1.3).filter(d => d.color === theme.dotActive && d.opacity > 0)
    assert('cards: sim-sand draws at most 3 red grains (one per falling column)', red.length > 0 && red.length <= 3, `${red.length} red dots`)
  }
  // ALL's first row on `/` (#315) holds still and draws light, so a phone's first screen settles fast (leading with
  // LEVEL 03, 20,000 dots, tripled the phone's Total Blocking Time)
  {
    const heavy = STILL_LEAD.flatMap(id => { const p = widgetById(id); if (!p) return [`${id} missing`]; const n = dotsAt(p, 0).length; return p.animated || n > 4000 ? [`${id}: ${p.animated ? 'animated' : ''} ${n} dots`] : [] })
    assert("cards: ALL's first row is still and light (no animated card, at most 4,000 dots each)", STILL_LEAD.length >= 4 && !heavy.length, heavy.join(', '))
  }
}
