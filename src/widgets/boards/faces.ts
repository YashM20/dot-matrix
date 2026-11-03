/**
 * Board · FACES (#127): four dot faces in the afterlight face's halftone (`faces-kit.ts`), each with its own character.
 * The eyes follow the pointer, or the last tap on a touch screen, and drift back to their own idle gaze when you go.
 * Blinks run on a seeded, uneven rhythm (`faces-motion.ts`). A tap (or Enter / Space) sets off the face's reaction,
 * which settles by itself: CALM winks, CURIOUS is surprised, SLEEPY jolts awake and yawns, PIP laughs.
 * The mood follows the local hour: awake by day, drowsy at night (SLEEPY falls asleep); a tap wakes a face for a few
 * seconds. Goldens run at 09:41; `data.hour` pins another hour for snapshots (`pnpm snap face-sleepy --ctx
 * '{"data":{"hour":23}}'`). Reduced motion: no tracking, no reactions, slow blinks only.
 * The blush is the board's one red: it shows only while a face reacts to you.
 */
import type { Layer } from '../../engine/types'
import type { Control } from '../../engine/context'
import { clamp, mix } from '../../engine/math'
import { TAU, TILE, dim, layer, layoutFor, tileStyle, type WidgetContext, type WidgetPreset } from '../types'
import { faceLayers, restPose, sdBlob, sdCircle, sitesFor, smooth, type Look, type Pose, type Pt } from './faces-kit'
import {
  NO_INPUT, awakeAt, blinkAt, dayWord, ease, gazeAt, hourOf, makeBlinks, makeGazes, memory, pulse, readInput,
  type Blinks, type Gazes, type Memory,
} from './faces-motion'

const T = layoutFor(TILE)
const KEY = 'poke'

/** A face's character: its build, its habits and its reaction to a tap. */
interface Character {
  id: string; name: string; look: Look
  /** Resting expression while awake. */
  rest: { lid: number; curve: number; brow: Pt; slant: Pt; smile: number; open: number; mouthW: number; mouthX: number }
  /** Lid when fully asleep (1: shut). */
  asleep: number
  /** How far the head turns and tilts after the gaze. */
  turn: number; tiltBy: number
  /** Breath period (s) and depth (cells). */
  breath: [number, number]
  gazes: Gazes; blinks: Blinks
  /** Reaction length (s), the pose change at age τ, and the caption while it runs. */
  dur: number
  react: (p: Pose, tau: number) => void
  word: (tau: number) => string
  /** Idle habits (a yawn now and then). */
  habit?: (p: Pose, t: number, alert: number) => void
  /** Rising Z's while asleep. */
  zz?: boolean
}

const lerpPt = (p: Pt, to: number, k: number) => { p[0] = mix(p[0], to, k); p[1] = mix(p[1], to, k) }
/** A yawn at age τ: the mouth opens tall, the lids sink, the head tips back. Returns its envelope. */
function yawn(p: Pose, tau: number, k = 1): number {
  const y = pulse(tau, .55, .45, .8) * k
  if (y <= 0) return 0
  p.open = Math.max(p.open, .85 * y); p.mouthW = mix(p.mouthW, .7, y); p.smile = mix(p.smile, 0, y)
  lerpPt(p.lid, .8, y); lerpPt(p.curve, -.2, y); p.squash *= 1 + .04 * y; p.turnY -= .35 * y
  return y
}

