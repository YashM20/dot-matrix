/**
 * Which browser probes a PR push runs (.github/workflows/probes.yml, docs/HARNESS.md › Probes in CI): the files the
 * PR changed against its base, through the table below, plus the SMOKE set every time.
 *
 *   npx tsx scripts/ci/affected.ts --base <ref>       probes for `git diff --name-only <ref>...HEAD`
 *   npx tsx scripts/ci/affected.ts --files a.ts,b.ts  probes for these paths (to try a table change)
 *
 * Prints `all` or a comma list on stdout, and each file's reason on stderr (and in $GITHUB_STEP_SUMMARY when set).
 * A file runs every probe when a row says `all` for it or when no row and no probe's own script matches it: an
 * unmapped path is the safe default. A probe's own script (its first argument in probe-list.ts) picks that probe.
 * Rows add up: a file gets the probes of every row it matches. `*` stays within a folder, `**` crosses folders.
 */
import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { PROBES } from './probe-list'

/** Fast probes that run on every PR push, whatever it changed: lazy chunks, axe, the no-flash theme boot. */
const SMOKE = ['chunks', 'a11y', 'theme-boot']

const ALL = 'all' as const
/** Path globs to probes. `all` for shared code; `[]` for paths no probe looks at. */
const AREAS: [glob: string, probes: string[] | typeof ALL][] = [
  // shared code and the CI itself: every probe
  ['src/engine/**', ALL], ['src/hooks/**', ALL], ['src/lib/*.ts', ALL], ['src/workers/**', ALL],
  ['src/widgets/types*', ALL], ['src/widgets/manifest*', ALL],
  ['src/components/DotCanvas*', ALL], ['src/components/DotWidget*', ALL],
  ['scripts/lib/**', ALL], ['scripts/ci/**', ALL], ['.github/workflows/probes.yml', ALL], ['.github/actions/**', ALL],
  ['vite.config.ts', ALL], ['index.html', ALL], ['package.json', ALL], ['pnpm-lock.yaml', ALL], ['tsconfig*.json', ALL],
  // the build's own steps (vite.config.ts runs them) write every page
  ['scripts/site/postbuild.ts', ALL], ['scripts/site/seo*.ts', ALL], ['scripts/og.ts', ALL],

  // site areas
  ['src/components/editor/**', ['editor', 'editor-phone']],
  ['src/components/studio/**', ['editor', 'editor-phone']],
  ['src/components/dwitter/**', ['editor', 'ir-worker']],
  ['src/spec/**', ['editor', 'editor-phone', 'ir-worker']],
  ['src/export/**', ['editor', 'chunks']],
  ['src/components/xray/**', ['c10']], ['src/components/palette/**', ['c10', 'analytics']],
  ['src/site/app/xray.css', ['c10']], ['src/site/app/palette.css', ['c10']],
  ['src/components/browse/**', ['browse']], ['src/site/browse.ts', ['browse']],
  ['src/components/skins/**', ['skins']], ['src/site/app/skins.css', ['skins']],
  ['src/components/theme/**', ['theme-picker', 'layout', 'layout-narrow']],
  ['src/site/theme/**', ['theme-picker', 'csp', 'layout', 'layout-narrow']],
  ['src/components/likes/**', ['likes']], ['src/lib/likes/**', ['likes']], ['api/**', ['likes']],
  ['src/components/game/**', ['game']], ['src/game/**', ['game']],
  ['src/audio/**', ['audio']],
  ['src/media/**', ['c6']], ['src/vision/**', ['c6']],
  ['src/essay/**', ['essay', 'csp']], ['src/blog/**', ['essay', 'csp']], ['docs/blog/**', ['essay', 'csp']],
  ['src/site/analytics*', ['analytics', 'csp']], ['src/site/analytics/**', ['analytics', 'csp']],
  ['src/site/light.ts', ['light']],
  ['src/site/stale-deploy.ts', ['chunks']], ['src/components/LoadBoundary.tsx', ['chunks']],
  ['src/site/meta.ts', ['nav', 'mobile']],
  ['src/site/mobile/**', ['mobile', 'mobile-boards', 'layout-narrow']],
  ['src/components/widget/**', ['layout', 'layout-narrow', 'nav', 'mobile', 'csp']],
  ['src/components/hero/**', ['layout', 'layout-narrow', 'mobile']],
  ['src/components/About.tsx', ['layout', 'layout-narrow', 'mobile']],
  ['src/lab/**', ['csp']], ['src/legal/**', ['layout', 'csp']], ['src/data/**', ['csp', 'mobile-boards']],

  // boards: every board's card at 375 px and under the CSP, plus the board's own probe
  ['src/widgets/boards/**', ['mobile-boards', 'csp']],
  ['src/widgets/boards/materials*', ['materials', 'gates']], ['src/widgets/boards/workshop*', ['materials']],
  ['src/widgets/boards/pond/**', ['life']], ['src/widgets/boards/physics*', ['light']],
  ['src/widgets/boards/squares*', ['squares']], ['src/widgets/boards/gpu.ts', ['webgl']],
  ['src/widgets/boards/levels.ts', ['game', 'c10']], ['src/widgets/boards/instrument.ts', ['audio']],
  ['src/widgets/boards/audio.ts', ['audio']], ['src/widgets/boards/mirror.ts', ['c6']],
  ['src/widgets/boards/mosaic.ts', ['skins']], ['src/widgets/boards/components*', ['skins', 'layout', 'layout-narrow']],
  ['src/widgets/boards/deerflow12.ts', ['layout', 'layout-narrow']],
  ['src/widgets/boards/henry*', ['c10']], ['src/widgets/boards/ir.ts', ['c10', 'webgl']], ['src/widgets/boards/metro.ts', ['c10']],

  // scripts a probe imports (beside its own script, which picks it already)
  ['scripts/life*.ts', ['life']], ['scripts/ir.ts', ['webgl']], ['scripts/noise.ts', ['webgl', 'gates']], ['scripts/materials/**', ['gates']],

  // nothing a probe loads
  ['docs/**', []], ['*.md', []], ['goldens/**', []], ['mcp/**', []], ['.github/**', []], ['public/images/**', []],
  ['scripts/*.ts', []], ['scripts/*/**', []],
]

