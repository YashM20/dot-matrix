/**
 * C4 checks: HIVE plays headless. The autopilot plays from the title; its inputs are recorded and
 * replayed into a fresh game, which must land on the same state hash at every stage change (the sim
 * is deterministic). Also: the run reaches the boss, every stage renders through the dot pipeline,
 * and a frame (layers + sampling) stays inside its budget.
 * Called from verify.ts (`gameChecks(assert)`); runnable alone: `npx tsx scripts/game.ts [--long]`.
 */
import { sampleLayersInto } from '../src/engine/sampler/gridSampler'
import { createDotBuffer } from '../src/engine/buffer/dotBuffer'
import { dot480 } from '../src/engine/theme/tokens'
import { autopilot } from '../src/game/bot'
import type { StepInput } from '../src/game/buttons'
import { gameLayers, gameStyle } from '../src/game/render'
import { newGame, stateHash, step, type Game, type Stage } from '../src/game/sim'
import { GAME } from '../src/game/world'

type Assert = (name: string, cond: boolean, detail?: string) => void

export interface PlayLog { inputs: StepInput[]; stages: { stage: Stage; frame: number; hash: string; score: number; lives: number }[]; game: Game }
/** Autopilot from the title until `until` is entered (or `max` steps). */
export function playthrough(until: Stage = 'queen', max = 30000, extra = 0): PlayLog {
  const g = newGame(), inputs: StepInput[] = [], stages: PlayLog['stages'] = []
  let stop = -1
  for (let i = 0; i < max && (stop < 0 || i < stop); i++) {
    const inp = autopilot(g)
    inputs.push(inp)
    const before = g.stage
    step(g, inp)
    if (g.stage !== before) {
      stages.push({ stage: g.stage, frame: g.frame, hash: stateHash(g), score: g.score, lives: g.lives })
      if (g.stage === until && stop < 0) stop = i + 1 + extra
    }
  }
  return { inputs, stages, game: g }
}
export function replay(inputs: StepInput[]): PlayLog {
  const g = newGame(), stages: PlayLog['stages'] = []
  for (const inp of inputs) {
    const before = g.stage
    step(g, inp)
    if (g.stage !== before) stages.push({ stage: g.stage, frame: g.frame, hash: stateHash(g), score: g.score, lives: g.lives })
  }
  return { inputs, stages, game: g }
}

export function gameChecks(assert: Assert, long = false): void {
  let t0 = performance.now()
  const run = playthrough('queen', 30000, long ? 9000 : 0), simMs = (performance.now() - t0) / run.inputs.length
  const order = run.stages.map(s => s.stage)
  const reached = order.includes('queen')
  assert('game: the autopilot plays title → corridor → maze → surface → void → queen', reached && ['corridor', 'maze', 'surface', 'void', 'queen'].every(s => order.includes(s)),
    `${order.join(' → ')} at frames ${run.stages.map(s => s.frame).join('/')}, ${(run.inputs.length / 60).toFixed(0)} s of play, score ${run.game.score}, sim ${(simMs * 1000).toFixed(0)} µs/step`)
  const again = replay(run.inputs)
  const same = again.stages.length === run.stages.length && again.stages.every((s, i) => s.hash === run.stages[i].hash && s.frame === run.stages[i].frame) && stateHash(again.game) === stateHash(run.game)
  assert('game: replaying the recorded inputs reproduces every stage change bit for bit', same, `${run.stages.length} stage hashes, final ${stateHash(run.game)}`)
  // render every stage the run visits: a frame per stage, timed (layers + sampling, the main-thread cost)
  const g = newGame(), buf = createDotBuffer(GAME.cols * GAME.rows), style = gameStyle(5), grid = { ...GAME, pitch: 5 }
  const times = new Map<string, number[]>(), dots = new Map<string, number>()
  let red = true
  for (let i = 0; i < run.inputs.length; i++) {
    step(g, run.inputs[i])
    if (i % 23 !== 0) continue
    t0 = performance.now()
    sampleLayersInto(gameLayers(g), grid, style, dot480, buf)
    const ms = performance.now() - t0
    if (!times.has(g.stage)) times.set(g.stage, [])
    times.get(g.stage)!.push(ms); dots.set(g.stage, buf.n)
    // one accent: every red dot this frame comes from a single element of the scene
    let n = 0
    for (let k = 0; k < buf.n; k++) if (buf.tone[k] === 5 && buf.r[k] > 0) n++
    if (g.stage === 'title' && n === 0) red = false
  }
  const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
  const worst = Math.max(...[...times.values()].map(med))
  assert('game: every visited stage renders through the sampler, median frame under 12 ms', worst < 12 && red,
    [...times].map(([s, a]) => `${s} ${med(a).toFixed(1)} ms/${dots.get(s)} dots`).join(', '))
  if (long) console.log(`long run: ${run.game.stage}, score ${run.game.score}, lives ${run.game.lives}, queen hp ${run.game.q.hp}`)
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/game.ts')) {
  let failures = 0
  gameChecks((name, ok, detail = '') => { console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }, process.argv.includes('--long'))
  if (failures) process.exit(1)
}