const calm: Character = {
  id: 'face-calm', name: 'Calm',
  look: {
    head: sdBlob(43, 49), R: 40, cx: 71.5, cy: 80, skin: 'grey',
    eye: { dx: 17, y: -2, rx: 9, ry: 7, pupil: 3.8 }, brow: { gap: 6, half: 8, w: 3.6, arch: 1.5 },
    mouth: { y: 23, half: 11, depth: 4.5 }, cheek: { dx: 27, y: 12, r: 7.5 }, nose: { y: 10, r: 4.5 }, parallax: [5, 3.5], gloss: .12,
  },
  rest: { lid: .3, curve: 0, brow: [0, 0], slant: [1, 1], smile: .55, open: 0, mouthW: 1, mouthX: 0 },
  asleep: .85, turn: .5, tiltBy: .03, breath: [4.6, .6],
  gazes: makeGazes(11, 2.8, [.45, .3], [0, .05]), blinks: makeBlinks(21, 4.2, .3),
  dur: 1.4, word: () => 'WINK',
  react: (p, tau) => {
    const e = pulse(tau, .1, .75, .5)
    p.lid[1] = mix(p.lid[1], 1, e); p.curve[1] = mix(p.curve[1], .75, e); p.lid[0] *= 1 - .5 * e
    p.smile += .45 * e; p.mouthX += 3 * e; p.mouthW *= 1 + .12 * e
    p.brow[1] -= 1.5 * e; p.brow[0] += 2 * e; p.tilt -= .07 * e; p.blush = Math.max(p.blush, e)
  },
}

const curious: Character = {
  id: 'face-curious', name: 'Curious',
  look: {
    head: sdBlob(39, 51), R: 37, cx: 71.5, cy: 80, skin: 'grey',
    eye: { dx: 16, y: -6, rx: 10.5, ry: 11.5, pupil: 4.6 }, brow: { gap: 7, half: 8.5, w: 3.6, arch: 2.2 },
    mouth: { y: 27, half: 8, depth: 2.5 }, cheek: { dx: 25, y: 10, r: 6.5 }, nose: { y: 10, r: 3.5 }, parallax: [6, 4], gloss: .15,
  },
  rest: { lid: 0, curve: 0, brow: [0, 3.5], slant: [0, -1.5], smile: .15, open: .32, mouthW: .55, mouthX: 2 },
  asleep: .8, turn: 1, tiltBy: .14, breath: [3.8, .5],
  gazes: makeGazes(31, 1.3, [.85, .55], [.1, 0]), blinks: makeBlinks(41, 3.4, .05),
  dur: 1.55, word: () => 'OH',
  react: (p, tau) => {
    const e = pulse(tau, .07, .8, .6), pop = pulse(tau, .06, .05, .45)
    p.wide = 1 + .2 * e; p.pupil = 1 - .35 * e; p.lid[0] *= 1 - e; p.lid[1] *= 1 - e
    p.brow[0] += 5 * e; p.brow[1] += 4 * e; lerpPt(p.slant, -1, e)
    p.smile *= 1 - e; p.open = mix(p.open, .95, e); p.mouthW = mix(p.mouthW, .55, e); p.mouthX *= 1 - e
    p.bob -= 3 * pop; p.blush = .7 * e
  },
}

const sleepy: Character = {
  id: 'face-sleepy', name: 'Sleepy',
  look: {
    head: sdBlob(52, 41, 2.5), R: 38, cx: 71.5, cy: 86, skin: 'grey',
    eye: { dx: 20, y: -1, rx: 10, ry: 8, pupil: 4.2 }, brow: { gap: 6, half: 9, w: 3.6, arch: .8 },
    mouth: { y: 18, half: 7, depth: 2 }, cheek: { dx: 32, y: 11, r: 8 }, nose: { y: 8, r: 4 }, parallax: [4, 3], gloss: .1,
  },
  rest: { lid: .55, curve: -.15, brow: [0, 0], slant: [2, 2], smile: .2, open: .08, mouthW: 1, mouthX: 0 },
  asleep: 1, turn: .35, tiltBy: .02, breath: [5.2, .8], zz: true,
  gazes: makeGazes(51, 3.6, [.35, .2], [0, .25]), blinks: makeBlinks(61, 5.5, .4),
  dur: 3.9, word: tau => (tau < 1.9 ? 'HUH' : 'YAWN'),
  react: (p, tau) => {
    const jolt = pulse(tau, .06, .8, 2.2), pop = pulse(tau, .05, .08, .4), o = pulse(tau, .06, .35, .5)
    p.lid[0] *= 1 - jolt; p.lid[1] *= 1 - jolt; lerpPt(p.curve, 0, jolt); lerpPt(p.slant, 0, jolt)
    p.wide = 1 + .14 * pop; p.pupil = 1 - .25 * pop; p.brow[0] += 4 * jolt; p.brow[1] += 4 * jolt
    p.open = Math.max(p.open, .5 * o); p.mouthW *= 1 - .45 * o; p.bob -= 3 * pop; p.blush = .6 * jolt
    yawn(p, tau - 1.9)
  },
  // a yawn every 19 s while awake
  habit: (p, t, alert) => { if (alert > .5) yawn(p, ((t - 11) % 19 + 19) % 19, alert) },
}

