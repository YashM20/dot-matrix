/**
 * Dash controls: the battery, the gear selector and the turn signals. Built from the components board's
 * pieces (stadium outlines of fine sites, a ring of sites as the knob, segmented and toggle controls with
 * the same hover / press / focus grammar). The red is the live part of each: the charge front, the gear
 * you are in, the hazard triangle.
 */
import type { Layer, Tone } from '../../engine/types'
import { layer } from '../types'
import { GEARS, GEAR_NAMES, LEFT, OFF, RIGHT, dashOf, indicators, rangeKm } from './dash-drive'
import { BODY, LINE, PRESS, SIGNAL_ARROW, T, at, card, dimmed, hero, mirror, mod, rr, spriteAt, spriteW, states, ui, type Pt } from './dash-kit'

// ── BATTERY ─────────────────────────────────────────────────────────────────
/**
 * A pack of 12 cell columns (three big dots each) lit to the charge. Plugged in, a front sweeps from the
 * charge to the top, again and again; braking sends a short regen front up from the charge. Drag across the
 * pack to set the charge; PLUG plugs in.
 */
const PACK = { x: 8, y: 26, w: 118, h: 52, r: 8, n: 12, x0: 18, dx: 9.4, ys: [41, 52, 63], size: 6 }
const PLUG = { x: 90, y: 98, w: 46, h: 22 }
const cellCol = (i: number): Pt[] => PACK.ys.map((y): Pt => [PACK.x0 + i * PACK.dx, y])
const BOLT = ['...###', '..###.', '.###..', '######', '..###.', '.###..', '.##...', '##....', '#.....']
export const batteryCard = card('dash-battery', 'Battery', {
  springKeys: ['drive', 'speed', 'gear'],
  controls: [
    { key: 'soc', kind: 'slider', box: [PACK.x, PACK.y, PACK.w, PACK.h], step: 1 / PACK.n, label: 'Battery charge' },
    { key: 'plug', kind: 'toggle', box: [PLUG.x, PLUG.y, PLUG.w, PLUG.h], label: 'Plug in' },
  ],
  layers: ctx => {
    const d = dashOf(ctx), cs = ui(ctx, 'soc'), ps = ui(ctx, 'plug'), pct = Math.round(d.soc * 100)
    const lit = Math.round(d.soc * PACK.n), regen = !d.charging && d.kw < -1
    // the moving front: plugged in, a sweep over every empty column; regen, a quick one over the next three
    const span = d.charging ? PACK.n - lit + 1 : regen ? Math.min(3, PACK.n - lit) : 0
    const front = span > 0 ? lit + Math.floor(mod(ctx.t / (d.charging ? 2 : .6), 1) * span) : -1
    const tone = (i: number): Tone => (i < lit ? 'value' : i === front ? 'active' : i < front ? 'idle' : 'faint')
    const cv = cs.pressed ? PRESS : 1, pv = ps.pressed ? PRESS : 1
    const pack = rr(PACK.x, PACK.y, PACK.w, PACK.h, PACK.r), plug = rr(PLUG.x, PLUG.y, PLUG.w, PLUG.h, PLUG.h / 2)
    const hw = (String(pct).length * 12 - 2) * 2
    const [word, detail] = d.charging
      ? ['CHARGING 11 KW', lit >= PACK.n ? 'FULL' : `FULL IN ${fullIn(d.soc)}`]
      : regen ? [`REGEN ${Math.round(-d.kw)} KW`, 'BRAKING INTO THE PACK'] : ['READY', `${Math.round(rangeKm(d.soc, d.kmh))} KM LEFT`]
    return [
      layer(at(T.dots(pack(0, LINE.spacing), LINE.size), cv), 'mid'),
      layer(T.dots([0, 3].flatMap(dx => [46, 52, 58].map((y): Pt => [130 + dx, y])), LINE.size), 'mid'),
      ...Array.from({ length: PACK.n }, (_, i) => layer(at(T.dots(cellCol(i), PACK.size), cv), tone(i))),
      layer(hero(String(pct), 8 + hw / 2, 90), 'value'),
      layer(T.big('%', 8 + hw + 3, 106.8, { lattice: 1.6 }), 'idle'),
      ...(d.charging ? [layer(spriteAt(BOLT, 8 + hw + 4, 91, 1.6), 'value')] : []),
      layer(T.text(word, 8, 125), 'idle'),
      layer(T.text(detail, 8, 135), 'mid'),
      layer(at(T.dots(plug(0, LINE.spacing), LINE.size), pv), d.charging ? 'value' : 'mid'),
      layer(dimmed(T.big('PLUG', PLUG.x + PLUG.w / 2, PLUG.y + PLUG.h / 2 - 4.5, { ...BODY, align: 'center' }), pv), d.charging ? 'value' : 'mid'),
      ...states(cs, ctx.t, pack, pack, 3), ...states(ps, ctx.t, plug, plug, 3),
    ]
  },
})
/** Time to full on an 11 kW charger with a 75 kWh pack, as H:MM. */
function fullIn(soc: number): string {
  const min = Math.round(((1 - soc) * 75 / 11) * 60)
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`
}

// ── GEAR ────────────────────────────────────────────────────────────────────
/**
 * P R N D in a dotted slot, a ring of sites as the selector. `gear` is a spring key here, so the ring glides
 * from one gear to the next; the gear you are in is the red letter, repeated large on the right.
 */
const SEL = { x: 36, y0: 32, dy: 28, ring: 13, slot: [18, 16, 36, 116] as const }
const GEAR_NOTES = ['WHEELS LOCKED', 'UP TO 20 KM/H', 'COASTING', 'READY'] as const
export const gearCard = card('dash-gear', 'Gear', {
  springKeys: ['drive', 'speed', 'gear'],
  controls: [{ key: 'gear', kind: 'segmented', options: 4, optionLabels: ['Park', 'Reverse', 'Neutral', 'Drive'], orientation: 'vertical', box: [16, SEL.y0 - SEL.dy / 2, 40, SEL.dy * 4], label: 'Gear' }],
  layers: ctx => {
    const d = dashOf(ctx), s = ui(ctx, 'gear'), g = Math.max(0, Math.min(3, d.gear)), sel = Math.round(g)
    const [x, y, w, h] = SEL.slot, slot = rr(x, y, w, h, w / 2)
    const moving = d.kmh >= .5
    return [
      layer(T.dots(slot(0, LINE.spacing), LINE.size), 'faint'),
      ...GEARS.map((ch, i) => layer(T.big(ch, SEL.x, SEL.y0 + i * SEL.dy - 7, { lattice: 2, align: 'center' }), i === sel ? 'active' : 'mid')),
      layer(at(T.dotRing(SEL.x, SEL.y0 + g * SEL.dy, SEL.ring, { spacing: 2.6, size: 1.3 }), s.pressed ? PRESS : 1), 'value'),
      layer(hero(GEARS[sel], 98, 28, 2.5), 'value'),
      layer(T.big(GEAR_NAMES[sel], 98, 76, { ...BODY, align: 'center' }), 'idle'),
      layer(T.text(`${Math.round(d.kmh)} KM/H`, 98, 96, { align: 'center' }), 'mid'),
      layer(T.text(sel === 3 && !moving ? 'HOLD' : GEAR_NOTES[sel], 98, 118, { align: 'center' }), 'mid'),
      ...states(s, ctx.t, slot, slot, 4),
    ]
  },
})

// ── SIGNALS ─────────────────────────────────────────────────────────────────
/**
 * The stalk (left, off, right: tap an arrow, or the middle to cancel) and the hazard button. Both arrows and
 * the triangle flash on the shared clock, so they stay in step with the speed card and the road.
 */
const ARROW = { k: 3.5, y: 24 }
const ARROW_W = spriteW(SIGNAL_ARROW) * ARROW.k
const HAZ = { x: 40, y: 74, w: 64, h: 40, r: 12 }
/** A closed polyline as sites about `spacing` apart. */
function loop(pts: Pt[], spacing: number): Pt[] {
  const out: Pt[] = []
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length], n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing))
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])
  })
  return out
}
const TRI_OUT = loop([[72, 81], [57, 106], [87, 106]], 2.5), TRI_IN = loop([[72, 90], [64.5, 102], [79.5, 102]], 2.5)
const SIGNAL_WORD = ['LEFT', 'OFF', 'RIGHT']
export const signalsCard = card('dash-signals', 'Signals', {
  springKeys: ['drive'],
  controls: [
    { key: 'signal', kind: 'segmented', options: 3, optionLabels: ['Left', 'Off', 'Right'], box: [2, 18, 140, 40], label: 'Turn signal' },
    { key: 'hazard', kind: 'toggle', box: [HAZ.x, HAZ.y, HAZ.w, HAZ.h], label: 'Hazard lights' },
  ],
  layers: ctx => {
    const d = dashOf(ctx), ss = ui(ctx, 'signal'), hs = ui(ctx, 'hazard'), [left, right] = indicators(ctx, d)
    const sv = ss.pressed ? PRESS : 1, hv = hs.pressed ? PRESS : 1, flash = left || right
    const stalk = rr(2, 18, 140, 40, 10), button = rr(HAZ.x, HAZ.y, HAZ.w, HAZ.h, HAZ.r)
    const arrow = (rows: string[], x: number, lit: boolean, set: boolean): Layer =>
      layer(dimmed(spriteAt(rows, x, ARROW.y, ARROW.k), sv), lit ? 'value' : set ? 'mid' : 'faint')
    const word = d.hazard ? 'BOTH' : SIGNAL_WORD[d.signal] ?? 'OFF'
    const tri = d.hazard ? (flash ? 'active' : 'mid') : 'mid'
    return [
      arrow(SIGNAL_ARROW, 4, left, d.signal === LEFT || d.hazard),
      arrow(mirror(SIGNAL_ARROW), 140 - ARROW_W, right, d.signal === RIGHT || d.hazard),
      layer(T.big(word, 72, ARROW.y + 7.5, { ...BODY, align: 'center' }), d.signal === OFF && !d.hazard ? 'mid' : 'value'),
      layer(T.dotLine(6, 66, 138, 66, { spacing: 3.3, size: 1 }), 'faint'),
      layer(at(T.dots(button(0, LINE.spacing), LINE.size), hv), d.hazard ? 'value' : 'mid'),
      layer(at(T.dots(TRI_OUT, 1.8), hv), tri), layer(at(T.dots(TRI_IN, 1.3), hv), tri),
      layer(T.text('HAZARD', 72, 124, { align: 'center' }), d.hazard ? 'value' : 'idle'),
      layer(T.text(d.hazard || d.signal !== OFF ? '92 / MIN' : 'STALK', 72, 135, { align: 'center' }), 'mid'),
      ...states(ss, ctx.t, stalk, stalk, 0), ...states(hs, ctx.t, button, button, 3),
    ]
  },
})
