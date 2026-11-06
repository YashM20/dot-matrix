/**
 * Kinetic board, 01 FLAP (#129): twelve split-flap modules that hold the board's word, and the way to change it.
 *
 * The loop: every module flips forward round the drum (blank, A to Z, 0 to 9, ! ? - .) to blank, rests, and flips
 * on round to its letter, the modules 50 ms apart. The leaf in motion is the red; a module's housing is its 5 × 7
 * of faint dots, so a blank module still reads as a module.
 *
 * Each module is a vertical stepper: tap its top half for the next character, the bottom half for the one before
 * (Up and Down on a focused module, Left and Right to the next one, one tab stop for the row; Home blanks it). The modules are board-shared data, so every card on the
 * board takes the new word at once, and this card writes it to `?word=` (`keepWord`). While a module is hovered
 * or focused the loop rests on the word, and an edited module flips to its new character on its own.
 */
import { SPLIT_FLAP } from '../creditSources'
import type { Control } from '../../engine/context'
import { ADV, DRUM, GH, GW, SLOTS, fromSlots, slotKey, slotText, slotsOf, type Cell } from '../../engine/kinetic/word'
import { FLAP, flapAt, flapFrame, flapSteps, type FlapState } from '../../engine/kinetic/glyphs'
import { layer, type WidgetContext, type WidgetPreset } from '../types'
import { SCREEN, T, WORD, footer, keepWord, loopTime, paint, stage, tile } from './kinetic-kit'

/** The modules sit on lattice 2: twelve 5 × 7 faces six dots apart fill the card. */
const K = 2, WIDTH = SLOTS * ADV - 1, CAP = Math.round(SCREEN.middle - (GH * K) / 2)
export const FLAP_STAGE = stage(WIDTH, K, CAP)
const colOf = (m: number) => FLAP_STAGE.origin[0] + (FLAP_STAGE.c0 + m * ADV) * K
const BOX = { top: CAP - 18, h: GH * K + 36 }
/** An edit flips faster than the loop. */
const EDIT_FLIP = .03

const controls: Control[] = Array.from({ length: SLOTS }, (_, m): Control => ({
  key: slotKey(m), kind: 'stepper', orientation: 'vertical', min: 0, max: DRUM.length, step: 1, wrap: true,
  box: [colOf(m) - 1, BOX.top, ADV * K, BOX.h], label: `Flap ${m + 1}`, group: 'flaps',
}))

// Edits in flight: when a module's value changes on an interaction frame, it flips from what it showed. Kept per
// module, dropped when the flip lands. Frames without interaction (goldens, checks) never record one.
let seen: number[] | undefined, seenT = -Infinity
const edits: ({ from: number; since: number } | undefined)[] = []
const interacting = (ctx: WidgetContext) => !ctx.reducedMotion && (ctx.hover !== undefined || ctx.focus !== undefined || ctx.pressed !== undefined || !!ctx.pointers?.length)
function editStates(slots: number[], ctx: WidgetContext): (m: number) => FlapState | undefined {
  if (!seen || ctx.t < seenT) edits.length = 0
  else if (interacting(ctx)) slots.forEach((v, m) => { if (v !== seen![m]) edits[m] = { from: seen![m], since: ctx.t } })
  seen = slots.slice(); seenT = ctx.t
  return m => {
    const e = edits[m]
    if (!e) return undefined
    const steps = flapSteps(e.from, slots[m]), tau = ctx.t - e.since
    if (tau >= steps * EDIT_FLIP) { edits[m] = undefined; return undefined }
    const s = flapAt(e.from, steps, tau, EDIT_FLIP)
    return s
  }
}
const moduleOf = (key: string | undefined) => (key && /^w\d+$/.test(key) ? +key.slice(1) : -1)

export const ktFlap: WidgetPreset = {
  id: 'kt-flap', name: 'Split-Flap', label: '01  FLAP', ...tile, defaults: WORD, controls,
  credit: SPLIT_FLAP,
  layers: ctx => {
    keepWord(ctx.data)
    const slots = slotsOf(ctx.data), word = fromSlots(slots), hot = moduleOf(ctx.focus ?? ctx.pressed ?? ctx.hover)
    const engaged = ctx.hover !== undefined || ctx.focus !== undefined || ctx.pressed !== undefined
    const t = engaged ? 0 : loopTime(ctx), frame = flapFrame(slotText(slots), t, editStates(slots, ctx))
    // housings: the 5 × 7 of each module in faint, the one under the pointer or focus a step brighter
    const under: Cell[] = []
    for (let m = 0; m < SLOTS; m++) for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++)
      under.push({ x: m * ADV + x, y, tone: m === hot ? 'idle' : 'faint', v: m === hot ? .5 : .4 })
    const cues = hot < 0 ? [] : [
      layer(T.text('+', colOf(hot) + 5, CAP - 11, { align: 'center' }), 'idle'),
      layer(T.text('-', colOf(hot) + 5, CAP + GH * K + 4, { align: 'center' }), 'idle'),
    ]
    return [
      ...paint(FLAP_STAGE, frame, { screen: false, under }),
      ...cues,
      ...footer((t % FLAP.period) / FLAP.period, hot < 0 ? 'TAP A FLAP' : `FLAP ${hot + 1}  ${DRUM[slots[hot]] === ' ' ? 'BLANK' : DRUM[slots[hot]]}`, `${word.length}/${SLOTS}`),
    ]
  },
}
