/**
 * Golden hashes of every preset's quantized dot list.
 *
 *   pnpm golden                   # (re)write goldens/hashes.json
 *   pnpm golden --check           # compare against goldens/hashes.json, exit 1 listing changed presets
 *   pnpm golden --backfill-style  # one-shot: add `style` to every entry; refuses (exit 1) unless every hash and dot count is unchanged
 *   pnpm golden --theme-parity    # every preset in all 14 themes (scheme × accent, src/site/theme) vs dark_signal: a theme may only recolour
 *
 * Each preset is sampled the way the app draws it (`withChrome` → `sampleLayers` on its own
 * grid/style, dot480) at t=0, plus t=1.3 for animated presets. Each dot becomes its golden key
 * (`dotKey`, scripts/lib/goldenKey.ts: x,y → 2dp, r/opacity → 3dp, colour, plus the optional
 * shape/join/rotation/aspect/motif channels), the keys are sorted so a pure re-ordering of the
 * sampler's output does not count as a change, and hashed with FNV-1a 32. Every entry also stores
 * the card's `style` signature (`--check` compares it too). The wall clock is frozen so clock cards
 * hash identically everywhere.
 *
 * `--theme-parity` (docs/LAYOUT-THEME-PLAN.md §4 "Goldens, OG, budget", §6) reads and writes nothing: it samples every
 * preset at the same t values with each theme's engine tokens (`tokensOf`, src/site/theme/tokens.ts), maps each dot's
 * colour back to its tone role through `paletteOf` (faint / mid / idle / value / activeDim / active; any other colour
 * stays literal), and requires the `(x, y, r, opacity, role, channels)` hash to equal dark_signal's. Goldens stay on
 * dark_signal (`goldens/hashes.json` is never touched by it).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { freezeWallClock } from './lib/freeze'
import { uniquePresets } from './lib/cards'
import { backfillOffenders, diffGoldens, goldenRow, type Goldens } from './lib/goldenKey'
export { fnv1a } from './lib/goldenKey'

freezeWallClock()
const FILE = 'goldens/hashes.json'
const ABOUT = 'FNV-1a 32 of the sorted quantized dot list per preset (scripts/golden.ts). Re-baseline with `pnpm golden` when a change is intended.'
const check = process.argv.includes('--check'), backfill = process.argv.includes('--backfill-style'), parity = process.argv.includes('--theme-parity')

if (parity) process.exit(await themeParity())

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

/** `--theme-parity`: exit code 0 when every theme only recolours every preset (see the header). */
async function themeParity(): Promise<number> {
  const [{ sampleLayers }, { paletteOf }, { withChrome }, { tokensOf }, { ACCENTS, SCHEMES, themeName }, { dotKey, fnv1a, TIMES }] = await Promise.all([
    import('../src/engine/sampler/gridSampler'), import('../src/engine/buffer/dotBuffer'), import('../src/widgets'),
    import('../src/site/theme/tokens'), import('../src/site/theme/names'), import('./lib/goldenKey'),
  ])
  const ROLES = ['faint', 'mid', 'idle', 'value', 'activeDim', 'active']
  const presets = uniquePresets(), themes = SCHEMES.flatMap(s => ACCENTS.map(a => [s, a] as const))
  /** Role-keyed hash of one preset at t in a theme: the golden key with the colour replaced by its tone role. */
  const hashIn = (p: (typeof presets)[number], t: number, tokens: ReturnType<typeof tokensOf>) => {
    const pal = paletteOf(tokens), dots = sampleLayers(withChrome(p)({ t, data: { ...p.defaults } }), p.grid, p.style, tokens)
    const keys = dots.map(d => { const i = pal.indexOf(d.color); return dotKey({ ...d, color: i >= 0 ? ROLES[i] : d.color }, p.style) }).sort()
    let h = 0x811c9dc5; for (const k of keys) h = fnv1a(k + ';', h)
    return `${h.toString(16).padStart(8, '0')}/${keys.length}`
  }
  const base = tokensOf('dark', 'signal'), want = new Map<string, string>()
  for (const p of presets) for (const t of p.animated ? TIMES.animated : TIMES.static) want.set(`${p.id}@${t}`, hashIn(p, t, base))
  let failures = 0
  for (const [s, a] of themes) {
    const tokens = tokensOf(s, a), pal = paletteOf(tokens), name = themeName(s, a), bad: string[] = []
    // the role map needs six distinct tone colours, or two roles would read as one
    if (new Set(pal).size !== pal.length) { console.log(`FAIL  ${name}: tone palette has duplicate colours (${pal.join(' ')})`); failures++; continue }
    for (const p of presets) for (const t of p.animated ? TIMES.animated : TIMES.static) {
      const got = hashIn(p, t, tokens), exp = want.get(`${p.id}@${t}`)!
      if (got !== exp) bad.push(`${p.id} t=${t} ${exp}→${got}`)
    }
    if (bad.length) failures++
    console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name}: ${presets.length - new Set(bad.map(b => b.split(' ')[0])).size}/${presets.length} presets recolour only${bad.length ? `  (${bad.slice(0, 4).join('; ')}${bad.length > 4 ? ` … ${bad.length - 4} more` : ''})` : ''}`)
  }
  console.log(failures ? `
theme parity: ${failures} of ${themes.length} themes move or resize dots` : `
theme parity: all ${themes.length} themes × ${presets.length} presets only recolour (dark_signal geometry and roles)`)
  return failures ? 1 : 0
}
