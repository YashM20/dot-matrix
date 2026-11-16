/**
 * METRO (#257) and DASHBOARD (#250) refine checks for `pnpm verify`: each pins one fix so it can't come back.
 * Layer-level where the fix is about sites; sampled dots only where it is about where text lands.
 */
import { describe } from '../../src/engine/describe'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import type { DotInstance } from '../../src/engine/types'
import { TAU } from '../../src/widgets/types'
import { oxygen, newswire } from '../../src/widgets/boards/metro'
import { bioSensor, entertainment, medicalMonitor, pharmaTrack, retailAnalytics } from '../../src/widgets/boards/deerflow12'
import type { WidgetPreset } from '../../src/widgets/types'
import { pitchOf, theme, visible } from '../lib/stats'
import type { Assert } from '../lib/check'

const at = (p: WidgetPreset, t: number) => p.layers({ t, data: { ...p.defaults } })
const dotsAt = (p: WidgetPreset, t: number): DotInstance[] => sampleLayers(at(p, t), p.grid, p.style, theme).filter(visible)
const textOf = (p: WidgetPreset, t = 0) => describe(p, { t }).text

export function metroDashboardChecks(assert: Assert) {
  // oxygen: the ring reads 98%, 42 of 43 slots lit with the red one last, so one slot stays empty before 12 o'clock
  {
    const [ring, red] = at(oxygen, 0), [x, y] = red.sites![0], a = (Math.atan2(x - 76.1, 76.2 - y) + TAU) % TAU
    assert('metro: oxygen ring lights 41 grey slots and a red 42nd', ring.sites!.length === 41 && Math.abs(a - (41 / 43) * TAU) < 1e-6, `${ring.sites!.length} grey, red at ${(a / TAU * 43).toFixed(2)} slots`)
  }
  // newswire: the live card runs its headlines, and no decode frame pushes a line past the card edge
  {
    const heads = new Set<string>(), over: string[] = []
    for (let t = 0; t < 18; t += 1 / 12) {
      at(newswire, t).forEach(l => { if (l.sites!.some(([x]) => x < 0 || x > newswire.grid.cols - 1)) over.push(`${l.field.text}@${t.toFixed(2)}`) })
      heads.add(textOf(newswire, t).join(' '))
    }
    assert('metro: newswire is animated and cycles three headlines', !!newswire.animated && ['THE MOON BLINKED', 'LAST TRAIN WAITS', 'COMET SKIPS SUNDAY'].every(h => heads.has(h)), [...heads].slice(0, 6).join(' | '))
    assert('metro: newswire headlines stay inside the card while they decode', !over.length, over.slice(0, 4).join(', '))
  }
  // medical-monitor: the sweep gap is off the card at t = 0 (the reduced-motion still is the whole trace) and on it later
  {
    const n = (t: number) => at(medicalMonitor, t).slice(0, 3).reduce((s, l) => s + l.sites!.length, 0)
    assert('dashboard: medical-monitor ECG sweeps, whole at t = 0', !!medicalMonitor.animated && n(0) > n(1.3), `${n(0)} sites at t = 0, ${n(1.3)} at t = 1.3`)
  }
  // retail-analytics: the LIVE tag means it: a new point every few seconds, the count ticks, the first frame is the reference
  {
    const ys = (t: number) => at(retailAnalytics, t)[3].sites!.map(([, y]) => y.toFixed(1)).join(',')
    const visitors = (t: number) => textOf(retailAnalytics, t)[0]
    assert('dashboard: retail-analytics line takes a new point every few seconds', ys(0) !== ys(3.1) && ys(3.1) === ys(5.9), '')
    assert('dashboard: retail-analytics visitors start at 1.28K and tick up', visitors(0) === '1.28K' && visitors(15.1) === '1.29K', `${visitors(0)} → ${visitors(15.1)}`)
  }
  // bio-sensor: LUX sits on the 420 line, so it no longer hangs below the moisture readout
  {
    const pitch = pitchOf(bioSensor), dots = dotsAt(bioSensor, 0).filter(d => d.y > 100 * pitch)
    const low = (f: (d: DotInstance) => boolean) => Math.max(...dots.filter(f).map(d => d.y))
    const left = low(d => d.x < 40 * pitch), right = low(d => d.x > 90 * pitch)
    assert('dashboard: bio-sensor LIGHT block is no deeper than MOISTURE', right <= left + pitch, `right bottom ${(right / pitch).toFixed(1)}, left ${(left / pitch).toFixed(1)}`)
  }
  // bio-sensor: the red arc follows the moisture readout (#250: it swept 14% beside a 64% readout), on its own ring
  {
    const ls = at(bioSensor, 0), ring = ls[2].sites!.length, red = ls[3].sites!.length, said = textOf(bioSensor).find(s => s.endsWith('%'))
    assert('dashboard: bio-sensor red arc matches the moisture readout', said === '64%' && Math.abs(red / ring - .64) < 1.5 / ring, `${said}, ${red} of ${ring} inner dots`)
    const outer = new Set(ls[1].sites!.map(p => p.join())), inner = new Set([...ls[2].sites!, ...ls[3].sites!].map(p => p.join()))
    assert('dashboard: bio-sensor light arc sits on the outer ring, clear of the moisture arc', [...outer].every(k => !inner.has(k)) && ls[0].sites!.length > ls[1].sites!.length, '')
  }
  // pharma-track names its steps; entertainment says what it is doing
  assert('dashboard: pharma-track labels PRE, I, II, III', ['PRE', 'I', 'II', 'III'].every(s => textOf(pharmaTrack).includes(s)), textOf(pharmaTrack).join(', '))
  assert('dashboard: entertainment has an accessible state', textOf(entertainment).includes('NOW PLAYING'), textOf(entertainment).join(', '))
}
