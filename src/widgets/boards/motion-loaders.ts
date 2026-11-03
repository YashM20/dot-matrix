/**
 * Motion loaders: a spinner that closes into a check, three bouncing dots, a scanning bar that finds devices.
 * Each is one loop on the shared clock. Red is the live part: the spinner's head, the dot at the top of its
 * bounce, the scanner's head column. When a loader is done, the red goes away.
 */
import type { Layer, Tone } from '../../engine/types'
import { layer } from '../types'
import { BODY, CHECK, T, arcRing, cols, frac, inOut, loopCard, outCubic, outline, span, spriteAt, type Pt } from './motion-kit'

// ── SPINNER ─────────────────────────────────────────────────────────────────
/**
 * An arc that grows and shrinks as it turns (one stretch every 1.2 s), for 3.6 s. Then the arc runs all the
 * way round, the ring closes and a check draws on in the middle.
 */
const SPIN = { cx: 72, cy: 58, r: 30, n: 24, cycle: 1.2, grow: 14, rot: 6, load: 3.6, close: .4, check: .35, period: 5.6 }
const ARC = { track: 2.2, arc: 4.4, head: 6.4 }
/** Arc ends in site units at loop time `lt` (while loading). */
function arcAt(lt: number): [number, number] {
  const c = Math.floor(lt / SPIN.cycle), f = frac(lt / SPIN.cycle), base = c * SPIN.grow + lt * SPIN.rot
  return [base + inOut(2 * f - 1) * SPIN.grow, base + 2 + inOut(2 * f) * SPIN.grow]
}
const checkCol = SPIN.cx + .5 - 3.5 * 3, checkRow = SPIN.cy + .5 - 3.5 * 3
export const spinnerCard = loopCard({
  id: 'mo-spinner', name: 'Spinner', period: SPIN.period, settled: 5,
  draw: lt => {
    const { cx, cy, r, n, load, close } = SPIN, out: Layer[] = []
    if (lt < load) {
      const [tail, head] = arcAt(lt)
      out.push(...arcRing(cx, cy, r, n, tail, head, ARC))
      const dots = Math.floor(lt * 2.5) % 4
      out.push(layer(T.big(`LOADING${'.'.repeat(dots)}`, 34, 100, BODY), 'idle'))
    } else {
      // the arc's tail holds where it was; the head runs on round to it
      const [tail, head] = arcAt(load), p = outCubic(span(lt, load, close)), shut = p >= 1
      out.push(...arcRing(cx, cy, r, n, tail, head + p * (tail + n - 1 - head), { ...ARC, headTone: shut ? 'value' : 'active', head: shut ? ARC.arc : ARC.head }))
      const drawn = Math.round(span(lt, load + close, SPIN.check) * 7)
      if (drawn > 0) out.push(layer(spriteAt(cols(CHECK, drawn), checkCol, checkRow, 3), 'value'))
      out.push(layer(T.big('READY', cx, 100, { ...BODY, align: 'center' }), 'value'))
    }
    return out
  },
  foot: lt => (lt < SPIN.load + SPIN.close ? ['LOADING', `${lt.toFixed(1)} S`] : ['DONE', `IN ${(SPIN.load + SPIN.close).toFixed(1)} S`]),
})

// ── BOUNCE ──────────────────────────────────────────────────────────────────
/**
 * Three big dots hop in a wave, once a second, each on a gravity arc (a parabola, whole cells). A shadow under
 * each shrinks as its dot rises. The dot at the top of its hop is red.
 */
