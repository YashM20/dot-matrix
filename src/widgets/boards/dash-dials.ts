/**
 * Dash dials: speed, power and range. Each is the components board's knob in another job: a dotted track,
 * the value lit on the track's own sites, the reading as a hero on a 2× smooth lattice. The red is the one
 * live part of each: the speed and power needles, the head of the range arc.
 */
import { TAU, layer } from '../types'
import { GEARS, KW_MAX, KW_MIN, VMAX, dashOf, indicators, rangeKm } from './dash-drive'
import { PRESS, SIGNAL_ARROW, T, angleOf, card, circle, dialArc, dialLabels, dialMap, dialTicks, hero, mirror, needle, polar, spriteAt, spriteW, states, ui, type Dial } from './dash-kit'

// ── SPEED ───────────────────────────────────────────────────────────────────
/** 270° dial, 0–160 km/h. Dragging or tapping the scale sets the speed; the needle eases there (spring key). */
const SPD: Dial = { cx: 72, cy: 78, r: 52, start: (TAU * 5) / 8, sweep: (TAU * 3) / 4 }
const dialBox = (d: Dial): [number, number, number, number] => [d.cx - d.r - 6, d.cy - d.r - 6, 2 * d.r + 12, 2 * d.r + 12]
export const speedCard = card('dash-speed', 'Speed', {
  fps: 24, springKeys: ['drive', 'speed', 'gear'],
  controls: [{ key: 'speed', kind: 'knob', box: dialBox(SPD), step: 1 / 32, map: dialMap(SPD), label: 'Speed', valueText: v => `${Math.round(v * VMAX)} km/h` }],
  layers: ctx => {
    const d = dashOf(ctx), s = ui(ctx, 'speed'), f = d.kmh / VMAX, [left, right] = indicators(ctx, d), g = Math.round(d.gear)
    return [
      ...dialArc(SPD, 0, f, 'value', f),
      layer(dialTicks(SPD, Array.from({ length: 9 }, (_, i) => i / 8)), 'idle'),
      ...dialLabels(SPD, [[0, '0'], [.5, '80'], [1, '160']]),
      layer(needle(SPD, f, s.pressed ? PRESS : 1), 'active'),
      layer(hero(String(Math.round(d.kmh)), SPD.cx, 58), 'value'),
      layer(T.text('KM/H', SPD.cx, 92, { align: 'center' }), 'mid'),
      // the gear strip under the dial and the indicators in its corners, as on a real cluster
      ...GEARS.map((ch, i) => layer(T.text(ch, Math.round(SPD.cx + (i - 1.5) * 9), 118, { align: 'center' }), i === g ? 'value' : 'faint')),
      layer(spriteAt(SIGNAL_ARROW, 6, 126, 1.4), left ? 'value' : 'faint'),
      layer(spriteAt(mirror(SIGNAL_ARROW), 138 - spriteW(SIGNAL_ARROW) * 1.4, 126, 1.4), right ? 'value' : 'faint'),
      ...states(s, ctx.t, circle(SPD.cx, SPD.cy, SPD.r + 4), circle(SPD.cx, SPD.cy, SPD.r + 4), 4),
    ]
  },
})

// ── POWER ───────────────────────────────────────────────────────────────────
/** 240° dial from 60 kW of regen to 150 kW of drive; the lit stretch runs from 0 to the needle, either way. */
const PWR: Dial = { cx: 72, cy: 80, r: 52, start: (TAU * 2) / 3, sweep: (TAU * 2) / 3 }
const kwF = (kw: number) => (kw - KW_MIN) / (KW_MAX - KW_MIN)
export const powerCard = card('dash-power', 'Power', {
  fps: 24, springKeys: ['drive', 'speed', 'gear'],
  layers: ctx => {
    const d = dashOf(ctx), kw = Math.round(d.kw), f = kwF(d.kw), zero = kwF(0)
    const word = d.charging && d.kmh < 1 ? 'CHARGING' : kw < 0 ? 'REGEN' : kw > 0 ? 'POWER' : 'READY'
    return [
      ...dialArc(PWR, zero, f, 'value', f),
      layer(dialTicks(PWR, [-60, -30, 50, 100, 150].map(kwF)), 'idle'),
      layer(T.dots([polar(PWR.cx, PWR.cy, PWR.r - 6, angleOf(PWR, zero))], 3.6), 'value'),
      // the scale's ends, outside the ring so the needle never covers them
      ...dialLabels(PWR, [[0, '-60'], [1, '150']], -9),
      layer(needle(PWR, f), 'active'),
      layer(hero(String(kw), PWR.cx, 58), 'value'),
      layer(T.text('KW', PWR.cx, 92, { align: 'center' }), 'mid'),
      layer(T.big(word, PWR.cx, 112, { lattice: 1.3, align: 'center' }), kw < 0 ? 'value' : 'idle'),
    ]
  },
})

// ── RANGE ───────────────────────────────────────────────────────────────────
/**
 * A 216° horseshoe of thick dots filled to the battery's charge (drag it to set the charge), the estimate as
 * the hero. The estimate falls with speed. A tick inside the arc shows the charge the trip home needs.
 */
const RNG: Dial = { cx: 72, cy: 82, r: 54, start: TAU * .7, sweep: TAU * .6 }
const THICK = { spacing: 4.4, size: 2.1 }
const HOME_KM = 42
export const rangeCard = card('dash-range', 'Range', {
  springKeys: ['drive', 'speed', 'gear', 'soc'],
  controls: [{ key: 'soc', kind: 'knob', box: dialBox(RNG), step: 1 / 100, map: dialMap(RNG), label: 'Battery charge', valueText: v => `${Math.round(v * 100)}% charge` }],
  layers: ctx => {
    const d = dashOf(ctx), s = ui(ctx, 'soc'), km = Math.round(rangeKm(d.soc, d.kmh)), home = HOME_KM / rangeKm(1, d.kmh)
    const arc = (sweep: number, size: number) => T.dotRing(RNG.cx, RNG.cy, RNG.r, { ...THICK, start: RNG.start, sweep, size })
    const pv = s.pressed ? PRESS : 1
    return [
      layer(arc(RNG.sweep, THICK.size), 'faint'),
      ...(d.soc > .005 ? [layer(arc(d.soc * RNG.sweep, 2.6), 'value')] : []),
      layer({ field: () => pv, sites: [polar(RNG.cx, RNG.cy, RNG.r, angleOf(RNG, d.soc))], size: 7 }, 'active'),
      layer(T.dots([polar(RNG.cx, RNG.cy, RNG.r - 7, angleOf(RNG, home))], 2.4), 'idle'),
      layer(hero(String(km), RNG.cx, 54), 'value'),
      layer(T.text('KM', RNG.cx, 88, { align: 'center' }), 'mid'),
      layer(T.big(`${Math.round(d.soc * 100)}%`, RNG.cx, 100, { lattice: 1.3, align: 'center' }), 'idle'),
      // fuel-gauge ends under the arc, the trip home along the bottom
      ...([['E', 0], ['F', 1]] as const).map(([ch, f]) => { const [x, y] = polar(RNG.cx, RNG.cy, RNG.r, angleOf(RNG, f)); return layer(T.big(ch, x, y + 8, { lattice: 1.3, align: 'center' }), 'mid') }),
      layer(T.text(`HOME ${HOME_KM} KM`, RNG.cx, 128, { align: 'center' }), d.soc < home ? 'value' : 'mid'),
      ...states(s, ctx.t, circle(RNG.cx, RNG.cy, RNG.r + 1), circle(RNG.cx, RNG.cy, RNG.r + 1), 2),
    ]
  },
})
