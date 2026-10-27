/**
 * CSS token lint (docs/LAYOUT-THEME-PLAN.md §1b "Consistency rules", §6). Every stylesheet under src/ uses token
 * names from src/tokens.css for colour, spacing, type size, radius and duration; raw literals live only there.
 *
 *   npx tsx scripts/site/css-tokens.ts             → list violations, exit 1 if any (or if an allowlist entry is stale)
 *   npx tsx scripts/site/css-tokens.ts --summary   → also print literal counts per category for every file
 *
 * What counts as a literal:
 *   colour   hex, rgb()/hsl()/oklch()/lab()/lch()/hwb()/color(), named colours: in any declaration, custom properties
 *            included. `color-mix(in srgb, var(--role) N%, transparent)` is the way to write an alpha variant.
 *   spacing  px/rem in margin*, padding*, gap, row-gap, column-gap, scroll-margin*, scroll-padding*. 0 and 1px (a
 *            hairline overlap) are fine; em is typographic rhythm and fine. Sizes and offsets (width, top, inset)
 *            are geometry, not spacing, and are not checked.
 *   type     px/rem in font-size and in the size slot of the `font` shorthand (line-height after `/` is not checked).
 *   radius   px/rem in border-*radius; % (circles, glass) is fine.
 *   duration non-zero s/ms in transition* and animation*.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'src'
/** The token block(s): the only files allowed to hold raw values. */
const TOKEN_FILES = new Set(['src/tokens.css'])
/** Intentional exceptions: file + a substring of `prop: value`, with the reason. Keep it short. */
const ALLOW: { file: string; has: string; why: string }[] = [
  { file: 'src/App.css', has: 'xr-flash 1.2s', why: 'X-RAY outline flash: a one-shot effect, not chrome motion' },
  { file: 'src/App.css', has: 'skin-nixie-flicker 5.3s', why: 'nixie flicker loop period: display physics' },
  { file: 'src/App.css', has: 'animation-duration: 1ms', why: 'reduced motion: jump to the end state but still fire animationend' },
  { file: 'src/App.css', has: 'padding-bottom: min(42dvh, 400px)', why: 'room for the pinned canvas: mirrors its height cap, not rhythm' },
]

type Cat = 'colour' | 'spacing' | 'type' | 'radius' | 'duration'
const NAMED = /\b(white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal|maroon|olive|lime|aqua|fuchsia)\b/i
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\(/i
const LEN = /(?<![\w.-])-?\d*\.?\d+(px|rem)\b/g
const SPACE = /^(margin|padding|gap$|row-gap$|column-gap$|scroll-margin|scroll-padding)/
const COLOUR_PROPS = /^(--|color$|background|border|outline|box-shadow|text-shadow|fill$|stroke$|accent-color$|caret-color$|text-decoration|column-rule|mask|-webkit-mask|filter$|scrollbar-color$)/

function check(prop: string, value: string): Cat[] {
  const out: Cat[] = []
  const v = value.replace(/url\([^)]*\)/g, '')
  if (COLOUR.test(v.replace(/color-mix\(/g, '')) || (COLOUR_PROPS.test(prop) && NAMED.test(v.replace(/var\([^)]*\)/g, '')))) out.push('colour')
  if (prop.startsWith('--')) return out
  const lens = (s: string) => [...s.matchAll(LEN)].map(m => m[0]).filter(x => parseFloat(x) !== 0)
  if (SPACE.test(prop) && lens(v).some(x => !/^-?1px$/.test(x))) out.push('spacing')
  if (prop === 'font-size' && lens(v).length) out.push('type')
  if (prop === 'font' && lens(v.replace(/\/\s*[^\s,]+/g, '')).length) out.push('type')
  if (/radius$/.test(prop) && lens(v).length) out.push('radius')
  if (/^(transition|animation)/.test(prop) && [...v.matchAll(/(?<![\w.-])\d*\.?\d+m?s\b/g)].some(m => parseFloat(m[0]) !== 0)) out.push('duration')
  return out
}

const walk = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const files = walk(ROOT).filter(f => f.endsWith('.css')).map(f => relative('.', f).replace(/\\/g, '/')).sort()
const summary = process.argv.includes('--summary')
const used = new Set<number>()
const counts: Record<string, Record<Cat, number>> = {}
let violations = 0

for (const file of files) {
  if (TOKEN_FILES.has(file)) continue
  // blank out comments but keep line numbers
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  const c = counts[file] = { colour: 0, spacing: 0, type: 0, radius: 0, duration: 0 }
  for (const m of src.matchAll(/(^|[{;\s])([a-z-]+|--[\w-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)) {
    const [, , prop, value] = m
    const cats = check(prop, value)
    if (!cats.length) continue
    const decl = `${prop}: ${value.replace(/\s+/g, ' ')}`
    const a = ALLOW.findIndex(e => e.file === file && decl.includes(e.has))
    if (a >= 0) { used.add(a); continue }
    const line = src.slice(0, m.index! + m[1].length).split('\n').length
    for (const k of cats) c[k]++
    violations++
    console.log(`${file}:${line}  ${cats.join('+')}  ${decl.slice(0, 120)}`)
  }
}
const stale = ALLOW.filter((_, i) => !used.has(i))
for (const e of stale) console.log(`stale allowlist entry: ${e.file} "${e.has}"`)
if (summary) for (const [f, c] of Object.entries(counts)) console.log(`  ${f.padEnd(40)} ${Object.entries(c).map(([k, n]) => `${k} ${n}`).join('  ')}`)
console.log(`css tokens: ${violations} raw literal(s) in ${files.length - TOKEN_FILES.size} stylesheets, allowlist ${ALLOW.length} (${stale.length} stale)`)
process.exit(violations || stale.length ? 1 : 0)
