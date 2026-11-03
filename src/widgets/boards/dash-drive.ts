/**
 * The dash board's car: one state per frame that every card reads, so the whole board moves together.
 *
 * While `drive` is on (the default) the state comes from a 30 s lap on the shared clock: parked, shift to D,
 * pull away, cruise, signal and turn left, brake to a stop at the destination, park with the hazards on.
 * The first control edit anywhere on the board sets `drive` to 0 (`WidgetPreset.handover`), and from then on
 * the state comes from the board-shared keys the controls write. `drive` is a spring key, so the hand-over
 * glides instead of jumping; the DRIVE card's AUTO switch starts the lap again.
 *
 * Speed in the lap is a chain of smoothstep ramps, so speed, acceleration and distance are exact closed forms
 * of t (no integration, no state). Pure in (t, data): goldens and reduced motion sample fixed t.
 */
import { clamp, mix, smoothstep } from '../../engine/math'
import type { WidgetContext } from '../types'

/** Board-shared keys: one store, so a control on any card drives every card. */
export const DASH_SHARED = ['drive', 'speed', 'gear', 'signal', 'hazard', 'soc', 'plug']
/** Every card carries all of them, so a card opened on its own page still works. `speed` is a share of VMAX. */
export const DASH_DEFAULTS: Record<string, number> = { drive: 1, speed: .4, gear: 3, signal: 1, hazard: 0, soc: .72, plug: 0 }
export const VMAX = 160
export const KW_MIN = -60, KW_MAX = 150
/** km on a full battery at a steady 60 km/h. */
export const RANGE_FULL = 400
export const GEARS = ['P', 'R', 'N', 'D'] as const
export const GEAR_NAMES = ['PARK', 'REVERSE', 'NEUTRAL', 'DRIVE'] as const
/** Turn signal stalk positions (the `signal` segmented control's index). */
export const LEFT = 0, OFF = 1, RIGHT = 2
export const LAP = 30
/** Board t = 0 lands just after the left signal comes on, so stills and reduced motion show a busy board. */
export const LAP_START = 10.4
/** Indicator period (s): about 92 flashes a minute, lit at t = 0 and at the golden t = 1.3. */
export const BLINK = .65

export type Arrow = 'left' | 'right' | 'straight' | 'arrive'
/** The nav's current leg: what to do at its end, onto which street, metres left of `len`. */
export interface Leg { arrow: Arrow; street: string; toGo: number; len: number }
export interface Dash {
  /** 1 = the lap drives, 0 = the visitor (the `drive` spring, in between while it hands over). */
  auto: number
  kmh: number
  kw: number
  /** Gear position 0..3 (P R N D), fractional while the selector glides. */
  gear: number
  signal: number
  hazard: boolean
  soc: number
  /** Plugged in and charging. */
  charging: boolean
  brake: boolean
  /** Metres driven: the lap's distance, or speed × t for the visitor. */
  dist: number
  /** Where the lane dashes are (m): `dist`, stretched in the lap so the dashes line up again at the wrap. */
  roll: number
  /** Road curvature, -1 (left) … 1 (right). */
  curve: number
  /** Metres to a stop line ahead (Infinity: none). */
  stop: number
  leg: Leg
  phase: string
  /** Lap seconds, -1 while the visitor drives. */
  lap: number
}

const mod = (x: number, m: number) => ((x % m) + m) % m
// ── the lap ─────────────────────────────────────────────────────────────────
/** [lap s, km/h] knots; each pair is one smoothstep ramp (flat when equal). */
const KNOTS: [number, number][] = [[0, 0], [2, 0], [7, 62], [11, 62], [14.5, 28], [16.5, 28], [20, 52], [22, 52], [26, 0], [LAP, 0]]
interface Seg { t0: number; t1: number; v0: number; v1: number; d0: number }
const SEGS: Seg[] = []
for (let i = 1, d = 0; i < KNOTS.length; i++) {
  const [t0, v0] = KNOTS[i - 1], [t1, v1] = KNOTS[i]
  SEGS.push({ t0, t1, v0, v1, d0: d })
  d += ((v0 + v1) / 2) * (t1 - t0) / 3.6
}
/** Speed (km/h), acceleration (m/s²) and distance (m) at lap time `tau`. */
export function motion(tau: number): { kmh: number; accel: number; dist: number } {
  const s = SEGS.find(g => tau < g.t1) ?? SEGS[SEGS.length - 1]
  const d = s.t1 - s.t0, x = clamp((tau - s.t0) / d), dv = s.v1 - s.v0
  return {
    kmh: s.v0 + dv * x * x * (3 - 2 * x),
    accel: (dv * 6 * x * (1 - x)) / d / 3.6,
    // ∫ smoothstep = x³ - x⁴/2
    dist: s.d0 + (d * (s.v0 * x + dv * (x ** 3 - x ** 4 / 2))) / 3.6,
  }
}
/** Lap seconds of the left turn, and the metres to it and to the end of the lap. */
const T_TURN = 15.5
const D_TURN = motion(T_TURN).dist, D_LAP = motion(LAP).dist
/** Lane dash period (m) and the lap's stretch to a whole number of them. */
export const DASH_PERIOD = 12
const ROLL = (Math.round(D_LAP / DASH_PERIOD) * DASH_PERIOD) / D_LAP
/** The lap's phases, by start time (the DRIVE card's timeline ticks). */
export const PHASES: [number, string][] = [[0, 'PARKED'], [1.4, 'SHIFT'], [2, 'PULL AWAY'], [7, 'CRUISE'], [10, 'SIGNAL'], [16.6, 'CRUISE'], [22, 'BRAKE'], [26.4, 'PARK'], [27.2, 'HAZARDS']]
export const phaseAt = (tau: number) => [...PHASES].reverse().find(([t0]) => tau >= t0)![1]