const HOP = { xs: [48, 72, 96], floor: 76, h: 26, air: .55, lag: .14, size: 11, period: 4 }
const SHADOW: [number, Tone][] = [[7, 'mid'], [5.4, 'mid'], [4, 'faint'], [3, 'faint']]
export const bounceCard = loopCard({
  id: 'mo-bounce', name: 'Bounce', period: HOP.period, settled: .9, fps: 24,
  draw: lt => {
    const lifts = HOP.xs.map((_, i) => {
      const u = frac(lt - i * HOP.lag) / HOP.air
      return u < 1 && lt >= i * HOP.lag ? 4 * u * (1 - u) : 0
    })
    const top = lifts.reduce((m, h, i) => (h > lifts[m] ? i : m), 0), out: Layer[] = []
    HOP.xs.forEach((x, i) => {
      const h = lifts[i], y = Math.round(HOP.floor - h * HOP.h), [size, tone] = SHADOW[Math.min(3, Math.floor(h * 4))]
      out.push(layer(T.dots([[x, HOP.floor + 14]], size), tone))
      out.push(layer(T.dots([[x, y]], HOP.size), i === top && h > .8 ? 'active' : 'value'))
    })
    out.push(layer(T.big('CONNECTING', 72, 104, { ...BODY, align: 'center' }), 'idle'))
    return out
  },
  foot: lt => ['WAITING', `PING ${Math.floor(lt) + 1}/4`],
})

// ── SCAN ────────────────────────────────────────────────────────────────────
/**
 * A light sweeps back and forth along a bar of dot columns, easing at the ends, with a short trail. Each pass
 * finds one more device; after four the bar rests and the list is complete.
 */
const SCAN = { n: 20, x0: 15, pitch: 6, ys: [58, 64, 70], pass: 1.2, passes: 4, trail: .035, period: 5.6 }
const DEVICES: [string, string][] = [['DESK LAMP', '-41 DB'], ['HALLWAY HUB', '-58 DB'], ['SPEAKER 2', '-63 DB'], ['DOT/480 TAG', '-77 DB']]
/** Column under the scanner's head at time `t` (fractional). */
const headAt = (t: number) => {
  const p = Math.floor(t / SCAN.pass), x = inOut(frac(t / SCAN.pass)) * (SCAN.n - 1)
  return p % 2 ? SCAN.n - 1 - x : x
}
/** Trail tones by age: the head, then four steps back. */
const TRAIL: [Tone, number][] = [['active', 5], ['value', 4.4], ['value', 4.4], ['idle', 4], ['mid', 3.4]]
export const scanCard = loopCard({
  id: 'mo-scan', name: 'Scan', period: SCAN.period, settled: 5.2, fps: 24,
  draw: lt => {
    const end = SCAN.pass * SCAN.passes, scanning = lt < end, found = Math.min(SCAN.passes, Math.floor(lt / SCAN.pass))
    const age = new Map<number, number>()
    if (scanning) for (let k = TRAIL.length - 1; k >= 0; k--) {
      const t = lt - k * SCAN.trail
      if (t >= 0) age.set(Math.round(headAt(t)), k)
    }
    const groups = new Map<number, Pt[]>()
    for (let i = 0; i < SCAN.n; i++) {
      const k = age.get(i) ?? -1, list = groups.get(k) ?? []
      list.push(...SCAN.ys.map((y): Pt => [SCAN.x0 + i * SCAN.pitch, y]))
      groups.set(k, list)
    }
    const out: Layer[] = [
      layer(T.big('NEARBY', 6, 22, BODY), 'value'),
      layer(T.text(`${found} FOUND`, 138, 23, { align: 'right' }), 'mid'),
      layer(outline(5, 50, 134, 28, 14), 'mid'),
    ]
    for (const [k, pts] of groups) {
      const [tone, size] = k < 0 ? (scanning ? ['faint', 2.2] as [Tone, number] : ['idle', 3.4] as [Tone, number]) : TRAIL[k]
      out.push(layer(T.dots(pts, size), tone))
    }
    DEVICES.slice(0, found).forEach(([name, db], i) => {
      const y = 88 + i * 9, fresh = lt - (i + 1) * SCAN.pass < .6
      out.push(layer(T.dots([[9, y + 3]], 2.4), fresh ? 'value' : 'mid'))
      out.push(layer(T.text(name, 16, y), fresh ? 'value' : 'idle'))
      out.push(layer(T.text(db, 138, y, { align: 'right' }), 'mid'))
    })
    return out
  },
  foot: lt => (lt < SCAN.pass * SCAN.passes ? ['SCANNING', `PASS ${Math.floor(lt / SCAN.pass) + 1}/${SCAN.passes}`] : ['DONE', `${SCAN.passes}/${SCAN.passes} PASSES`]),
})
