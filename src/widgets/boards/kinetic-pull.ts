/**
 * Kinetic board, 06 MAGNET and 07 SHATTER (#129): the two cards whose pixels leave the word.
 *
 *   MAGNET   a red magnet crosses the word on its own path and the pixels within its reach (the faint ring) lean
 *            toward it. Hover or drag on the card and the magnet follows the pointer; with the keyboard, focus the
 *            card and move it with the arrows (an `xy` control over the screen, a drag surface on touch).
 *   SHATTER  the pixels blow out from the middle, hang as dim dust, and fly home one letter after another; the
 *            letters in flight are red.
 */
import type { Control } from '../../engine/context'
import { loopT, wordOf, wordPixels } from '../../engine/kinetic/word'
import { MAGNET, SHATTER, magnetFrame, shatterFrame } from '../../engine/kinetic/drift'
import type { WidgetContext, WidgetPreset } from '../types'
import { SCREEN, WORD, centred, footer, letters, loopTime, paint, tile, wordStage, type Stage } from './kinetic-kit'

// ── 06 MAGNET ───────────────────────────────────────────────────────────────
const PAD: Control = { key: 'mag', keyY: 'magY', kind: 'xy', gesture: 'surface', box: [0, SCREEN.top, 144, SCREEN.bottom - SCREEN.top + 1], label: 'Magnet' }
/** Card cells to word coordinates on stage `st` (the lattice cell whose centre is at the point). */
const toWord = (st: Stage, x: number, y: number): [number, number] => [(x - st.origin[0]) / st.k - .5 - st.c0, (y - st.origin[1]) / st.k - .5 - st.r0]
/** Where the user holds the magnet, if anywhere: a pointer over the card, else the pad's value while it is focused or dragged. */
function heldAt(ctx: WidgetContext, st: Stage): [number, number] | undefined {
  const p = ctx.pointers?.find(q => q.inside && !q.up)
  if (p) return toWord(st, p.x, p.y)
  if (ctx.focus !== PAD.key && ctx.pressed !== PAD.key) return undefined
  const [x, y, w, h] = PAD.box
  return toWord(st, x + (ctx.data.mag ?? .5) * w, y + (1 - (ctx.data.magY ?? .5)) * h)
}
export const ktMagnet: WidgetPreset = {
  id: 'kt-magnet', name: 'Magnet', label: '06  MAGNET', ...tile, defaults: WORD, controls: [PAD],
  layers: ctx => {
    const word = wordOf(ctx.data), t = loopTime(ctx), st = wordStage(word, centred), held = heldAt(ctx, st)
    const f = magnetFrame(word, t, held), px = wordPixels(word)
    let pulled = 0
    f.cells.forEach((c, j) => { if (c.x !== px[j].x || c.y !== px[j].y) pulled++ })
    return [...paint(st, f), ...footer(loopT(t, MAGNET.period) / MAGNET.period, held ? 'HELD' : 'DRIFT', `${pulled} PULLED`)]
  },
}

// ── 07 SHATTER ──────────────────────────────────────────────────────────────
export const ktShatter: WidgetPreset = {
  id: 'kt-shatter', name: 'Shatter', label: '07  SHATTER', ...tile, defaults: WORD,
  layers: ctx => {
    const word = wordOf(ctx.data), t = loopTime(ctx), lt = loopT(t, SHATTER.period), n = letters(word)
    let home = 0, rank = 0
    for (let i = 0; i < word.length; i++) {
      if (word[i] === ' ') continue
      if (lt < SHATTER.blast || lt >= SHATTER.back + rank * SHATTER.stagger + SHATTER.home) home++
      rank++
    }
    const state = lt < SHATTER.blast ? 'WHOLE' : lt < SHATTER.blast + SHATTER.fly + .2 ? 'BLAST' : lt < SHATTER.back ? 'DUST' : home < n ? 'REFORM' : 'WHOLE'
    return [...paint(wordStage(word, centred), shatterFrame(word, t)), ...footer(lt / SHATTER.period, state, `${home}/${n} HOME`)]
  },
}
