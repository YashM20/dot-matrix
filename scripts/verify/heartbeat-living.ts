/**
 * HEARTBEAT (#230) and LIVING (#229) refine checks for `pnpm verify`: one per fix, so it can't come back.
 * Run alone: `pnpm exec tsx scripts/verify/heartbeat-living.ts`.
 */
import { describe } from '../../src/engine/describe'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { simPhase } from '../../src/engine/sim'
import { hbAwaiting, hbToolRunning, heartbeatBoard } from '../../src/widgets/boards/heartbeat'
import { simBoard, simBoardSims } from '../../src/widgets/boards/sim'
import type { WidgetPreset } from '../../src/widgets/types'
import type { Assert } from '../lib/check'
import { theme, visible } from '../lib/stats'

const at = (p: WidgetPreset, t: number, data: Record<string, number> = {}) => p.layers({ t, data: { ...p.defaults, ...data } })
const shows = (p: WidgetPreset, t = 0) => describe(p, { t }).text
/** Total radius of the visible dots the chosen layers draw: how much of them is on the card. */
const ink = (p: WidgetPreset, t: number, layers: readonly number[]) =>
  sampleLayers(at(p, t).filter((_, j) => layers.includes(j)), p.grid, p.style, theme).filter(visible).reduce((s, d) => s + d.r, 0)

export function heartbeatLivingChecks(assert: Assert) {
  // tool-running: the orbit track is `mid`, so it holds on the paper sheet
  {
    const tones = at(hbToolRunning, 0).filter(l => (l.sites?.length ?? 0) > 20 && l.tone !== 'value').map(l => l.tone)
    assert('heartbeat: tool-running orbit track is mid, not faint', tones.includes('mid') && !tones.includes('faint'), tones.join(','))
  }
  // awaiting approval: a ring is always on the card, at 40% or more, through the whole beat
  {
    const weak: string[] = []
    for (let t = 0; t < 2.4; t += .05) {
      const rings = at(hbAwaiting, t).filter(l => l.tone === 'idle').map(l => l.field(0, 0))
      if (!rings.some(v => v >= .4)) weak.push(t.toFixed(2))
    }
    assert('heartbeat: awaiting-approval keeps a ring at 40% between beats', !weak.length, `no ring at t = ${weak.slice(0, 6).join(', ')}`)
  }
  // agent: the stops are named in whole words, and DONE is the done stop's name
  {
    const agent = heartbeatBoard[5], words = shows(agent).filter(s => /^[A-Z]+$/.test(s))
    const codes = words.filter(w => ['THK', 'ERR', 'OK'].includes(w))
    assert('heartbeat: agent stops read THINK RUN ASK FAIL DONE', ['THINK', 'RUN', 'ASK', 'FAIL', 'DONE'].every(w => words.includes(w)) && !codes.length, words.join(' '))
  }
  // LIVING: card names drop the board word
  assert('living: card names carry no "Sim" prefix', simBoard.every(p => !/^sim\b/i.test(p.name)), simBoard.map(p => p.name).join(', '))
  // sim-rd: the stat names the pattern, not the rates
  assert('living: sim-rd stat says CORAL', shows(simBoard[0]).includes('CORAL') && !shows(simBoard[0]).some(s => s.startsWith('F.')), shows(simBoard[0]).join(' | '))
  // sim-sand: the glass is `mid`, and the TOP count pads to the total's width
  {
    const sand = simBoard[1], walls = at(sand, 0)[0], top = shows(sand).find(s => s.startsWith('TOP')) ?? ''
    assert('living: sim-sand glass is mid', walls.tone === 'mid', String(walls.tone))
    const [a, b] = top.slice(4).split('/')
    assert('living: sim-sand TOP count pads to the total', !!b && a.length === b.length, top)
  }
  // sim-sand and sim-life fade their grains and cells out before the loop resets, like sim-rd
  for (const [i, layers] of [[1, [1, 2]], [2, [0, 1]]] as const) {
    const p = simBoard[i], sim = simBoardSims[i]
    let mid = -1, end = -1
    for (let t = 0; t < 60 && (mid < 0 || end < 0); t += .1) {
      const k = simPhase(sim, t)
      if (mid < 0 && k > .45 && k < .55) mid = t
      if (end < 0 && k > .985) end = t
    }
    const a = ink(p, mid, layers), b = ink(p, end, layers)
    assert(`living: ${p.id} fades out before its loop resets`, mid >= 0 && end >= 0 && a > 0 && b < .05 * a, `ink ${a.toFixed(0)} mid-run, ${b.toFixed(1)} at the end`)
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/heartbeat-living.ts')) {
  let failed = 0
  heartbeatLivingChecks((name, ok, detail) => { if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : `: ${detail}`}`) })
  process.exit(failed ? 1 : 0)
}
