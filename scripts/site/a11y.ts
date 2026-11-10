/**
 * Accessibility probe (#187): loads each route in headless Chrome over CDP (scripts/lib/cdp.ts), injects axe-core
 * (an app-level dev dependency; nothing shipped imports it) and reports what axe finds, per route and colour mode.
 * Serious and critical findings are checks (`axe:<rule>@<route>`); moderate and minor ones are listed after them.
 * `KNOWN` holds the serious and critical findings already listed on #187 with an owner issue: they print as known
 * and don't fail the run (scripts/lib/check.ts `knownChecker`). A summary table closes the run.
 *
 * Routes: home (ALL, #315), four boards (the first; mirror for the ⋯ target size), a widget page, about, a blog post, the essay and the
 * privacy page (`--all` adds every board, the blog index, the terms page and the 404 page). On the blog and legal pages
 * it also checks the shell (#187): SKIP TO CONTENT is the first stop and points at `<main>`, and the site nav and
 * footer sit outside `<main>`. Modes: the default dark theme and light (`--modes` takes any of
 * dark, light, more-dark, more-light; `more` is `prefers-contrast: more`).
 *
 *   npx vite build && npx tsx scripts/site/a11y.ts            → serves dist/ on port 4327 for the run
 *   npx tsx scripts/site/a11y.ts https://matrix.reactopia.me/  → any running site (`pnpm dev`, preview, production)
 *   flags: --all, --modes dark,light,more-dark, --routes home,post (by name), --width 390 (default 1440; up to 600 is a
 *   phone: 844 tall, touch, so the 44 px touch targets apply), --shots <dir> (a PNG per route and mode, the top of the page). Chrome: $CHROME or the usual paths. Not in CI yet.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { boardIds } from '../../src/widgets/manifest'
import { findChrome, launch, serveDist, sleep, type Page } from '../lib/cdp'
import { knownChecker } from '../lib/check'

/** Serious or critical findings listed on #187 with the issue that owns the fix. Delete an id when its fix lands. */
const KNOWN: readonly string[] = []

const args = process.argv.slice(2)
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const all = args.includes('--all')
const MODES = (flag('--modes') ?? 'dark,light').split(',')
const WIDTH = Number(flag('--width') ?? 1440), PHONE = WIDTH <= 600, HEIGHT = PHONE ? 844 : 900
if (!Number.isInteger(WIDTH) || WIDTH < 240 || WIDTH > 3840) { console.error('--width takes 240 to 3840'); process.exit(2) }
const MEDIA: Record<string, [string, string][]> = {
  dark: [['prefers-color-scheme', 'dark']],
  light: [['prefers-color-scheme', 'light']],
  'more-dark': [['prefers-color-scheme', 'dark'], ['prefers-contrast', 'more']],
  'more-light': [['prefers-color-scheme', 'light'], ['prefers-contrast', 'more']],
}
for (const m of MODES) if (!MEDIA[m]) { console.error(`unknown mode ${m} (use ${Object.keys(MEDIA).join(', ')})`); process.exit(2) }

/** [name, path, what must be on the page before axe runs]. */
const APP_READY = `!document.querySelector('.view-loading') && !!document.querySelector('.board-grid .dot-card')`
/** `/` is ALL (#315): every card in one windowed grid, under the board picker. */
const ALL_READY = `!document.querySelector('.view-loading') && !!document.querySelector('.browse-grid .dot-card')`
const ALL_ROUTES: [string, string, string][] = [
  ['home', '', ALL_READY],
  [boardIds[0], `${boardIds[0]}/`, APP_READY],
  ['mosaic', 'mosaic/', APP_READY],
  ['components', 'components/', APP_READY],
  ['mirror', 'mirror/', APP_READY],
  ['widget', 'widget/timer/', `!!document.querySelector('.shell--widget .wp-ids, .shell--widget .wp-missing')`],
  ['about', '?about', `!document.querySelector('.view-loading') && !!document.querySelector('.about-view')`],
  ['post', 'blog/build-your-own-dot-engine/', `!!document.querySelector('.essay.post > main .hero') && !document.querySelector('.post-wait')`],
  ['essay', 'blog/dot-matrix-essay/', `!!document.querySelector('.essay.post > main .hero') && !document.querySelector('.post-wait')`],
  ['privacy', 'privacy', `!!document.querySelector('.legal > main')`],
  ...(all ? [
    ...boardIds.filter(id => id !== boardIds[0] && id !== 'mosaic' && id !== 'components' && id !== 'mirror').map(id => [id, `${id}/`, APP_READY] as [string, string, string]),
    ['blog', 'blog/', `!!document.querySelector('.essay.blog > main')`] as [string, string, string],
    ['terms', 'terms', `!!document.querySelector('.legal > main')`] as [string, string, string],
    ['404', '404.html', `!!document.querySelector('main')`] as [string, string, string],
  ] : []),
]

const pick = flag('--routes')?.split(',')
const ROUTES = pick ? ALL_ROUTES.filter(r => pick.includes(r[0])) : ALL_ROUTES
const shots = flag('--shots')
if (shots) mkdirSync(shots, { recursive: true })

