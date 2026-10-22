/**
 * Board 9 — Departures: the Phase 1 flagship. A live transit board where every change is a
 * mechanical one: split-flap rows that cascade when a train leaves, a Swiss station clock whose
 * red second hand sweeps in 58.5 s and waits at 12 for the minute to jump, a platform number that
 * flips, a countdown that drains dot by dot, a train gliding along its line.
 * Everything is a pure function of the board clock `t` (and the wall clock for the station clock),
 * so goldens stay deterministic. One accent (the live red) marks what is happening *now*.
 */
import { decodeText, ease, splitFlapCells, splitFlapText, underdampedSpring } from '../../engine/motion'
import { TAU, TILE, layer, layoutFor, tileStyle, type LatticeField, type WidgetPreset } from '../types'
import { dotText, flapText } from './henry'

const T = layoutFor(TILE)
type Pt = [number, number]
const live = { chrome: 'dots', grid: TILE, style: tileStyle, animated: true, live: true } as const
/** Cycle bookkeeping: which cycle `t` is in, and seconds into it. */
const cycle = (t: number, period: number) => { const k = Math.floor(t / period); return { k, tau: t - k * period } }
/** On for the first half of every `period` seconds — status blinks. */
const blink = (t: number, period = 1) => t % period < period / 2
/** Evenly spaced sites along a ray at clock angle `a` (clockwise from 12), radii r0 → r1. */
const ray = (cx: number, cy: number, a: number, r0: number, r1: number, spacing: number): Pt[] => {
  const n = Math.max(1, Math.round((r1 - r0) / spacing)), s = Math.sin(a), c = Math.cos(a)
  return Array.from({ length: n + 1 }, (_, i) => { const r = r0 + ((r1 - r0) * i) / n; return [cx + r * s, cy - r * c] as Pt })
}
/** The big 6×8 numerals (the home-clock face), mid-flip when `since` is inside the flip window. */
const flapDigits = (prev: string, next: string, since: number, x: number, y: number, o: { px: number; size: number; flip?: number }): LatticeField[] =>
  since < 0 ? [dotText(next, x, y, o)] : flapText(splitFlapCells(prev, next, since, { flip: o.flip ?? .22, stagger: .14 }), x, y, o)

// ── 01 DEPARTURES ───────────────────────────────────────────────────────────
const TRAINS: [string, string, string][] = [
  ['08:42', 'HARBOUR', '3'], ['08:47', 'AIRPORT', '1'], ['08:55', 'NORTHGATE', '4'], ['09:02', 'RIVERSIDE', '2'],
  ['09:10', 'OLD TOWN', '5'], ['09:16', 'CENTRAL', '3'], ['09:24', 'LAKESIDE', '1'], ['09:31', 'FAIRVIEW', '6'],
]
const ROWS = 4, ROW_PERIOD = 7, L = 1.3
const rowText = (k: number, i: number) => { const [time, dest, plat] = TRAINS[(k + i) % TRAINS.length]; return `${time} ${dest.padEnd(9)} ${plat}` }
export const departures: WidgetPreset = {
  id: 'departures', name: 'Departures', group: 'text', ...live,
  layers: ({ t }) => {
    // every 7 s the top train leaves: the rows flap to their new text, cascading down the board
    const { k, tau } = cycle(t, ROW_PERIOD), col = (c: number) => 6 + c * 6 * L
    const rows = Array.from({ length: ROWS }, (_, i) => {
      const next = rowText(k, i)
      return k === 0 ? next : splitFlapText(rowText(k - 1, i), next, tau - i * .3, { flip: .045, stagger: .03 }).text
    })
    return [
      layer(T.text('TIME', col(0), 21), 'idle'), layer(T.text('TO', col(6), 21), 'idle'), layer(T.text('P', col(16), 21), 'idle'),
      ...rows.map((s, i) => layer(T.big(s, 6, 33 + i * 17, { lattice: L }), i === 0 ? 'value' : 'mid')),
      layer(T.dotLine(6, 104, 138, 104, { spacing: 3.3, size: 1.2 }), 'faint'),
      layer(T.big('BOARDING', 6, 116, { lattice: L })),
      ...(blink(t, 1.2) ? [layer(T.dots([[134, 120.5]], 6), 'active')] : []),
    ]
  },
}

