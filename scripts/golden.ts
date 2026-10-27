/**
 * Golden hashes of every preset's quantized dot list.
 *
 *   pnpm golden                   # (re)write goldens/hashes.json
 *   pnpm golden --check           # compare against goldens/hashes.json, exit 1 listing changed presets
 *   pnpm golden --backfill-style  # one-shot: add `style` to every entry; refuses (exit 1) unless every hash and dot count is unchanged
 *
 * Each preset is sampled the way the app draws it (`withChrome` → `sampleLayers` on its own
 * grid/style, dot480) at t=0, plus t=1.3 for animated presets. Each dot becomes its golden key
 * (`dotKey`, scripts/lib/goldenKey.ts: x,y → 2dp, r/opacity → 3dp, colour, plus the optional
 * shape/join/rotation/aspect/motif channels), the keys are sorted so a pure re-ordering of the
 * sampler's output does not count as a change, and hashed with FNV-1a 32. Every entry also stores
 * the card's `style` signature (`--check` compares it too). The wall clock is frozen so clock cards
 * hash identically everywhere.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { freezeWallClock } from './lib/freeze'
import { uniquePresets } from './lib/cards'
import { backfillOffenders, diffGoldens, goldenRow, type Goldens } from './lib/goldenKey'
export { fnv1a } from './lib/goldenKey'

freezeWallClock()
const FILE = 'goldens/hashes.json'
const ABOUT = 'FNV-1a 32 of the sorted quantized dot list per preset (scripts/golden.ts). Re-baseline with `pnpm golden` when a change is intended.'
const check = process.argv.includes('--check'), backfill = process.argv.includes('--backfill-style')

const current: Goldens = {}
for (const p of uniquePresets()) current[p.id] = goldenRow(p)

const write = () => {
  mkdirSync('goldens', { recursive: true })
  writeFileSync(FILE, JSON.stringify({ about: ABOUT, presets: current }, null, 1) + '\n')
  console.log(`${FILE}: ${Object.keys(current).length} presets`)
}
const read = (): Goldens => {
  if (!existsSync(FILE)) { console.error(`${FILE} missing — run \`pnpm golden\` first`); process.exit(1) }
  return JSON.parse(readFileSync(FILE, 'utf8')).presets
}

if (backfill) {
  const offenders = backfillOffenders(read(), current)
  if (offenders.length) {
    for (const o of offenders) console.error(o)
    console.error(`\n--backfill-style refused: ${offenders.length} preset row(s) would change, be added or be removed (fix them, or regenerate with \`pnpm golden\` as an intended change)`)
    process.exit(1)
  }
  write()
  console.log('backfill: every hash and dot count kept; `style` written on every entry')
  process.exit(0)
}

if (!check) { write(); process.exit(0) }

const { changed, added, removed } = diffGoldens(read(), current)
for (const c of changed) console.log(`changed  ${c}`)
for (const a of added) console.log(`added    ${a}`)
for (const r of removed) console.log(`removed  ${r}`)
const total = Object.keys(current).length
if (changed.length || added.length || removed.length) { console.log(`\n${changed.length} changed, ${added.length} added, ${removed.length} removed of ${total} presets`); process.exit(1) }
console.log(`all ${total} presets match ${FILE}`)
