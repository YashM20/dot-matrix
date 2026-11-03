/**
 * Motion progress: a determinate upload in big block dots, an indeterminate check for updates that resolves
 * into a full bar, and a backup ring with its percentage in the middle. The red is the live front: the block
 * filling now, the leading end of the moving bar, the ring's head. Each loop ends done, then starts again.
 */
import type { Layer, Tone } from '../../engine/types'
import { layer } from '../types'
import { BODY, CHECK, T, arcRing, cols, frac, hero, heroW, inOut, loopCard, outCubic, span, spriteAt, step4, type Pt } from './motion-kit'

/** Piecewise-linear progress through keyframes [time, value]. */
const track = (keys: [number, number][]) => (lt: number) => {
  if (lt <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]
    if (lt <= t1) { const [t0, v0] = keys[i - 1]; return v0 + (v1 - v0) * (lt - t0) / (t1 - t0) }
  }
  return keys[keys.length - 1][1]
}

// ── PROGRESS ────────────────────────────────────────────────────────────────
/**
 * Sixteen block dots fill one by one at an uneven pace (a stall near a quarter, then a run). The block filling
 * now grows through the quantize steps in red. At 100 the check draws on.
 */
const UP = { n: 16, x0: 8.25, pitch: 8.5, y: 84, block: 6, empty: 2.4, done: 4.7, mb: 24, period: 6.5 }
const upAt = track([[0, 0], [.6, .12], [1, .2], [1.6, .24], [2.2, .27], [2.8, .55], [3.4, .71], [3.9, .86], [4.4, .97], [UP.done, 1]])
export const progressCard = loopCard({
  id: 'mo-progress', name: 'Progress', period: UP.period, settled: 6,
  draw: lt => {
    const p = upAt(lt), pct = Math.floor(p * 100), full = Math.floor(p * UP.n + 1e-9), part = p * UP.n - full
    const x = (i: number): Pt => [UP.x0 + i * UP.pitch, UP.y], hw = heroW(String(pct))
    const out: Layer[] = [
      layer(T.text(p < 1 ? 'UPLOADING' : 'UPLOADED', 6, 18), 'idle'),
      layer(T.text('BOARD.PNG', 138, 18, { align: 'right' }), 'mid'),
      layer(hero(String(pct), 6, 30), 'value'),
      layer(T.big('%', 6 + hw + 3, 30 + 35 - 11.2, { lattice: 1.6 }), 'idle'),
      layer(T.dots(Array.from({ length: full }, (_, i) => x(i)), UP.block), 'value'),
      layer(T.dots(Array.from({ length: UP.n - full - (p < 1 ? 1 : 0) }, (_, i) => x(full + 1 + i)), UP.empty), 'faint'),
    ]
    if (p < 1) out.push(layer(T.dots([x(full)], UP.empty + step4(part) * (UP.block - UP.empty)), 'active'))
    const drawn = Math.round(span(lt, UP.done, .3) * 7)
    if (drawn > 0) out.push(layer(spriteAt(cols(CHECK, drawn), 114, 37, 3), 'value'))
    out.push(
      layer(T.text(`${(p * UP.mb).toFixed(1)} / ${UP.mb} MB`, 6, 98), 'mid'),
      layer(T.text(p < 1 ? `${Math.max(1, Math.ceil(UP.done - lt))} S LEFT` : 'COMPLETE', 138, 98, { align: 'right' }), p < 1 ? 'mid' : 'value'),
    )
    return out
  },
  foot: lt => (lt < UP.done ? ['SENDING', `${Math.floor(upAt(lt) * UP.n)}/${UP.n} PARTS`] : ['DONE', `${UP.n}/${UP.n} PARTS`]),
})

// ── WAIT (indeterminate) ────────────────────────────────────────────────────
/**
 * Two bars chase along a thick rail, a long one then a short one, each easing in and out (1.5 s a cycle).
 * After three cycles the answer comes back: the rail fills from the left and the copy turns to UP TO DATE.
 */
