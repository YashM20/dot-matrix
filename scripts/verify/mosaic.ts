/**
 * MOSAIC refine fixes (#253) for `pnpm verify`: each pins one fix so it can't come back.
 * The ev-charge kW figure is labelled POWER, the codex-usage caption clears the card's bottom edge, no mini-game
 * star sits in or against an invader at any sway, and every vision-camera tag keeps an empty cell before each bracket.
 */
import { describe } from '../../src/engine/describe'
import { codexUsage, evCharge, miniGame, visionCamera } from '../../src/widgets/boards/mosaic'
import type { LatticeField, WidgetPreset } from '../../src/widgets/types'
import { checker, type Assert } from '../lib/check'

type Box = [number, number, number, number]
const at = (p: WidgetPreset, t = 1.3) => p.layers({ t, data: { ...p.defaults } }) as LatticeField[]
const boundsOf = (l: LatticeField): Box | undefined => (l.field as { bounds?: Box }).bounds
/** Empty cells between two cell boxes (0 when they touch or overlap). */
const gap = ([a0, b0, a1, b1]: Box, [c0, d0, c1, d1]: Box) => Math.max(c0 - a1, a0 - c1, d0 - b1, b0 - d1) - 1

export function mosaicChecks(assert: Assert) {
  const label = describe(evCharge).label
  assert('mosaic: ev-charge labels its kW figure POWER', label.includes('142 KW') && label.includes('POWER') && !label.includes('SPEED'), label)

  // the caption tier is 7 rows on a 0.72 lattice; the lowest caption keeps at least 4 empty rows above the edge
  const lowest = Math.max(...at(codexUsage).filter(l => l.lattice === .72 && l.origin?.[0] === 0).map(l => l.origin![1] + 7 * .72))
  assert('mosaic: codex-usage captions end 4 or more rows above the card edge', lowest <= 143 - 4, `lowest caption ends at row ${lowest.toFixed(1)}`)

  // the invaders sway two cells each way: check both ends and the middle
  const close: string[] = []
  for (const t of [0, Math.PI / 2.4, Math.PI * 1.5 / 1.2]) {
    const layers = at(miniGame, t)
    const invaders = layers.filter(l => l.lattice === 1.25 && boundsOf(l)?.[2] === 10).map(l => [l.origin![0], l.origin![1], l.origin![0] + 10 * 1.25, l.origin![1] + 7 * 1.25] as Box)
    const stars = layers.filter(l => (l.tone === 'mid' || l.tone === 'idle') && (l.size === 1 || l.size === 1.3) && l.sites).flatMap(l => l.sites!)
    for (const [x, y] of stars) for (const b of invaders) if (x > b[0] - 2 && x < b[2] + 2 && y > b[1] - 2 && y < b[3] + 2) close.push(`t=${t.toFixed(2)} (${x}, ${y})`)
    if (invaders.length !== 4) close.push(`t=${t.toFixed(2)}: found ${invaders.length} invaders`)
  }
  assert('mosaic: no mini-game star sits within 2 cells of an invader', !close.length, close.join('; '))

  // tags are the 11-row dashed boxes; brackets are the 4-cell arms
  const idle = at(visionCamera).filter(l => l.tone === 'idle').map(boundsOf).filter((b): b is Box => !!b)
  const tags = idle.filter(b => b[3] - b[1] === 10), arms = idle.filter(b => (b[2] - b[0] === 3 && b[1] === b[3]) || (b[3] - b[1] === 3 && b[0] === b[2]))
  const tight = tags.flatMap(t => arms.filter(a => gap(t, a) < 1).map(a => `tag ${t} / arm ${a}`))
  assert('mosaic: vision-camera tags keep an empty cell before every bracket', tags.length === 4 && arms.length === 32 && !tight.length, `${tags.length} tags, ${arms.length} arms; ${tight.join('; ')}`)
}

// standalone: pnpm exec tsx scripts/verify/mosaic.ts
if (process.argv[1]?.replace(/\\/g, '/').endsWith('verify/mosaic.ts')) {
  const { assert, done } = checker('mosaic')
  mosaicChecks(assert)
  done('mosaic: all checks passed')
}
