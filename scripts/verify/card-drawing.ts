/**
 * Card drawing fixes (#359) for `pnpm verify`: each pins one fix so it can't come back.
 * The unit after a `fine` hero number, the dash-drive lap knob in clear air, the glyph transport as hex-packed
 * triangles, own-drawn REC dots at the chrome live dot's size, and the speed and power dials' end labels clear of
 * the needle (#263), and the henry camera thirds and flip icon (#247).
 */
import { LIVE_DOT, TILE, layoutFor, type LatticeField, type WidgetPreset } from '../../src/widgets/types'
import { progressCard } from '../../src/widgets/boards/motion-progress'
import { driveCard } from '../../src/widgets/boards/dash-trip'
import { PWR, SPD, dialEndAt } from '../../src/widgets/boards/dash-dials'
import { needleSites } from '../../src/widgets/dials'
import { textSize } from '../../src/engine/layout'
import { glyphLongpress } from '../../src/widgets/boards/glyph'
import { camera } from '../../src/widgets/boards/henry'
import type { Assert } from '../lib/check'

type Pt = [number, number]
const T = layoutFor(TILE)
const at = (p: WidgetPreset, t: number, data: Record<string, number> = {}) => p.layers({ t, data: { ...p.defaults, ...data } }) as LatticeField[]
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6

export function cardDrawingChecks(assert: Assert) {
  // a unit after a hero number sits a fixed gap past the face's measured width: fine digits are 8 + 2, twin 10 + 2
  {
    const fine = { lattice: 2.5, smooth: true, face: 'fine' as const }, twin = { lattice: 2.5, smooth: true }
    const pct = T.heroUnit('64', '%', 6, 30, fine, { lattice: 1.6 })
    assert('cards: fine hero digits measure 8 dots plus a 2-dot gap', near(T.bigSize('64', fine)[0], 18 * 2.5) && near(T.bigSize('64', twin)[0], 22 * 2.5), `${T.bigSize('64', fine)[0]} fine, ${T.bigSize('64', twin)[0]} twin`)
    assert('cards: the % after a fine hero sits 3 cells past its last digit', near(pct.origin![0], 6 + 45 + 3) && near(pct.origin![1] + 7 * 1.6, 30 + 14 * 2.5), `% at ${pct.origin}`)
    const unit = at(progressCard, 6).find(l => l.lattice === 1.6)
    assert('cards: mo-progress reads 100 with the % right after it', !!unit && near(unit.origin![0], 6 + T.bigSize('100', fine)[0] + 3), `% at ${unit?.origin}`)
  }
  // dash-drive: no rail dot touches or hides under the lap knob, wherever the playhead is
  {
    const bad: string[] = []
    let seen = 0
    for (let t = 0; t < 30; t += .37) {
      const ls = at(driveCard, t, { drive: 1 }), knob = ls.find(l => l.tone === 'active' && l.size === 6)
      if (!knob) continue
      seen++
      const [kx, ky] = knob.sites![0], rail = ls.filter(l => l.size === 1.8).flatMap(l => l.sites ?? [])
      const d = Math.min(...rail.map(([x, y]) => Math.hypot(x - kx, y - ky)))
      if (d < 5 - 1e-6) bad.push(`${t.toFixed(2)}: ${d.toFixed(2)}`)
    }
    assert('cards: dash-drive rail clears the lap knob', seen > 0 && !bad.length, `${seen} frames with the knob; ${bad.slice(0, 4).join(', ')}`)
  }
  // dash-speed and dash-power: each end label sits clear of the needle parked at that end (it ran into -60 before)
  {
    const bad: string[] = []
    for (const [name, d, ends] of [['speed', SPD, ['0', '160']], ['power', PWR, ['-60', '150']]] as const) {
      ends.forEach((s, f) => {
        const [cx, top] = dialEndAt(d, f), [w, h] = textSize(s), x0 = cx - w / 2, x1 = cx + w / 2
        const gap = Math.min(...needleSites(d, f).map(([x, y]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(top - y, 0, y - (top + h)))))
        if (gap < 3) bad.push(`${name} ${s}: ${gap.toFixed(2)}`)
      })
    }
    assert('cards: dash speed and power end labels clear the needle by 3 cells', !bad.length, bad.join(', '))
  }
  // glyph long press: prev and next are hex-packed triangles (columns k·√3/2 apart), not square-grid sprites
  {
    let icons: Pt[][] = []
    for (let t = 0; t < 12 && icons.length !== 2; t += .25) icons = at(glyphLongpress, t, { hold: 1 }).filter(l => l.tone === 'idle' && l.sites?.length && l.sites.every(([, y]) => Math.abs(y - 113) < 8)).map(l => l.sites!)
    const hex = (pts: Pt[]) => {
      const xs = [...new Set(pts.map(([x]) => x.toFixed(3)))].map(Number).sort((a, b) => a - b), gaps = xs.slice(1).map((x, i) => x - xs[i])
      const min = Math.min(...pts.flatMap((p, i) => pts.slice(i + 1).map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))))
      return near(min, 3) && gaps.some(g => Math.abs(g - 1.5 * Math.sqrt(3)) < 1e-3)
    }
    assert('cards: glyph transport prev and next are dot triangles', icons.length === 2 && icons.every(hex), `${icons.length} icons`)
  }
  // a card's own REC dot matches the chrome live dot
  {
    const rec = (camera.layers({ t: 0, data: {} }) as LatticeField[]).find(l => l.tone === 'active')
    assert('cards: henry camera REC dot is the live dot size', rec?.size === LIVE_DOT, `${rec?.size}`)
  }
  // henry camera (#247): each rule-of-thirds crossing is one dot both dotted rules share, and no two flip-icon dots touch
  {
    const ls = camera.layers({ t: 0, data: {} }) as LatticeField[]
    const rules = (gen: 'hrule' | 'vrule') => ls.filter(l => l.tone === 'mid' && l.field.from?.gen === gen).map(l => l.field.from!.args as number[])
    const on = (at: number, from: number, len: number, step: number) => at >= from && at < from + len && (at - from) % step === 0
    const miss = rules('vrule').flatMap(([vx, vy, vh, vs]) => rules('hrule').filter(([hx, hy, hw, hs]) => !on(vx, hx, hw, hs) || !on(hy, vy, vh, vs)).map(([, hy]) => `${vx},${hy}`))
    assert('cards: henry camera thirds cross on a shared dot', rules('vrule').length === 2 && rules('hrule').length === 2 && !miss.length, miss.join(' '))
    const flip = ls.flatMap(l => l.size === .85 ? l.sites ?? [] : []).filter(([x, y]) => x < 40 && y > 110)
    const min = Math.min(...flip.flatMap((p, i) => flip.slice(i + 1).map(q => Math.hypot(p[0] - q[0], p[1] - q[1]))))
    assert('cards: henry camera flip icon dots sit a stroke pitch apart', flip.length > 40 && min > .99, `${flip.length} dots, closest ${min.toFixed(2)}`)
  }
}
