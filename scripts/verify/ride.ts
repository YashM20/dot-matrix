/**
 * RIDE (#258) refine checks for `pnpm verify`: one per fix, so it can't come back.
 * Run alone: `pnpm exec tsx scripts/verify/ride.ts`.
 */
import { describe } from '../../src/engine/describe'
import { heroCovers, heroRows } from '../../src/engine/fields/heroFaces'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import type { DotInstance, Layer } from '../../src/engine/types'
import { APP_K, APP_ORIGIN, apps, designReview, henryBear, memo, notifications, ride, rideBoard } from '../../src/widgets/boards/ride'
import { posterRows } from '../../src/widgets/boards/ride-type'
import type { WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'
import { pitchOf, theme, visible } from '../lib/stats'

const at = (p: WidgetPreset): Layer[] => p.layers({ t: 0, data: { ...p.defaults } })
const dotsOf = (p: WidgetPreset, ls: Layer[]): DotInstance[] => sampleLayers(ls, p.grid, p.style, theme).filter(visible)
const textOf = (l: Layer) => l.field.text?.trim() ?? ''

export function rideChecks(assert: Assert) {
  // ride: the speed is drawn on two lattices but reads as one number, and the watts as one reading
  {
    const d = describe(ride)
    const ok = d.text.includes('32.4') && d.text.includes('247 W') && !d.text.some(s => ['32', '.', '4', '.4', '247', 'W'].includes(s))
    assert('ride: the card reads "32.4" and "247 W", not the separate digit layers', ok, d.label)
  }
  // ride: the point and the 4 are one hero-face string on one lattice (#292), their last row on the 32's last row
  {
    const ls = at(ride), big = ls.find(l => textOf(l) === '32.4'), tenths = ls.find(l => l.lattice === 2 && l !== big && !textOf(l))
    const bottom = (l?: Layer) => (l ? Math.max(...dotsOf(ride, [l]).map(d => d.y)) / pitchOf(ride) : NaN)
    const gap = Math.abs(bottom(big) - bottom(tenths))
    assert('ride: the tenths sit on the 32\'s baseline (last dot rows within 0.1 cell)', gap < .1, `${gap.toFixed(2)} cells apart`)
  }
  // henry-bear is a still picture: no red live dot in its header
  assert('ride: henry-bear has no live dot (it never moves)', !henryBear.live && !henryBear.animated)
  // henry-bear: the bunny keeps air from the fur all round (on main its ears sat close under the chin)
  {
    const ls = at(henryBear), [fur, , bunny] = ls.slice(2, 5), pitch = pitchOf(henryBear)
    const fd = dotsOf(henryBear, [fur]), bd = dotsOf(henryBear, [bunny])
    const air = Math.min(...bd.flatMap(b => fd.map(f => Math.hypot(b.x - f.x, b.y - f.y) - b.r - f.r))) / pitch
    assert('ride: henry-bear\'s bunny keeps 2 cells of air from the fur', air >= 2, `${air.toFixed(2)} cells`)
  }
  // notifications: one red dot on the whole card (the newest message), never one per row
  {
    const red = dotsOf(notifications, at(notifications)).filter(d => d.color === theme.dotActive)
    assert('ride: notifications shows exactly one red dot', red.length === 1, `${red.length} red dots`)
  }
  // every word on the board is drawn on one lattice: rows and columns share a pitch (no `[1, 1.25]`-style glyph scale).
  // Hero numerals are the exception: hand-made face bitmaps (#292), kept as the owner approved them (notifications' 3)
  {
    const hero = (s: string) => heroCovers('twin', s)
    const bad = rideBoard.flatMap(p => at(p).filter(l => textOf(l) && !hero(textOf(l)) && (l.sites || !l.lattice)).map(l => `${p.id} "${textOf(l)}"`))
    assert('ride: all text sits on a uniform lattice (no stretched glyph sites)', !bad.length, bad.join(', '))
  }
  // notifications: the 3 stays main's twin hero numeral (every dot of the face's 3), NEW is the condensed capitals
  {
    const ls = at(notifications), three = ls.find(l => textOf(l) === '3'), word = ls.find(l => textOf(l) === 'NEW')
    const dots = heroRows('twin', '3').join('').split('#').length - 1
    const ok = !!three && three.sites?.length === dots && !!word && word.lattice === 2.5 && !word.sites
    assert('ride: notifications keeps the twin-face 3 and draws NEW in condensed capitals on one lattice', ok, `3: ${three?.sites?.length ?? 0} of ${dots} face dots; NEW lattice ${word?.lattice}`)
  }
  // design-review: THU 20 reads and draws a digit zero (the condensed face's open 0), never the letter O
  {
    const text = at(designReview).map(textOf).find(s => s.startsWith('THU'))
    const zero = heroRows('condensed', '0'), drawn = posterRows('THU 20').map(r => r.slice(-zero[0].length))
    assert('ride: design-review reads THU 20 and its 0 is the condensed digit', text === 'THU 20' && drawn.every((r, y) => r === zero[y]), text)
  }
  assert('ride: memo reads SHIP and THE IDEA', ['SHIP', 'THE IDEA'].every(s => at(memo).some(l => textOf(l) === s)))
  // apps: the nine icons share one lattice, each a whole number of dots from the same origin
  {
    const icons = at(apps).filter(l => l.lattice && !textOf(l))
    const off = icons.filter(l => l.lattice !== APP_K || !l.origin || l.origin.some((o, i) => Math.abs(((o - APP_ORIGIN[i]) / APP_K) - Math.round((o - APP_ORIGIN[i]) / APP_K)) > 1e-6))
    assert('ride: apps draws its nine icons on one lattice', icons.length === 9 && !off.length, `${icons.length} icons, ${off.length} off the lattice`)
  }
}

if (/verify[\\/]ride\.ts$/.test(process.argv[1] ?? '')) {
  const { assert, done } = checker('ride')
  rideChecks(assert)
  done('ride checks passed')
}
