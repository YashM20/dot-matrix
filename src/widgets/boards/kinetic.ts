/**
 * Board: Kinetic (#129). One word in big dot lettering, seven ways of moving it, one effect per card. The word is
 * board-shared (set it on the FLAP card, or with `?word=` in the link) and every card loops seamlessly from the
 * settled word back to the settled word, so t = 0 and reduced motion show the word as it is spelled.
 *
 *   01 FLAP      twelve split-flap modules, also the editor (./kinetic-flap.ts)
 *   02 MELT      the columns drip into a pool and set back into letters; the hot letter is red
 *   03 SCRAMBLE  random glyphs that lock in from left to right; the next letter to lock is red
 *   04 WAVE      a travelling wave bends the word column by column; the letter on the highest crest is red
 *   05 TYPE      backspaced and typed again; the caret is red
 *   06 MAGNET    a red magnet pulls the pixels near it; hover or drag to hold it (./kinetic-pull.ts)
 *   07 SHATTER   blown to dust and flown home letter by letter; the letters in flight are red (./kinetic-pull.ts)
 *
 * The effects are src/engine/kinetic (pure functions of word and t); this file only stages and paints them.
 */
import { loopT, wordOf, wordPixels, wordWidth } from '../../engine/kinetic/word'
import { MELT, WAVE, meltFloor, meltFrame, waveFrame, waveOffset } from '../../engine/kinetic/drift'
import { SCRAMBLE, TYPE, scrambleFrame, scrambleLock, typed, typewriterFrame } from '../../engine/kinetic/glyphs'
import type { WidgetPreset } from '../types'
import { SCREEN, WORD, WORD_KEYS, centred, footer, letters, loopTime, paint, tile, wordStage } from './kinetic-kit'
import { ktFlap } from './kinetic-flap'
import { ktMagnet, ktShatter } from './kinetic-pull'


// ── 02 MELT ─────────────────────────────────────────────────────────────────
export const ktMelt: WidgetPreset = {
  id: 'kt-melt', name: 'Melt', label: '02  MELT', ...tile, defaults: WORD,
  layers: ctx => {
    const word = wordOf(ctx.data), t = loopTime(ctx), lt = loopT(t, MELT.period)
    // the word and its pool (7 + drop rows) centred together
    const st = wordStage(word, k => Math.round(SCREEN.middle - ((meltFloor() + 1) * k) / 2))
    const state = lt < MELT.hold ? 'SOLID' : lt < MELT.pool - .3 ? 'MELTING' : lt < MELT.pool ? 'POOLED' : lt < MELT.pool + MELT.sweep + MELT.rise ? 'SETTING' : 'SOLID'
    return [...paint(st, meltFrame(word, t)), ...footer(lt / MELT.period, state, `${wordPixels(word).length} DROPS`)]
  },
}

// ── 03 SCRAMBLE ─────────────────────────────────────────────────────────────
export const ktScramble: WidgetPreset = {
  id: 'kt-scramble', name: 'Scramble', label: '03  SCRAMBLE', ...tile, defaults: WORD,
  layers: ctx => {
    const word = wordOf(ctx.data), t = loopTime(ctx), lt = loopT(t, SCRAMBLE.period)
    let busy = 0
    for (let i = 0; i < word.length; i++) if (word[i] !== ' ' && lt >= SCRAMBLE.start + i * SCRAMBLE.spread && lt < scrambleLock(i)) busy++
    const n = letters(word)
    return [...paint(wordStage(word, centred), scrambleFrame(word, t)), ...footer(lt / SCRAMBLE.period, busy ? 'DECODING' : 'LOCKED', `${n - busy}/${n} LOCKED`)]
  },
}

// ── 04 WAVE ─────────────────────────────────────────────────────────────────
export const ktWave: WidgetPreset = {
  id: 'kt-wave', name: 'Wave', label: '04  WAVE', ...tile, defaults: WORD,
  layers: ctx => {
    const word = wordOf(ctx.data), t = loopTime(ctx), lt = loopT(t, WAVE.period)
    let amp = 0
    for (let x = 0; x < wordWidth(word); x++) amp = Math.max(amp, Math.abs(waveOffset(x, lt)))
    return [...paint(wordStage(word, centred), waveFrame(word, t)), ...footer(lt / WAVE.period, amp ? 'WAVE' : 'STILL', `AMP ${amp} ROWS`)]
  },
}

// ── 05 TYPE ─────────────────────────────────────────────────────────────────
export const ktType: WidgetPreset = {
  id: 'kt-type', name: 'Typewriter', label: '05  TYPE', ...tile, defaults: WORD,
  layers: ctx => {
    const word = wordOf(ctx.data), t = loopTime(ctx), lt = loopT(t, TYPE.period), { len, busy } = typed(word, t)
    const state = !busy ? 'READY' : lt < TYPE.empty ? 'DELETE' : 'TYPING'
    return [...paint(wordStage(word, centred), typewriterFrame(word, t)), ...footer(lt / TYPE.period, state, `COL ${String(len + 1).padStart(2, '0')}`)]
  },
}

export const kineticBoard: WidgetPreset[] = [ktFlap, ktMelt, ktScramble, ktWave, ktType, ktMagnet, ktShatter]
/** Board-shared data: the twelve flap modules, so the FLAP card's edits reach every card. */
export const kineticShared = WORD_KEYS