// ── 02 STATION CLOCK ────────────────────────────────────────────────────────
// The Swiss railway clock: the red seconds hand sweeps the dial in 58.5 s, rests at 12, and
// releases the minute hand, which jumps one minute with a small spring overshoot.
const C: Pt = [72, 79], R = 56
export const stationClock: WidgetPreset = {
  id: 'station-clock', name: 'Station', group: 'polar', ...live,
  layers: () => {
    const now = new Date(), s = now.getSeconds() + now.getMilliseconds() / 1000
    const m = now.getMinutes(), h = now.getHours() % 12
    const jump = underdampedSpring(-1, 0, 0, 2.2, .32, s).x // minutes behind the target, springing to 0
    const minute = ((m + jump) / 60) * TAU, hour = ((h + (m + jump) / 60) / 12) * TAU, second = (Math.min(s, 58.5) / 58.5) * TAU
    const [cx, cy] = C, ticks: Pt[] = [], hours: Pt[] = []
    for (let i = 0; i < 60; i++) (i % 5 ? ticks.push(...ray(cx, cy, (i / 60) * TAU, R, R, 1)) : hours.push(...ray(cx, cy, (i / 60) * TAU, R - 8, R, 2.6)))
    return [
      layer(T.dots(ticks, 1.6), 'mid'),
      layer(T.dots(hours, 3)),
      layer(T.dots(ray(cx, cy, hour, -7.2, 32.4, 3.6), 4)),
      layer(T.dots(ray(cx, cy, minute, -9.6, 48, 3.2), 3.3)),
      layer(T.dots(ray(cx, cy, second + Math.PI, 0, 13, 2.2), 1.7), 'active'), layer(T.dots(ray(cx, cy, second, 0, 34, 2.2), 1.7), 'active'),
      layer(T.dots(ray(cx, cy, second, 38, 38, 1), 8.5), 'active'),
      layer(T.dots([C], 4.2), 'active'),
    ]
  },
}

// ── 03 PLATFORM ─────────────────────────────────────────────────────────────
const PLATFORM_PERIOD = 8
export const platform: WidgetPreset = {
  id: 'platform', name: 'Platform', group: 'text', ...live,
  layers: ({ t }) => {
    // the 08:42 moves between platforms 4 and 7; the number drums round to its new value
    const { k, tau } = cycle(t, PLATFORM_PERIOD), plat = k % 2 ? '7' : '4', was = k % 2 ? '4' : '7'
    const changed = k % 2 === 1
    return [
      ...flapDigits(was, plat, k === 0 ? -1 : tau, 54.5, 25, { px: 7, size: 6.4 }).map((f, i) => layer(f, i ? 'mid' : 'value')),
      layer(T.big('08:42 HARBOUR', 72, 98, { lattice: 1.1, align: 'center' })),
      layer(T.big(changed ? `CHANGED FROM ${was}` : 'ON TIME', 72, 117, { lattice: 1.1, align: 'center' }), changed ? 'value' : 'idle'),
      ...(changed && blink(t, .8) ? [layer(T.dots([[72, 135]], 5), 'active')] : []),
    ]
  },
}

// ── 04 NEXT TRAIN ───────────────────────────────────────────────────────────
const COUNTDOWN = 240, BAR = 30
export const nextTrain: WidgetPreset = {
  id: 'next-train', name: 'Next Train', group: 'chart', ...live,
  layers: ({ t }) => {
    // four minutes to the next train, on loop: the minute digit flips on each boundary, the bar
    // below drains one dot per two seconds and the leading dot burns red
    const left = COUNTDOWN - (t % COUNTDOWN), mins = Math.ceil(left / 60), since = Math.ceil(left / 60) * 60 - left
    const prev = String(mins === 4 ? 1 : mins + 1), lit = Math.ceil(((left - 1e-9) % 60) / 2) || BAR
    const bar = Array.from({ length: BAR }, (_, i): Pt => [8 + i * 4.4, 124])
    return [
      ...flapDigits(prev, String(mins), t < 1 ? -1 : since, 18, 30, { px: 7, size: 6.4 }).map((f, i) => layer(f, i ? 'mid' : 'value')),
      layer(T.big('MIN', 70, 66, { lattice: 2.6 })),
      layer(T.text('TO HARBOUR', 70, 93), 'idle'),
      layer(T.dots(bar.slice(lit), 2.6), 'faint'),
      layer(T.dots(bar.slice(0, lit - 1), 2.6)),
      layer(T.dots(bar.slice(lit - 1, lit), 3.2), 'active'),
    ]
  },
}

