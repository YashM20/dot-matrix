/**
 * POISE on a card: a dotted beam on a pivot, a pan at each end with its stack of weights (one dot site each, its
 * size the weight), the weight in hand at the top in the accent and the next one beside it. A level meter under
 * the pivot shows the lean against the tipping point. A placed weight drops onto its pan and the beam eases to its
 * new lean; a clear flashes before it goes. Under reduced motion every move lands at once.
 * Tap the left or right half (or press the arrow keys) to place the weight on that side.
 */
import type { Layer } from '../../engine/types'
import { POISE_LIMIT, imbalance, poise, type Poise } from '../../game/mini/poise'
import { TILE, layer, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { PLAY_BOX, SIDE_N, T, frame, overlay, session, type View } from './arcade-kit'

type Pt = [number, number]
const PX = 72, PY = 94, HALF = 58, ARM = 48, TILT = .24, HAND: Pt = [72, 24], NEXT: Pt = [96, 24], METER = 116
/** A weight's height in cells and its dot size. */
const height = (w: number) => 4 + 2.2 * w
const size = (w: number) => height(w) * .85
const ease = (k: number) => 1 - (1 - k) ** 3

/** Beam angle for an imbalance (positive leans right, the right end down). */
const angle = (d: number, tipped: boolean) => (tipped ? Math.sign(d) * 1.6 : Math.max(-1.25, Math.min(1.25, d / POISE_LIMIT))) * TILT
/** Centre of each weight in a pan, bottom up, standing on the pan at (x, y). */
function stack(pan: number[], x: number, y: number): Pt[] {
  let top = y - 1.5
  return pan.map(w => { const c: Pt = [x, top - height(w) / 2]; top -= height(w); return c })
}

/** Weight sites grouped by size, so each size is one layer. */
function weights(list: { at: Pt; w: number }[], tone: 'idle' | 'value' | 'mid'): Layer[] {
  const by = new Map<number, Pt[]>()
  for (const { at, w } of list) by.set(w, [...(by.get(w) ?? []), at])
  return [...by].map(([w, pts]) => layer(T.dots(pts, size(w)), tone))
}

export function poiseLayers(s: Poise, reduced: boolean): Layer[] {
  const k = reduced ? 1 : Math.min(1, (s.frame - s.moveAt) / 10), d = imbalance(s)
  const shown = s.fromD + (d - s.fromD) * ease(k), a = angle(shown, s.end === 1 && k >= 1)
  const cos = Math.cos(a), sin = Math.sin(a), end = (side: number): Pt => [PX + side * ARM * cos, PY + side * ARM * sin]
  const out: Layer[] = [
    layer(T.dotLine(PX - HALF * cos, PY - HALF * sin, PX + HALF * cos, PY + HALF * sin, { spacing: 3, size: 1.3 }), 'idle'),
    // the pivot: a small triangle of dots under the beam
    layer(T.dots(Array.from({ length: 4 }, (_, j) => Array.from({ length: 2 * j + 1 }, (_, i): Pt => [PX + (i - j) * 3.2, PY + 3.5 + j * 3.2])).flat(), 1.2), 'mid'),
  ]
  const placed: { at: Pt; w: number }[] = []
  let falling: { at: Pt; w: number } | undefined
  for (const side of [-1, 1]) {
    const [x, y] = end(side), pan = side < 0 ? s.left : s.right
    out.push(layer(T.dotLine(x - 10, y, x + 10, y, { spacing: 2.5, size: 1 }), 'mid'))
    const at = stack(pan, x, y)
    pan.forEach((w, i) => {
      // the weight just placed drops in from the hand
      if (k < 1 && side === s.moveSide && i === pan.length - 1 && !(s.clearAt === s.moveAt)) {
        const e = ease(k)
        falling = { at: [HAND[0] + (at[i][0] - HAND[0]) * e, HAND[1] + (at[i][1] - HAND[1]) * e], w }
      } else placed.push({ at: at[i], w })
    })
    // a clear: three ghosts on top of the pan, flashing for a moment
    if (!reduced && side === s.clearSide && s.frame - s.clearAt < 14 && Math.floor((s.frame - s.clearAt) / 3) % 2 === 0) {
      const top = at.length ? at[at.length - 1][1] - height(pan[pan.length - 1]) / 2 : y - 1.5
      out.push(...weights(stack([s.clearW, s.clearW, s.clearW], x, top + 1.5).map(p => ({ at: p, w: s.clearW })), 'value'))
    }
  }
  out.push(...weights(placed, 'idle'))
  if (falling) out.push(...weights([falling], 'idle'))
  // the weight in hand (the board's one red), the next one, and which way is which
  if (!s.over) out.push(layer(T.dots([HAND], size(s.hand)), 'active'), layer(T.dots([NEXT], size(s.next) * .6), 'mid'))
  out.push(layer(T.text('<', 4, 21), 'faint'), layer(T.text('>', 139, 21), 'faint'))
  // the level meter: one dot per unit of lean, the tipping points brighter, the lean itself in white
  const m = (i: number): Pt => [PX + i * 6.5, METER], lean = Math.max(-POISE_LIMIT - 1, Math.min(POISE_LIMIT + 1, d))
  const ticks = Array.from({ length: 2 * POISE_LIMIT + 1 }, (_, i) => i - POISE_LIMIT).filter(i => i !== lean)
  out.push(layer(T.dots(ticks.filter(i => Math.abs(i) !== POISE_LIMIT && i !== 0).map(m), 1.1), 'faint'))
  out.push(layer(T.dots(ticks.filter(i => Math.abs(i) === POISE_LIMIT || i === 0).map(m), 1.8), 'mid'))
  out.push(layer(T.dots([m(lean)], 2.8), 'value'))
  return out
}

const KEY = 'side'
export const poiseSession = session(poise, { key: KEY, kind: 'side', loop: 18, seed: 5 })
export const POISE_HOWTO = ['TAP LEFT OR RIGHT', 'THREE ALIKE VANISH']
export function poiseFrame(ctx: WidgetContext, v: View<Poise>): Layer[] {
  // the attract text sits under the beam (no TAP TO PLAY line: the stacks need the room above)
  const lines = v.mode === 'attract' && !v.still ? POISE_HOWTO : overlay(v, POISE_HOWTO, v.s.end === 2 ? 'SPILLED' : 'TIPPED')
  return frame(ctx, KEY, v, poiseLayers(v.s, !!ctx.reducedMotion), lines, v.mode === 'attract' && !v.still ? [118, 143] : [30, 100])
}

export const poiseCard: WidgetPreset = {
  id: 'arc-poise', name: 'Poise', label: 'POISE', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true, fps: 24,
  defaults: { [KEY]: 0 },
  controls: [{ key: KEY, kind: 'stepper', box: PLAY_BOX, min: 0, max: SIDE_N, step: 1, wrap: true, label: 'Poise: place the weight on the left or right pan' }],
  layers: ctx => poiseFrame(ctx, poiseSession.frame(ctx)),
}
