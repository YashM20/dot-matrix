/**
 * Dash trip cards: the nav strip, the road ahead and the drive loop itself. The nav and the road read the
 * same distance as everything else (the lap's, or speed × t once the visitor drives). The red is the one
 * live part of each: your place on the leg, your brake lights, the lap's playhead.
 */
import type { Layer } from '../../engine/types'
import { layer } from '../types'
import { DASH_PERIOD, LAP, dashOf, distText, indicators } from './dash-drive'
import { ARRIVE, BODY, LINE, PRESS, STRAIGHT, T, TURN_LEFT, at, card, mirror, mod, rr, spriteAt, states, ui, type Pt } from './dash-kit'

// ── NAV ─────────────────────────────────────────────────────────────────────
/** Next manoeuvre as a big sprite, the distance to it as the hero, the street in dot type, the leg as a rail. */
const RAIL = { x0: 6, x1: 138, y: 116, spacing: 4.4, size: 2.1, head: 8, gap: 6 }
const SPRITES = { left: TURN_LEFT, right: mirror(TURN_LEFT), straight: STRAIGHT, arrive: ARRIVE }
const clockText = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export const navCard = card('dash-nav', 'Nav', {
  springKeys: ['drive', 'speed', 'gear'],
  layers: ctx => {
    const d = dashOf(ctx), { arrow, street, toGo, len } = d.leg, [num, unit] = distText(Math.max(0, toGo))
    const w = (num.length * 12 - 2) * 1.8, f = Math.max(0, Math.min(1, 1 - toGo / len))
    const span = RAIL.x1 - RAIL.x0, n = Math.round(span / RAIL.spacing), step = span / n, head = Math.round(f * n)
    const done: Pt[] = [], todo: Pt[] = []
    for (let i = 0; i <= n; i++) if (Math.abs(i - head) * step >= RAIL.gap) (i < head ? done : todo).push([RAIL.x0 + i * step, RAIL.y])
    const action = arrow === 'arrive' ? (toGo < 1 ? 'ARRIVED AT' : 'ARRIVE AT') : arrow === 'straight' ? 'STAY ON' : `TURN ${arrow.toUpperCase()} ONTO`
    const eta = d.kmh > 1 ? `IN ${clockText(toGo / (d.kmh / 3.6))}` : '--:--'
    return [
      layer(spriteAt(SPRITES[arrow], 6, 20, 4.5), 'value'),
      layer(T.big(num, 60, 22, { lattice: 1.8, smooth: true, face: 'fine' }), 'value'),
      layer(T.big(unit, 60 + w + 3, 22 + 25.2 - 11.2, { lattice: 1.6 }), 'idle'),
      layer(T.text(action, 6, 74), 'idle'),
      layer(T.big(street, 6, 86, { lattice: 1.6 }), 'value'),
      layer(T.dots(done, RAIL.size), 'idle'), layer(T.dots(todo, RAIL.size), 'faint'),
      layer(T.dots([[RAIL.x0 + head * step, RAIL.y]], RAIL.head), 'active'),
      layer(T.text(arrow === 'arrive' ? 'DESTINATION' : 'NEXT TURN', 6, 128), 'mid'),
      layer(T.text(eta, 138, 128, { align: 'right' }), 'mid'),
    ]
  },
})

// ── ROAD ────────────────────────────────────────────────────────────────────
/**
 * The road from behind the car: lane lines in perspective, one site row every 3 screen rows, dashes moving
 * with the distance driven and the road bending through the turn. Your car sits at the bottom; its brake
 * lights are the red, and its indicators flash with the stalk. A stop line comes up as the lap brakes.
 */
