/**
 * The tide clock and the world clock. The tide is a five-constituent harmonic model (src/engine/astro/tide.ts), an
 * illustration that the card's blurb says is one: the hand turns once a tide, high water at 12 (the big tick; the next
 * turn's line names HIGH or LOW), the water fills the dial to the current level and the hand's red tip marks it. The world clock lists five places; tap a row (or use
 * the arrow keys) to put it in the hero, where the red dot follows it.
 */
import { CITIES, DAY, partsOf, zoneWall } from '../../engine/astro/calendar'
import { tideClock } from '../../engine/astro/tide'
import { TAU, layer } from '../types'
import { CX, CY, DAYS, PRESS, T, at, clockOf, face, knock, onScreen, pad2, polar, ray, rr, states, textBox, ui, wallNow, type Pt } from './watch-kit'

// ── TIDE ──────────────────────────────────────────────────────────────────────
const TIDE = { r: 50, hand: 42, tip: 46, water: 3.3 }
const TICKS: { p: Pt; big: boolean }[] = Array.from({ length: 12 }, (_, k) => ({ p: polar(TIDE.r, (k / 12) * TAU), big: k % 6 === 0 }))
/** The water's sites: a square grid inside the tick ring. */
const WATER: Pt[] = (() => {
  const out: Pt[] = [], n = Math.ceil(TIDE.r / TIDE.water)
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const p: Pt = [CX + i * TIDE.water, CY + j * TIDE.water]
    if (onScreen('round', ...p, 11)) out.push(p)
  }
  return out
})()
/** The next turn's line sits below the hub, or above it while the hand points down. */
const NEXT = { below: 88, above: 54, k: 1.2 }
export const tideFace = face('watch-tide', 'Tide', 'round', {
  group: 'chart', label: 'TIDE',
  layers: () => {
    const now = wallNow(), c = tideClock(now.utc), a = c.angle
    const next = `${c.next.high ? 'HIGH' : 'LOW'} ${clockOf(c.next.at + now.offset * 60_000)}`, status = c.rising ? 'RISING' : 'FALLING'
    // the surface: level 0 sits at the dial's bottom, level 1 near its top, with a small standing ripple
    const level = CY + 44 - c.level * 88, surface = (x: number) => level + 1.2 * Math.sin(x / 7)
    const along = (x: number, y: number) => (x - CX) * Math.sin(a) - (y - CY) * Math.cos(a), across = (x: number, y: number) => Math.abs((x - CX) * Math.cos(a) + (y - CY) * Math.sin(a))
    const offHand = ([x, y]: Pt) => !(across(x, y) < 3 && along(x, y) > -9 && along(x, y) < TIDE.tip + 4) && Math.hypot(x - CX, y - CY) > 4
    const wet = WATER.filter(([x, y]) => y >= surface(x))
    const top = new Map<number, number>()
    for (const [x, y] of wet) top.set(x, Math.min(top.get(x) ?? Infinity, y))
    const ty = Math.cos(a) < 0 ? NEXT.above : NEXT.below, low = CY + TIDE.r - 14
    const boxes = [textBox(next, CX, ty, NEXT.k), textBox(status, CX, ty + 12), textBox('LOW', CX, low)]
    const keep = (pts: Pt[]) => knock(T.dots(pts.filter(offHand), 1.6), boxes)
    return [
      layer(keep(wet.filter(([x, y]) => y > top.get(x)!)), 'faint'),
      layer(keep(wet.filter(([x, y]) => y === top.get(x))), 'mid'),
      layer(T.dots(TICKS.filter(t => !t.big).map(t => t.p), 1.8), 'mid'),
      layer(T.dots(TICKS.filter(t => t.big).map(t => t.p), 3), 'idle'),
      layer(T.text('LOW', CX, low, { align: 'center' }), 'mid'),
      layer(T.big(next, CX, ty, { lattice: NEXT.k, align: 'center' }), 'value'),
      layer(T.text(status, CX, ty + 12, { align: 'center' }), 'idle'),
      // the hand starts at the hub: a tail behind it would cross the status line above the hub
      layer(T.dots(ray(a, 0, TIDE.hand, 3), 2.4), 'value'),
      layer(T.dots([polar(TIDE.tip, a)], 5), 'active'),
      layer(T.dots([[CX, CY]], 4.4), 'value'),
    ]
  },
})

// ── WORLD ─────────────────────────────────────────────────────────────────────
const ROW = { top: 62, h: 14, k: 1.3, mark: 24, code: 29, sun: 63, diff: 67, time: 121 }
const PLACES = [{ code: 'HERE', name: 'LOCAL' }, ...CITIES]
const rowTop = (i: number) => ROW.top + i * ROW.h
export const worldFace = face('watch-world', 'World', 'squircle', {
  group: 'text', defaults: { city: 1 },
  controls: [{ key: 'city', kind: 'segmented', orientation: 'vertical', options: PLACES.length, optionLabels: PLACES.map(p => p.name), box: [20, ROW.top - 2, 104, PLACES.length * ROW.h], label: 'City' }],
  layers: ctx => {
    const now = wallNow(), s = ui(ctx, 'city'), sel = Math.max(0, Math.min(PLACES.length - 1, Math.round(ctx.data.city ?? 1)))
    const walls = [now.local, ...CITIES.map(z => zoneWall(z, now.utc))], here = Math.floor(now.local / DAY)
    const hero = partsOf(walls[sel]), pv = s.pressed ? PRESS : 1
    return [
      layer(T.big(clockOf(walls[sel]), CX, 26, { lattice: 1.5, smooth: true, align: 'center' }), 'value'),
      layer(T.text(`${PLACES[sel].name} ${DAYS[hero.dow]} ${pad2(hero.day)}`, CX, 51, { align: 'center' }), 'idle'),
      ...walls.flatMap((w, i) => {
        const p = partsOf(w), y = rowTop(i), on = i === sel, diff = Math.floor(w / DAY) - here, day = p.hour >= 6 && p.hour < 18
        return [
          ...(on ? [layer(at(T.dots([[ROW.mark, y + 4.5]], 3.4), pv), 'active')] : []),
          layer(T.big(PLACES[i].code, ROW.code, y, { lattice: ROW.k }), on ? 'value' : 'idle'),
          layer(T.dots([[ROW.sun, y + 4.5]], 2.6), day ? 'idle' : 'faint'),
          ...(diff ? [layer(T.text(diff > 0 ? `+${diff}` : `${diff}`, ROW.diff, y + 1), 'mid')] : []),
          layer(T.big(clockOf(w), ROW.time, y, { lattice: ROW.k, align: 'right' }), on ? 'value' : 'idle'),
        ]
      }),
      ...states(s, ctx.t, rr(22, rowTop(sel) - 1, 100, 12, 6), rr(22, rowTop(sel) - 1, 100, 12, 6), 1),
    ]
  },
})
