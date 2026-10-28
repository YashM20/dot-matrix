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
 *
 * Consistency rules (docs/LAYOUT-THEME-PLAN.md §1b, §1c #15, §6; DESIGN.md › Chrome states):
 *   four-state  every selector with `:hover` has the same selector with `:active` and with `:focus-visible` (or
 *               `:focus-within`, `:has(:focus-visible)`) in the same stylesheet. Hover resets inside
 *               `@media (hover: none)` are exempt.
 *   glow        `var(--glow…)` (the one signature effect) only on active, focus and live selectors.
 *   outline     no `outline: none` / `outline: 0` without a replacement (allowlist it with the reason).
 *   transition  no `transition: all` (name the properties).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = 'src'
/** The token block(s): the only files allowed to hold raw values. */
// themes.css is the generated per-theme role table (scripts/site/theme.ts --write)
const TOKEN_FILES = new Set(['src/tokens.css', 'src/site/theme/themes.css'])
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

// ── consistency rules ────────────────────────────────────────────────────────────────────────────────────────────
/** `outline: none` with a replacement elsewhere: file + selector substring, with the reason. */
const OUTLINE_OK: { file: string; sel: string; why: string }[] = [
  { file: 'src/App.css', sel: '.dot-a11y-ctl', why: 'in-card controls: the card draws focus as marching dots (DESIGN.md › Interaction)' },
  { file: 'src/essay/essay.css', sel: '.dot-a11y-ctl', why: 'in-card controls: the card draws focus as marching dots' },
  { file: 'src/App.css', sel: '.dw-code textarea', why: 'the editor box shows focus: .dw-editor:focus-within' },
  { file: 'src/App.css', sel: '.pal-input', why: 'the field row shows focus: .pal-field:focus-within' },
  { file: 'src/components/editor/editor.css', sel: '.ed-viewport', why: 'the canvas shows focus: .ed-viewport:focus-visible' },
  { file: 'src/components/editor/editor.css', sel: '.ed-field input:focus', why: 'fields show focus with the accent border' },
  { file: 'src/components/game/hive.css', sel: '.hive-screen', why: 'the full-screen game owns the screen; it has no other focus target' },
]
/** Selectors where the glow may appear: active, selected, pressed, open, focus, live. */
const LIVE_SEL = /:active|:focus|:checked|\[aria-(pressed|selected|checked|expanded|current)|\[open\]|\[data-engaged\]|\.selected\b|\.on\b|--sel\b|--engaged\b|--live\b|\.live\b|\.busy\b/
/** Top-level comma split (keeps `:is(a, b)` whole). */
const splitSel = (s: string) => { const out: string[] = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = '' } else cur += ch } if (cur.trim()) out.push(cur.trim()); return out }
const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim()
interface Rule { sels: string[]; body: string; line: number; media: string }
function rules(src: string): Rule[] {
  const out: Rule[] = [], stack: { at: string; kind: 'at' | 'kf' | 'style' }[] = []
  let start = 0
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') {
      const prelude = src.slice(start, i).trim(), top = stack[stack.length - 1]
      if (prelude.startsWith('@')) stack.push({ at: prelude, kind: /^@(-\w+-)?keyframes/.test(prelude) ? 'kf' : 'at' })
      else if (top?.kind === 'kf') stack.push({ at: '', kind: 'kf' })
      else {
        const end = src.indexOf('}', i)
        out.push({ sels: splitSel(prelude), body: src.slice(i + 1, end), line: src.slice(0, i).split('\n').length, media: stack.map(s => s.at).join(' ') })
        i = end; start = end + 1; continue
      }
      start = i + 1
    } else if (ch === '}') { stack.pop(); start = i + 1 } else if (ch === ';' && !stack.length) start = i + 1
  }
  return out
}
let consistency = 0
const usedOutline = new Set<number>()
const fail = (file: string, line: number, what: string) => { consistency++; console.log(`${file}:${line}  ${what}`) }
for (const file of files) {
  if (TOKEN_FILES.has(file)) continue
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  const rs = rules(src), have = new Set(rs.flatMap(r => r.sels.map(norm)))
  for (const r of rs) {
    for (const sel of r.sels) {
      // a selector that already names all three states (`:is(:hover, :active, :focus-visible)`) is its own twin
      if (sel.includes(':hover') && !(sel.includes(':active') && sel.includes(':focus-visible')) && !/hover:\s*none/.test(r.media)) {
        const s = norm(sel), act = s.replaceAll(':hover', ':active')
        const foc = [':focus-visible', ':focus-within', ':has(:focus-visible)'].map(f => s.replaceAll(':hover', f))
        const miss = [!have.has(act) && ':active', !foc.some(f => have.has(f)) && ':focus-visible'].filter(Boolean)
        if (miss.length) fail(file, r.line, `four-state  "${s}" has no ${miss.join(' / ')} twin`)
      }
    }
    if (/var\(--glow/.test(r.body)) for (const sel of r.sels) if (!LIVE_SEL.test(sel)) fail(file, r.line, `glow  "${norm(sel)}" is not an active / focus / live selector`)
    if (/(^|;)\s*outline(-style)?\s*:\s*(none|0)\s*(;|$)/m.test(r.body)) {
      const ok = OUTLINE_OK.findIndex(e => e.file === file && r.sels.some(s => s.includes(e.sel)))
      if (ok >= 0) usedOutline.add(ok); else fail(file, r.line, `outline  "${r.sels.map(norm).join(', ')}" removes the focus outline with no replacement`)
    }
    if (/(^|;)\s*transition(-property)?\s*:\s*all\b/m.test(r.body)) fail(file, r.line, `transition  "${r.sels.map(norm).join(', ')}" uses transition: all`)
  }
}
const staleOutline = OUTLINE_OK.filter((_, i) => !usedOutline.has(i))
for (const e of staleOutline) console.log(`stale outline allowlist entry: ${e.file} "${e.sel}"`)
console.log(`css consistency: ${consistency} issue(s) (four-state, glow, outline, transition), outline allowlist ${OUTLINE_OK.length} (${staleOutline.length} stale)`)
process.exit(violations || stale.length || consistency || staleOutline.length ? 1 : 0)