interface Finding { id: string; impact: string; help: string; nodes: { target: string; summary: string }[] }
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8')
const RUN = `(async () => {
  const r = await axe.run(document, { resultTypes: ['violations'], runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } })
  return r.violations.map(v => ({ id: v.id, impact: v.impact || 'minor', help: v.help,
    nodes: v.nodes.map(n => ({ target: n.target.join(' '), summary: (n.failureSummary || '').split('\\n').slice(1, 2).join('').trim().slice(0, 160) })) }))
})()`

async function audit(p: Page, base: string, mode: string, route: [string, string, string]) {
  const [name, path, ready] = route
  await p.cdp('Emulation.setEmulatedMedia', { features: MEDIA[mode].map(([n, value]) => ({ name: n, value })) })
  await p.cdp('Page.navigate', { url: base + path })
  await sleep(400)
  const ok = await p.waitFor(`document.readyState === 'complete' && (${ready})`, 30000)
  await sleep(1500) // entrance animations and lazy chunks settle
  if (!(await p.js<boolean>('typeof axe === "object"'))) await p.js(AXE)
  const found = await p.js<Finding[]>(RUN, 60000)
  if (shots) await p.shot(join(shots, `${name}-${mode}.png`))
  const shell = SHELL.includes(name) ? await p.js<string>(SHELL_CHECK) : ''
  return { ok, found, name, shell }
}

/** The pages outside the app (#187): the blog, its posts and the legal pages. */
const SHELL = ['post', 'essay', 'privacy', 'blog', 'terms']
/** '' when the page's first focusable is SKIP TO CONTENT pointing at its `<main>` and the site nav and footer sit outside it. */
const SHELL_CHECK = `(() => {
  const first = document.querySelector('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])')
  const main = document.getElementById('main'), out = []
  if (!first?.matches('a.skip-link[href="#main"]')) out.push('first stop: ' + (first?.outerHTML.slice(0, 60) ?? 'none'))
  if (main?.tagName !== 'MAIN') out.push('#main is not the <main>')
  if (!document.querySelector('nav[aria-label="Site"]') || document.querySelector('main nav[aria-label="Site"]')) out.push('site nav inside <main> or missing')
  if (!document.querySelector('footer.essay-foot') || document.querySelector('main footer')) out.push('footer inside <main> or missing')
  return out.join('; ')
})()`

if (!findChrome()) { console.log('no Chrome found (set $CHROME): skipped'); process.exit(0) }
const given = args.find(a => /^https?:/.test(a))
const server = given ? undefined : await serveDist(4327)
const base = (given ?? server!.url).replace(/\/?$/, '/')
const { check, done } = knownChecker(KNOWN, 'a11y')
/** rule → impact, help, and where it showed up (route@mode and the first targets). */
const table = new Map<string, { impact: string; help: string; where: Set<string>; nodes: number; targets: Set<string> }>()
const minor: string[] = []
const p = await launch(WIDTH, HEIGHT)
try {
  await p.cdp('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: PHONE })
  if (PHONE) await p.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
  await p.cdp('Page.setBypassCSP', { enabled: true }) // the production CSP has no grant for the injected axe script
  for (const mode of MODES) {
    console.log(`\n${mode}`)
    for (const route of ROUTES) {
      const { ok, found, name, shell } = await audit(p, base, mode, route)
      if (!ok) check(`ready@${name}`, false, `${mode}: the page did not finish loading in 30 s (audited anyway)`)
      if (SHELL.includes(name)) check(`skip link and landmarks@${name}:${mode}`, !shell, shell || 'skip link first, nav and footer outside <main>')
      const bad = found.filter(f => f.impact === 'serious' || f.impact === 'critical')
      for (const f of found) {
        const row = table.get(f.id) ?? { impact: f.impact, help: f.help, where: new Set(), nodes: 0, targets: new Set() }
        row.where.add(`${name}@${mode}`); row.nodes += f.nodes.length
        for (const n of f.nodes.slice(0, 3)) row.targets.add(n.target)
        table.set(f.id, row)
      }
      for (const f of bad) check(`axe:${f.id}@${name}`, false, `${mode}, ${f.impact}, ${f.nodes.length} node(s): ${f.help}. ${f.nodes.slice(0, 3).map(n => `${n.target} (${n.summary})`).join(' | ')}`)
      if (!bad.length) check(`axe@${name}:${mode}`, true, `0 serious or critical${found.length ? `, ${found.length} lesser rule(s)` : ''}`)
      for (const f of found.filter(f => !bad.includes(f))) minor.push(`${f.impact} ${f.id}@${name}:${mode} (${f.nodes.length}): ${f.help}`)
    }
  }
} finally {
  await p.close()
  server?.stop()
}
if (minor.length) console.log(`\nmoderate and minor (not gated):\n${minor.map(m => `  ${m}`).join('\n')}`)
console.log('\nsummary (rule · impact · pages · nodes · first targets)')
const rank = { critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>
for (const [id, r] of [...table].sort((a, b) => rank[a[1].impact] - rank[b[1].impact] || b[1].where.size - a[1].where.size))
  console.log(`  ${id} · ${r.impact} · ${r.where.size} · ${r.nodes} · ${[...r.targets].slice(0, 3).join(' , ')}\n      ${r.help}; on ${[...r.where].join(' ')}`)
console.log(`\n${ROUTES.length} routes × ${MODES.length} modes (${MODES.join(', ')}) at ${WIDTH} px, ${base}`)
done()
process.exit(0)
