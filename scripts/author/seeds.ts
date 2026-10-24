/**
 * Three deliberately weak IR cards, one per failure family, used by `mcp/test/author.ts` and
 * `npx tsx scripts/author/seeds.ts` (prints each refinement history).
 */
import { pathToFileURL } from 'node:url'
import type { IRCard } from './card'
import { refine } from './refine'

export const SEEDS: Record<string, IRCard> = {
  // fine-pitch, low-contrast speckle: small dots (G4), flat tone (V2)
  speckle: { ir: 'hash(floor(u * 144), floor(v * 144)) * .3 + .3 * smoothstep(.5, .1, length(u - .5, v - .5))' },
  // the whole blob in red: accent area (G2)
  redFlood: { ir: 'smoothstep(.42, .05, length(u - .5, v - .5))', tone: 'active', lattice: 2 },
  // off-ladder lattice (G3), strobing bands (L1)
  strobe: { ir: '.5 + .5 * sin(u * 18 - t * 40)', lattice: 1.75 },
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  for (const [name, card] of Object.entries(SEEDS)) {
    const r = refine(card, { rounds: 4 })
    console.log(`\n${name}: ${r.stopped}`)
    for (const x of r.rounds) console.log(`  r${x.round} ${x.score.passed}/${x.score.total} deficit ${x.score.deficit} failing [${x.score.failing.join(' ')}]${x.accepted.length ? `  ← ${x.accepted.join('; ')}` : ''}`)
  }
}