/** Battery power (kW, negative = into the battery) for a 2.1 t car: inertia, drag and rolling resistance; regen caps at 60 kW. */
export function kwOf(kmh: number, accel: number): number {
  const v = kmh / 3.6
  return clamp((2100 * accel * v + .8 * v ** 3 + 185 * v) / 1000, KW_MIN, KW_MAX)
}
/** Estimated range: the charge, less at speed. */
export const rangeKm = (soc: number, kmh: number) => clamp(soc) * RANGE_FULL * (1.04 - .3 * (kmh / VMAX) ** 2)

function lapAt(t: number, soc: number): Dash {
  const tau = mod(t + LAP_START, LAP), m = motion(tau)
  const gear = 3 * (smoothstep(1.4, 2, tau) - smoothstep(26.4, 27, tau))
  const turning = tau >= 14 && tau < 17 ? Math.sin((Math.PI * (tau - 14)) / 3) : 0
  const leg: Leg = tau < T_TURN
    ? { arrow: 'left', street: 'KING ST', toGo: D_TURN - m.dist, len: D_TURN }
    : { arrow: 'arrive', street: 'MILL LANE', toGo: Math.max(0, D_LAP - m.dist), len: D_LAP - D_TURN }
  return {
    auto: 1, kmh: m.kmh, kw: kwOf(m.kmh, m.accel), gear,
    signal: tau >= 10 && tau < 16.6 ? LEFT : OFF, hazard: tau >= 27.2, soc, charging: false,
    // foot on the brake to shift out of P and back into it, and while slowing
    brake: m.accel < -.4 || (tau > 1 && tau < 2.3) || (tau > 25 && tau < 27.2),
    // the stop line at the destination, 8 m ahead once stopped; after the wrap the car pulls away over it
    dist: m.dist, roll: m.dist * ROLL, curve: -turning, stop: tau >= 19 ? D_LAP + 8 - m.dist : tau < 5 ? 8 - m.dist : Infinity,
    leg, phase: phaseAt(tau), lap: tau,
  }
}

// ── the visitor ─────────────────────────────────────────────────────────────
/** A loop of legs for the visitor's drive (metres). */
const ROUTE: { arrow: Arrow; street: string; len: number }[] = [
  { arrow: 'right', street: 'HARBOUR RD', len: 420 }, { arrow: 'left', street: 'KING ST', len: 260 }, { arrow: 'straight', street: 'RING RD', len: 640 },
]
const ROUTE_M = ROUTE.reduce((a, l) => a + l.len, 0)
function legAt(dist: number): Leg {
  let m = mod(dist, ROUTE_M)
  for (const l of ROUTE) { if (m < l.len) return { ...l, toGo: l.len - m }; m -= l.len }
  return { ...ROUTE[0], toGo: ROUTE[0].len }
}
/**
 * The visitor's car, from the controls. `gear` may be fractional (a spring key): each gear's speed is
 * blended, so shifting to P or R eases the needle down (P holds 0, R at most 20 km/h, N coasts, D drives).
 */
function youAt(data: Record<string, number>, t: number): Dash {
  const g = clamp(data.gear ?? 3, 0, 3), set = clamp(data.speed ?? .4) * VMAX
  const byGear = [0, Math.min(set, 20), set, set], i = Math.min(2, Math.floor(g))
  const kmh = mix(byGear[i], byGear[i + 1], g - i), charging = (data.plug ?? 0) >= .5
  const dist = (kmh / 3.6) * t
  return {
    auto: 0, kmh, kw: charging && kmh < 1 ? -11 : kwOf(kmh, 0), gear: g,
    signal: Math.round(clamp(data.signal ?? OFF, 0, 2)), hazard: (data.hazard ?? 0) >= .5, soc: clamp(data.soc ?? .72), charging,
    brake: kmh < .5 && g > 2.5, dist, roll: dist, curve: 0, stop: Infinity, leg: legAt(dist), phase: 'YOU DRIVE', lap: -1,
  }
}

/** This frame's car: the lap, the visitor's, or a blend of the two while `drive` springs between them. */
export function dashOf(ctx: WidgetContext): Dash {
  const a = clamp(ctx.data.drive ?? 1), soc = clamp(ctx.data.soc ?? .72)
  if (a >= 1) return lapAt(ctx.t, soc)
  const you = youAt(ctx.data, ctx.t)
  if (a <= 0) return you
  const lap = lapAt(ctx.t, soc), near = a >= .5 ? lap : you
  return { ...near, auto: a, kmh: mix(you.kmh, lap.kmh, a), kw: mix(you.kw, lap.kw, a), gear: mix(you.gear, lap.gear, a), curve: mix(you.curve, lap.curve, a) }
}

/** Indicator phase on the shared clock; steady under reduced motion. */
export const blinkOn = (ctx: WidgetContext) => !!ctx.reducedMotion || mod(ctx.t / BLINK, 1) < .55
/** Which indicators are lit this frame: [left, right]. */
export function indicators(ctx: WidgetContext, d: Dash): [boolean, boolean] {
  const on = blinkOn(ctx)
  return [on && (d.hazard || d.signal === LEFT), on && (d.hazard || d.signal === RIGHT)]
}
/** Distance as [number, unit]: 5 m steps under 100 m, 10 m steps under 1 km, then 0.1 km. */
export function distText(m: number): [string, string] {
  if (m >= 995) return [(m / 1000).toFixed(1), 'KM']
  return [String(m >= 100 ? Math.round(m / 10) * 10 : Math.round(m / 5) * 5), 'M']
}