const rx = (glob: string) => new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/|\*\*|\*/g, m => (m === '*' ? '[^/]*' : m === '**' ? '.*' : '(?:.*/)?')) + '$')
const ROWS = AREAS.map(([glob, probes]) => ({ glob, re: rx(glob), probes }))
const OWN = PROBES.map(p => ({ name: p.name, script: p.args[0] }))
const known = new Set(PROBES.map(p => p.name))
for (const n of [...SMOKE, ...AREAS.flatMap(([, ps]) => (ps === ALL ? [] : ps))]) if (!known.has(n)) throw new Error(`affected.ts: unknown probe ${n}`)

/** The probes for a list of changed paths, with one reason line per path that adds probes. */
function affected(files: string[]): { probes: string[] | typeof ALL; why: string[] } {
  const picked = new Set(SMOKE), why = [`smoke: ${SMOKE.join(', ')}`]
  let all = false
  for (const f of files) {
    const rows = ROWS.filter(r => r.re.test(f))
    const own = OWN.filter(o => o.script === f).map(o => o.name)
    if (!rows.length && !own.length) { all = true; why.push(`${f}: no row in scripts/ci/affected.ts, so all`); continue }
    const hit = rows.find(r => r.probes === ALL)
    if (hit) { all = true; why.push(`${f}: ${hit.glob} is shared, so all`); continue }
    const add = [...new Set([...own, ...rows.flatMap(r => r.probes as string[])])]
    for (const n of add) picked.add(n)
    if (add.length) why.push(`${f}: ${add.join(', ')}`)
  }
  if (all || picked.size === known.size) return { probes: ALL, why }
  return { probes: PROBES.map(p => p.name).filter(n => picked.has(n)), why }
}

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const base = opt('--base'), list = opt('--files')
if (!base && list === undefined) { console.error('usage: affected.ts --base <ref> | --files a,b'); process.exit(2) }
const files = base
  ? execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], { encoding: 'utf8' }).split('\n').filter(Boolean)
  : list!.split(',').map(s => s.trim()).filter(Boolean)
const { probes, why } = affected(files)
const out = probes === ALL ? ALL : probes.join(',')
const report = [`${files.length} changed file(s); probes: ${out}`, ...why]
console.error(report.join('\n'))
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Affected probes\n\n${report.map(l => `- ${l}`).join('\n')}\n\n`)
console.log(out)