// ── 05 LINE MAP ─────────────────────────────────────────────────────────────
const STOPS = ['HARBOUR', 'CENTRAL', 'OLD TOWN', 'RIVERSIDE', 'NORTHGATE', 'AIRPORT']
const ABBR = ['HBR', 'CTR', 'OLD', 'RVS', 'NGT', 'APT']
const HOP = 4.5, DWELL = 1.4, TRACK_Y = 82
const stopX = (i: number) => 12 + i * 24
export const lineMap: WidgetPreset = {
  id: 'line-map', name: 'Line 3', group: 'chart', ...live,
  layers: ({ t }) => {
    // the train dwells at each stop, then glides to the next (eased), looping the line
    const hops = STOPS.length - 1, { k, tau } = cycle(t, HOP), from = k % hops, to = from + 1
    const p = tau < DWELL ? 0 : ease.emphasized(Math.min(1, (tau - DWELL) / (HOP - DWELL)))
    const x = stopX(from) + (stopX(to) - stopX(from)) * p
    const name = decodeText(STOPS[from], STOPS[to], tau, { stagger: .05, lead: .15 })
    const track = T.dotLine(stopX(0), TRACK_Y, stopX(hops), TRACK_Y, { spacing: 3, size: 1.6 })
    const passed = (track.sites ?? []).filter(([sx]) => sx <= x), ahead = (track.sites ?? []).filter(([sx]) => sx > x)
    return [
      layer(T.text('NEXT', 8, 22), 'idle'),
      layer(T.big(name, 8, 34, { lattice: 1.5 })),
      layer(T.dots(ahead, 1.6), 'idle'), layer(T.dots(passed, 1.9)),
      ...STOPS.map((_, i) => layer(T.dotRing(stopX(i), TRACK_Y, 4.2, { spacing: 2.6, size: 1.9 }), stopX(i) <= x + .5 ? 'value' : 'mid')),
      ...ABBR.map((a, i) => layer(T.text(a, stopX(i), i % 2 ? 66 : 94, { align: 'center' }), 'idle')),
      layer(T.dots([[x, TRACK_Y]], 7.5), 'active'),
      layer(T.text(p > 0 ? 'DEPARTED' : 'AT PLATFORM', 8, 124), 'mid'),
    ]
  },
}

// ── 06 SERVICE ──────────────────────────────────────────────────────────────
const STATUS = [
  ['ON TIME', 'ON TIME', 'PLUS 4 MIN', 'ON TIME'],
  ['ON TIME', 'PLUS 2 MIN', 'ON TIME', 'DELAYED'],
  ['PLUS 6 MIN', 'ON TIME', 'ON TIME', 'ON TIME'],
]
const SERVICE_PERIOD = 9
export const service: WidgetPreset = {
  id: 'service', name: 'Service', group: 'text', ...live,
  layers: ({ t }) => {
    // line status refreshes every 9 s; changed lines decode into their new state
    const { k, tau } = cycle(t, SERVICE_PERIOD), now = STATUS[k % STATUS.length], before = STATUS[(k + STATUS.length - 1) % STATUS.length]
    return STATUS[0].flatMap((_, i) => {
      const y = 28 + i * 28, ok = now[i] === 'ON TIME', text = k === 0 ? now[i] : decodeText(before[i], now[i], tau - i * .12)
      return [
        layer(T.dotRing(14, y + 3, 8, { spacing: 2.9, size: 1.7 }), ok ? 'idle' : 'value'),
        layer(T.big(String(i + 1), 14, y, { lattice: 1, align: 'center' })),
        layer(T.big(text, 30, y - 1, { lattice: 1.15 }), ok ? 'mid' : 'value'),
        ...(!ok && blink(t + i * .3, 1.4) ? [layer(T.dots([[134, y + 3]], 4.5), 'active')] : []),
      ]
    })
  },
}

export const departuresBoard: WidgetPreset[] = [departures, stationClock, platform, nextTrain, lineMap, service]