const WAIT = { x0: 6, n: 41, pitch: 3.3, ys: [72, 76], cycle: 1.5, cycles: 3, fill: .4, period: 6.8 }
const waitEnd = WAIT.cycle * WAIT.cycles
/** Lit fraction ranges [tail, head] of the two bars at cycle phase `f`. */
const bars = (f: number): [number, number][] => [
  [inOut((f - .15) / .6) * 1.2 - .1, inOut(f / .6) * 1.2 - .1],
  [inOut((f - .62) / .38) * 1.25 - .1, inOut((f - .5) / .38) * 1.25 - .1],
]
export const waitCard = loopCard({
  id: 'mo-wait', name: 'Indeterminate', period: WAIT.period, settled: 6, fps: 24,
  draw: lt => {
    const last = WAIT.n - 1, tone: Tone[] = new Array(WAIT.n).fill('faint')
    if (lt < waitEnd) {
      const [b1, b2] = bars(frac(lt / WAIT.cycle))
      for (let i = 0; i < WAIT.n; i++) { const u = i / last; if ((u >= b1[0] && u <= b1[1]) || (u >= b2[0] && u <= b2[1])) tone[i] = 'value' }
      const h = Math.round(b1[1] * last)
      if (h >= 0 && h <= last && b1[1] > b1[0]) tone[h] = 'active'
    } else {
      const p = outCubic(span(lt, waitEnd, WAIT.fill)), h = Math.round(p * last)
      for (let i = 0; i <= h; i++) tone[i] = 'value'
      if (p < 1) tone[h] = 'active'
    }
    const by = new Map<Tone, Pt[]>()
    tone.forEach((tn, i) => { const list = by.get(tn) ?? []; list.push(...WAIT.ys.map((y): Pt => [WAIT.x0 + i * WAIT.pitch, y])); by.set(tn, list) })
    const done = lt >= waitEnd + WAIT.fill
    return [
      layer(T.big(done ? 'UP TO DATE' : 'CHECKING', 6, 34, BODY), 'value'),
      layer(T.text(done ? 'VERSION 4.8.0' : 'FOR UPDATES', 6, 50), 'idle'),
      ...[...by].map(([tn, pts]) => layer(T.dots(pts, tn === 'faint' ? 1.4 : tn === 'active' ? 3.8 : 3), tn)),
      layer(T.text(done ? 'LAST CHECK JUST NOW' : 'THIS CAN TAKE A MINUTE', 6, 92), 'mid'),
    ]
  },
  foot: lt => (lt < waitEnd + WAIT.fill ? ['WAITING', `${lt.toFixed(1)} S`] : ['DONE', `IN ${(waitEnd + WAIT.fill).toFixed(1)} S`]),
})

// ── RING ────────────────────────────────────────────────────────────────────
/**
 * A backup on a ring of sites: the arc fills clockwise from 12 with the percentage in the middle, the head in
 * red. At 100 the number becomes a check. Then the ring winds back to 0 and the next backup starts.
 */
const RING = { cx: 72, cy: 66, r: 42, n: 60, fill: 4, hold: 5.4, drain: .6, files: 1204, gb: 3.2, period: 6.4 }
const ringAt = track([[0, 0], [.5, .08], [1.2, .3], [1.6, .34], [2.4, .62], [3.2, .88], [RING.fill, 1]])
const ringP = (lt: number) => (lt < RING.hold ? ringAt(lt) : 1 - outCubic(span(lt, RING.hold, RING.drain)))
const RING_LAT = 1.8
export const ringCard = loopCard({
  id: 'mo-ring', name: 'Ring', period: RING.period, settled: 4.8,
  draw: lt => {
    const { cx, cy, r, n } = RING, p = ringP(lt), pct = Math.round(p * 100), filling = lt < RING.fill
    const done = lt >= RING.fill && lt < RING.hold
    const out: Layer[] = [
      ...arcRing(cx, cy, r, n, 0, p * n - 1, { track: 1.6, arc: 2.6, head: filling ? 6 : 2.6, headTone: filling ? 'active' : 'value' }),
      layer(T.text(done ? 'DONE' : 'BACKUP', cx, 38, { align: 'center' }), 'idle'),
    ]
    if (done) {
      const drawn = Math.round(span(lt, RING.fill, .3) * 7)
      if (drawn > 0) out.push(layer(spriteAt(cols(CHECK, drawn), cx + .5 - 10.5, cy + .5 - 10.5, 3), 'value'))
    } else {
      const w = heroW(String(pct), RING_LAT), all = w + 2 + 6.5, left = cx - all / 2
      out.push(
        layer(hero(String(pct), left, 52, RING_LAT), 'value'),
        layer(T.big('%', left + w + 2, 52 + 25.2 - 9.1, BODY), 'idle'),
      )
    }
    out.push(layer(T.text(`${Math.round(p * RING.files)}/${RING.files}`, cx, 83, { align: 'center' }), 'mid'))
    return out
  },
  foot: lt => [lt < RING.fill ? 'BACKING UP' : lt < RING.hold ? 'DONE' : 'RESET', `${(ringP(lt) * RING.gb).toFixed(1)}/${RING.gb} GB`],
})