const ROAD = { hy: 34, k: 545, f: 136.25, dash: 4, bend: .004 }
const LANES: { x: number; dashed: boolean }[] = [{ x: -5.25, dashed: false }, { x: -1.75, dashed: true }, { x: 1.75, dashed: true }, { x: 5.25, dashed: false }]
/** Three dot sizes by distance (quantized, never a continuous falloff). */
const sizeAt = (z: number) => (z < 12 ? 3 : z < 30 ? 2.2 : 1.4)
const screenX = (z: number, x: number, curve: number) => 72 + (ROAD.f * (x + curve * ROAD.bend * z * z)) / z
const CAR = { x: 48, y: 106, w: 48, h: 26, r: 8 }
export const roadCard = card('dash-road', 'Road', {
  fps: 24, springKeys: ['drive', 'speed', 'gear'],
  layers: ctx => {
    const d = dashOf(ctx), [left, right] = indicators(ctx, d)
    const lines = new Map<string, Pt[]>(), put = (key: string, p: Pt) => { const a = lines.get(key); if (a) a.push(p); else lines.set(key, [p]) }
    for (let y = ROAD.hy + 4; y <= 143; y += 2.5) {
      const z = ROAD.k / (y - ROAD.hy), size = sizeAt(z)
      for (const lane of LANES) {
        const x = screenX(z, lane.x, d.curve)
        if (x < 1 || x > 142 || (y > CAR.y - 2 && Math.abs(x - 72) < CAR.w / 2 + 6)) continue
        if (lane.dashed && mod(d.roll + z, DASH_PERIOD) >= ROAD.dash) continue
        put(`${lane.dashed ? 'value' : 'idle'}:${size}`, [x, y])
      }
    }
    const out: Layer[] = [layer(T.dotLine(4, ROAD.hy, 140, ROAD.hy, { spacing: 3.3, size: 1 }), 'faint')]
    for (const [key, pts] of lines) { const [tone, size] = key.split(':'); out.push(layer(T.dots(pts, +size), tone as 'value' | 'idle')) }
    // the stop line across your lane, once it is closer than the far rows
    if (d.stop >= 6 && d.stop < 90) {
      const y = ROAD.hy + ROAD.k / d.stop, x0 = screenX(d.stop, -1.75, d.curve), x1 = screenX(d.stop, 1.75, d.curve)
      if (y < CAR.y - 2) out.push(layer(T.dotLine(x0, y, x1, y, { spacing: 2.4, size: sizeAt(d.stop) + .4 }), 'value'))
    }
    const body = rr(CAR.x, CAR.y, CAR.w, CAR.h, CAR.r), ty = CAR.y + 15
    out.push(
      layer(T.dots(body(0, 2.6), 1.4), 'value'),
      layer(T.dotLine(CAR.x + 7, CAR.y + 5, CAR.x + CAR.w - 7, CAR.y + 5, { spacing: 2.6, size: 1.4 }), 'mid'),
      layer(T.dots([[CAR.x + 7, ty], [CAR.x + CAR.w - 7, ty]], 5), d.brake ? 'active' : 'idle'),
      ...(left ? [layer(T.dots([[CAR.x - 4, ty]], 3), 'value')] : []),
      ...(right ? [layer(T.dots([[CAR.x + CAR.w + 4, ty]], 3), 'value')] : []),
      layer(T.text(`${Math.round(d.kmh)} KM/H`, 138, 14, { align: 'right' }), 'mid'),
    )
    return out
  },
})

// ── DRIVE ───────────────────────────────────────────────────────────────────
/**
 * The loop that drives the board: the phase as the hero, the 30 s lap as a rail with its playhead, the trip
 * so far, and the AUTO switch. Touching any control on the board hands the car over (AUTO goes off); AUTO on
 * runs the lap again. The switch is the components board's toggle.
 */
const LAPR = { x0: 6, x1: 138, y: 62 }
const SW = { x: 6, y: 114, w: 52, h: 24 }
export const driveCard = card('dash-drive', 'Drive', {
  springKeys: ['drive', 'speed', 'gear'],
  controls: [{ key: 'drive', kind: 'toggle', box: [SW.x, SW.y - 2, 132, SW.h + 4], label: 'Auto drive' }],
  layers: ctx => {
    const d = dashOf(ctx), s = ui(ctx, 'drive'), on = d.auto >= .5, pv = s.pressed ? PRESS : 1
    const span = LAPR.x1 - LAPR.x0, xAt = (tau: number) => LAPR.x0 + (tau / LAP) * span
    const rail: Pt[][] = [[], []]
    for (let i = 0; i <= LAP; i++) rail[on && i <= d.lap ? 0 : 1].push([xAt(i), LAPR.y])
    const r = SW.h / 2, knob: Pt = [SW.x + r + d.auto * (SW.w - SW.h), SW.y + r], track = rr(SW.x, SW.y, SW.w, SW.h, r)
    const use = d.kmh > 1 && d.kw > 0 ? String(Math.round((Math.max(0, d.kw) / d.kmh) * 100)) : '--'
    return [
      layer(T.text(on ? 'DRIVE LOOP' : 'YOUR CAR', 6, 20), 'idle'),
      layer(T.big(d.phase, 6, 31, { lattice: 2 }), 'value'),
      layer(T.text(on ? 'TOUCH ANY CONTROL' : 'AUTO RUNS THE LOOP', 6, 50), 'mid'),
      layer(T.dots(rail[0], 1.8), 'idle'), layer(T.dots(rail[1], 1.8), 'faint'),
      ...(on ? [layer(T.dots([[xAt(d.lap), LAPR.y]], 6), 'active')] : []),
      layer(T.text(on ? `0:${String(Math.floor(d.lap)).padStart(2, '0')}` : 'LAP', 6, 74), 'mid'),
      layer(T.text(`0:${LAP}`, 138, 74, { align: 'right' }), 'mid'),
      layer(T.big((d.dist / 1000).toFixed(2), 6, 86, BODY), 'value'), layer(T.text('KM', 6, 100), 'idle'),
      layer(T.big(use, 76, 86, BODY), 'value'), layer(T.text('KWH/100 KM', 76, 100), 'idle'),
      layer(at(T.dots(track(0, LINE.spacing), LINE.size), pv), on ? 'value' : 'mid'),
      layer(at(T.dots([knob], 18), pv), on ? 'value' : 'mid'),
      layer(T.big('AUTO', 70, SW.y + r - 4.5, BODY), on ? 'value' : 'mid'),
      ...states(s, ctx.t, track, rr(SW.x - 2, SW.y - 2, 136, SW.h + 4, r + 2), 0),
    ]
  },
})
