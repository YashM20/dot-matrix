/**
 * Golden hashes of every preset's quantized dot list.
 *
 *   pnpm golden            # (re)write goldens/hashes.json
 *   pnpm golden --check    # compare against goldens/hashes.json, exit 1 listing changed presets
 *
 * Each preset is sampled the way the app draws it (`withChrome` → `sampleLayers` on its own
 * grid/style, dot480) at t=0, plus t=1.3 for animated presets. Dots are quantized
 * (x,y → 2dp, r/opacity → 3dp, colour string), sorted so a pure re-ordering of the sampler's
 * output does not count as a change, and hashed with FNV-1a 32. The wall clock is frozen so
 * clock cards hash identically everywhere.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { freezeWallClock } from './lib/freeze'
import { sampleCard, uniquePresets } from './lib/cards'
import type { DotInstance } from '../src/engine/types'

freezeWallClock()
const FILE = 'goldens/hashes.json', TIMES = { static: [0], animated: [0, 1.3] }
const check = process.argv.includes('--check')

/** FNV-1a 32 over UTF-16 code units, as 8 hex digits. */
export function fnv1a(str: string, h = 0x811c9dc5): number {
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
  return h >>> 0
}
const hex = (n: number) => n.toString(16).padStart(8, '0')
const q = (d: DotInstance) => `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.r.toFixed(3)},${d.opacity.toFixed(3)},${d.color}`

interface Entry { hash: string; dots: number }
type Goldens = Record<string, Record<string, Entry>>
const current: Goldens = {}
for (const p of uniquePresets()) {
  const row: Record<string, Entry> = {}
  for (const t of p.animated ? TIMES.animated : TIMES.static) {
    const keys = sampleCard(p, t).map(q).sort()
    let h = 0x811c9dc5; for (const k of keys) h = fnv1a(k + ';', h)
    row[`t=${t}`] = { hash: hex(h), dots: keys.length }
  }
  current[p.id] = row
}

if (!check) {
  mkdirSync('goldens', { recursive: true })
  const doc = { about: 'FNV-1a 32 of the sorted quantized dot list per preset (scripts/golden.ts). Re-baseline with `pnpm golden` when a change is intended.', presets: current }
  writeFileSync(FILE, JSON.stringify(doc, null, 1) + '\n')
  console.log(`${FILE}: ${Object.keys(current).length} presets`)
  process.exit(0)
}

if (!existsSync(FILE)) { console.error(`${FILE} missing — run \`pnpm golden\` first`); process.exit(1) }
const golden: Goldens = JSON.parse(readFileSync(FILE, 'utf8')).presets
const changed: string[] = [], added: string[] = [], removed = Object.keys(golden).filter(id => !(id in current))
for (const [id, row] of Object.entries(current)) {
  const g = golden[id]; if (!g) { added.push(id); continue }
  const diffs = Object.keys({ ...row, ...g }).filter(t => row[t]?.hash !== g[t]?.hash)
    .map(t => `${t} ${g[t]?.hash ?? '-'}→${row[t]?.hash ?? '-'} (${g[t]?.dots ?? 0}→${row[t]?.dots ?? 0} dots)`)
  if (diffs.length) changed.push(`${id}: ${diffs.join(', ')}`)
}
for (const c of changed) console.log(`changed  ${c}`)
for (const a of added) console.log(`added    ${a}`)
for (const r of removed) console.log(`removed  ${r}`)
const total = Object.keys(current).length
if (changed.length || added.length || removed.length) { console.log(`\n${changed.length} changed, ${added.length} added, ${removed.length} removed of ${total} presets`); process.exit(1) }
console.log(`all ${total} presets match ${FILE}`)
