/**
 * The one way Lighthouse runs: on the SEO routes, mobile and desktop, from the probes workflow's `lighthouse` job and
 * the on-demand seo-audit workflow (docs/HARNESS.md). The same engine and throttling as PageSpeed Insights, without
 * its API key: Performance, Accessibility, SEO and Best practices per route, the Core Web Vitals lab numbers (LCP,
 * CLS, TBT as the lab stand-in for INP), and every audit that lost points. A build is served the way Vercel serves it
 * (`scripts/site/serve.ts`: vercel.json redirects, headers, compression and real 404s).
 * A report: it exits 0 unless Lighthouse itself never ran, because shared runners are too noisy to gate on timings.
 *
 *   npx tsx scripts/ci/lighthouse.ts                          → dist/ (build first), served like Vercel
 *   npx tsx scripts/ci/lighthouse.ts --base https://matrix.reactopia.me/   → the live site
 *   npx tsx scripts/ci/lighthouse.ts --routes /,/browse/ --forms mobile --out lh
 *   npx tsx scripts/ci/lighthouse.ts --routes /mosaic/ --runs 3 --trace   → 3 runs each, the median-TBT one reported
 *
 * `--runs N` audits each route N times and reports the run with the median TBT (a single run on a shared runner swings
 * by a third); the TBT column lists every run. `--trace` keeps each run's trace beside its report (`--save-assets`),
 * to read the long tasks in the Performance panel.
 * Writes `<out>/<route>-<form>.json` (the full report) and `<out>/summary.md`, and appends the summary to
 * $GITHUB_STEP_SUMMARY when it is set. Chrome comes from $CHROME or the usual paths (scripts/lib/cdp.ts).
 * Lighthouse runs through `pnpm dlx` at a pinned version: it is a CI tool, not a dependency.
 */
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { findChrome } from '../lib/cdp'
import { serveVercel } from '../site/serve'

const LIGHTHOUSE = 'lighthouse@13.6.0'
/** The SEO routes: home, browse, three boards, two widget pages, the blog, the essay, a markdown post, about and the
 *  legal pages. The 404 is left out: Lighthouse refuses a page that answers 404 (scripts/site/seo-check.ts checks it). */
const ROUTES = ['/', '/browse/', '/henry/', '/mosaic/', '/components/', '/widget/timer/', '/widget/weather/', '/blog/', '/blog/dot-matrix-essay/', '/blog/living-matter/', '/about/', '/privacy', '/terms']
const CATEGORIES = ['performance', 'accessibility', 'seo', 'best-practices']

const argv = process.argv.slice(2)
const opt = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const routes = (opt('--routes') ?? ROUTES.join(',')).split(',').map(s => s.trim()).filter(Boolean)
const forms = (opt('--forms') ?? 'mobile,desktop').split(',').filter(f => f === 'mobile' || f === 'desktop')
const out = resolve(opt('--out') ?? join('.snapshots', 'lighthouse'))
const runs = Math.max(1, Math.min(9, Number(opt('--runs')) || 1)), trace = argv.includes('--trace')
const chrome = findChrome()
if (!chrome) { console.error('no Chrome found (set $CHROME)'); process.exit(2) }
mkdirSync(out, { recursive: true })

const server = opt('--base') ? undefined : await serveVercel(4319)
const base = opt('--base') ?? server!.url

interface Audit { id: string; title: string; score: number | null; scoreDisplayMode: string; displayValue?: string; numericValue?: number }
interface Report { categories: Record<string, { score: number | null; auditRefs: { id: string; weight: number }[] }>; audits: Record<string, Audit>; runtimeError?: { message: string } }

