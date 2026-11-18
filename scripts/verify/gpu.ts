/**
 * 500K DOTS (#241) card checks for `pnpm verify`: one per bug fixed on the board.
 * Run alone: `pnpm exec tsx scripts/verify/gpu.ts`.
 */
import { gpuStill } from '../../src/components/gpuStill'
import { passDots, passToDots, splitGPULayers } from '../../src/engine/renderer/webgl/passes'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Layer } from '../../src/engine/types'
import { creditsOf, withChrome, type WidgetPreset } from '../../src/widgets/types'
import { gpuBoard, gpuStarfield, kilo } from '../../src/widgets/boards/gpu'
import { checker, type Assert } from '../lib/check'

const TIMES = [0, .7, 1.3, 2.5, 5, 9.1, 13.4]
const frame = (p: WidgetPreset, t: number) => withChrome(p)({ t, data: {} })
const footer = (layers: Layer[]) => layers.map(l => (l.field as { text?: string }).text).find(s => s?.includes('DOTS')) ?? ''

export function gpuChecks(assert: Assert) {
  // the footer's dot count is the one the WebGL2 pass draws (it was a formula beside the pass, free to drift)
  {
    const off = gpuBoard.flatMap(p => TIMES.map(t => {
      const layers = frame(p, t), drawn = passDots(splitGPULayers(layers, p.grid, p.style, p.grid.pitch!).passes)
      return footer(layers).startsWith(`${kilo(drawn)} DOTS`) ? '' : `${p.id}@${t}: "${footer(layers)}" vs ${drawn}`
    })).filter(Boolean)
    assert('gpu: each footer names the dots its GPU pass draws', !off.length, off.join('; '))
  }
  // the still frame (reduced motion, paused) carries the GPU passes, and its CPU dots leave the GPU field out
  {
    const bad = gpuBoard.filter(p => {
      const g = p.grid, still = gpuStill(withChrome(p), { t: 0, data: {}, grid: g, reducedMotion: true }, g, p.style, dot480)
      const cpuOnly = sampleLayers(frame(p, 0).filter(l => !splitGPULayers([l], g, p.style, g.pitch!).passes.length), g, p.style, dot480)
      return !still || !still.passes.length || still.dots.length !== cpuOnly.length
    }).map(p => p.id)
    assert('gpu: the still frame draws the GPU passes', !bad.length, bad.join(', '))
  }
  // names and labels: no "GPU" prefix and no double space (ids stay as URLs)
  {
    const bad = gpuBoard.filter(p => /gpu/i.test(p.name) || /gpu|\s{2}/i.test(p.label ?? '')).map(p => `${p.id}: ${p.name} / ${p.label}`)
    assert('gpu: names and labels read plain', !bad.length, bad.join('; '))
  }
  assert('gpu: every card credits its source', gpuBoard.every(p => creditsOf(p).length > 0))
  // starfield: no star is cut flat by the window's top or bottom edge (owner's call: the stars keep main's look; #241).
  // A star touching an edge row would be cut, so the GPU pass's first and last rows stay dark at every t
  {
    const cut: string[] = []
    for (const t of TIMES) {
      const pass = splitGPULayers(frame(gpuStarfield, t), gpuStarfield.grid, gpuStarfield.style, 2.25).passes[0]
      const dots = passToDots(pass, dot480), ys = dots.map(d => d.y), top = Math.min(...ys), y0 = (pass.origin[1] + (pass.map[2] + .5) * pass.k) * pass.pitch
      const y1 = (pass.origin[1] + (pass.map[2] + (pass.rows - 1) * pass.map[3] + .5) * pass.k) * pass.pitch
      const edge = dots.filter(d => Math.abs(d.y - y0) < 1e-6 || Math.abs(d.y - y1) < 1e-6).length
      if (edge) cut.push(`t${t}: ${edge} dots on an edge row (top dot y ${top.toFixed(2)})`)
    }
    assert('gpu: starfield stars fade out before the window edge instead of being cut', !cut.length, cut.join('; '))
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/gpu.ts')) {
  const { assert, done } = checker('gpu')
  gpuChecks(assert)
  done('gpu: all checks passed')
}