const pip: Character = {
  id: 'face-pip', name: 'Pip',
  look: {
    head: smooth(6, sdCircle(0, 6, 41), sdCircle(-30, -28, 14), sdCircle(30, -28, 14)), R: 36, cx: 71.5, cy: 78, skin: 'white',
    eye: { dx: 15, y: 3, rx: 6, ry: 7.5, pupil: 0, dot: true },
    mouth: { y: 21, half: 6, depth: 2.6, cat: true }, cheek: { dx: 25, y: 15, r: 6.5 }, parallax: [5, 4], gloss: .4,
    // an even light, so the lower face (and an open laugh) stays white; the nose a dark dot
    ambient: .55, patches: [[0, 13.5, 2.8, 0]],
  },
  rest: { lid: 0, curve: 0, brow: [0, 0], slant: [0, 0], smile: .6, open: 0, mouthW: 1, mouthX: 0 },
  asleep: .8, turn: .8, tiltBy: .05, breath: [2.6, 1],
  gazes: makeGazes(71, 1.9, [.7, .45], [0, .05]), blinks: makeBlinks(81, 3.8, .1),
  dur: 1.7, word: () => 'HA HA',
  react: (p, tau) => {
    const e = pulse(tau, .08, 1.1, .5), hop = Math.abs(Math.sin(tau * TAU * 2.4)) * e
    lerpPt(p.lid, 1, e); lerpPt(p.curve, .8, e)
    p.open = mix(p.open, .8, e); p.mouthW = 1 + .7 * e; p.smile = mix(p.smile, .7, e)
    p.bob -= 4 * hop; p.squash = 1 - .05 * e * Math.cos(tau * TAU * 4.8); p.tilt += .06 * e * Math.sin(tau * TAU * 1.2); p.blush = e
  },
}

/** The slow blink rhythm under reduced motion (the only motion then). */
const SLOW_BLINKS = makeBlinks(7, 7, 0)

/** Rising Z's beside a sleeping head: three on a 3.2 s cycle, growing as they fade. */
function zzz(c: Character, t: number, still: boolean): Layer[] {
  const { cx, cy } = c.look
  return [0, 1, 2].map(k => {
    const ph = still ? .15 + k * .35 : ((t / 3.2 + k / 3) % 1 + 1) % 1
    const z = T.big('Z', cx + 28 + 14 * ph, cy - 48 - 22 * ph, { lattice: 1.7 + 1.2 * ph })
    return layer({ ...z, field: dim(z.field, .9 * (1 - ph)) }, 'idle')
  })
}

