/**
 * FACES, the motion: blinks on a seeded rhythm, an idle gaze that wanders between fixations, the mood of the hour,
 * and what a face remembers of you between frames (where you were, when you last tapped). The rhythms are pure
 * functions of t over a long loop, so goldens see fixed frames; the memory only ever holds input, so a card no
 * one touches is still a pure function of t. Input fades back into the loop on its own (`readInput`).
 */
import { clamp, hash01, mix } from '../../engine/math'
import type { WidgetContext } from '../types'
import type { Pt } from './faces-kit'

export const ease = (x: number) => { const u = clamp(x); return u * u * (3 - 2 * u) }
/** 0 → 1 over `a` s, held for `hold`, back to 0 over `rel`: a reaction's envelope at age τ. */
export const pulse = (tau: number, a: number, hold: number, rel: number) => (tau < 0 ? 0 : ease(tau / a) * (1 - ease((tau - a - hold) / rel)))
const mod = (x: number, m: number) => ((x % m) + m) % m

/** Loop length of every rhythm (s). Long, so no one sees it repeat. */
const LOOP = 97

// ── blinks ──────────────────────────────────────────────────────────────────
export interface Blinks { at: number[]; slow: number[] }
/**
 * Blink times over the loop: gaps of `mean` · (0.45 .. 1.55), a double blink now and then, and some blinks
 * `lazy` (the slow, content kind). None in the first 2.2 s, so t = 0 and t = 1.3 (the goldens) show open eyes.
 */
export function makeBlinks(seed: number, mean: number, lazy = .15): Blinks {
  const at: number[] = [], slow: number[] = []
  for (let t = 2.2 + hash01(seed, 99) * mean * .5, i = 0; t < LOOP - 2; i++) {
    const s = hash01(seed, i, 3) < lazy ? 2.6 : 1
    at.push(t); slow.push(s)
    if (s === 1 && hash01(seed, i, 7) < .18) { at.push(t + .34); slow.push(1) }
    t += mean * (.45 + 1.1 * hash01(seed, i))
  }
  return { at, slow }
}
/** Lid closure of one blink at age τ: shut in 70 ms, held 40 ms, open in 140 ms; `slow` stretches all three. */
export function blinkShape(tau: number, slow = 1): number {
  const c = .07 * slow, h = .04 * slow, o = .14 * slow
  if (tau < 0 || tau > c + h + o) return 0
  return tau < c ? ease(tau / c) : tau < c + h ? 1 : 1 - ease((tau - c - h) / o)
}
/** How shut the lids are from blinking at t (0..1); `slow` stretches every blink (night, reduced motion). */
export function blinkAt(b: Blinks, t: number, slow = 1): number {
  const p = mod(t, LOOP)
  let m = 0
  for (let i = 0; i < b.at.length; i++) {
    const tau = p - b.at[i]
    if (tau < -.01) break
    m = Math.max(m, blinkShape(tau, b.slow[i] * slow))
  }
  return m
}

// ── idle gaze ───────────────────────────────────────────────────────────────
export interface Gazes { at: number[]; to: Pt[] }
/** Fixations over the loop: held `mean` · (0.4 .. 1.6) s each, scattered `amp` around `bias`. The first is `bias`. */
export function makeGazes(seed: number, mean: number, amp: Pt, bias: Pt): Gazes {
  const at = [0], to: Pt[] = [bias]
  for (let t = 1.6 + hash01(seed, 5) * mean, i = 1; t < LOOP - 1; i++) {
    at.push(t)
    to.push([bias[0] + amp[0] * (2 * hash01(seed, i, 11) - 1), bias[1] + amp[1] * (2 * hash01(seed, i, 13) - 1)])
    t += mean * (.4 + 1.2 * hash01(seed, i, 17))
  }
  return { at, to }
}
/** The idle gaze at t: a saccade of 90 ms into each fixation (the loop's wrap jumps, as a saccade), with a slight drift. */
export function gazeAt(g: Gazes, t: number): Pt {
  const p = mod(t, LOOP)
  let i = 0
  while (i + 1 < g.at.length && g.at[i + 1] <= p) i++
  const from = g.to[Math.max(0, i - 1)], to = g.to[i], k = i ? ease((p - g.at[i]) / .09) : 1
  return [mix(from[0], to[0], k) + .03 * Math.sin(t * 1.7 + i), mix(from[1], to[1], k) + .03 * Math.sin(t * 1.3 + 2 * i)]
}