const ms = (a?: Audit) => (a?.numericValue === undefined ? '-' : `${(a.numericValue / 1000).toFixed(2)} s`)
const pct = (s: number | null | undefined) => (s === null || s === undefined ? '-' : String(Math.round(s * 100)))
const rows: string[] = [], losses = new Map<string, { title: string; where: string[] }>()
let ran = 0
try {
  for (const route of routes) for (const form of forms) {
    const slug = `${route.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'home'}-${form}`, file = join(out, `${slug}.json`)
    const url = new URL(route.replace(/^\//, ''), base).href
    const args = (f: string) => ['dlx', LIGHTHOUSE, url, '--quiet', '--output=json', `--output-path=${f}`, `--only-categories=${CATEGORIES.join(',')}`,
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu', '--max-wait-for-load=45000', ...(form === 'desktop' ? ['--preset=desktop'] : []), ...(trace ? ['--save-assets'] : [])]
    const run = (f: string) => { rmSync(f, { force: true }); const r = spawnSync('pnpm', args(f), { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, CHROME_PATH: chrome }, shell: process.platform === 'win32', timeout: 180_000 }); return r.status === 0 && existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) as Report : undefined }
    const done: Report[] = []
    let lhr: Report | undefined
    for (let i = 1; i <= runs; i++) {
      const f = runs > 1 ? join(out, `${slug}-${i}.json`) : file
      // one retry: a run on a shared runner now and then loses its trace (NO_NAVSTART)
      lhr = run(f)
      if (!lhr || lhr.runtimeError) lhr = run(f)
      if (lhr && !lhr.runtimeError) done.push(lhr)
      console.log(`${route} ${form} run ${i}: TBT ${lhr?.audits['total-blocking-time']?.numericValue?.toFixed(0) ?? 'failed'} ms`)
    }
    if (!done.length && !lhr) { rows.push(`| ${route} | ${form} | failed | | | | | | | |`); continue }
    if (!done.length) { rows.push(`| ${route} | ${form} | ${lhr!.runtimeError!.message.slice(0, 60)} | | | | | | | |`); continue }
    const tbt = (r: Report) => r.audits['total-blocking-time']?.numericValue ?? 0
    done.sort((x, y) => tbt(x) - tbt(y))
    lhr = done[(done.length - 1) >> 1]
    if (runs > 1) writeFileSync(file, JSON.stringify(lhr))
    ran++
    const a = lhr.audits, c = lhr.categories
    rows.push(`| ${route} | ${form} | ${pct(c.performance?.score)} | ${pct(c.accessibility?.score)} | ${pct(c.seo?.score)} | ${pct(c['best-practices']?.score)} | ${ms(a['largest-contentful-paint'])} | ${a['cumulative-layout-shift']?.displayValue ?? '-'} | ${a['total-blocking-time']?.displayValue ?? '-'}${done.length > 1 ? ` (${done.map(d => Math.round(tbt(d))).join(', ')})` : ''} | ${ms(a['first-contentful-paint'])} |`)
    // every audit of either category that lost points (or, for an informative insight, says something), by route
    for (const cat of CATEGORIES) for (const ref of c[cat]?.auditRefs ?? []) {
      const au = a[ref.id]
      if (!au || au.score === null || au.score >= 0.9 || au.scoreDisplayMode === 'manual' || au.scoreDisplayMode === 'notApplicable') continue
      const key = `${cat}: ${au.title}`, e = losses.get(key) ?? { title: key, where: [] }
      e.where.push(`${route} ${form}${au.displayValue ? ` (${au.displayValue})` : ''}`)
      losses.set(key, e)
    }
  }
} finally { server?.stop() }

const md = [`## Lighthouse (${LIGHTHOUSE}) on ${base}`, '',
  '| Route | Form | Perf | A11y | SEO | BP | LCP | CLS | TBT | FCP |', '|---|---|---|---|---|---|---|---|---|---|', ...rows, '',
  '### Audits that lost points', '', ...[...losses.values()].sort((x, y) => y.where.length - x.where.length).map(l => `- **${l.title}**: ${l.where.join(', ')}`), ''].join('\n')
writeFileSync(join(out, 'summary.md'), md)
console.log(md)
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n')
process.exit(ran ? 0 : 1)
