/**
 * Card dot checks for `pnpm verify` (CP6 wave 3, #226 to #245): cards whose dot-level defects were fixed keep every
 * visible dot clear of its neighbours, across all their layers (scripts/touching.ts checks one site layer at a time).
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import type { CellBounds, DotInstance, Layer } from '../../src/engine/types'
import { widgetById, withChrome, type WidgetPreset } from '../../src/widgets'
import { touchingPairs } from '../touching'
import { theme, visible } from '../lib/stats'
import type { Assert } from '../lib/check'
import { STILL_LEAD } from '../../src/components/browse/data'

/** Cards with no touching dots anywhere, at three times (moving parts included). */
const CLEAR = ['line-map', 'service', 'departures', 'ir-ripple', 'chart-bar', 'chart-line', 'chart-area', 'chart-candle', 'hb-done', 'sim-sand', 'live-contribs',
  'lv-title', 'lv-queen', 'sq-teletext', 'phys-jelly', 'phys-splash', 'light-emissive', 'inst-crank', 'inst-xy', 'inst-level', 'inst-transport', 'mo-wait', 'mo-send', 'scope-mic', 'scope-wave',
  'cinema-exit-14', 'cinema-sundown', 'cinema-keeper', 'heal-mirror', 'mat-knob', 'mirror-conduct']
const CINEMA = ['cinema-signal', 'cinema-sundown', 'cinema-upstairs', 'cinema-witness', 'cinema-exit-14', 'cinema-keeper', 'cinema-encore']
const dotsAt = (p: WidgetPreset, t: number): DotInstance[] => sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, theme)

export function cardChecks(assert: Assert) {
  for (const id of CLEAR) {
    const p = widgetById(id)
    if (!p) { assert(`cards: ${id} exists`, false); continue }
    const bad = [0, 1.3, 3.7].flatMap(t => touchingPairs(dotsAt(p, t)).map(() => t))
    assert(`cards: ${id} has no touching dots (t = 0, 1.3, 3.7)`, !bad.length, `${bad.length} pair(s) at t = ${[...new Set(bad)].join(', ')}`)
  }
  // #237: the transport opens in Play, so its red record light means the visitor pressed record
  assert('cards: inst-transport opens in Play (mode 1)', widgetById('inst-transport')?.defaults?.mode === 1)
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
  // MICRO UI settings (#247): the Bluetooth and Sound switches are toggles; the resting frame is the reference's (off, on)
  {
    const p = widgetById('settings')!, frame = (data: Record<string, number>) => JSON.stringify(sampleLayers(withChrome(p)({ t: 0, data }), p.grid, p.style, theme))
    const keys = (p.controls ?? []).filter(c => c.kind === 'toggle').map(c => c.key), rest = { ...p.defaults }
    assert('cards: settings has toggles for Bluetooth and Sound, off and on at rest, and flipping one moves its knob',
      keys.join() === 'bluetooth,sound' && rest.bluetooth === 0 && rest.sound === 1 && frame({ ...rest, bluetooth: 1 }) !== frame(rest) && frame({ ...rest, sound: 0 }) !== frame(rest), keys.join())
  }
  textOverlapChecks(assert)
}

/** Every text layer's box in card cells: plain text from its bounds, lattice text scaled from its origin, dot-site text from its sites. */
export function textBoxes(layers: Layer[]): { text: string; box: CellBounds }[] {
  return layers.flatMap(l => {
    const text = l.field.text?.trim(), b = l.field.bounds
    if (!text) return []
    if (l.sites?.length) {
      const r = (l.size ?? 1) / 2, xs = l.sites.map(p => p[0]), ys = l.sites.map(p => p[1])
      return [{ text, box: [Math.min(...xs) - r, Math.min(...ys) - r, Math.max(...xs) + r, Math.max(...ys) + r] as CellBounds }]
    }
    if (!b) return []
    if (!l.lattice) return [{ text, box: b }]
    const [kx, ky] = Array.isArray(l.lattice) ? l.lattice : [l.lattice, l.lattice], [ox, oy] = l.origin ?? [0, 0]
    return [{ text, box: [ox + b[0] * kx, oy + b[1] * ky, ox + (b[2] + 1) * kx - 1, oy + (b[3] + 1) * ky - 1] as CellBounds }]
  })
}
const overlaps = (a: CellBounds, b: CellBounds) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]
/** Cards whose text never overlaps other text or leaves the card, at each listed time (the departures numerals mid-flip at 8.05). */
const NO_TEXT_OVERLAP = ['departures', 'station-clock', 'platform', 'next-train', 'line-map', 'service'], OVERLAP_TIMES = [0, 1.3, 3.7, 7.1, 8.05, 9, 61]
export function textOverlapChecks(assert: Assert) {
  for (const id of NO_TEXT_OVERLAP) {
    const p = widgetById(id)
    if (!p) { assert(`cards: ${id} exists`, false); continue }
    const bad = new Set<string>()
    for (const t of OVERLAP_TIMES) {
      const boxes = textBoxes(withChrome(p)({ t, data: { ...p.defaults } }))
      boxes.forEach((a, i) => {
        if (a.box[0] < 0 || a.box[1] < 0 || a.box[2] > p.grid.cols - 1 || a.box[3] > p.grid.rows - 1) bad.add(`${a.text} leaves the card at t = ${t}`)
        boxes.slice(i + 1).forEach(b => { if (overlaps(a.box, b.box)) bad.add(`${a.text} / ${b.text} at t = ${t}`) })
      })
    }
    assert(`cards: ${id} text boxes never overlap or leave the card`, !bad.size, [...bad].slice(0, 4).join('; '))
  }
}