function draw(c: Character, mem: Memory, ctx: WidgetContext): Layer[] {
  const t = ctx.t, still = !!ctx.reducedMotion, h = hourOf(ctx), awake = awakeAt(h)
  const inp = still ? NO_INPUT : readInput(mem, ctx, KEY)
  const tau = t - inp.tap, reacting = tau >= 0 && tau < c.dur
  // a tap wakes a dozing face for a few seconds; being looked at (hover, focus) half wakes it
  const wake = tau >= 0 ? 1 - ease((tau - 4) / 2.5) : 0
  const alert = clamp(awake + Math.max(wake, inp.w * .55, inp.focus ? .55 : 0))
  const p = restPose(), r = c.rest

  // the gaze: the idle loop, or you (the pointer, the last tap, straight out under keyboard focus)
  const idle = still ? [0, 0] : gazeAt(c.gazes, t)
  let gx = idle[0], gy = idle[1] + (1 - alert) * .35
  if (inp.focus) { gx = 0; gy = .08 }
  if (inp.at) {
    let ax = (inp.at[0] - c.look.cx) / 50, ay = (inp.at[1] - c.look.cy - c.look.eye.y) / 42
    const m = Math.hypot(ax, ay)
    if (m > 1) { ax /= m; ay /= m }
    gx = mix(gx, ax, inp.w); gy = mix(gy, ay, inp.w)
  }
  p.gx = gx; p.gy = gy; p.turnX = gx * c.turn; p.turnY = gy * c.turn * .6; p.tilt = gx * c.tiltBy

  // the lids: the mood's rest, plus blinks (slower when drowsy, slowest under reduced motion)
  const blink = still ? blinkAt(SLOW_BLINKS, t, 4) : blinkAt(c.blinks, t, 1 + (1 - alert) * 1.2)
  const lid = mix(c.asleep, r.lid, alert), curve = mix(-.35, r.curve, alert)
  p.lid = [lid + (1 - lid) * blink, lid + (1 - lid) * blink]; p.curve = [curve, curve]
  p.brow = [r.brow[0], r.brow[1]]; p.slant = [r.slant[0] + (1 - alert), r.slant[1] + (1 - alert)]
  p.smile = r.smile * mix(.5, 1, alert); p.open = mix(.12, r.open, alert); p.mouthW = r.mouthW; p.mouthX = r.mouthX
  if (!still) p.bob = Math.sin(t * TAU / c.breath[0]) * c.breath[1] * mix(1.4, 1, alert)
  // the light: the sun from the upper right by day, a dimmer moon from the upper left at night
  p.light = mix(.66, 1, awake); p.side = mix(-1, 1, awake)

  if (!still) c.habit?.(p, t, alert)
  if (reacting) c.react(p, tau)
  const asleep = alert < .3 && !reacting
  const word = reacting ? c.word(tau) : asleep ? (c.asleep >= 1 ? 'ASLEEP' : 'DOZING') : alert < .75 ? 'DROWSY'
    : inp.focus ? 'HELLO' : inp.w > .5 ? 'WATCHING' : dayWord(h)
  return [
    ...faceLayers(c.look, p, sitesOf(c)),
    ...(c.zz && asleep ? zzz(c, t, still) : []),
    layer(T.big(word, 143, 1, { lattice: .72, align: 'right' }), 'mid'),
  ]
}

const sites = new Map<string, Pt[]>()
const sitesOf = (c: Character) => { let s = sites.get(c.id); if (!s) sites.set(c.id, (s = sitesFor(c.look))); return s }

/** The whole card below the label is the face's button: a tap or a click sets off its reaction, so does Enter / Space. */
const poke = (name: string): Control[] => [{ key: KEY, kind: 'button', box: [0, 10, 144, 134], label: `Tap ${name}` }]
const FACE_STYLE = { ...tileStyle, sizeMin: .1, sizeMax: 1 }

function preset(c: Character): WidgetPreset {
  const mem = memory()
  return {
    id: c.id, name: c.name, group: 'composite', chrome: 'dots', grid: TILE, style: FACE_STYLE, animated: true, fps: 24,
    defaults: { [KEY]: 0 }, controls: poke(c.name),
    layers: ctx => draw(c, mem, ctx),
  }
}

export const facesBoard: WidgetPreset[] = [calm, curious, sleepy, pip].map(preset)
/** For tests and snapshots: the characters by id. */
export const faceCharacters = { calm, curious, sleepy, pip }
