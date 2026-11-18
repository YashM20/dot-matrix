/**
 * 500K DOTS (#241) card checks for `pnpm verify`: one per bug fixed on the board.
 * Run alone: `pnpm exec tsx scripts/verify/gpu.ts`.
 */
import { gpuStill } from '../../src/components/gpuStill'
import { passDots, splitGPULayers } from '../../src/engine/renderer/webgl/passes'
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import { dot480 } from '../../src/engine/theme/tokens'
import type { Layer } from '../../src/engine/types'
import { creditsOf, withChrome, type WidgetPreset } from '../../src/widgets/types'
import { gpuBoard, gpuStarfield, kilo, nearStars } from '../../src/widgets/boards/gpu'
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
  // starfield: every near star is one site, whole inside the IR window (rows 10–129), never cut at an edge
  {
    const out = TIMES.flatMap(t => nearStars(t).flatMap(l => l.sites!.filter(([x, y]) => {
      const r = l.size! / 2
      return x - r < 0 || x + r > 143 || y - r < 10 || y + r > 129
    }).map(([x, y]) => `t${t}:${x},${y}`)))
    assert('gpu: starfield near stars stay inside the window', !out.length, out.slice(0, 5).join(' '))
  }
  // starfield: the IR draws far stars only, each one dot at the card lattice (they were clusters of mixed sizes)
  {
    let worst = 0
    for (const t of TIMES) {
      const ir = frame(gpuStarfield, t).filter(l => splitGPULayers([l], gpuStarfield.grid, gpuStarfield.style, 2.25).passes.length)
      const lit = new Set(sampleLayers(ir, gpuStarfield.grid, gpuStarfield.style, dot480).map(d => `${Math.round(d.x / 2.25 - .5)},${Math.round(d.y / 2.25 - .5)}`))
      // the largest group of touching lit cells (8-neighbourhood)
      const seen = new Set<string>()
      for (const start of lit) {
        if (seen.has(start)) continue
        let n = 0
        const stack = [start]
        seen.add(start)
        while (stack.length) {
          const [c, r] = stack.pop()!.split(',').map(Number); n++
          for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) {
            const k = `${c + dc},${r + dr}`
            if (lit.has(k) && !seen.has(k)) { seen.add(k); stack.push(k) }
          }
        }
        worst = Math.max(worst, n)
      }
    }
    assert('gpu: starfield IR stars are at most a 2×2 speck at the card lattice', worst <= 4, `largest ${worst} cells`)
  }
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/gpu.ts')) {
  const { assert, done } = checker('gpu')
  gpuChecks(assert)
  done('gpu: all checks passed')
}
