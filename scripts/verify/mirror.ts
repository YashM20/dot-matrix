/**
 * MIRROR (#242) refine checks for `pnpm verify`: each pins one fix so it can't come back.
 *
 *   pnpm exec tsx scripts/verify/mirror.ts
 */
import { sampleLayers } from '../../src/engine/sampler/gridSampler'
import type { Layer } from '../../src/engine/types'
import { TILE, type WidgetContext, type WidgetPreset } from '../../src/widgets/types'
import { mirrorConduct, mirrorShadow } from '../../src/widgets/boards/mirror'
import { pitchOf, theme, visible } from '../lib/stats'
import { checker, type Assert } from '../lib/check'

const at = (p: WidgetPreset, t: number, extra: Partial<WidgetContext> = {}) => p.layers({ t, ...extra, data: { ...p.defaults } })
const times = (a: number, b: number, step: number) => Array.from({ length: Math.round((b - a) / step) + 1 }, (_, i) => +(a + i * step).toFixed(3))

/** A soft-edged live silhouette (a disc with a 6-cell ramp), as the camera's background model gives. */
function softSilhouette() {
  const data = new Float32Array(TILE.cols * TILE.rows)
  for (let y = 0; y < TILE.rows; y++) for (let x = 0; x < TILE.cols; x++) data[y * TILE.cols + x] = Math.min(1, Math.max(0, (34 - Math.hypot(x - 70, y - 70)) / 6))
  return { grid: TILE, space: 'card' as const, data }
}

/** Every value the shadow card's wall field gives on its own lattice. */
function wallValues(wall: Layer): number[] {
  const k = wall.lattice as number, [, oy] = wall.origin ?? [0, 0], cols = Math.floor(TILE.cols / k), rows = Math.floor((TILE.rows - oy) / k), out: number[] = []
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push(wall.field(c / (cols - 1), r / (rows - 1)))
  return out
}

export function mirrorChecks(assert: Assert) {
  // mirror-shadow: the wall is a body ~120 cells across, so it sits on a 3-cell lattice (big single dots, not a mass of
  // small ones), and the shadow's edge is cut at half: no grey penumbra between the wall (.12–.16) and the lit spot (≥ .36)
  {
    const fringe: string[] = [], lattices = new Set<number>()
    const cases: [string, Partial<WidgetContext>][] = [['fixture', {}], ['live', { media: { silhouette: softSilhouette() } as WidgetContext['media'] }]]
    for (const [name, extra] of cases) for (const t of times(0, 6, .5)) {
      const wall = at(mirrorShadow, t, extra).find(l => l.lattice)
      if (!wall) { fringe.push(`${name} t = ${t}: no lattice layer`); continue }
      lattices.add(wall.lattice as number)
      const grey = wallValues(wall).filter(v => v > .17 && v < .35).length
      if (grey) fringe.push(`${name} t = ${t}: ${grey} grey edge site(s)`)
    }
    assert('mirror: mirror-shadow wall sits on a 3-cell lattice', [...lattices].join() === '3', [...lattices].join())
    assert('mirror: mirror-shadow silhouette has a crisp edge (no grey fringe), fixture and soft live silhouette', !fringe.length, fringe.slice(0, 3).join('; '))
  }
  // mirror-conduct: the scripted pinch rises above the field, and a live hand or mouse goes anywhere. The pointer ring
  // stays off the WAVE / PINCH line (rows 50–56) and the bottom plate (from row 126), with the field's clear rows
  // between (57–59 above, 121–125 below; field dots stop at row 120)
  {
    const pitch = pitchOf(mirrorConduct), hits: string[] = []
    const inGap = (ctx: Partial<WidgetContext>, t: number) => sampleLayers(at(mirrorConduct, t, ctx), mirrorConduct.grid, mirrorConduct.style, theme).filter(visible)
      .some(d => { const row = d.y / pitch - .5; return (row > 56.5 && row < 59.5) || (row > 120.5 && row < 125.5) })
    for (const t of times(0, 9, .05)) if (inGap({}, t)) hits.push(`demo t = ${t}`)
    for (let y = 40; y <= 140; y += 2) for (const down of [false, true]) {
      const pointers = [{ id: 'hand' as const, x: 72, y, inside: true, down, tDown: 0, tUp: 0, vx: 0, vy: 0, pressure: down ? 1 : 0 }]
      if (inGap({ pointers }, 1)) hits.push(`pointer y = ${y}${down ? ' down' : ''}`)
    }
    assert('mirror: mirror-conduct keeps the rows round the WAVE / PINCH line and the bottom plate clear (pointer ring included)', !hits.length, hits.slice(0, 6).join(', '))
  }
}

if (/verify[\\/]mirror\.ts$/.test(process.argv[1] ?? '')) {
  const { assert, done } = checker('mirror')
  mirrorChecks(assert)
  done('mirror checks passed')
}
