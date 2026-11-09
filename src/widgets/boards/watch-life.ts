/**
 * Watch faces about the wearer's day: a modular face with four complications (battery, pulse, air, moon) whose
 * one red dot beats with the pulse, and a step ring filled toward the day's goal with its red head and the steps
 * of each hour underneath. The numbers come from small seeded day models (./watch-kit), so they move with the clock.
 */
import { moonPhase } from '../../engine/astro/moon'
import type { Layer, Tone } from '../../engine/types'
import { TAU, layer } from '../types'
import { CX, DAYS, MONTHS, STEP_GOAL, T, airOf, beat, face, hhmm, hourlySteps, pad2, polar, pulseOf, wallNow, type Pt } from './watch-kit'
import { moonSites } from './watch-sky'

// ── COMPLICATIONS ─────────────────────────────────────────────────────────────
const SLOT = { r: 14, ring: { spacing: 2.6, size: 1.2 } }
const SLOTS: Pt[] = [[47, 80], [97, 80], [47, 113], [97, 113]]
/** A round complication: dotted track, the stretch `f` of it lit, a value over a small caption. */
function dial([cx, cy]: Pt, f: number, value: string, caption: string, fill: Tone = 'idle', openTop = false): Layer[] {
  // `openTop` leaves the 12 o'clock site free for a marker (coincident sites merge, the brighter wins)
  const track = T.dotRing(cx, cy, SLOT.r, openTop ? { ...SLOT.ring, start: .01, sweep: TAU - .02 } : SLOT.ring)
  return [
    layer(track, 'faint'),
    ...(f > .005 ? [layer(T.dotRing(cx, cy, SLOT.r, { ...SLOT.ring, sweep: Math.min(1, f) * TAU - 1e-6, size: 1.5 }), fill)] : []),
    layer(T.text(value, cx, cy - 7, { align: 'center' }), 'value'),
    ...(caption ? [layer(T.text(caption, cx, cy + 2, { align: 'center' }), 'mid')] : []),
  ]
}
export const complicationsFace = face('watch-complications', 'Complications', 'squircle', {
  group: 'composite', animated: true, defaults: { battery: .78 },
  layers: ctx => {
    const now = wallNow(), bpm = pulseOf(now), air = airOf(now), [b, h, a, m] = SLOTS
    const moon = moonSites(m[0], m[1], 9.6, 2.4, moonPhase(now.utc).phase, false)
    const pulse = ctx.reducedMotion ? 1 : beat(ctx.t, bpm)
    return [
      layer(T.big(hhmm(now), CX, 24, { lattice: 1.5, smooth: true, face: 'fine', align: 'center' }), 'value'),
      layer(T.text(`${DAYS[now.dow]} ${pad2(now.day)} ${MONTHS[now.month]}`, CX, 49, { align: 'center' }), 'idle'),
      ...dial(b, ctx.data.battery ?? .78, String(Math.round((ctx.data.battery ?? .78) * 100)), 'BAT'),
      ...dial(h, 0, String(bpm), 'BPM', 'idle', true),
      layer({ field: () => pulse, sites: [polar(SLOT.r, 0, h[0], h[1])], size: 4.4 }, 'active'),
      ...dial(a, (air + 10) / 45, `${air}°`, 'AIR'),
      layer(T.dotRing(m[0], m[1], SLOT.r, SLOT.ring), 'faint'),
      layer(T.dots(moon.dark, 1.9), 'faint'),
      layer(T.dots(moon.lit, 1.9), 'value'),
    ]
  },
})

// ── STEPS ─────────────────────────────────────────────────────────────────────
const RING = { cx: 72, cy: 68, r: 44, spacing: 4.4, size: 2.1 }
const BARS = { base: 133, gap: 3.3, pitch: 2, dots: 7 }
export const stepsFace = face('watch-steps', 'Steps', 'squircle', {
  group: 'chart',
  layers: () => {
    const now = wallNow(), hours = hourlySteps(now), total = hours.reduce((s, x) => s + x, 0), f = Math.min(1, total / STEP_GOAL)
    // the ring leaves out the sites under the red head, so no grey or white dot shows half under it
    const head = polar(RING.r, f * TAU, RING.cx, RING.cy)
    const ring = (sweep: number, size: number) => T.knockout(T.dotRing(RING.cx, RING.cy, RING.r, { spacing: RING.spacing, size, sweep }), [head], 3.4)
    const most = Math.max(1, ...hours), x0 = CX - 11.5 * BARS.gap
    const col = (h: number): Pt[] => Array.from({ length: 1 + Math.round((hours[h] / most) * BARS.dots) }, (_, j): Pt => [x0 + h * BARS.gap, BARS.base - j * BARS.pitch])
    const span = (pick: (h: number) => boolean) => hours.map((_, h) => h).filter(pick).flatMap(col)
    return [
      layer(ring(TAU, RING.size), 'faint'),
      ...(f > .005 ? [layer(ring(f * TAU - 1e-6, 2.6), 'value')] : []),
      layer(T.dots([head], 6), 'active'),
      layer(T.text('STEPS', CX, 46, { align: 'center' }), 'idle'),
      layer(T.big(String(total), CX, 56, { lattice: total >= 10000 ? 1.3 : 1.5, smooth: true, face: 'fine', align: 'center' }), 'value'),
      layer(T.text(`OF ${STEP_GOAL}`, CX, 82, { align: 'center' }), 'mid'),
      layer(T.dots(span(h => h > now.hour), 1.4), 'faint'),
      layer(T.dots(span(h => h < now.hour), 1.6), 'idle'),
      layer(T.dots(span(h => h === now.hour), 1.6), 'value'),
    ]
  },
})