// ── the hour ────────────────────────────────────────────────────────────────
/** Local hour (fractional): `data.hour` when set (snapshots of the night), else the wall clock (09:41 in goldens). */
export function hourOf(ctx: WidgetContext): number {
  const h = ctx.data.hour
  if (h !== undefined && Number.isFinite(h) && h >= 0) return h % 24
  const d = new Date()
  return d.getHours() + d.getMinutes() / 60
}
/** 1 awake (08:00 to 20:30), 0 asleep (23:00 to 06:00), easing between. */
export function awakeAt(h: number): number {
  if (h >= 8 && h <= 20.5) return 1
  if (h >= 23 || h <= 6) return 0
  return h < 12 ? ease((h - 6) / 2) : 1 - ease((h - 20.5) / 2.5)
}
export const dayWord = (h: number) => (h >= 5 && h < 12 ? 'MORNING' : h >= 12 && h < 17 ? 'AFTERNOON' : h >= 17 && h < 21 ? 'EVENING' : 'NIGHT')

// ── input memory ────────────────────────────────────────────────────────────
/** What one card remembers (on whichever thread samples it): the last place it saw you, the last tap and key press. */
export interface Memory { look?: { x: number; y: number; t: number; hold: number }; tap: number; kick: number; kickOn: boolean }
export const memory = (): Memory => ({ tap: -Infinity, kick: -Infinity, kickOn: false })
export interface Input {
  /** Where to look (card cells) and how much (0..1: 1 while you are there, fading back into the loop). */
  at?: Pt; w: number
  /** Board-clock time of the last tap or key press (-Infinity: none yet). */
  tap: number
  /** Keyboard focus on the card: the face looks straight out at you. */
  focus: boolean
}
export const NO_INPUT: Input = { w: 0, tap: -Infinity, focus: false }
/** A mouse that leaves is let go of after 0.6 s; a lifted touch is looked at for 3 s. Then 0.7 s back into the loop. */
const HOLD_MOUSE = .6, HOLD_TOUCH = 3, HEAL = .7

/**
 * This frame's input, merged into `mem`. A pointer over the card is looked at; a lifted touch keeps being looked at
 * for a while (`up` pointers linger briefly, the memory keeps them longer). A press anywhere is a tap; Enter or Space
 * on the card's button (`key`) is one too. Entries stamped after `ctx.t` are ignored, so a still frame at t = 0
 * (a thumbnail, a golden) never sees live input.
 */
export function readInput(mem: Memory, ctx: WidgetContext, key: string): Input {
  const t = ctx.t, ps = ctx.pointers ?? []
  let pressed = false
  for (const p of ps) {
    if (p.tDown > 0 && p.tDown <= t + .1 && p.tDown > mem.tap) mem.tap = p.tDown
    if (p.down) pressed = true
    if (p.up || p.inside || p.down) mem.look = { x: p.x, y: p.y, t, hold: p.up ? HOLD_TOUCH : HOLD_MOUSE }
  }
  const kick = (ctx.data[key] ?? 0) >= .5
  if (kick && !mem.kickOn && !pressed) mem.kick = t
  mem.kickOn = kick
  const look = mem.look && mem.look.t <= t + .05 ? mem.look : undefined
  const w = look ? 1 - ease((t - look.t - look.hold) / HEAL) : 0
  const tap = Math.max(mem.tap, mem.kick)
  return { at: look && w > 0 ? [look.x, look.y] : undefined, w: look ? w : 0, tap: tap <= t + .1 ? tap : -Infinity, focus: ctx.focus === key }
}
