/**
 * KNOCK on a card: eight step dots round a ring, the step under the cursor marked by one red dot inside it. While
 * the machine knocks, its beats swell and fade; on your bar the pattern is hidden and only your own knocks show.
 * The result reveals what you missed. Phase word in the middle, lives and round under the ring.
 */
import type { Layer } from '../../engine/types'
import { KNOCK_LIVES, KNOCK_STEPS, knock, knockBeats, knockPhase, type Knock } from '../../game/mini/knock'
import { TAU, TILE, layer, tileStyle, type WidgetPreset } from '../types'
import { PLAY_BOX, T, frame, overlay, session, type View } from './arcade-kit'

const CX = 72, CY = 58, R = 36
const site = (i: number, r = R): [number, number] => [CX + r * Math.sin((i / KNOCK_STEPS) * TAU), CY - r * Math.cos((i / KNOCK_STEPS) * TAU)]
/** A swell that starts big and shrinks over half a step, in whole size steps. */
const swell = (f: number) => (f < 0 || f >= .5 ? 0 : Math.round((1 - f * 2) * 3) / 3)

export function knockLayers(s: Knock): Layer[] {
  const { phase, p, cursor } = knockPhase(s), out: Layer[] = []
  const rest: [number, number][] = [], lit: [number, number][] = [], big: [number, number][] = [], wrong: Layer[] = [], missed: Layer[] = []
  for (let i = 0; i < KNOCK_STEPS; i++) {
    const at = site(i)
    if (phase === 'listen' && s.pattern[i]) {
      const f = p - i, sw = swell(f)
      if (sw > 0) big.push(at); else if (f > 0) lit.push(at); else rest.push(at)
      continue
    }
    if (phase === 'knock' || phase === 'result') {
      if (s.marks[i] === 1) { (s.frame - s.knockAt < s.len / 2 && i === cursor ? big : lit).push(at); continue }
      if (s.marks[i] === 2) { wrong.push(layer(T.dotRing(at[0], at[1], 5.5, { spacing: 2.4, size: 1 }), 'idle')); rest.push(at); continue }
      if (phase === 'result' && s.pattern[i]) { missed.push(layer(T.dotRing(at[0], at[1], 5.5, { spacing: 2.4, size: 1 }), 'mid')); rest.push(at); continue }
    }
    rest.push(at)
  }
  out.push(layer(T.dots(rest, 3.2), 'faint'), layer(T.dots(lit, 5), 'idle'), layer(T.dots(big, 7.5), 'value'), ...wrong, ...missed)
  // the cursor: one red dot just inside the ring at the current step
  if (cursor >= 0) out.push(layer(T.dots([site(cursor, R - 11)], 2.4), 'active'))
  const word = phase === 'listen' ? 'LISTEN' : phase === 'ready' ? 'YOU' : phase === 'knock' ? 'KNOCK' : s.result === 1 ? 'CLEAN' : 'MISS'
  out.push(layer(T.big(word, CX, CY - 5, { lattice: 1.3, align: 'center' }), phase === 'knock' || phase === 'ready' ? 'value' : 'idle'))
  // lives left, then the round and its beats
  const lives: [number, number][] = Array.from({ length: KNOCK_LIVES }, (_, i) => [10 + i * 7, 112])
  out.push(layer(T.dots(lives.slice(0, s.lives), 2.4), 'idle'), layer(T.dots(lives.slice(s.lives), 1.4), 'faint'))
  out.push(layer(T.text(`ROUND ${s.cleared + 1}  ${knockBeats(s)} BEATS`, 140, 109, { align: 'right' }), 'mid'))
  return out
}

const KEY = 'knock'
export const knockSession = session(knock, { key: KEY, kind: 'press', loop: 19, seed: 11 })
export const KNOCK_HOWTO = ['LISTEN, THEN KNOCK', 'THE SAME BEATS BACK']
export function knockFrame(ctx: Parameters<WidgetPreset['layers']>[0], v: View<Knock>): Layer[] {
  const lines = overlay(v, KNOCK_HOWTO, 'OFFBEAT')
  return frame(ctx, KEY, v, knockLayers(v.s), lines, v.mode === 'attract' ? [100, 143] : [28, 106])
}

export const knockCard: WidgetPreset = {
  id: 'arc-knock', name: 'Knock', label: 'KNOCK', group: 'composite', chrome: 'dots', grid: TILE, style: tileStyle, animated: true, fps: 30,
  defaults: { [KEY]: 0 },
  controls: [{ key: KEY, kind: 'button', box: PLAY_BOX, label: 'Knock: press on the beat' }],
  layers: ctx => knockFrame(ctx, knockSession.frame(ctx)),
}
