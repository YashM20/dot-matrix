/**
 * Checks for the arcade board's mini games (#131, src/game/mini, src/widgets/boards/arcade*.ts):
 * - determinism: the autopilot's run from a seed lands on a pinned score and state hash, and replaying its inputs
 *   into a fresh game lands on the same state; a different seed plays a different game;
 * - the rules, from scripted inputs: KNOCK scores a clean bar and takes a life for a wrong knock, HOPLINE drops a
 *   runner who never hops, POISE clears three alike, tips past the limit and refuses nothing;
 * - the card runtime: the attract loop is a pure function of t, a keyboard press and a pointer press each start a
 *   game once (never twice), a jump in the clock pauses and a press resumes, under reduced motion a timed game stays
 *   on its still title while the turn-based one moves once per tap;
 * - the cards: one red layer at most, control boxes inside the grid, and a frame (layers + sampling) in budget (warn-only).
 * Called from verify.ts (`arcadeChecks(assert)`); also runnable alone: `npx tsx scripts/arcade.ts`.
 */
import type { Pointer } from '../src/engine/context'
import { sampleLayers } from '../src/engine/sampler/gridSampler'
import { dot480 } from '../src/engine/theme/tokens'
import { hopline } from '../src/game/mini/hopline'
import { KNOCK_LIVES, knock } from '../src/game/mini/knock'
import { POISE_LIMIT, poise, settlePan } from '../src/game/mini/poise'
import { autoplay, replay, stateHash, type MiniGame, type MiniInput, type MiniState } from '../src/game/mini/types'
import { arcadeBoard } from '../src/widgets/boards/arcade'
import { hoplineSession } from '../src/widgets/boards/arcade-hopline'
import { knockSession } from '../src/widgets/boards/arcade-knock'
import { poiseSession } from '../src/widgets/boards/arcade-poise'
import { withChrome, type WidgetContext, type WidgetPreset } from '../src/widgets/types'
import type { Assert } from './lib/check'
import { fmtLoaded, medianLoaded } from './lib/load'

/** Seed 1, 3600 steps of autopilot: frames, score, state hash. Change only with an intended rule change. */
const PINNED: Record<string, [number, number, string]> = {
  knock: [3600, 169, 'a0124043'],
  hopline: [3600, 473, '7103329a'],
  poise: [1489, 109, 'ea33a65a'],
}
const GAMES = [knock, hopline, poise] as unknown as MiniGame<MiniState>[]
const dotsKey = (p: WidgetPreset, ctx: WidgetContext) => sampleLayers(withChrome(p)(ctx), p.grid, p.style, dot480).map(d => `${d.x},${d.y},${d.r},${d.color}`).join(';')
const card = (id: string) => arcadeBoard.find(p => p.id === id)!
const ptr = (tDown: number, down: boolean): Pointer => ({ id: 1, x: 72, y: 80, inside: true, down, tDown, tUp: 0, vx: 0, vy: 0, pressure: .5 })

