/**
 * FACES refine fixes (#255) for `pnpm verify`: each pins one fix so it can't come back.
 * Bright features (eyes, brows, lips, shut lines) are one dot size per frame, CURIOUS rests with an open "o" mouth
 * that keeps its sides, and SLEEPY's Z's sit on whole card cells at one lattice.
 */
import { facesBoard } from '../../src/widgets/boards/faces'
import type { Layer } from '../../src/engine/types'
import type { WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'

type Sited = Layer & { sites?: [number, number][]; size?: number; lattice?: number; origin?: [number, number] }
const byId = (id: string) => facesBoard.find(p => p.id === id)!
const at = (p: WidgetPreset, t: number, hour: number, poke = 0) => p.layers({ t, data: { ...p.defaults, hour, poke } }) as Sited[]
/** The halftone's feature layer: `value` sites at the halftone size (the glints are a separate, smaller layer). */
const features = (ls: Sited[]) => ls.find(l => l.tone === 'value' && l.sites && l.size === 2.5)

export function facesChecks(assert: Assert) {
  // a stroke mixed full and half-size dots when the features shared the head's soft edges
  const mixed: string[] = []
  for (const id of ['face-calm', 'face-curious', 'face-sleepy']) {
    const p = byId(id)
    // the tap lands at t = 1000, far past any smoke render's t, so this memory never leaks into another frame
    for (const [t, poke] of [[0, 0], [1.3, 0], [1000, 1], [1000.7, 1]] as const) {
      const f = features(at(p, t, 9.7, poke))
      if (!f) { mixed.push(`${id} t=${t}: no feature layer`); continue }
      const vals = new Set(f.sites!.map(([x, y]) => (f.field as (u: number, v: number) => number)(x / 143, y / 143).toFixed(3)))
      if (vals.size !== 1) mixed.push(`${id} t=${t}: ${[...vals].join(', ')}`)
    }
    at(p, 1001, 9.7, 0)
  }
  assert('faces: bright features are one dot size per frame', !mixed.length, mixed.join('; '))

  // CURIOUS rests with a small open mouth: a ring of lit sites with a dark middle, not two or three loose dots
  const cur = byId('face-curious'), mouth = features(at(cur, 0, 9.7))!.sites!.filter(([x, y]) => y > 100 && y < 118 && Math.abs(x - 73.5) < 9)
  const xs = mouth.map(s => s[0]), ys = mouth.map(s => s[1])
  const midLit = mouth.some(([x, y]) => Math.abs(x - (Math.min(...xs) + Math.max(...xs)) / 2) < 1.4 && Math.abs(y - (Math.min(...ys) + Math.max(...ys)) / 2) < 1.4)
  assert('faces: CURIOUS rests with an open "o" mouth (8+ lit sites, dark middle)', mouth.length >= 8 && !midLit, `${mouth.length} lit mouth sites, middle lit: ${midLit}`)

  // the Z's grew on a fractional lattice (1.7 to 2.9), so their diagonals stepped and mixed sizes
  const off: string[] = []
  const sleepy = byId('face-sleepy')
  for (const t of [0, .4, 1.1, 2.3, 3]) {
    const zs = at(sleepy, t, 23).filter(l => l.lattice !== undefined && l.tone === 'idle' && l.origin)
    if (zs.length !== 3) off.push(`t=${t}: ${zs.length} Z's`)
    for (const z of zs) if (z.lattice !== 2 || !z.origin!.every(Number.isInteger)) off.push(`t=${t}: lattice ${z.lattice} at ${z.origin}`)
  }
  assert('faces: SLEEPY Z\'s sit on whole card cells at a 2-cell lattice', !off.length, off.join('; '))
}

// standalone: pnpm exec tsx scripts/verify/faces.ts
if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/faces.ts')) {
  const { assert, done } = checker('faces')
  facesChecks(assert)
  done('faces: all checks passed')
}