export function arcadeChecks(assert: Assert): void {
  // ── determinism ──
  for (const g of GAMES) {
    const { state, inputs } = autoplay(g, 1, 3600), again = replay(g, 1, inputs), pin = PINNED[g.id]
    assert(`arcade: ${g.id} autopilot from seed 1 lands on the pinned frame, score and state`, state.frame === pin[0] && state.score === pin[1] && stateHash(state) === pin[2], `${state.frame} ${state.score} ${stateHash(state)}`)
    assert(`arcade: ${g.id} replaying the inputs reproduces the state`, stateHash(again) === stateHash(state))
    assert(`arcade: ${g.id} seed 2 plays a different game`, stateHash(autoplay(g, 2, 600).state) !== stateHash(autoplay(g, 1, 600).state))
  }

  // ── KNOCK rules ──
  {
    const s = knock.create(4), beats = s.pattern.reduce((a, b) => a + b, 0)
    for (let f = 0; f < 20 * s.len; f++) knock.step(s, knock.bot(s))
    assert('arcade: KNOCK a bar knocked back on every beat scores its beats and keeps the lives', s.score === beats && s.lives === KNOCK_LIVES && s.cleared === 1, `score ${s.score} beats ${beats} lives ${s.lives}`)
    const w = knock.create(4), empty = w.pattern.findIndex(b => !b)
    for (let f = 0; f < 20 * w.len; f++) knock.step(w, w.frame - w.t0 === (10 + empty) * w.len ? 1 : 0)
    assert('arcade: KNOCK a knock where there is no beat costs a life', w.lives === KNOCK_LIVES - 1 && w.score === 0 && w.cleared === 0)
    const idle = replay(knock, 4, new Array(60 * 60).fill(0))
    assert('arcade: KNOCK three silent bars end the game', idle.over && idle.lives === 0)
  }
  // ── HOPLINE rules ──
  {
    const s = replay(hopline, 9, new Array(60 * 30).fill(0))
    assert('arcade: HOPLINE a runner who never hops is dropped or stopped', s.over && s.crash >= 0, `crash ${s.crash} at x ${s.x.toFixed(1)}`)
    const ok = autoplay(hopline, 9, 60 * 30).state
    assert('arcade: HOPLINE the autopilot survives 30 s and collects sparks', !ok.over && ok.sparks > 0, `score ${ok.score}`)
    const h = hopline.create(9); hopline.step(h, 1); const rail = h.rail; hopline.step(h, 1)
    assert('arcade: HOPLINE a press mid-hop does nothing', h.rail === rail && h.hop > 0)
  }
  // ── POISE rules ──
  {
    assert('arcade: POISE three alike on top of a pan vanish', settlePan([2, 1, 1], 1).pan.join() === '2' && settlePan([2, 1, 1], 1).cleared === 1)
    assert('arcade: POISE two alike stay', settlePan([1, 1], 2).pan.join() === '1,1,2' && settlePan([1], 1).cleared === 0)
    const s = poise.create(3)
    let n = 0
    while (!s.over && n++ < 40) poise.step(s, 1)
    assert('arcade: POISE always the right pan tips the beam past the limit', s.over && s.end === 1 && s.right.reduce((a, b) => a + b, 0) > POISE_LIMIT)
    const before = poise.create(3), t = poise.create(3); poise.step(t, 0)
    assert('arcade: POISE no input, no move', t.turns === 0 && t.hand === before.hand)
  }

  // ── the card runtime ──
  {
    const p = card('arc-knock'), ctx = (t: number, extra: Partial<WidgetContext> = {}): WidgetContext => ({ t, data: { knock: 0 }, ...extra })
    knockSession.reset()
    const a = dotsKey(p, ctx(1.3)), b = dotsKey(p, ctx(0)), c = dotsKey(p, ctx(1.3))
    assert('arcade: the attract loop is a pure function of t', a === c && a !== b)
    // a keyboard press: the button's data goes up with no pointer down
    knockSession.reset()
    knockSession.frame(ctx(5))
    const k = knockSession.frame(ctx(5.03, { data: { knock: 1 } }))
    assert('arcade: a keyboard press starts a game', k.mode === 'play' && k.s.frame === 0)
    const held = knockSession.frame(ctx(5.06, { data: { knock: 1 } }))
    assert('arcade: a held key is one press, the game runs on', held.mode === 'play' && held.s.frame > 0)
    // a pointer press also sets the button's data: it must count once
    knockSession.reset()
    knockSession.frame(ctx(5))
    knockSession.frame(ctx(5.03, { pointers: [ptr(5.02, true)], data: { knock: 1 } }))
    const g = knockSession.frame(ctx(5.06, { pointers: [ptr(5.02, true)], data: { knock: 1 } }))
    assert('arcade: a pointer press starts a game once', g.mode === 'play' && g.s.knockAt < 0)
    const pause = knockSession.frame(ctx(9, { pointers: [ptr(5.02, false)] }))
    assert('arcade: a jump in the clock pauses the game', pause.mode === 'paused')
    const back = knockSession.frame(ctx(9.03, { pointers: [ptr(9.02, true)] }))
    assert('arcade: a press resumes it', back.mode === 'play')
    const rewind = knockSession.frame(ctx(0))
    assert('arcade: the clock running backwards (the card left the screen) pauses too', rewind.mode === 'paused')
    // reduced motion: no clock
    knockSession.reset()
    const still = knockSession.frame(ctx(0, { reducedMotion: true, pointers: [ptr(.01, true)] }))
    assert('arcade: under reduced motion a timed game keeps its still title', still.mode === 'attract' && still.still)
    knockSession.reset()

    poiseSession.reset()
    const pc = (side: number): WidgetContext => ({ t: 0, reducedMotion: true, data: { side } })
    poiseSession.frame(pc(0))
    // views share the live state: read what each step shows right away
    const look = (side: number) => { const v = poiseSession.frame(pc(side)); return { mode: v.mode, side: v.s.moveSide, turns: v.s.turns } }
    const start = look(1), right = look(2), left = look(1), wrap = look(0), wrapLeft = look(7)
    assert('arcade: under reduced motion POISE starts on a tap and moves once per tap', start.mode === 'play' && start.turns === 0 && right.turns === 1 && right.side === 1 && left.side === -1 && left.turns === 2)
    assert('arcade: POISE reads the wrapping stepper by direction', wrap.side === -1 && wrapLeft.side === -1 && wrapLeft.turns === 4)
    poiseSession.reset()
    hoplineSession.reset()
  }

  // ── the cards ──
  for (const p of arcadeBoard) {
    const inside = (p.controls ?? []).every(c => c.box[0] >= 0 && c.box[1] >= 10 && c.box[0] + c.box[2] <= p.grid.cols && c.box[1] + c.box[3] <= p.grid.rows)
    assert(`arcade: ${p.id} control boxes sit inside the grid, under the label`, inside)
    let worst = 0
    for (const t of [0, .7, 1.3, 2.9, 4.4, 6.1, 8.3, 11.2]) worst = Math.max(worst, withChrome(p)({ t, data: { ...p.defaults } }).filter(l => l.tone === 'active').length)
    assert(`arcade: ${p.id} draws at most one red layer`, worst <= 1, `${worst}`)
    const r = medianLoaded(i => sampleLayers(withChrome(p)({ t: 1.5 + i * .37, data: { ...p.defaults } }), p.grid, p.style, dot480).length, 9)
    assert(`arcade: ${p.id} frame ≤ 4 ms (layers + sample, median warm × load)`, r.ms <= 4 * r.load, fmtLoaded(r))
  }
}

const self = process.argv[1]?.replace(/\\/g, '/')
if (self && import.meta.url.endsWith(self.split('/').slice(-2).join('/'))) {
  const { assert, done } = (await import('./lib/check')).checker('arcade')
  arcadeChecks(assert)
  done()
}
